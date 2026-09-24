import { Module, Global } from '@nestjs/common';
import { JevService } from './jev-fetch.service';

@Global()
@Module({
  providers: [JevService],
  exports: [JevService],
})
export class JevModule {}
