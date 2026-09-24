import { Module } from '@nestjs/common';
import { InfraService } from './infra.service';
import { InfraController } from './infra.controller';
import { ProxmoxMcpModule } from '../mcp/proxmox-mcp.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [ProxmoxMcpModule, AuditModule],
  controllers: [InfraController],
  providers: [InfraService],
  exports: [InfraService],
})
export class InfraModule {}
