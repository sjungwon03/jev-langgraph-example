import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContextData {
  traceId: string;
  spanId?: string;
  parentSpanId?: string;
  userId?: string;
  email?: string;
  clientIp?: string;
  method?: string;
  url?: string;
  startedAt: number;
}

@Injectable()
export class RequestContextService {
  private static readonly storage = new AsyncLocalStorage<RequestContextData>();

  /**
   * 새로운 비동기 실행 스코프에서 Context 실행
   */
  static run<T>(data: RequestContextData, fn: () => T): T {
    return this.storage.run(data, fn);
  }

  /**
   * 현재 비동기 실행 스코프의 RequestContext 반환 (없으면 undefined)
   */
  static current(): RequestContextData | undefined {
    return this.storage.getStore();
  }

  /**
   * 현재 요청의 Trace ID (Correlation ID) 반환
   */
  static getTraceId(): string | undefined {
    return this.storage.getStore()?.traceId;
  }

  /**
   * 현재 요청의 Span ID 반환
   */
  static getSpanId(): string | undefined {
    return this.storage.getStore()?.spanId;
  }

  /**
   * 부모 Span ID 반환
   */
  static getParentSpanId(): string | undefined {
    return this.storage.getStore()?.parentSpanId;
  }

  /**
   * 현재 요청의 인증된 사용자 ID 반환
   */
  static getUserId(): string | undefined {
    return this.storage.getStore()?.userId;
  }

  /**
   * 현재 컨텍스트에 사용자 정보 바인딩 (JWT 가드 통과 후 호출 가능)
   */
  static setUserId(userId: string, email?: string): void {
    const store = this.storage.getStore();
    if (store) {
      store.userId = userId;
      if (email) store.email = email;
    }
  }
}
