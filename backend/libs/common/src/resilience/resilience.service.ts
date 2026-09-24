import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  BrokenCircuitError,
  CircuitBreakerPolicy,
  CircuitState,
  circuitBreaker,
  ConsecutiveBreaker,
  ExponentialBackoff,
  handleWhen,
  retry,
  timeout,
  TimeoutStrategy,
  wrap,
} from 'cockatiel';
import { MetricsService } from '../metrics/metrics.service';

export interface ResiliencePolicyOptions {
  failureThreshold?: number; // 연속 실패 허용 횟수 (기본 3회)
  halfOpenAfterMs?: number; // Half-Open 전환 대기 시간 (기본 5초)
  retryAttempts?: number; // 재시도 횟수 (기본 2회)
  timeoutMs?: number; // 타임아웃 (기본 3초)
}

export interface CircuitBreakerStatus {
  name: string;
  state: string; // 'CLOSED' | 'HALF_OPEN' | 'OPEN'
  stateCode: number; // 0, 1, 2
}

/**
 * 4xx 클라이언트 비즈니스 에러(401 Unauthorized, 404 Not Found, 409 Conflict 등)는
 * 서버 장애가 아니므로 서킷 브레이커 및 재시도 대상에서 제외합니다 (Spring Resilience4j의 ignoreExceptions와 동일).
 */
export function isFaultError(err: any): boolean {
  // Duck Typing: getStatus()가 존재하거나 status가 4xx인 경우 클라이언트 에러로 판별
  let status: number | undefined;

  if (typeof err?.getStatus === 'function') {
    status = err.getStatus();
  } else {
    status =
      err?.status ||
      err?.statusCode ||
      err?.response?.status ||
      err?.response?.statusCode ||
      err?.error?.statusCode ||
      err?.error?.status;
  }

  if (typeof status === 'number' && status >= 400 && status < 500) {
    return false; // 클라이언트 에러는 서킷 실패로 카운트하지 않음
  }

  // 메시지 기반 체크 (마이크로서비스 RPC 직렬화 예외 대응)
  const msg = (err?.message || '').toLowerCase();
  if (
    msg.includes('unauthorized') ||
    msg.includes('invalid email or password') ||
    msg.includes('already exists') ||
    msg.includes('forbidden') ||
    msg.includes('not found') ||
    msg.includes('conflict')
  ) {
    return false;
  }

  return true; // 5xx 서버 에러, 타임아웃, ECONNREFUSED 등은 장애로 처리
}

@Injectable()
export class ResilienceService {
  private readonly logger = new Logger(ResilienceService.name);
  private readonly circuits = new Map<string, CircuitBreakerPolicy>();
  private readonly pipelines = new Map<string, any>();

  constructor(@Optional() private readonly metricsService?: MetricsService) {}

  /**
   * 지정된 이름의 Resilience 파이프라인(Circuit Breaker + Retry + Timeout)을 가져오거나 생성
   */
  getOrCreatePipeline(name: string, options: ResiliencePolicyOptions = {}) {
    if (this.pipelines.has(name)) {
      return this.pipelines.get(name);
    }

    const {
      failureThreshold = 3,
      halfOpenAfterMs = 5000,
      retryAttempts = 2,
      timeoutMs = 3000,
    } = options;

    const faultPolicy = handleWhen(isFaultError);

    // 1. Timeout Policy (기본 3초)
    const timeoutPolicy = timeout(timeoutMs, TimeoutStrategy.Aggressive);

    // 2. Retry Policy (Exponential Backoff - 서버 오류 시에만 재시도)
    const retryPolicy = retry(faultPolicy, {
      maxAttempts: retryAttempts,
      backoff: new ExponentialBackoff({ initialDelay: 100, maxDelay: 1000 }),
    });

    retryPolicy.onRetry((reason: any) => {
      const errMsg = reason?.error?.message || reason?.value || JSON.stringify(reason);
      this.logger.warn(`🔁 [Resilience:${name}] Retrying request due to: ${errMsg}`);
    });

    // 3. Circuit Breaker Policy (서버 오류 시에만 서킷 트립)
    const cbPolicy = circuitBreaker(faultPolicy, {
      halfOpenAfter: halfOpenAfterMs,
      breaker: new ConsecutiveBreaker(failureThreshold),
    });

    // 초기 메트릭 상태: Closed (0)
    this.metricsService?.setCircuitBreakerState(name, 0);

    // 상태 변화 리스너 등록
    cbPolicy.onBreak((reason: any) => {
      const errMsg = reason?.error?.message || reason?.value || JSON.stringify(reason);
      this.logger.error(
        `🚨 [Resilience:${name}] Circuit OPENED! Fast failing all downstream calls. Cause: ${errMsg}`,
      );
      this.metricsService?.setCircuitBreakerState(name, 2);
    });

    cbPolicy.onHalfOpen(() => {
      this.logger.warn(`⚠️ [Resilience:${name}] Circuit HALF-OPEN. Probing downstream service...`);
      this.metricsService?.setCircuitBreakerState(name, 1);
    });

    cbPolicy.onReset(() => {
      this.logger.log(`✅ [Resilience:${name}] Circuit CLOSED. Downstream service recovered!`);
      this.metricsService?.setCircuitBreakerState(name, 0);
    });

    // 4. Policy Wrap: Retry -> Circuit Breaker -> Timeout
    const pipeline = wrap(retryPolicy, cbPolicy, timeoutPolicy);

    this.circuits.set(name, cbPolicy);
    this.pipelines.set(name, pipeline);

    return pipeline;
  }

  /**
   * Resilience 파이프라인을 통과하여 함수를 안전하게 실행하고, 실패/서킷 오픈 시 Fallback 수행
   */
  async execute<T>(
    name: string,
    action: () => Promise<T>,
    fallback?: (error: any) => Promise<T>,
    options?: ResiliencePolicyOptions,
  ): Promise<T> {
    const pipeline = this.getOrCreatePipeline(name, options);

    try {
      return await pipeline.execute(() => action());
    } catch (err) {
      if (err instanceof BrokenCircuitError) {
        this.logger.warn(`⚡ [Resilience:${name}] Fast-failing via OPEN circuit breaker`);
      }

      // 비즈니스 예외(4xx)는 Fallback을 타지 않고 그대로 클라이언트에게 전달
      if (!isFaultError(err)) {
        throw err;
      }

      if (fallback) {
        this.logger.log(
          `🛡️ [Resilience:${name}] Executing Fallback logic for error: ${err.message}`,
        );
        return fallback(err);
      }

      throw err;
    }
  }

  /**
   * 등록된 모든 서킷 브레이커의 상태 반환
   */
  getStatusList(): CircuitBreakerStatus[] {
    const result: CircuitBreakerStatus[] = [];
    for (const [name, cb] of this.circuits.entries()) {
      let stateStr = 'UNKNOWN';
      let stateCode = 0;

      if (cb.state === CircuitState.Closed) {
        stateStr = 'CLOSED';
        stateCode = 0;
      } else if (cb.state === CircuitState.HalfOpen) {
        stateStr = 'HALF_OPEN';
        stateCode = 1;
      } else if (cb.state === CircuitState.Open) {
        stateStr = 'OPEN';
        stateCode = 2;
      }

      result.push({ name, state: stateStr, stateCode });
    }
    return result;
  }
}
