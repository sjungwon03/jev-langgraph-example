import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface RateLimitResult {
  isAllowed: boolean;
  limit: number;
  remaining: number;
  resetSeconds: number;
  retryAfterSeconds: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly inMemoryFallback = new Map<string, { count: number; expiresAt: number }>();

  constructor(@Optional() private readonly redisService?: RedisService) {}

  /**
   * Evaluates if a request identifier exceeds the rate limit window
   */
  async checkRateLimit(
    key: string,
    limit = 60,
    ttl = 60,
  ): Promise<RateLimitResult> {
    const client = this.redisService?.getClient();

    if (client && client.status === 'ready') {
      try {
        const fullKey = `ratelimit:${key}`;
        const current = await client.incr(fullKey);

        if (current === 1) {
          await client.expire(fullKey, ttl);
        }

        const remainingTtl = Math.max(await client.ttl(fullKey), 1);
        const isAllowed = current <= limit;
        const remaining = Math.max(limit - current, 0);

        return {
          isAllowed,
          limit,
          remaining,
          resetSeconds: remainingTtl,
          retryAfterSeconds: isAllowed ? 0 : remainingTtl,
        };
      } catch (err: any) {
        this.logger.warn(`Redis rate-limit check failed: ${err.message}. Falling back to memory.`);
      }
    }

    // In-memory fallback
    const now = Date.now();
    const entry = this.inMemoryFallback.get(key);

    if (!entry || now > entry.expiresAt) {
      this.inMemoryFallback.set(key, {
        count: 1,
        expiresAt: now + ttl * 1000,
      });
      return {
        isAllowed: true,
        limit,
        remaining: limit - 1,
        resetSeconds: ttl,
        retryAfterSeconds: 0,
      };
    }

    entry.count += 1;
    const remainingSeconds = Math.max(Math.ceil((entry.expiresAt - now) / 1000), 1);
    const isAllowed = entry.count <= limit;
    const remaining = Math.max(limit - entry.count, 0);

    return {
      isAllowed,
      limit,
      remaining,
      resetSeconds: remainingSeconds,
      retryAfterSeconds: isAllowed ? 0 : remainingSeconds,
    };
  }

  /**
   * Resets rate limit for a key (useful for tests or IP unbanning)
   */
  async reset(key: string): Promise<void> {
    this.inMemoryFallback.delete(key);
    const client = this.redisService?.getClient();
    if (client && client.status === 'ready') {
      await client.del(`ratelimit:${key}`);
    }
  }
}
