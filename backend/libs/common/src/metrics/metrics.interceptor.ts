import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const path = req.route?.path || req.path || 'unknown';
    // /metrics 엔드포인트 자체는 메트릭 수집 루프 방지를 위해 제외
    if (path.includes('metrics')) {
      return next.handle();
    }

    const method = req.method;
    const start = process.hrtime();

    return next.handle().pipe(
      tap({
        next: () => {
          this.recordMetric(method, path, res.statusCode, start);
        },
        error: (err) => {
          const status = err.status || err.statusCode || 500;
          this.recordMetric(method, path, status, start);
        },
      }),
    );
  }

  private recordMetric(method: string, route: string, statusCode: number, start: [number, number]) {
    const diff = process.hrtime(start);
    const durationSeconds = diff[0] + diff[1] / 1e9;
    const statusStr = statusCode.toString();

    this.metricsService.httpRequestCounter.inc({
      method,
      route,
      status_code: statusStr,
    });

    this.metricsService.httpRequestDuration.observe(
      {
        method,
        route,
        status_code: statusStr,
      },
      durationSeconds,
    );
  }
}
