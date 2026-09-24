import { Module } from '@nestjs/common';
import { DynamicConfigModule } from '../config/dynamic-config.module';
import { MetricsModule } from '../metrics/metrics.module';
import { RedisModule } from '../redis/redis.module';
import { ResilienceModule } from '../resilience/resilience.module';
import { ActuatorController } from './actuator.controller';

@Module({
  imports: [RedisModule, MetricsModule, ResilienceModule, DynamicConfigModule],
  controllers: [ActuatorController],
})
export class ActuatorModule {}
