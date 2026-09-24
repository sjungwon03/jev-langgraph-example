import { SetMetadata } from '@nestjs/common';
import { HttpCacheOptions } from './http-cache.interface';

export const HTTP_CACHE_OPTIONS_KEY = 'HTTP_CACHE_OPTIONS_KEY';
export const INVALIDATE_CACHE_TAGS_KEY = 'INVALIDATE_CACHE_TAGS_KEY';

/**
 * Decorator to enable distributed response caching with ETag and 304 Not Modified support
 */
export const HttpCache = (options: HttpCacheOptions = {}) =>
  SetMetadata(HTTP_CACHE_OPTIONS_KEY, options);

/**
 * Decorator to invalidate cache tags upon successful mutation (POST/PUT/PATCH/DELETE)
 */
export const InvalidateCache = (...tags: string[]) =>
  SetMetadata(INVALIDATE_CACHE_TAGS_KEY, tags);
