import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'RATE_LIMIT_KEY';
export const SKIP_RATE_LIMIT_KEY = 'SKIP_RATE_LIMIT_KEY';

export interface RateLimitOptions {
  /**
   * Maximum allowed requests in the time window
   * @default 60
   */
  limit?: number;

  /**
   * Time window in seconds
   * @default 60
   */
  ttl?: number;

  /**
   * Redis key prefix or namespace
   * @default 'rl'
   */
  keyPrefix?: string;

  /**
   * Optional function to resolve the rate limit key from execution context
   */
  keyGenerator?: (req: any) => string;
}

export const RateLimit = (options: RateLimitOptions = {}) =>
  SetMetadata(RATE_LIMIT_KEY, options);

export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
