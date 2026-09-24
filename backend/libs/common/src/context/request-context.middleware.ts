import { Injectable, NestMiddleware } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { CORRELATION_ID_HEADER } from '../correlation/correlation-id.middleware';
import { RequestContextData, RequestContextService } from './request-context.service';

export const TRACEPARENT_HEADER = 'traceparent';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const rawTraceparent = req.headers[TRACEPARENT_HEADER] as string;
    const existingCorrelationId = req.headers[CORRELATION_ID_HEADER] as string;

    let traceId: string;
    let parentSpanId: string | undefined;

    if (rawTraceparent && rawTraceparent.startsWith('00-')) {
      // W3C Traceparent: 00-{traceId}-{parentSpanId}-{flags}
      const parts = rawTraceparent.split('-');
      if (parts.length >= 4) {
        traceId = parts[1];
        parentSpanId = parts[2];
      } else {
        traceId = existingCorrelationId || uuidv4();
      }
    } else {
      traceId = existingCorrelationId || uuidv4();
    }

    // 신규 Span ID 생성 (16자리 Hex)
    const spanId = crypto.randomBytes(8).toString('hex');
    const outgoingTraceparent = `00-${traceId.replace(/-/g, '').padEnd(32, '0').slice(0, 32)}-${spanId}-01`;

    // 헤더 동기화
    req.headers[CORRELATION_ID_HEADER] = traceId;
    req.headers[TRACEPARENT_HEADER] = outgoingTraceparent;
    res.setHeader(CORRELATION_ID_HEADER, traceId);
    res.setHeader(TRACEPARENT_HEADER, outgoingTraceparent);

    const contextData: RequestContextData = {
      traceId,
      spanId,
      parentSpanId,
      clientIp: req.ip || req.socket?.remoteAddress,
      method: req.method,
      url: req.originalUrl || req.url,
      startedAt: Date.now(),
    };

    // AsyncLocalStorage 비동기 스코프 시작
    RequestContextService.run(contextData, () => {
      next();
    });
  }
}
