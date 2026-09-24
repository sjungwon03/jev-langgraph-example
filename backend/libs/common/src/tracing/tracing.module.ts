import { Module, Global, DynamicModule } from '@nestjs/common';
import { TracingService } from './tracing.service';
import { HttpTracingInterceptor } from './tracing.interceptor';
import { RequestContextService } from '../context/request-context.service';

@Global()
@Module({
  providers: [TracingService, HttpTracingInterceptor, RequestContextService],
  exports: [TracingService, HttpTracingInterceptor],
})
export class TracingModule {
  static forRoot(): DynamicModule {
    return {
      module: TracingModule,
      providers: [TracingService, HttpTracingInterceptor, RequestContextService],
      exports: [TracingService, HttpTracingInterceptor],
    };
  }
}
