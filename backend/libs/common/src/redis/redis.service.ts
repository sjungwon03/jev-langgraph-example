import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  onModuleInit() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = Number(process.env.REDIS_PORT) || 6379;
    const password = process.env.REDIS_PASSWORD || undefined;

    this.client = new Redis({
      host,
      port,
      password,
      retryStrategy: (times) => {
        const delay = Math.min(times * 200, 2000);
        return delay;
      },
      lazyConnect: false,
    });

    this.client.on('connect', () => {
      this.logger.log(`🔴 [Redis] Connected successfully to ${host}:${port}`);
    });

    this.client.on('error', (err) => {
      this.logger.error(`🔴 [Redis] Connection error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
      this.logger.log('🔴 [Redis] Connection closed');
    }
  }

  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<'OK' | null> {
    if (ttlSeconds) {
      return this.client.set(key, value, 'EX', ttlSeconds);
    }
    return this.client.set(key, value);
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  /**
   * Redis 헬스체크 (PING -> PONG)
   */
  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * JWT 토큰 블랙리스트 등록 (로그아웃 처리)
   * 남은 유효 시간(초)만큼 Redis에 보관하여 자동 만료
   */
  async blacklistToken(token: string, ttlSeconds: number = 3600): Promise<void> {
    await this.set(`blacklist:token:${token}`, '1', ttlSeconds);
  }

  /**
   * 토큰이 블랙리스트에 등록되어 있는지 확인
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    const result = await this.get(`blacklist:token:${token}`);
    return result !== null;
  }
}
