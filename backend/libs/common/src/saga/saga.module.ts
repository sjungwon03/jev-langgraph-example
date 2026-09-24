import { Module, Global } from '@nestjs/common';
import { SagaOrchestrator } from './saga-orchestrator.service';

@Global()
@Module({
  providers: [SagaOrchestrator],
  exports: [SagaOrchestrator],
})
export class SagaModule {}
