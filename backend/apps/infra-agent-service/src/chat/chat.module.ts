import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AgentModule } from '../agent/agent.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AgentModule, AuditModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
