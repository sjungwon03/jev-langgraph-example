import { Global, Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { DynamicConfigService } from './dynamic-config.service';

@Global()
@Module({
  imports: [RedisModule],
  providers: [DynamicConfigService],
  exports: [DynamicConfigService],
})
export class DynamicConfigModule {}
