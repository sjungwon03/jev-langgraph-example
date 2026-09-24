import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { throwError } from 'rxjs';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // 1. RabbitMQ / Microservice RPC 컨텍스트 처리
    if (host.getType() === 'rpc') {
      const errMsg = exception instanceof Error ? exception.message : JSON.stringify(exception);
      this.logger.error(`RPC Exception: ${errMsg}`);

      if (exception instanceof HttpException) {
        return throwError(() => ({
          statusCode: exception.getStatus(),
          message: exception.message,
          error: exception.name,
        }));
      }

      return throwError(() => exception);
    }

    // 2. HTTP REST API 컨텍스트 처리
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      typeof (exception as any)?.getStatus === 'function'
        ? (exception as any).getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      typeof (exception as any)?.getResponse === 'function'
        ? (exception as any).getResponse()
        : (exception as any)?.message || 'Internal server error';

    this.logger.error(`HTTP Status: ${status} Error Message: ${JSON.stringify(message)}`);

    if (response && typeof response.status === 'function') {
      response.status(status).json({
        success: false,
        statusCode: status,
        error: message,
        path: request?.url,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
