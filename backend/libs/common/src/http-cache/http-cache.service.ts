import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { CachedResponse } from './http-cache.interface';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HttpCacheService {
  private readonly logger = new Logger(HttpCacheService.name);
  private readonly memoryStore = new Map<string, { value: CachedResponse; expiresAt: number }>();
  private readonly memoryTags = new Map<string, Set<string>>();

  constructor(@Optional() private readonly redisService?: RedisService) {}

  /**
   * Generates a deterministic ETag for response payload
   */
  generateETag(payload: any): string {
    const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const hash = crypto.createHash('sha1').update(raw).digest('hex').substring(0, 16);
    return `W/"${hash}"`;
  }

  /**
   * Retrieves cached response by key
   */
  async get<T = any>(key: string): Promise<CachedResponse<T> | null> {
    const client = this.redisService?.getClient();

    if (client && client.status === 'ready') {
      try {
        const raw = await client.get(`httpcache:${key}`);
        if (raw) {
          return JSON.parse(raw);
        }
        return null;
      } catch (err: any) {
        this.logger.warn(`Redis get failed: ${err.message}. Checking memory fallback.`);
      }
    }

    // Memory fallback
    const entry = this.memoryStore.get(key);
    if (entry) {
      if (Date.now() > entry.expiresAt) {
        this.memoryStore.delete(key);
        return null;
      }
      return entry.value as CachedResponse<T>;
    }

    return null;
  }

  /**
   * Stores response in cache and indexes by tags
   */
  async set<T = any>(
    key: string,
    data: T,
    ttl = 60,
    etag?: string,
    tags: string[] = [],
  ): Promise<CachedResponse<T>> {
    const computedEtag = etag || this.generateETag(data);
    const cached: CachedResponse<T> = {
      data,
      etag: computedEtag,
      cachedAt: Date.now(),
      ttl,
      tags,
    };

    const client = this.redisService?.getClient();

    if (client && client.status === 'ready') {
      try {
        const fullKey = `httpcache:${key}`;
        await client.set(fullKey, JSON.stringify(cached), 'EX', ttl);

        // Index tags in Redis sets
        for (const tag of tags) {
          await client.sadd(`httpcache:tag:${tag}`, fullKey);
          await client.expire(`httpcache:tag:${tag}`, ttl * 2);
        }

        return cached;
      } catch (err: any) {
        this.logger.warn(`Redis set failed: ${err.message}. Using memory fallback.`);
      }
    }

    // Memory fallback
    this.memoryStore.set(key, {
      value: cached,
      expiresAt: Date.now() + ttl * 1000,
    });

    for (const tag of tags) {
      if (!this.memoryTags.has(tag)) {
        this.memoryTags.set(tag, new Set());
      }
      this.memoryTags.get(tag)?.add(key);
    }

    return cached;
  }

  /**
   * Invalidates all cache entries mapped to the given tags
   */
  async invalidateTags(tags: string[]): Promise<number> {
    if (!tags || tags.length === 0) return 0;

    let invalidatedCount = 0;
    const client = this.redisService?.getClient();

    if (client && client.status === 'ready') {
      try {
        for (const tag of tags) {
          const tagKey = `httpcache:tag:${tag}`;
          const keys = await client.smembers(tagKey);

          if (keys.length > 0) {
            await client.del(...keys);
            invalidatedCount += keys.length;
          }
          await client.del(tagKey);
        }

        this.logger.log(`🧹 [HttpCache] Invalidated ${invalidatedCount} keys across tags: [${tags.join(', ')}]`);
        return invalidatedCount;
      } catch (err: any) {
        this.logger.warn(`Redis invalidateTags failed: ${err.message}. Cleaning memory fallback.`);
      }
    }

    // Memory fallback
    for (const tag of tags) {
      const keys = this.memoryTags.get(tag);
      if (keys) {
        for (const k of keys) {
          this.memoryStore.delete(k);
          invalidatedCount++;
        }
        this.memoryTags.delete(tag);
      }
    }

    return invalidatedCount;
  }

  /**
   * Clears entire cache (for test isolation)
   */
  async clear(): Promise<void> {
    this.memoryStore.clear();
    this.memoryTags.clear();

    const client = this.redisService?.getClient();
    if (client && client.status === 'ready') {
      const keys = await client.keys('httpcache:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    }
  }
}
