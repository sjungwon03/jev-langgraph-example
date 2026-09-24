import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CommonResponse } from '../dto/common-response.dto';

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, CommonResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<CommonResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
      })),
    );
  }
}
