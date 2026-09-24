import { SetMetadata } from '@nestjs/common';
import { DistributedLockOptions } from './distributed-lock.service';

export const DISTRIBUTED_SCHEDULE_KEY = 'DISTRIBUTED_SCHEDULE_KEY';

export interface DistributedScheduleOptions extends DistributedLockOptions {
  /**
   * 고유한 스케줄 및 락 식별자 (예: 'outbox-relay', 'daily-cleanup')
   */
  name: string;
  /**
   * 실행 주기 (밀리초 단위)
   */
  intervalMs?: number;
}

/**
 * Kubernetes 다중 파드 환경에서 중복 실행을 방지하는 ShedLock 기반 분산 스케줄러 데코레이터
 */
export const DistributedSchedule = (options: DistributedScheduleOptions) =>
  SetMetadata(DISTRIBUTED_SCHEDULE_KEY, options);
