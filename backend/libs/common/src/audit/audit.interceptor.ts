import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';
import { AUDIT_METADATA_KEY } from './audit.decorator';
import { AuditOptions, AuditEvent } from './audit.interface';
import { AuditService } from './audit.service';
import { RequestContextService } from '../context/request-context.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditOptions = this.reflector.getAllAndOverride<AuditOptions>(
      AUDIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!auditOptions) {
      return next.handle();
    }

    const startTime = Date.now();
    let actor: any;
    let clientIp: string | undefined;
    let userAgent: string | undefined;

    if (context.getType() === 'http') {
      const req = context.switchToHttp().getRequest();
      actor = req.user
        ? {
            id: req.user.id || req.user.sub,
            email: req.user.email,
            role: req.user.role || (req.user.roles && req.user.roles[0]),
          }
        : undefined;

      const ipHeader = req.headers['x-forwarded-for'];
      clientIp = typeof ipHeader === 'string' ? ipHeader.split(',')[0].trim() : req.ip;
      userAgent = req.headers['user-agent'];
    }

    const traceId = RequestContextService.getTraceId();

    return next.handle().pipe(
      tap({
        next: () => {
          const durationMs = Date.now() - startTime;
          const event: AuditEvent = {
            id: uuidv4(),
            action: auditOptions.action,
            resource: auditOptions.resource,
            actor,
            clientIp,
            userAgent,
            status: 'SUCCESS',
            durationMs,
            timestamp: new Date().toISOString(),
            traceId,
            metadata: auditOptions.metadata,
          };

          this.auditService.dispatch(event);
        },
        error: (err) => {
          const durationMs = Date.now() - startTime;
          const event: AuditEvent = {
            id: uuidv4(),
            action: auditOptions.action,
            resource: auditOptions.resource,
            actor,
            clientIp,
            userAgent,
            status: 'FAILED',
            durationMs,
            timestamp: new Date().toISOString(),
            traceId,
            metadata: auditOptions.metadata,
            errorMessage: err.message,
          };

          this.auditService.dispatch(event);
        },
      }),
    );
  }
}
