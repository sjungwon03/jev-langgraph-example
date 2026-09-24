import { ConsoleLogger, Injectable, LogLevel, Scope } from '@nestjs/common';
import { RequestContextService } from '../context/request-context.service';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'secret',
  'authorization',
  'access_token',
  'refreshtoken',
  'creditcard',
]);

/**
 * 로그 출력 전 민감 정보(비밀번호, 토큰 등)를 ***MASKED***로 치환
 */
export function maskSensitiveData(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === 'string') {
    return data.replace(
      /("(?:password|passwordHash|token|secret|authorization|access_token|refreshToken)"\s*:\s*)"([^"]+)"/gi,
      '$1"***MASKED***"',
    );
  }
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item));
  }

  const masked: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      masked[key] = '***MASKED***';
    } else if (typeof value === 'object') {
      masked[key] = maskSensitiveData(value);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger extends ConsoleLogger {
  protected formatMessage(
    logLevel: LogLevel,
    message: unknown,
    pidMessage: string,
    formattedLogLevel: string,
    contextMessage: string,
    timestampDiff: string,
  ): string {
    const traceId = RequestContextService.getTraceId();
    const spanId = RequestContextService.getSpanId();
    const isJson = process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production';

    // 1. 민감 데이터 마스킹
    const sanitizedMessage =
      typeof message === 'object'
        ? JSON.stringify(maskSensitiveData(message))
        : maskSensitiveData(String(message));

    // 2. 구조화된 JSON 포맷 모드 (ELK / Loki / Datadog 수집용)
    if (isJson) {
      const jsonEntry = {
        timestamp: new Date().toISOString(),
        level: logLevel.toUpperCase(),
        service: process.env.SERVICE_NAME || process.env.npm_package_name || 'nest-msa',
        traceId: traceId || null,
        spanId: spanId || null,
        context: this.context || contextMessage.replace(/\[|\]/g, '').trim() || 'App',
        message: sanitizedMessage,
      };
      return JSON.stringify(jsonEntry);
    }

    // 3. 로컬 개발 환경용 Pretty Text 포맷
    const tracePrefix = traceId ? `[Trace: ${traceId}] ` : '';
    const spanPrefix = spanId ? `[Span: ${spanId}] ` : '';

    return super.formatMessage(
      logLevel,
      `${tracePrefix}${spanPrefix}${sanitizedMessage}`,
      pidMessage,
      formattedLogLevel,
      contextMessage,
      timestampDiff,
    );
  }
}
