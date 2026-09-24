import { RequestContextService } from './request-context.service';

describe('RequestContextService (TDD)', () => {
  it('should maintain traceId within AsyncLocalStorage scope', (done) => {
    const context1 = {
      traceId: 'trace-1111',
      spanId: 'span-aaaa',
      startedAt: Date.now(),
    };

    const context2 = {
      traceId: 'trace-2222',
      spanId: 'span-bbbb',
      startedAt: Date.now(),
    };

    // 스코프 1 실행
    RequestContextService.run(context1, async () => {
      expect(RequestContextService.getTraceId()).toBe('trace-1111');
      expect(RequestContextService.getSpanId()).toBe('span-aaaa');

      // 비동기 지연 후에도 동일 컨텍스트 보존 확인
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(RequestContextService.getTraceId()).toBe('trace-1111');
    });

    // 스코프 2 동시 실행 시 격리 확인
    RequestContextService.run(context2, async () => {
      expect(RequestContextService.getTraceId()).toBe('trace-2222');
      expect(RequestContextService.getSpanId()).toBe('span-bbbb');

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(RequestContextService.getTraceId()).toBe('trace-2222');
      done();
    });
  });

  it('should return undefined when outside an active context', () => {
    expect(RequestContextService.getTraceId()).toBeUndefined();
    expect(RequestContextService.getSpanId()).toBeUndefined();
  });
});
