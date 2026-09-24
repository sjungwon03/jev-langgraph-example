import { HttpCacheService } from './http-cache.service';
import { HttpCacheInterceptor } from './http-cache.interceptor';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { HttpStatus } from '@nestjs/common';
import {
  HTTP_CACHE_OPTIONS_KEY,
  INVALIDATE_CACHE_TAGS_KEY,
} from './http-cache.decorator';

describe('HttpCacheModule', () => {
  let cacheService: HttpCacheService;

  beforeEach(() => {
    cacheService = new HttpCacheService();
  });

  describe('HttpCacheService', () => {
    it('should generate deterministic ETags for identical payloads', () => {
      const etag1 = cacheService.generateETag({ id: 1, name: 'Alice' });
      const etag2 = cacheService.generateETag({ id: 1, name: 'Alice' });
      const etag3 = cacheService.generateETag({ id: 2, name: 'Bob' });

      expect(etag1).toBe(etag2);
      expect(etag1).toMatch(/^W\/"[0-9a-f]{16}"$/);
      expect(etag1).not.toBe(etag3);
    });

    it('should set and get cached responses', async () => {
      await cacheService.set('test-key', { status: 'ok' }, 60, undefined, ['test-tag']);

      const cached = await cacheService.get('test-key');
      expect(cached).not.toBeNull();
      expect(cached?.data).toEqual({ status: 'ok' });
      expect(cached?.etag).toBeDefined();
    });

    it('should invalidate cache entries by tag', async () => {
      await cacheService.set('user:1', { name: 'User 1' }, 60, undefined, ['users']);
      await cacheService.set('user:2', { name: 'User 2' }, 60, undefined, ['users']);
      await cacheService.set('product:1', { name: 'Product 1' }, 60, undefined, ['products']);

      await cacheService.invalidateTags(['users']);

      expect(await cacheService.get('user:1')).toBeNull();
      expect(await cacheService.get('user:2')).toBeNull();
      expect(await cacheService.get('product:1')).not.toBeNull();
    });
  });

  describe('HttpCacheInterceptor', () => {
    let interceptor: HttpCacheInterceptor;
    let reflector: Reflector;

    beforeEach(() => {
      reflector = new Reflector();
      cacheService = new HttpCacheService();
      interceptor = new HttpCacheInterceptor(reflector, cacheService);
    });

    it('should cache response on MISS and set ETag and X-Cache: MISS headers', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === HTTP_CACHE_OPTIONS_KEY) return { ttl: 60, scope: 'public' };
        return undefined;
      });

      const headersSet: Record<string, string> = {};
      const mockReq = { method: 'GET', url: '/api/v1/users', headers: {} };
      const mockRes = {
        setHeader: (k: string, v: string) => {
          headersSet[k] = v;
        },
      };

      const mockCtx = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => mockReq,
          getResponse: () => mockRes,
        }),
      } as any;

      const mockHandler = {
        handle: () => of([{ id: 1, name: 'Alice' }]),
      };

      const obs = await interceptor.intercept(mockCtx, mockHandler);
      let responseData: any;
      obs.subscribe((data) => (responseData = data));

      expect(responseData).toEqual([{ id: 1, name: 'Alice' }]);
      expect(headersSet['X-Cache']).toBe('MISS');
      expect(headersSet['ETag']).toBeDefined();
      expect(headersSet['Cache-Control']).toBe('public, max-age=60');

      // Verify second call is a Cache HIT
      const hitHeaders: Record<string, string> = {};
      const hitRes = {
        setHeader: (k: string, v: string) => {
          hitHeaders[k] = v;
        },
      };
      const hitCtx = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => mockReq,
          getResponse: () => hitRes,
        }),
      } as any;

      const hitHandler = {
        handle: jest.fn(), // Should not be called
      };

      const hitObs = await interceptor.intercept(hitCtx, hitHandler);
      let hitData: any;
      hitObs.subscribe((data) => (hitData = data));

      expect(hitHandler.handle).not.toHaveBeenCalled();
      expect(hitData).toEqual([{ id: 1, name: 'Alice' }]);
      expect(hitHeaders['X-Cache']).toBe('HIT');
    });

    it('should return 304 Not Modified when client If-None-Match matches ETag', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === HTTP_CACHE_OPTIONS_KEY) return { ttl: 60, scope: 'public' };
        return undefined;
      });

      const mockReq = { method: 'GET', url: '/api/v1/config', headers: {} };
      const headersSet: Record<string, string> = {};
      let responseStatus = 200;

      const mockRes = {
        status: (s: number) => {
          responseStatus = s;
        },
        setHeader: (k: string, v: string) => {
          headersSet[k] = v;
        },
      };

      const mockCtx = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => mockReq,
          getResponse: () => mockRes,
        }),
      } as any;

      // 1st request -> prime the cache
      const obs1 = await interceptor.intercept(mockCtx, {
        handle: () => of({ theme: 'dark' }),
      });
      obs1.subscribe();

      const cachedEtag = headersSet['ETag'];
      expect(cachedEtag).toBeDefined();

      // 2nd request with matching If-None-Match
      const conditionalReq = {
        method: 'GET',
        url: '/api/v1/config',
        headers: { 'if-none-match': cachedEtag },
      };

      let conditionalStatus = 200;
      const conditionalHeaders: Record<string, string> = {};
      const conditionalRes = {
        status: (s: number) => {
          conditionalStatus = s;
        },
        setHeader: (k: string, v: string) => {
          conditionalHeaders[k] = v;
        },
      };

      const conditionalCtx = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => conditionalReq,
          getResponse: () => conditionalRes,
        }),
      } as any;

      const obs2 = await interceptor.intercept(conditionalCtx, {
        handle: jest.fn(),
      });

      let conditionalData: any;
      obs2.subscribe((data) => (conditionalData = data));

      expect(conditionalStatus).toBe(HttpStatus.NOT_MODIFIED); // 304
      expect(conditionalData).toBeNull();
      expect(conditionalHeaders['X-Cache']).toBe('HIT');
    });

    it('should invalidate cache tags on mutating requests', async () => {
      // Prime a cached item with tag 'users'
      await cacheService.set('public:GET:/api/v1/users', { count: 10 }, 60, undefined, ['users']);
      expect(await cacheService.get('public:GET:/api/v1/users')).not.toBeNull();

      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
        if (key === INVALIDATE_CACHE_TAGS_KEY) return ['users'];
        return undefined;
      });

      const mockCtx = {
        getType: () => 'http',
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({
          getRequest: () => ({ method: 'POST', url: '/api/v1/users' }),
          getResponse: () => ({}),
        }),
      } as any;

      const obs = await interceptor.intercept(mockCtx, {
        handle: () => of({ success: true }),
      });

      obs.subscribe();

      // Allow microtask to finish
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(await cacheService.get('public:GET:/api/v1/users')).toBeNull();
    });
  });
});
