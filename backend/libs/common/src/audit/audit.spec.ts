import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { Reflector } from '@nestjs/core';
import { of, throwError } from 'rxjs';
import { AUDIT_METADATA_KEY } from './audit.decorator';

describe('AuditModule', () => {
  let auditService: AuditService;
  let reflector: Reflector;
  let interceptor: AuditInterceptor;

  beforeEach(() => {
    auditService = new AuditService();
    reflector = new Reflector();
    interceptor = new AuditInterceptor(reflector, auditService);
  });

  it('should capture and dispatch successful audit event', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'USER_LOGIN',
      resource: 'AUTH',
    });

    const mockContext = {
      getType: () => 'http',
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'usr-42', email: 'alice@example.com', role: 'ADMIN' },
          ip: '127.0.0.1',
          headers: { 'user-agent': 'JestTest' },
        }),
      }),
    } as any;

    const mockCallHandler = {
      handle: () => of({ success: true }),
    };

    const unsubscribe = auditService.subscribe((event) => {
      expect(event.action).toBe('USER_LOGIN');
      expect(event.resource).toBe('AUTH');
      expect(event.actor?.email).toBe('alice@example.com');
      expect(event.status).toBe('SUCCESS');
      expect(event.durationMs).toBeGreaterThanOrEqual(0);
      unsubscribe();
      done();
    });

    interceptor.intercept(mockContext, mockCallHandler).subscribe();
  });

  it('should capture and dispatch failed audit event when error occurs', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'PASSWORD_RESET',
      resource: 'AUTH',
    });

    const mockContext = {
      getType: () => 'http',
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'usr-99', email: 'bob@example.com' },
          ip: '10.0.0.1',
          headers: {},
        }),
      }),
    } as any;

    const mockCallHandler = {
      handle: () => throwError(() => new Error('Invalid token')),
    };

    const unsubscribe = auditService.subscribe((event) => {
      expect(event.action).toBe('PASSWORD_RESET');
      expect(event.status).toBe('FAILED');
      expect(event.errorMessage).toBe('Invalid token');
      unsubscribe();
      done();
    });

    interceptor.intercept(mockContext, mockCallHandler).subscribe({
      error: () => {},
    });
  });
});
