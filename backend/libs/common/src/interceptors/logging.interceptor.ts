import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CORRELATION_ID_HEADER } from '../correlation/correlation-id.middleware';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const type = context.getType();
    if (type === 'http') {
      const req = context.switchToHttp().getRequest();
      const { method, url } = req;
      const correlationId = req.headers?.[CORRELATION_ID_HEADER] || '-';
      const now = Date.now();

      return next.handle().pipe(
        tap(() => {
          const delay = Date.now() - now;
          this.logger.log(`[Trace: ${correlationId}] [${method}] ${url} - ${delay}ms`);
        }),
      );
    }

    // RabbitMQ Microservice RPC/Event
    const now = Date.now();
    return next.handle().pipe(
      tap(() => {
        const delay = Date.now() - now;
        this.logger.log(`[RMQ Handler] - ${delay}ms`);
      }),
    );
  }
}
