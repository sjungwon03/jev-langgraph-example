import { Module, Global } from '@nestjs/common';
import { HttpCacheService } from './http-cache.service';
import { HttpCacheInterceptor } from './http-cache.interceptor';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [HttpCacheService, HttpCacheInterceptor],
  exports: [HttpCacheService, HttpCacheInterceptor],
})
export class HttpCacheModule {}
