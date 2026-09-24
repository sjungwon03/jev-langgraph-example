import { Module, Global, DynamicModule } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { RateLimitGuard } from './rate-limit.guard';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [RateLimitService, RateLimitGuard],
  exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule {
  static forRoot(): DynamicModule {
    return {
      module: RateLimitModule,
      imports: [RedisModule],
      providers: [RateLimitService, RateLimitGuard],
      exports: [RateLimitService, RateLimitGuard],
    };
  }
}
