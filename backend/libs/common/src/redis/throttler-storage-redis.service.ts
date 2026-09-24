import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from './redis.service';

export interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

@Injectable()
export class ThrottlerStorageRedisService implements ThrottlerStorage {
  constructor(private readonly redisService: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const client = this.redisService.getClient();
    const hitKey = `throttle:${throttlerName}:${key}:hits`;
    const blockKey = `throttle:${throttlerName}:${key}:blocked`;

    // 1. 이미 차단 상태인지 확인
    const isBlocked = (await client.get(blockKey)) !== null;
    let timeToBlockExpire = 0;
    if (isBlocked) {
      const pttl = await client.pttl(blockKey);
      timeToBlockExpire = Math.max(Math.ceil(pttl / 1000), 0);
      return {
        totalHits: limit + 1,
        timeToExpire: timeToBlockExpire,
        isBlocked: true,
        timeToBlockExpire,
      };
    }

    // 2. 히트 수 원자적 증가 및 TTL 설정
    const totalHits = await client.incr(hitKey);
    if (totalHits === 1) {
      await client.pexpire(hitKey, ttl);
    }

    const pttl = await client.pttl(hitKey);
    const timeToExpire = Math.max(Math.ceil(pttl / 1000), 0);

    // 3. 한도 초과 시 차단 플래그 설정
    if (totalHits > limit) {
      if (blockDuration > 0) {
        await client.set(blockKey, '1', 'PX', blockDuration);
        timeToBlockExpire = Math.ceil(blockDuration / 1000);
      }
      return {
        totalHits,
        timeToExpire: timeToBlockExpire || timeToExpire,
        isBlocked: true,
        timeToBlockExpire: timeToBlockExpire || timeToExpire,
      };
    }

    return {
      totalHits,
      timeToExpire,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
  }
}
