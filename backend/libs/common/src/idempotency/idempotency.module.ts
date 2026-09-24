import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Module({
  imports: [RedisModule],
  providers: [IdempotencyInterceptor],
  exports: [IdempotencyInterceptor],
})
export class IdempotencyModule {}
