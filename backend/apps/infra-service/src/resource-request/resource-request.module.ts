import { Module } from '@nestjs/common';
import { ResourceRequestService } from './resource-request.service';
import { ResourceRequestController } from './resource-request.controller';
import { ProxmoxMcpModule } from '../mcp/proxmox-mcp.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [ProxmoxMcpModule, AuditModule],
  controllers: [ResourceRequestController],
  providers: [ResourceRequestService],
  exports: [ResourceRequestService],
})
export class ResourceRequestModule {}
