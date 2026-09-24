import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ProxmoxMcpClient } from './proxmox-mcp.client';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ProxmoxMcpClient],
  exports: [ProxmoxMcpClient],
})
export class ProxmoxMcpModule {}
