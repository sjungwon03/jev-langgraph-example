import { Injectable } from '@nestjs/common';
import * as os from 'node:os';
import { AppLogger } from '../logger/app-logger.service';
import { RedisService } from '../redis/redis.service';

export interface DistributedLockOptions {
  /**
   * 최대 락 유지 시간 (초 단위, 기본 60초).
   * 작업 도중 노드가 비정상 종료(Crash)되어도 데드락이 걸리지 않도록 방지하는 안전 타임아웃.
   */
  lockAtMostSeconds?: number;
  /**
   * 최소 락 유지 시간 (초 단위, 기본 0초).
   * 작업이 매우 빨리 끝나더라도 서버 간 시계 오차(Clock Drift)로 인해 다른 노드가 즉시 재실행하는 것을 방지.
   */
  lockAtLeastSeconds?: number;
}

/**
 * Spring ShedLock 스타일의 Redis 기반 분산 락 서비스
 *
 * Kubernetes 다중 파드 환경에서 동일한 스케줄러/배치 태스크가
 * 동시에 중복 실행되지 않고 단 1개의 파드에서만 1회 실행되도록 보장합니다.
 */
@Injectable()
export class DistributedLockService {
  private readonly logger = new AppLogger(DistributedLockService.name);
  private readonly nodeId = `${os.hostname()}:${process.pid}`;

  constructor(private readonly redisService: RedisService) {}

  /**
   * 분산 락 획득 시도 (원자적 SET NX)
   */
  async acquireLock(lockName: string, lockAtMostSeconds: number = 60): Promise<boolean> {
    const key = `shedlock:${lockName}`;
    const value = `${this.nodeId}:${Date.now()}`;

    const acquired = await this.redisService
      .getClient()
      .set(key, value, 'EX', lockAtMostSeconds, 'NX');

    return acquired === 'OK';
  }

  /**
   * 분산 락 해제
   * lockAtLeastSeconds가 설정된 경우 해당 시간만큼 락을 유지하도록 남겨둠
   */
  async releaseLock(
    lockName: string,
    lockAtLeastSeconds: number = 0,
    acquiredAt: number = Date.now(),
  ): Promise<void> {
    const key = `shedlock:${lockName}`;
    const elapsedSeconds = Math.floor((Date.now() - acquiredAt) / 1000);

    if (lockAtLeastSeconds > elapsedSeconds) {
      const remainingSeconds = lockAtLeastSeconds - elapsedSeconds;
      await this.redisService.getClient().expire(key, remainingSeconds);
      this.logger.debug(
        `[ShedLock] Lock '${lockName}' held for minimum duration (${remainingSeconds}s remaining)`,
      );
    } else {
      await this.redisService.del(key);
      this.logger.debug(`[ShedLock] Lock '${lockName}' released`);
    }
  }

  /**
   * 락을 선점하여 안전하게 태스크를 1회만 실행하는 고차 함수
   * 락 획득 실패 시 태스크를 건너뛰고 null을 반환
   */
  async withLock<T>(
    lockName: string,
    task: () => Promise<T>,
    options: DistributedLockOptions = {},
  ): Promise<T | null> {
    const lockAtMost = options.lockAtMostSeconds || 60;
    const lockAtLeast = options.lockAtLeastSeconds || 0;
    const acquiredAt = Date.now();

    const acquired = await this.acquireLock(lockName, lockAtMost);
    if (!acquired) {
      this.logger.debug(
        `[ShedLock] Lock '${lockName}' is currently held by another node. Skipping execution.`,
      );
      return null;
    }

    this.logger.debug(
      `[ShedLock] Node '${this.nodeId}' acquired lock '${lockName}'. Executing task...`,
    );

    try {
      return await task();
    } finally {
      await this.releaseLock(lockName, lockAtLeast, acquiredAt);
    }
  }
}
