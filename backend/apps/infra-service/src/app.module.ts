import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProxmoxMcpModule } from './mcp/proxmox-mcp.module';
import { InfraModule } from './infra/infra.module';
import { AutomationModule } from './automation/automation.module';
import { AuditModule } from './audit/audit.module';
import { ResourceRequestModule } from './resource-request/resource-request.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../infra/env/.env', '../infra/env/.env'],
    }),
    AuthModule,
    ProxmoxMcpModule,
    InfraModule,
    AutomationModule,
    AuditModule,
    ResourceRequestModule,
  ],
})
export class AppModule {}
