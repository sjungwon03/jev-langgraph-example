import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  HTTP_CACHE_OPTIONS_KEY,
  INVALIDATE_CACHE_TAGS_KEY,
} from './http-cache.decorator';
import { HttpCacheOptions } from './http-cache.interface';
import { HttpCacheService } from './http-cache.service';

@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly cacheService: HttpCacheService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // 1. Check for cache invalidation tags on mutations (POST/PUT/PATCH/DELETE)
    const invalidateTags = this.reflector.getAllAndOverride<string[]>(
      INVALIDATE_CACHE_TAGS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (invalidateTags && invalidateTags.length > 0) {
      return next.handle().pipe(
        tap({
          next: async () => {
            await this.cacheService.invalidateTags(invalidateTags);
          },
        }),
      );
    }

    // 2. Check for @HttpCache options
    const cacheOptions = this.reflector.getAllAndOverride<HttpCacheOptions>(
      HTTP_CACHE_OPTIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!cacheOptions) {
      return next.handle();
    }

    // Only cache idempotent GET / HEAD requests
    const method = req.method?.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      return next.handle();
    }

    const ttl = cacheOptions.ttl ?? 60;
    const scope = cacheOptions.scope ?? 'public';
    const tags = cacheOptions.tags ?? [];

    // Resolve cache key
    let cacheKey: string;
    if (cacheOptions.keyGenerator) {
      cacheKey = cacheOptions.keyGenerator(req);
    } else {
      const userPrefix =
        scope === 'user'
          ? `user:${req.user?.id || req.user?.sub || 'anon'}:`
          : 'public:';
      cacheKey = `${userPrefix}${method}:${req.originalUrl || req.url}`;
    }

    // 3. Cache lookup
    const cached = await this.cacheService.get(cacheKey);
    const clientIfNoneMatch = req.headers['if-none-match'];

    if (cached) {
      const cacheControl = `${scope === 'user' ? 'private' : 'public'}, max-age=${ttl}`;

      // 4. Conditional Request: 304 Not Modified
      if (clientIfNoneMatch && clientIfNoneMatch === cached.etag) {
        if (res && typeof res.status === 'function') {
          res.status(HttpStatus.NOT_MODIFIED);
        }
        if (res && typeof res.setHeader === 'function') {
          res.setHeader('ETag', cached.etag);
          res.setHeader('Cache-Control', cacheControl);
          res.setHeader('X-Cache', 'HIT');
        }
        return of(null);
      }

      // Normal Cache HIT
      if (res && typeof res.setHeader === 'function') {
        res.setHeader('ETag', cached.etag);
        res.setHeader('Cache-Control', cacheControl);
        res.setHeader('X-Cache', 'HIT');
      }
      return of(cached.data);
    }

    // 5. Cache MISS: Execute handler and cache response
    return next.handle().pipe(
      tap({
        next: async (data) => {
          if (data === undefined || data === null) return;

          const etag = this.cacheService.generateETag(data);
          const cacheControl = `${scope === 'user' ? 'private' : 'public'}, max-age=${ttl}`;

          if (res && typeof res.setHeader === 'function') {
            res.setHeader('ETag', etag);
            res.setHeader('Cache-Control', cacheControl);
            res.setHeader('X-Cache', 'MISS');
          }

          await this.cacheService.set(cacheKey, data, ttl, etag, tags);
        },
      }),
    );
  }
}
