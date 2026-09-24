import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from './agent/agent.module';
import { AuditModule } from './audit/audit.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../infra/env/.env', '../infra/env/.env'],
    }),
    AgentModule,
    AuditModule,
    ChatModule,
  ],
})
export class AppModule {}
