import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { LangGraphAgentService } from './langgraph-agent.service';
import { InfraRemoteClient } from './infra-remote.client';

@Module({
  imports: [ConfigModule, HttpModule],
  providers: [LangGraphAgentService, InfraRemoteClient],
  exports: [LangGraphAgentService, InfraRemoteClient],
})
export class AgentModule {}
