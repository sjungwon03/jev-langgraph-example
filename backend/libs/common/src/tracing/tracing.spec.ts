import { TraceContext } from './trace-context';
import { TracingService } from './tracing.service';

describe('TracingModule', () => {
  describe('TraceContext', () => {
    it('should generate a valid W3C traceparent string', () => {
      const ctx = new TraceContext();
      const traceparent = ctx.toTraceparent();
      expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    });

    it('should correctly parse an incoming W3C traceparent header', () => {
      const header = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
      const parsed = TraceContext.parse(header);

      expect(parsed).not.toBeNull();
      expect(parsed?.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(parsed?.parentId).toBe('00f067aa0ba902b7');
      expect(parsed?.sampled).toBe(true);
    });

    it('should create child context with same traceId and parentId set to previous spanId', () => {
      const parent = new TraceContext();
      const child = parent.createChild();

      expect(child.traceId).toBe(parent.traceId);
      expect(child.parentId).toBe(parent.spanId);
      expect(child.spanId).not.toBe(parent.spanId);
    });

    it('should extract trace context from case-insensitive headers', () => {
      const header = '00-abcdefabcdefabcdefabcdefabcdef12-1234567890abcdef-01';
      const ctx = TraceContext.fromHeaders({ Traceparent: header });

      expect(ctx.traceId).toBe('abcdefabcdefabcdefabcdefabcdef12');
      expect(ctx.parentId).toBe('1234567890abcdef');
    });
  });

  describe('TracingService', () => {
    let service: TracingService;

    beforeEach(() => {
      service = new TracingService();
    });

    it('should start and end a span successfully', () => {
      const span = service.startSpan('GET /test', undefined, { env: 'test' });
      expect(span.name).toBe('GET /test');
      expect(span.status).toBe('OK');
      expect(span.tags.env).toBe('test');

      service.setTag(span.spanId, 'custom.key', 'custom.value');
      service.addEvent(span.spanId, 'cache_lookup', { hit: true });

      const endedSpan = service.endSpan(span.spanId, 'OK');
      expect(endedSpan).toBeDefined();
      expect(endedSpan?.durationMs).toBeGreaterThanOrEqual(0);
      expect(endedSpan?.tags['custom.key']).toBe('custom.value');
      expect(endedSpan?.events.length).toBe(1);
    });

    it('should record error information when span ends with error', () => {
      const span = service.startSpan('POST /orders');
      const err = new Error('Database connection failed');
      const endedSpan = service.endSpan(span.spanId, 'ERROR', err);

      expect(endedSpan?.status).toBe('ERROR');
      expect(endedSpan?.tags['error']).toBe(true);
      expect(endedSpan?.tags['error.message']).toBe('Database connection failed');
    });
  });
});
