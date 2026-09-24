import { Injectable, Logger } from '@nestjs/common';
import { ProxmoxMcpClient } from '../mcp/proxmox-mcp.client';
import { AuditService } from '../audit/audit.service';
import { VmActionRequestDto, VmActionType } from '@nest-msa/contracts';
import { v4 as uuidv4 } from 'uuid';

export interface PendingInfraConfirmation {
  token: string;
  action: string;
  node: string;
  vmid: number;
  args: Record<string, any>;
  description: string;
  expiresAt: number;
}

@Injectable()
export class InfraService {
  private readonly logger = new Logger(InfraService.name);
  private pendingConfirmations: Map<string, PendingInfraConfirmation> = new Map();

  constructor(
    private readonly mcpClient: ProxmoxMcpClient,
    private readonly auditService: AuditService,
  ) {}

  async getClusterSummary() {
    return this.mcpClient.getClusterSummary();
  }

  async getNodes() {
    return this.mcpClient.callTool('list_nodes');
  }

  async getVms(node?: string) {
    return this.mcpClient.callTool('cluster_resources', { type: 'vm' });
  }

  async getStorage(node?: string) {
    return this.mcpClient.callTool('list_storage', { node });
  }

  async getTasks(node: string = 'pve-node-01') {
    return this.mcpClient.callTool('list_tasks', { node });
  }

  async getNetworks(node?: string) {
    return this.mcpClient.callTool('list_networks', { node });
  }

  async getTopology() {
    const nodes = await this.mcpClient.callTool('list_nodes');
    const vms = await this.mcpClient.callTool('cluster_resources', { type: 'vm' });
    const storage = await this.mcpClient.callTool('cluster_resources', { type: 'storage' });
    const networks = await this.mcpClient.callTool('list_networks', {});
    return {
      datacenter: 'Proxmox-DC-Seoul',
      nodes: nodes.map((n: any) => ({
        ...n,
        vms: vms.filter((v: any) => v.node === n.node),
        storage: storage.filter((s: any) => !s.node || s.node === n.node),
        networks: networks.filter((nw: any) => !nw.node || nw.node === n.node),
      })),
    };
  }

  /**
   * Remote MCP tool execution for Chat Agent
   */
  async executeTool(tool: string, args: Record<string, any> = {}) {
    this.logger.log(`[Remote Tool Call] Executing tool: ${tool} with args: ${JSON.stringify(args)}`);
    return this.mcpClient.callTool(tool, args);
  }

  /**
   * List all available MCP tools
   */
  async getTools() {
    return this.mcpClient.listTools();
  }

  createPendingConfirmation(
    action: string,
    node: string,
    vmid: number,
    args: Record<string, any>,
    description: string,
  ): PendingInfraConfirmation {
    const token = `cf_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const confirmation: PendingInfraConfirmation = {
      token,
      action,
      node,
      vmid,
      args,
      description,
      expiresAt: Date.now() + 5 * 60 * 1000,
    };
    this.pendingConfirmations.set(token, confirmation);
    return confirmation;
  }

  consumeConfirmation(token: string): PendingInfraConfirmation | null {
    const conf = this.pendingConfirmations.get(token);
    if (!conf) return null;
    if (Date.now() > conf.expiresAt) {
      this.pendingConfirmations.delete(token);
      return null;
    }
    this.pendingConfirmations.delete(token);
    return conf;
  }

  async executeVmAction(dto: VmActionRequestDto) {
    const { node, vmid, action, confirm } = dto;
    const toolPrefix = 'qemu';
    let toolName = `${toolPrefix}_${action}`;

    if (action === VmActionType.DELETE || action === VmActionType.FORCE_STOP) {
      if (!confirm) {
        const conf = this.createPendingConfirmation(
          toolName,
          node,
          vmid,
          { node, vmid },
          `${node}의 VM ${vmid}에 대한 ${action} 작업`,
        );
        this.auditService.record('user', action, 'vm', String(vmid), 'WAITING_CONFIRMATION', {
          token: conf.token,
        });
        return {
          status: 'CONFIRMATION_REQUIRED',
          confirmation: conf,
        };
      }
    }

    try {
      const result = await this.mcpClient.callTool(toolName, {
        node,
        vmid,
        confirm: confirm || false,
      });

      this.auditService.record('user', action, 'vm', String(vmid), 'SUCCESS', {
        upid: result.upid,
      });

      return {
        status: 'SUCCESS',
        result,
      };
    } catch (err: any) {
      this.auditService.record('user', action, 'vm', String(vmid), 'FAILED', {
        error: err.message,
      });
      throw err;
    }
  }

  async confirmAction(token: string, approved: boolean) {
    const conf = this.consumeConfirmation(token);
    if (!conf) {
      return { success: false, message: '만료되었거나 유효하지 않은 승인 토큰입니다.' };
    }
    if (!approved) {
      this.auditService.record('user', conf.action, 'vm', String(conf.vmid), 'REJECTED', {
        token,
      });
      return { success: false, message: '사용자가 작업을 취소했습니다.' };
    }

    const result = await this.mcpClient.callTool(conf.action, {
      ...conf.args,
      confirm: true,
    });
    this.auditService.record('user', conf.action, 'vm', String(conf.vmid), 'SUCCESS', {
      token,
      upid: result.upid,
    });
    return { success: true, result, message: '보안 승인이 확인되어 작업이 성공적으로 실행되었습니다.' };
  }

  async createVm(dto: any) {
    const tool = dto.type === 'lxc' ? 'lxc_create' : 'qemu_create';
    const result = await this.mcpClient.callTool(tool, dto);
    this.auditService.record('user', tool, dto.type || 'qemu', String(dto.vmid), 'SUCCESS', {
      name: dto.name,
      cpus: dto.cpus,
      memory: dto.memory,
    });
    return result;
  }

  async getSnapshots(node: string, vmid: number) {
    return this.mcpClient.callTool('qemu_snapshot_list', { node, vmid });
  }

  async createSnapshot(dto: any) {
    const result = await this.mcpClient.callTool('qemu_snapshot_create', dto);
    this.auditService.record('user', 'snapshot_create', 'vm', String(dto.vmid), 'SUCCESS', {
      snapname: dto.snapname,
    });
    return result;
  }

  async resizeDisk(dto: any) {
    const result = await this.mcpClient.callTool('qemu_resize_disk', dto);
    this.auditService.record('user', 'resize_disk', 'vm', String(dto.vmid), 'SUCCESS', {
      disk: dto.disk,
      size: dto.size,
    });
    return result;
  }
}
