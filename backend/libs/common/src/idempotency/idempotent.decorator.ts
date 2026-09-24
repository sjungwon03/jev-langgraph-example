import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENT_KEY = 'IDEMPOTENT_METADATA';

export interface IdempotentOptions {
  /**
   * 멱등성 캐시 유지 시간 (초 단위, 기본값: 86400초 / 24시간)
   */
  ttlSeconds?: number;
  /**
   * 헤더가 없을 때 필수 여부 (기본값: false - 헤더가 없으면 멱등성 검사 패스)
   */
  required?: boolean;
}

/**
 * 중복 요청(네트워크 재시도, 중복 클릭 등) 방지를 위한 멱등성 데코레이터
 *
 * 클라이언트가 `x-idempotency-key` 헤더를 전달하면:
 * 1. 처리 중인 경우: 409 Conflict 반환
 * 2. 이미 완료된 경우: 최초 응답 결과와 상태코드를 캐시에서 즉시 반환 (x-cache: IDEMPOTENT_HIT)
 * 3. 최초 실행인 경우: 정상 처리 후 결과 캐싱
 */
export const Idempotent = (options: IdempotentOptions = {}) => SetMetadata(IDEMPOTENT_KEY, options);
