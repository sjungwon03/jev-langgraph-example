import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { TraceContext } from './trace-context';
import { TracingService } from './tracing.service';

@Injectable()
export class HttpTracingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpTracingInterceptor.name);

  constructor(private readonly tracingService: TracingService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const type = context.getType();
    if (type !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // 1. Extract W3C traceparent or generate new TraceContext
    const traceCtx = TraceContext.fromHeaders(req.headers);

    // 2. Inject traceparent into response headers for downstream caller
    if (res && typeof res.setHeader === 'function') {
      res.setHeader('traceparent', traceCtx.toTraceparent());
      res.setHeader('x-trace-id', traceCtx.traceId);
    }

    // 3. Start Span
    const span = this.tracingService.startSpan(
      `${req.method} ${req.route?.path || req.url}`,
      traceCtx,
      {
        'http.method': req.method,
        'http.url': req.url,
        'http.user_agent': req.headers['user-agent'],
      },
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = res?.statusCode || 200;
          this.tracingService.setTag(span.spanId, 'http.status_code', statusCode);
          this.tracingService.endSpan(span.spanId, statusCode >= 400 ? 'ERROR' : 'OK');
        },
        error: (err) => {
          this.tracingService.setTag(span.spanId, 'http.status_code', err.status || 500);
          this.tracingService.endSpan(span.spanId, 'ERROR', err);
        },
      }),
    );
  }
}
