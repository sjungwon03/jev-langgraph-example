import { Module } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';
import { ProxmoxMcpModule } from '../mcp/proxmox-mcp.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [ProxmoxMcpModule, AuditModule],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
