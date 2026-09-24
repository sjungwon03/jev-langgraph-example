import { Global, Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { ResilienceService } from './resilience.service';

@Global()
@Module({
  imports: [MetricsModule],
  providers: [ResilienceService],
  exports: [ResilienceService],
})
export class ResilienceModule {}
