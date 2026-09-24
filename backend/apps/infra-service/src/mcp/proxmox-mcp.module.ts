import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProxmoxMcpClient } from './proxmox-mcp.client';
import { ProxmoxApiClient } from './proxmox-api.client';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ProxmoxApiClient, ProxmoxMcpClient],
  exports: [ProxmoxApiClient, ProxmoxMcpClient],
})
export class ProxmoxMcpModule {}
