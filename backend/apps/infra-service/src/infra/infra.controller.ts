import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { InfraService } from './infra.service';
import { VmActionRequestDto } from '@nest-msa/contracts';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Infrastructure Management')
@Controller('api/infra')
export class InfraController {
  constructor(private readonly infraService: InfraService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get overall Proxmox cluster summary (telemetry, nodes, VMs)' })
  getClusterSummary() {
    return this.infraService.getClusterSummary();
  }

  @Get('nodes')
  @ApiOperation({ summary: 'List all Proxmox nodes' })
  getNodes() {
    return this.infraService.getNodes();
  }

  @Get('vms')
  @ApiOperation({ summary: 'List all QEMU VMs and LXC containers' })
  getVms(@Query('node') node?: string) {
    return this.infraService.getVms(node);
  }

  @Get('storage')
  @ApiOperation({ summary: 'List node storages' })
  getStorage(@Query('node') node?: string) {
    return this.infraService.getStorage(node);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'List cluster tasks' })
  getTasks(@Query('node') node?: string) {
    return this.infraService.getTasks(node);
  }

  @Get('networks')
  @ApiOperation({ summary: 'List virtual networks and bridges' })
  getNetworks(@Query('node') node?: string) {
    return this.infraService.getNetworks(node);
  }

  @Get('topology')
  @ApiOperation({ summary: 'Get cluster topology tree' })
  getTopology() {
    return this.infraService.getTopology();
  }

  /**
   * Remote MCP Tool Execution Endpoints for AI Chat Agent
   */
  @Get('tools')
  @ApiOperation({ summary: 'List available MCP tools for remote AI Agent' })
  getTools() {
    return this.infraService.getTools();
  }

  @Post('tools/execute')
  @ApiOperation({ summary: 'Remotely execute an MCP tool from AI Agent' })
  executeTool(@Body() body: { tool: string; args?: Record<string, any> }) {
    return this.infraService.executeTool(body.tool, body.args || {});
  }

  @Post('action')
  @ApiOperation({ summary: 'Execute VM power or lifecycle action (Start, Stop, Reboot, Delete)' })
  executeVmAction(@Body() dto: VmActionRequestDto) {
    return this.infraService.executeVmAction(dto);
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Confirm a destructive VM action with token' })
  confirmAction(@Body() body: { token: string; approved: boolean }) {
    return this.infraService.confirmAction(body.token, body.approved);
  }

  @Post('create')
  @ApiOperation({ summary: 'Create a new QEMU VM or LXC container' })
  createVm(@Body() dto: any) {
    return this.infraService.createVm(dto);
  }

  @Get('snapshots')
  @ApiOperation({ summary: 'Get snapshots for a VM' })
  getSnapshots(@Query('node') node: string, @Query('vmid') vmid: number) {
    return this.infraService.getSnapshots(node || 'pve-node-01', Number(vmid));
  }

  @Post('snapshot')
  @ApiOperation({ summary: 'Create a new VM snapshot' })
  createSnapshot(@Body() dto: any) {
    return this.infraService.createSnapshot(dto);
  }

  @Post('resize')
  @ApiOperation({ summary: 'Resize disk of a VM' })
  resizeDisk(@Body() dto: any) {
    return this.infraService.resizeDisk(dto);
  }
}
