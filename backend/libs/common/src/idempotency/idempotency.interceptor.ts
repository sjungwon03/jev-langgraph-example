import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisService } from '../redis/redis.service';
import { IDEMPOTENT_KEY, IdempotentOptions } from './idempotent.decorator';

export const IDEMPOTENCY_HEADER = 'x-idempotency-key';

interface IdempotentRecord {
  status: 'PENDING' | 'RESOLVED';
  statusCode?: number;
  data?: any;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const options = this.reflector.get<IdempotentOptions>(IDEMPOTENT_KEY, context.getHandler());

    // 데코레이터가 없으면 그대로 통과
    if (!options) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const rawKey = req.headers[IDEMPOTENCY_HEADER] as string;

    if (!rawKey) {
      if (options.required) {
        throw new BadRequestException(`Missing required header: ${IDEMPOTENCY_HEADER}`);
      }
      return next.handle();
    }

    const redisKey = `idempotency:${rawKey}`;
    const ttlSeconds = options.ttlSeconds || 86400; // 기본 24시간 보관

    // 1. 기존 멱등성 레코드 조회
    const existing = await this.redisService.get(redisKey);
    if (existing) {
      try {
        const record: IdempotentRecord = JSON.parse(existing);
        if (record.status === 'PENDING') {
          throw new ConflictException(
            'A request with this idempotency key is currently being processed. Please retry later.',
          );
        }
        if (record.status === 'RESOLVED') {
          res.setHeader('x-cache', 'IDEMPOTENT_HIT');
          if (record.statusCode) {
            res.status(record.statusCode);
          }
          return of(record.data);
        }
      } catch (err) {
        if (err instanceof ConflictException) throw err;
        // JSON 파싱 에러 시 재실행 허용
      }
    }

    // 2. 동시성 제어를 위한 분산 락 (NX: Not eXists)
    const acquired = await this.redisService
      .getClient()
      .set(redisKey, JSON.stringify({ status: 'PENDING' }), 'EX', 30, 'NX');

    if (!acquired) {
      throw new ConflictException(
        'A request with this idempotency key is currently being processed. Please retry later.',
      );
    }

    // 3. 비즈니스 로직 실행 및 응답 캐싱
    return next.handle().pipe(
      tap({
        next: async (data) => {
          const resolvedRecord: IdempotentRecord = {
            status: 'RESOLVED',
            statusCode: res.statusCode,
            data,
          };
          await this.redisService.set(redisKey, JSON.stringify(resolvedRecord), ttlSeconds);
        },
        error: async () => {
          // 비즈니스 로직 처리 실패 시 락을 해제하여 재시도 허용
          await this.redisService.del(redisKey);
        },
      }),
    );
  }
}
