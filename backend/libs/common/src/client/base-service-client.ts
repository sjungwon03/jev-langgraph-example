import { HttpException, HttpStatus } from '@nestjs/common';
import { firstValueFrom, isObservable, Observable, timeout } from 'rxjs';
import { RequestContextService } from '../context/request-context.service';
import { CORRELATION_ID_HEADER } from '../correlation/correlation-id.middleware';
import { AppLogger } from '../logger/app-logger.service';
import { ResilienceService } from '../resilience/resilience.service';

export type TransportType = 'grpc' | 'http' | 'rmq';

export interface IHttpService {
  get<T = any>(url: string, config?: any): any;
  post<T = any>(url: string, data?: any, config?: any): any;
}

export interface IRmqClient {
  send<TResult = any, TInput = any>(pattern: any, data: TInput): Observable<TResult>;
  emit<TResult = any, TInput = any>(pattern: any, data: TInput): Observable<TResult>;
}

export interface ServiceCallOptions<TInput = any> {
  pattern: string; // RabbitMQ 메시지 패턴 (예: 'auth.login')
  path: string; // HTTP Direct 상대 경로 (예: '/auth/login')
  grpcCall?: () => Promise<any> | Observable<any>; // gRPC 동기 호출 함수
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: TInput; // 전달할 DTO / Payload
  transport?: TransportType;
  timeoutMs?: number; // 타임아웃 (기본 3000ms)
  fallback?: (err: any) => Promise<any>;
}

/**
 * Spring Cloud OpenFeign 스타일의 선언적 하이브리드 서비스 클라이언트 추상 클래스
 *
 * - 동기 통신: gRPC(기본) 및 HTTP Direct 하이브리드 지원
 * - 비동기 통신: RabbitMQ Pub/Sub 도메인 이벤트 발행
 * - Cockatiel Circuit Breaker + Exponential Retry + Timeout 자동 결합
 * - RequestContext의 Correlation ID 자동 헤더 전파
 * - 일관된 예외 변환 및 Fallback 지원
 */
export abstract class BaseServiceClient {
  protected readonly logger: AppLogger;

  constructor(
    protected readonly serviceName: string,
    protected readonly httpBaseUrl: string,
    protected readonly rmqClient: IRmqClient,
    protected readonly httpService: IHttpService,
    protected readonly resilienceService: ResilienceService,
  ) {
    this.logger = new AppLogger(this.constructor.name);
  }

  /**
   * 전송 모드 결정 (메서드 인자 > 환경변수 > 기본 'grpc')
   */
  protected resolveTransport(override?: TransportType): TransportType {
    if (override) return override;
    const envKey = `${this.serviceName.toUpperCase().replace(/-/g, '_')}_TRANSPORT_MODE`;
    const envMode = (
      process.env[envKey] ||
      process.env.DEFAULT_TRANSPORT_MODE ||
      'grpc'
    ).toLowerCase() as TransportType;
    return envMode;
  }

  /**
   * 에러를 적절한 HttpException으로 정규화
   */
  protected handleClientError(err: any): never {
    if (err instanceof HttpException) {
      throw err;
    }

    const msg = (err?.message || err?.details || '').toLowerCase();
    let status =
      err?.status ||
      err?.statusCode ||
      err?.response?.status ||
      err?.response?.statusCode ||
      err?.error?.statusCode;

    if (!status) {
      // gRPC status code mapping
      if (err?.code === 16 || msg.includes('unauthorized') || msg.includes('invalid')) {
        status = HttpStatus.UNAUTHORIZED;
      } else if (err?.code === 6 || msg.includes('already exists') || msg.includes('conflict')) {
        status = HttpStatus.CONFLICT;
      } else if (err?.code === 5 || msg.includes('not found')) {
        status = HttpStatus.NOT_FOUND;
      } else if (err?.code === 3 || msg.includes('bad request')) {
        status = HttpStatus.BAD_REQUEST;
      } else {
        status = HttpStatus.SERVICE_UNAVAILABLE;
      }
    }

    const data = err?.response?.data;
    const message = data?.message || data?.error || err?.details || err?.message || 'Service Unavailable';
    throw new HttpException(message, status);
  }

  /**
   * OpenFeign 스타일의 단일 선언적 호출 메서드
   */
  protected async call<TResult = any, TInput = any>(
    options: ServiceCallOptions<TInput>,
  ): Promise<TResult> {
    const {
      pattern,
      path,
      grpcCall,
      method = 'POST',
      data,
      transport,
      timeoutMs = 3000,
      fallback,
    } = options;

    const mode = this.resolveTransport(transport);
    const traceId = RequestContextService.getTraceId();

    return this.resilienceService.execute(
      this.serviceName,
      async () => {
        // 1. gRPC 동기 호출 모드 (Primary Synchronous Transport)
        if (mode === 'grpc' && grpcCall) {
          this.logger.log(`⚡ [Feign:gRPC] Executing synchronous RPC for ${this.serviceName}`);
          try {
            const raw = grpcCall();
            const res = isObservable(raw)
              ? await firstValueFrom(raw.pipe(timeout(timeoutMs)))
              : await raw;
            return res as TResult;
          } catch (grpcErr) {
            this.handleClientError(grpcErr);
          }
        }

        // 2. HTTP Direct 모드
        if (mode === 'http') {
          const url = `${this.httpBaseUrl}${path}`;
          this.logger.log(`⚡ [Feign:HTTP] ${method} ${url}`);
          const headers: Record<string, string> = {};
          if (traceId) {
            headers[CORRELATION_ID_HEADER] = traceId;
          }

          try {
            let res;
            if (method === 'GET') {
              res = await firstValueFrom(this.httpService.get(url, { headers }));
            } else {
              res = await firstValueFrom(this.httpService.post(url, data, { headers }));
            }
            return res.data?.data || res.data;
          } catch (httpErr) {
            this.handleClientError(httpErr);
          }
        }

        // 3. RabbitMQ RPC 모드 (Legacy synchronous via queue)
        this.logger.log(`🐰 [Feign:RMQ] Sending RPC: ${pattern}`);
        try {
          return await firstValueFrom(
            this.rmqClient.send<TResult>(pattern, data || {}).pipe(timeout(timeoutMs)),
          );
        } catch (rmqErr) {
          this.handleClientError(rmqErr);
        }
      },
      // 4. Fallback: gRPC / RMQ 실패 시 HTTP Direct 또는 지정된 fallback으로 전환
      fallback ||
        (async (err) => {
          if (mode !== 'http') {
            this.logger.warn(`Primary transport (${mode}) failed, fallback to HTTP Direct: ${err.message}`);
            const url = `${this.httpBaseUrl}${path}`;
            const headers: Record<string, string> = {};
            if (traceId) headers[CORRELATION_ID_HEADER] = traceId;

            try {
              let res;
              if (method === 'GET') {
                res = await firstValueFrom(this.httpService.get(url, { headers }));
              } else {
                res = await firstValueFrom(this.httpService.post(url, data, { headers }));
              }
              return res.data?.data || res.data;
            } catch (httpErr) {
              this.handleClientError(httpErr);
            }
          }
          this.handleClientError(err);
        }),
    );
  }

  /**
   * RabbitMQ 비동기 이벤트 발행 (Asynchronous Domain Event)
   */
  public emitEvent(pattern: string, data: any): void {
    this.logger.log(`🐰 [Event:RabbitMQ] Emitting asynchronous event: ${pattern}`);
    this.rmqClient.emit(pattern, data);
  }
}
