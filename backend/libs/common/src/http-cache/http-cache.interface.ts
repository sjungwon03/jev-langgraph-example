export interface HttpCacheOptions {
  /**
   * Time to live in seconds
   * @default 60
   */
  ttl?: number;

  /**
   * Cache scope:
   * - 'public': shared across all clients
   * - 'user': scoped to authenticated user ID
   * @default 'public'
   */
  scope?: 'public' | 'user';

  /**
   * Optional cache tags for group invalidation
   */
  tags?: string[];

  /**
   * Custom cache key generator function
   */
  keyGenerator?: (req: any) => string;
}

export interface CachedResponse<T = any> {
  data: T;
  etag: string;
  cachedAt: number;
  ttl: number;
  contentType?: string;
  tags?: string[];
}
