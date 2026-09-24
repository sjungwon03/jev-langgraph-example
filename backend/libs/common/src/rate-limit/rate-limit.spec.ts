import { RateLimitService } from './rate-limit.service';
import { RateLimitGuard } from './rate-limit.guard';
import { RATE_LIMIT_KEY } from './rate-limit.decorator';
import { Reflector } from '@nestjs/core';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('RateLimitModule', () => {
  describe('RateLimitService', () => {
    let service: RateLimitService;

    beforeEach(() => {
      service = new RateLimitService();
    });

    it('should allow requests within limit and track remaining count', async () => {
      const res1 = await service.checkRateLimit('client-1', 2, 60);
      expect(res1.isAllowed).toBe(true);
      expect(res1.remaining).toBe(1);

      const res2 = await service.checkRateLimit('client-1', 2, 60);
      expect(res2.isAllowed).toBe(true);
      expect(res2.remaining).toBe(0);

      const res3 = await service.checkRateLimit('client-1', 2, 60);
      expect(res3.isAllowed).toBe(false);
      expect(res3.retryAfterSeconds).toBeGreaterThan(0);
    });

    it('should reset rate limit after reset is called', async () => {
      await service.checkRateLimit('client-reset', 1, 60);
      await service.reset('client-reset');

      const fresh = await service.checkRateLimit('client-reset', 1, 60);
      expect(fresh.isAllowed).toBe(true);
      expect(fresh.remaining).toBe(0);
    });
  });

  describe('RateLimitGuard', () => {
    let guard: RateLimitGuard;
    let reflector: Reflector;
    let rateLimitService: RateLimitService;

    beforeEach(() => {
      reflector = new Reflector();
      rateLimitService = new RateLimitService();
      guard = new RateLimitGuard(reflector, rateLimitService);
    });

    it('should set X-RateLimit headers and allow allowed requests', async () => {
      const headersSet: Record<string, string> = {};
      const mockContext = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ headers: { 'x-forwarded-for': '192.168.1.100' } }),
          getResponse: () => ({
            setHeader: (key: string, value: string) => {
              headersSet[key] = value;
            },
          }),
        }),
      } as any;

      const allowed = await guard.canActivate(mockContext);
      expect(allowed).toBe(true);
      expect(headersSet['X-RateLimit-Limit']).toBe('60');
      expect(headersSet['X-RateLimit-Remaining']).toBe('59');
    });

    it('should throw 429 when rate limit is exceeded', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: any) => {
        if (key === RATE_LIMIT_KEY) return { limit: 1, ttl: 60 };
        return undefined;
      });

      const mockResponse = { setHeader: jest.fn() };
      const mockContext = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ user: { id: 'usr-999' } }),
          getResponse: () => mockResponse,
        }),
      } as any;

      // 1st request -> pass
      await guard.canActivate(mockContext);

      // 2nd request -> throw 429
      await expect(guard.canActivate(mockContext)).rejects.toThrow(HttpException);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });
  });
});
