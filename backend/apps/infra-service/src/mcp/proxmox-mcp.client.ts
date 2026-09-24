import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import * as fs from 'fs';
import {
  ClusterSummaryDto,
  ProxmoxNodeDto,
  ProxmoxVmDto,
  ProxmoxStorageDto,
  TargetKind,
} from '@nest-msa/contracts';
import { ProxmoxApiClient } from './proxmox-api.client';

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: any;
}

@Injectable()
export class ProxmoxMcpClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProxmoxMcpClient.name);
  private client: any = null;
  private transport: any = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly apiClient: ProxmoxApiClient,
  ) {}

  async onModuleInit() {
    const baseUrl = this.configService?.get<string>('PROXMOX_BASE_URL') || process.env.PROXMOX_BASE_URL;
    const tokenId = this.configService?.get<string>('PROXMOX_TOKEN_ID') || process.env.PROXMOX_TOKEN_ID;
    const tokenSecret = this.configService?.get<string>('PROXMOX_TOKEN_SECRET') || process.env.PROXMOX_TOKEN_SECRET;

    this.logger.log(`Proxmox service initializing. Target Proxmox host: ${baseUrl || 'Not configured'}`);

    // Check if external Theorvane/proxmox-mcp stdio binary exists
    try {
      const sdkClient = require('@modelcontextprotocol/sdk/client/index.js');
      const sdkTransport = require('@modelcontextprotocol/sdk/client/stdio.js');
      const Client = sdkClient.Client;
      const StdioClientTransport = sdkTransport.StdioClientTransport;

      const mcpCandidates = [
        path.resolve(process.cwd(), '../../infra/proxmox-mcp/dist/index.js'),
        path.resolve(process.cwd(), '../infra/proxmox-mcp/dist/index.js'),
        path.resolve(process.cwd(), 'infra/proxmox-mcp/dist/index.js'),
      ];

      const entryPath = mcpCandidates.find((p) => fs.existsSync(p));
      if (entryPath && baseUrl && tokenId && tokenSecret && !baseUrl.includes('example.com')) {
        this.logger.log(`Starting Proxmox MCP stdio process: ${entryPath}`);
        this.transport = new StdioClientTransport({
          command: 'node',
          args: [entryPath],
          env: {
            ...process.env,
            PROXMOX_BASE_URL: baseUrl,
            PROXMOX_TOKEN_ID: tokenId,
            PROXMOX_TOKEN_SECRET: tokenSecret,
          },
        });

        this.client = new Client(
          { name: 'nest-msa-infra-agent', version: '1.0.0' },
          { capabilities: {} },
        );

        await this.client.connect(this.transport);
        this.logger.log('✅ Connected to Proxmox MCP stdio process successfully!');
        return;
      }
    } catch (e: any) {
      this.logger.debug(`Stdio MCP transport unavailable (${e.message}). Using direct Proxmox REST API client.`);
    }

    this.logger.log('⚡ Direct Proxmox REST API Engine active (No mock data).');
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
      } catch (e) {}
      this.client = null;
    }
  }

  isSimulated(): boolean {
    return false;
  }

  /**
   * Helper to locate node for a given VM ID if not provided in args
   */
  private async resolveVmNode(vmid: number | string, givenNode?: string): Promise<string> {
    if (givenNode && givenNode.trim().length > 0) {
      return givenNode;
    }

    const numVmid = Number(vmid);
    if (!numVmid) {
      const nodes = await this.apiClient.getNodes().catch(() => []);
      return nodes[0]?.node || 'pve';
    }

    try {
      const vms = await this.apiClient.getClusterResources('vm');
      const found = vms.find((v) => Number(v.vmid) === numVmid);
      if (found?.node) return found.node;
    } catch {}

    const nodes = await this.apiClient.getNodes().catch(() => []);
    return nodes[0]?.node || 'pve';
  }

  /**
   * List available MCP tools
   */
  async listTools(): Promise<McpToolDefinition[]> {
    if (this.client) {
      try {
        const response = await this.client.listTools();
        return response.tools.map((t: any) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        }));
      } catch (err: any) {
        this.logger.warn(`Failed to list tools from MCP transport: ${err.message}`);
      }
    }

    return [
      { name: 'cluster_version', description: 'Read cluster version.' },
      { name: 'cluster_resources', description: 'List cluster resources (nodes, vms, storage).' },
      { name: 'list_nodes', description: 'List nodes in the cluster.' },
      { name: 'node_status', description: 'Read specific node status.' },
      { name: 'list_storage', description: 'List node storage.' },
      { name: 'list_qemu', description: 'List QEMU VMs on a node.' },
      { name: 'list_lxc', description: 'List LXC containers on a node.' },
      { name: 'list_tasks', description: 'List node tasks.' },
      { name: 'list_networks', description: 'List network interfaces on nodes.' },
      { name: 'task_status', description: 'Read status of a specific task.' },
      { name: 'qemu_start', description: 'Start a QEMU VM.' },
      { name: 'qemu_shutdown', description: 'Gracefully shutdown a QEMU VM.' },
      { name: 'qemu_stop', description: 'Stop a QEMU VM.' },
      { name: 'qemu_reboot', description: 'Reboot a QEMU VM.' },
      { name: 'qemu_force_stop', description: 'Force-stop a QEMU VM (destructive, requires confirm: true).' },
      { name: 'qemu_delete', description: 'Delete a QEMU VM (destructive, requires confirm: true).' },
      { name: 'qemu_create', description: 'Create a new QEMU VM.' },
      { name: 'qemu_resize_disk', description: 'Resize a disk of a QEMU VM.' },
      { name: 'qemu_snapshot_list', description: 'List snapshots for a QEMU VM.' },
      { name: 'qemu_snapshot_create', description: 'Create a snapshot for a QEMU VM.' },
      { name: 'lxc_start', description: 'Start an LXC container.' },
      { name: 'lxc_shutdown', description: 'Gracefully shutdown an LXC container.' },
      { name: 'lxc_stop', description: 'Stop an LXC container.' },
      { name: 'lxc_reboot', description: 'Reboot an LXC container.' },
      { name: 'lxc_delete', description: 'Delete an LXC container (destructive, requires confirm: true).' },
      { name: 'lxc_create', description: 'Create a new LXC container.' },
    ];
  }

  /**
   * Call an MCP tool by name (dispatched directly to real Proxmox VE REST API)
   */
  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    this.logger.debug(`Calling tool "${name}" with args: ${JSON.stringify(args)}`);

    // If stdio MCP client is connected, try it first
    if (this.client) {
      try {
        const result = await this.client.callTool({
          name,
          arguments: args,
        });
        const content = result.content?.[0];
        if (content && content.type === 'text') {
          try {
            return JSON.parse(content.text);
          } catch {
            return content.text;
          }
        }
        return result;
      } catch (err: any) {
        this.logger.warn(`MCP stdio tool error (${name}): ${err.message}. Falling back to direct REST client.`);
      }
    }

    // Direct REST API execution against live Proxmox VE
    return this.executeDirectRestTool(name, args);
  }

  private async executeDirectRestTool(name: string, args: Record<string, any>): Promise<any> {
    switch (name) {
      case 'cluster_version':
        return this.apiClient.getClusterVersion();

      case 'cluster_resources':
        return this.apiClient.getClusterResources(args.type);

      case 'list_nodes':
        return this.apiClient.getNodes();

      case 'node_status': {
        if (!args.node) throw new Error('node_status requires "node" parameter');
        return this.apiClient.getNodeStatus(args.node);
      }

      case 'list_storage': {
        if (args.node) {
          return this.apiClient.getNodeStorage(args.node);
        }
        return this.apiClient.getClusterResources('storage');
      }

      case 'list_qemu': {
        if (args.node) {
          return this.apiClient.getQemuList(args.node);
        }
        const vms = await this.apiClient.getClusterResources('vm');
        return vms.filter((v: any) => v.type === 'qemu');
      }

      case 'list_lxc': {
        if (args.node) {
          return this.apiClient.getLxcList(args.node);
        }
        const vms = await this.apiClient.getClusterResources('vm');
        return vms.filter((v: any) => v.type === 'lxc');
      }

      case 'list_networks': {
        if (args.node) {
          return this.apiClient.getNodeNetworks(args.node);
        }
        const nodes = await this.apiClient.getNodes().catch(() => []);
        const networkLists = await Promise.all(
          nodes.map(async (n: any) => {
            try {
              const nets = await this.apiClient.getNodeNetworks(n.node);
              return nets.map((net: any) => ({ ...net, node: n.node }));
            } catch {
              return [];
            }
          }),
        );
        return networkLists.flat();
      }

      case 'list_tasks': {
        if (args.node) {
          return this.apiClient.getNodeTasks(args.node);
        }
        const nodes = await this.apiClient.getNodes().catch(() => []);
        const taskLists = await Promise.all(
          nodes.map(async (n: any) => {
            try {
              const tasks = await this.apiClient.getNodeTasks(n.node);
              return tasks.map((t: any) => ({ ...t, node: n.node }));
            } catch {
              return [];
            }
          }),
        );
        return taskLists.flat().sort((a: any, b: any) => (b.starttime || 0) - (a.starttime || 0));
      }

      case 'task_status': {
        if (!args.node || !args.upid) throw new Error('task_status requires "node" and "upid" parameters');
        return this.apiClient.getTaskStatus(args.node, args.upid);
      }

      case 'qemu_start': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        const upid = await this.apiClient.startQemu(node, Number(args.vmid));
        return {
          upid,
          targetKind: TargetKind.QEMU,
          node,
          vmid: Number(args.vmid),
          status: 'started',
        };
      }

      case 'qemu_stop': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        const upid = await this.apiClient.stopQemu(node, Number(args.vmid));
        return {
          upid,
          targetKind: TargetKind.QEMU,
          node,
          vmid: Number(args.vmid),
          status: 'stopped',
        };
      }

      case 'qemu_shutdown': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        const upid = await this.apiClient.shutdownQemu(node, Number(args.vmid));
        return {
          upid,
          targetKind: TargetKind.QEMU,
          node,
          vmid: Number(args.vmid),
          status: 'shutdown',
        };
      }

      case 'qemu_reboot': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        const upid = await this.apiClient.rebootQemu(node, Number(args.vmid));
        return {
          upid,
          targetKind: TargetKind.QEMU,
          node,
          vmid: Number(args.vmid),
          status: 'rebooted',
        };
      }

      case 'qemu_force_stop': {
        if (!args.confirm) {
          throw new Error('Safety Guard: qemu_force_stop requires confirm: true');
        }
        const node = await this.resolveVmNode(args.vmid, args.node);
        const upid = await this.apiClient.forceStopQemu(node, Number(args.vmid));
        return {
          upid,
          targetKind: TargetKind.QEMU,
          node,
          vmid: Number(args.vmid),
          status: 'force_stopped',
        };
      }

      case 'qemu_delete': {
        if (!args.confirm) {
          throw new Error('Safety Guard: qemu_delete requires confirm: true');
        }
        const node = await this.resolveVmNode(args.vmid, args.node);
        const upid = await this.apiClient.deleteQemu(node, Number(args.vmid));
        return {
          upid,
          targetKind: TargetKind.QEMU,
          node,
          vmid: Number(args.vmid),
          status: 'deleted',
        };
      }

      case 'qemu_create': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        const { node: _n, ...createArgs } = args;
        const upid = await this.apiClient.createQemu(node, createArgs);
        return {
          upid,
          targetKind: TargetKind.QEMU,
          node,
          vmid: Number(args.vmid),
          status: 'created',
        };
      }

      case 'qemu_resize_disk': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        const disk = args.disk || 'scsi0';
        const size = args.size || '+10G';
        const upid = await this.apiClient.resizeQemuDisk(node, Number(args.vmid), disk, size);
        return {
          upid,
          targetKind: TargetKind.QEMU,
          node,
          vmid: Number(args.vmid),
          disk,
          size,
          status: 'resized',
        };
      }

      case 'qemu_snapshot_list': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        return this.apiClient.getQemuSnapshots(node, Number(args.vmid));
      }

      case 'qemu_snapshot_create': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        const snapname = args.snapname || `snap-${Date.now()}`;
        const upid = await this.apiClient.createQemuSnapshot(
          node,
          Number(args.vmid),
          snapname,
          args.description,
        );
        return {
          upid,
          targetKind: TargetKind.QEMU,
          node,
          vmid: Number(args.vmid),
          snapname,
          status: 'snapshot_created',
        };
      }

      case 'lxc_start': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        const upid = await this.apiClient.startLxc(node, Number(args.vmid));
        return {
          upid,
          targetKind: TargetKind.LXC,
          node,
          vmid: Number(args.vmid),
          status: 'started',
        };
      }

      case 'lxc_stop': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        const upid = await this.apiClient.stopLxc(node, Number(args.vmid));
        return {
          upid,
          targetKind: TargetKind.LXC,
          node,
          vmid: Number(args.vmid),
          status: 'stopped',
        };
      }

      case 'lxc_shutdown': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        const upid = await this.apiClient.shutdownLxc(node, Number(args.vmid));
        return {
          upid,
          targetKind: TargetKind.LXC,
          node,
          vmid: Number(args.vmid),
          status: 'shutdown',
        };
      }

      case 'lxc_reboot': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        const upid = await this.apiClient.rebootLxc(node, Number(args.vmid));
        return {
          upid,
          targetKind: TargetKind.LXC,
          node,
          vmid: Number(args.vmid),
          status: 'rebooted',
        };
      }

      case 'lxc_delete': {
        if (!args.confirm) {
          throw new Error('Safety Guard: lxc_delete requires confirm: true');
        }
        const node = await this.resolveVmNode(args.vmid, args.node);
        const upid = await this.apiClient.deleteLxc(node, Number(args.vmid));
        return {
          upid,
          targetKind: TargetKind.LXC,
          node,
          vmid: Number(args.vmid),
          status: 'deleted',
        };
      }

      case 'lxc_create': {
        const node = await this.resolveVmNode(args.vmid, args.node);
        const { node: _n, ...createArgs } = args;
        const upid = await this.apiClient.createLxc(node, createArgs);
        return {
          upid,
          targetKind: TargetKind.LXC,
          node,
          vmid: Number(args.vmid),
          status: 'created',
        };
      }

      default:
        throw new Error(`Unsupported Proxmox MCP tool: ${name}`);
    }
  }

  /**
   * Helper method for frontend dashboard summary, aggregated from live Proxmox VE
   */
  async getClusterSummary(): Promise<ClusterSummaryDto> {
    try {
      const [versionData, nodes, vms, storage] = await Promise.all([
        this.callTool('cluster_version').catch(() => null),
        this.callTool('list_nodes').catch(() => []),
        this.callTool('cluster_resources', { type: 'vm' }).catch(() => []),
        this.callTool('cluster_resources', { type: 'storage' }).catch(() => []),
      ]);

      const nodeList: ProxmoxNodeDto[] = Array.isArray(nodes) ? nodes : [];
      const vmList: ProxmoxVmDto[] = Array.isArray(vms) ? vms : [];
      const storageList: ProxmoxStorageDto[] = Array.isArray(storage) ? storage : [];

      let totalCpuUsage = 0;
      let totalMemUsage = 0;
      let totalDiskUsage = 0;

      if (nodeList.length > 0) {
        const onlineNodes = nodeList.filter((n) => n.status === 'online');
        const activeNodes = onlineNodes.length > 0 ? onlineNodes : nodeList;

        totalCpuUsage = activeNodes.reduce((acc, n) => acc + (n.cpu || 0), 0) / activeNodes.length;

        const totalMem = activeNodes.reduce((acc, n) => acc + (n.maxmem || 0), 0);
        const usedMem = activeNodes.reduce((acc, n) => acc + (n.mem || 0), 0);
        totalMemUsage = totalMem > 0 ? usedMem / totalMem : 0;

        const totalDisk = activeNodes.reduce((acc, n) => acc + (n.maxdisk || 0), 0);
        const usedDisk = activeNodes.reduce((acc, n) => acc + (n.disk || 0), 0);
        totalDiskUsage = totalDisk > 0 ? usedDisk / totalDisk : 0;
      }

      const versionStr = versionData?.version
        ? `Proxmox VE ${versionData.version} (${versionData.release || ''})`
        : 'Proxmox VE';

      return {
        version: versionStr,
        nodes: nodeList,
        vms: vmList,
        storage: storageList,
        totalCpuUsage,
        totalMemUsage,
        totalDiskUsage,
      };
    } catch (err: any) {
      this.logger.error(`Failed to get cluster summary from Proxmox VE: ${err.message}`);
      return {
        version: 'Proxmox VE (Offline / Not Configured)',
        nodes: [],
        vms: [],
        storage: [],
        totalCpuUsage: 0,
        totalMemUsage: 0,
        totalDiskUsage: 0,
      };
    }
  }
}
