import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Graceful / lazy resolution for MCP transport client
let Client: any = null;
let StdioClientTransport: any = null;
try {
  const sdkClient = require('@modelcontextprotocol/sdk/client/index.js');
  Client = sdkClient.Client;
  const sdkTransport = require('@modelcontextprotocol/sdk/client/stdio.js');
  StdioClientTransport = sdkTransport.StdioClientTransport;
} catch (e) {
  // Offline simulation mode will handle requests if SDK transport is absent
}
import * as path from 'path';
import * as fs from 'fs';
import {
  ClusterSummaryDto,
  ProxmoxNodeDto,
  ProxmoxVmDto,
  ProxmoxStorageDto,
  TaskReceiptDto,
  TargetKind,
} from '@nest-msa/contracts';

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
  private isMockMode = false;

  // In-memory mock cluster state for offline development & immediate zero-config testing
  private mockNodes: ProxmoxNodeDto[] = [
    {
      node: 'pve-node-01',
      status: 'online',
      cpu: 0.28,
      maxcpu: 16,
      mem: 19543162880, // ~18.2 GB
      maxmem: 34359738368, // 32 GB
      disk: 128849018880, // ~120 GB
      maxdisk: 536870912000, // 500 GB
      uptime: 846200,
      level: '',
    },
    {
      node: 'pve-node-02',
      status: 'online',
      cpu: 0.62,
      maxcpu: 16,
      mem: 30601641984, // ~28.5 GB (High usage)
      maxmem: 34359738368, // 32 GB
      disk: 225485783040, // ~210 GB
      maxdisk: 536870912000, // 500 GB
      uptime: 1205300,
      level: '',
    },
  ];

  private mockVms: ProxmoxVmDto[] = [
    {
      vmid: 100,
      name: 'web-gateway-prod',
      node: 'pve-node-01',
      status: 'running',
      type: 'qemu',
      cpu: 0.15,
      cpus: 2,
      mem: 2147483648,
      maxmem: 4294967296,
      disk: 32212254720,
      maxdisk: 64424509440,
      uptime: 360000,
    },
    {
      vmid: 101,
      name: 'app-api-worker',
      node: 'pve-node-01',
      status: 'running',
      type: 'qemu',
      cpu: 0.42,
      cpus: 4,
      mem: 5368709120,
      maxmem: 8589934592,
      disk: 42949672960,
      maxdisk: 85899345920,
      uptime: 240000,
    },
    {
      vmid: 102,
      name: 'db-postgres-primary',
      node: 'pve-node-02',
      status: 'running',
      type: 'qemu',
      cpu: 0.58,
      cpus: 8,
      mem: 15032385536,
      maxmem: 17179869184,
      disk: 161061273600,
      maxdisk: 214748364800,
      uptime: 890000,
    },
    {
      vmid: 103,
      name: 'redis-cluster-cache',
      node: 'pve-node-02',
      status: 'running',
      type: 'lxc',
      cpu: 0.12,
      cpus: 2,
      mem: 3221225472,
      maxmem: 4294967296,
      disk: 10737418240,
      maxdisk: 21474836480,
      uptime: 650000,
    },
    {
      vmid: 104,
      name: 'staging-test-runner',
      node: 'pve-node-01',
      status: 'stopped',
      type: 'qemu',
      cpu: 0.0,
      cpus: 2,
      mem: 0,
      maxmem: 4294967296,
      disk: 21474836480,
      maxdisk: 42949672960,
      uptime: 0,
    },
    {
      vmid: 105,
      name: 'backup-syncer',
      node: 'pve-node-02',
      status: 'stopped',
      type: 'lxc',
      cpu: 0.0,
      cpus: 1,
      mem: 0,
      maxmem: 2147483648,
      disk: 8589934592,
      maxdisk: 17179869184,
      uptime: 0,
    },
  ];

  private mockStorage: ProxmoxStorageDto[] = [
    {
      storage: 'local',
      node: 'pve-node-01',
      type: 'dir',
      content: 'iso,vztmpl,backup',
      active: 1,
      enabled: 1,
      used: 34359738368,
      total: 107374182400,
      avail: 73014444032,
    },
    {
      storage: 'local-lvm',
      node: 'pve-node-01',
      type: 'lvmthin',
      content: 'rootdir,images',
      active: 1,
      enabled: 1,
      used: 94489280512,
      total: 429496729600,
      avail: 335007449088,
    },
    {
      storage: 'local-zfs',
      node: 'pve-node-02',
      type: 'zfspool',
      content: 'images,rootdir',
      active: 1,
      enabled: 1,
      used: 214748364800,
      total: 536870912000,
      avail: 322122547200,
    },
  ];

  private mockNetworks = [
    {
      iface: 'vmbr0',
      node: 'pve-node-01',
      type: 'bridge',
      cidr: '192.168.1.10/24',
      gateway: '192.168.1.1',
      active: 1,
      autostart: 1,
      ports: 'eno1',
      comment: '호스트 관리 및 외부 인터넷 통신 브릿지',
    },
    {
      iface: 'vmbr1',
      node: 'pve-node-01',
      type: 'bridge',
      cidr: '10.10.0.1/16',
      gateway: '',
      active: 1,
      autostart: 1,
      ports: 'eno2',
      comment: '내부 고속 백본 클러스터 전용망 (VLAN 10)',
    },
    {
      iface: 'vmbr0',
      node: 'pve-node-02',
      type: 'bridge',
      cidr: '192.168.1.11/24',
      gateway: '192.168.1.1',
      active: 1,
      autostart: 1,
      ports: 'eno1',
      comment: '호스트 관리 및 외부 인터넷 통신 브릿지',
    },
    {
      iface: 'vmbr1',
      node: 'pve-node-02',
      type: 'bridge',
      cidr: '10.10.0.2/16',
      gateway: '',
      active: 1,
      autostart: 1,
      ports: 'eno2',
      comment: '내부 고속 백본 클러스터 전용망 (VLAN 10)',
    },
  ];

  private mockTasks = [
    {
      upid: 'UPID:pve-node-01:00001000:00000000:1718000000:qmstart:100:root@pam:',
      node: 'pve-node-01',
      type: 'qmstart',
      id: '100',
      user: 'root@pam',
      status: 'OK',
      starttime: Math.floor(Date.now() / 1000) - 1800,
      endtime: Math.floor(Date.now() / 1000) - 1795,
    },
    {
      upid: 'UPID:pve-node-01:00001001:00000000:1718000000:qmsnapshot:101:root@pam:',
      node: 'pve-node-01',
      type: 'qmsnapshot',
      id: '101',
      user: 'ai-agent',
      status: 'OK',
      starttime: Math.floor(Date.now() / 1000) - 3600,
      endtime: Math.floor(Date.now() / 1000) - 3590,
    },
    {
      upid: 'UPID:pve-node-02:00001002:00000000:1718000000:qmresize:102:root@pam:',
      node: 'pve-node-02',
      type: 'qmresize',
      id: '102',
      user: 'root@pam',
      status: 'OK',
      starttime: Math.floor(Date.now() / 1000) - 7200,
      endtime: Math.floor(Date.now() / 1000) - 7198,
    },
    {
      upid: 'UPID:pve-node-02:00001003:00000000:1718000000:vzdump:103:root@pam:',
      node: 'pve-node-02',
      type: 'vzdump',
      id: '103',
      user: 'automation-engine',
      status: 'OK',
      starttime: Math.floor(Date.now() / 1000) - 14400,
      endtime: Math.floor(Date.now() / 1000) - 14350,
    },
  ];

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const baseUrl = this.configService?.get<string>('PROXMOX_BASE_URL') || process.env.PROXMOX_BASE_URL;
    const tokenId = this.configService?.get<string>('PROXMOX_TOKEN_ID') || process.env.PROXMOX_TOKEN_ID;
    const tokenSecret = this.configService?.get<string>('PROXMOX_TOKEN_SECRET') || process.env.PROXMOX_TOKEN_SECRET;
    const explicitMock = (this.configService?.get<string>('PROXMOX_MOCK_MODE') || process.env.PROXMOX_MOCK_MODE) === 'true';

    // If credentials are placeholder or not provided, safely fallback to high-fidelity mock mode
    if (
      explicitMock ||
      !baseUrl ||
      !tokenId ||
      !tokenSecret ||
      baseUrl.includes('example.com')
    ) {
      this.isMockMode = true;
      this.logger.warn(
        '⚠️ Proxmox VE credentials not configured or MOCK_MODE enabled. Running in High-Fidelity Simulation Mode.',
      );
      return;
    }

    try {
      this.logger.log(`Connecting to Proxmox MCP via Stdio (PVE: ${baseUrl})...`);

      // Determine path to proxmox-mcp binary or entrypoint
      const mcpCandidates = [
        path.resolve(process.cwd(), '../../infra/proxmox-mcp/dist/index.js'),
        path.resolve(process.cwd(), '../infra/proxmox-mcp/dist/index.js'),
        path.resolve(process.cwd(), 'infra/proxmox-mcp/dist/index.js'),
      ];

      let entryPath = mcpCandidates.find((p) => fs.existsSync(p));
      if (!entryPath) {
        this.logger.warn(
          'proxmox-mcp built binary not found. Will use simulation mode fallback until built.',
        );
        this.isMockMode = true;
        return;
      }

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
      this.isMockMode = false;
      this.logger.log('✅ Connected to Theorvane/proxmox-mcp server successfully!');
    } catch (err: any) {
      this.logger.error(
        `Failed to initialize real Proxmox MCP client: ${err.message}. Falling back to simulation mode.`,
      );
      this.isMockMode = true;
    }
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
    return this.isMockMode;
  }

  /**
   * List available MCP tools
   */
  async listTools(): Promise<McpToolDefinition[]> {
    if (this.isMockMode || !this.client) {
      return [
        { name: 'cluster_version', description: 'Read cluster version.' },
        { name: 'cluster_resources', description: 'List cluster resources (nodes, vms, storage).' },
        { name: 'list_nodes', description: 'List nodes in the cluster.' },
        { name: 'node_status', description: 'Read specific node status.' },
        { name: 'list_storage', description: 'List node storage.' },
        { name: 'list_qemu', description: 'List QEMU VMs on a node.' },
        { name: 'list_lxc', description: 'List LXC containers on a node.' },
        { name: 'list_tasks', description: 'List node tasks.' },
        { name: 'task_status', description: 'Read status of a specific task.' },
        { name: 'qemu_start', description: 'Start a QEMU VM.' },
        { name: 'qemu_shutdown', description: 'Gracefully shutdown a QEMU VM.' },
        { name: 'qemu_stop', description: 'Stop a QEMU VM.' },
        { name: 'qemu_reboot', description: 'Reboot a QEMU VM.' },
        { name: 'qemu_force_stop', description: 'Force-stop a QEMU VM (destructive, requires confirm: true).' },
        { name: 'qemu_delete', description: 'Delete a QEMU VM (destructive, requires confirm: true).' },
        { name: 'lxc_start', description: 'Start an LXC container.' },
        { name: 'lxc_shutdown', description: 'Gracefully shutdown an LXC container.' },
        { name: 'lxc_stop', description: 'Stop an LXC container.' },
        { name: 'lxc_reboot', description: 'Reboot an LXC container.' },
        { name: 'lxc_delete', description: 'Delete an LXC container (destructive, requires confirm: true).' },
      ];
    }

    const response = await this.client.listTools();
    return response.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /**
   * Call an MCP tool by name
   */
  async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    this.logger.debug(`Calling tool "${name}" with args: ${JSON.stringify(args)}`);

    if (this.isMockMode || !this.client) {
      return this.handleMockToolCall(name, args);
    }

    try {
      const result = await this.client.callTool({
        name,
        arguments: args,
      });

      // Parse JSON from text response if possible
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
      this.logger.error(`MCP tool call error (${name}): ${err.message}`);
      throw err;
    }
  }

  // --- High-Fidelity Simulation Mock Implementation ---
  private handleMockToolCall(name: string, args: Record<string, any>): any {
    switch (name) {
      case 'cluster_version':
        return { release: '8.2', repoid: '1', version: '8.2-7', mock: true };

      case 'cluster_resources': {
        const type = args.type;
        if (type === 'node') return this.mockNodes;
        if (type === 'vm') return this.mockVms;
        if (type === 'storage') return this.mockStorage;
        return [
          ...this.mockNodes.map((n) => ({ ...n, id: `node/${n.node}`, type: 'node' })),
          ...this.mockVms.map((v) => ({ ...v, id: `${v.type}/${v.vmid}` })),
          ...this.mockStorage.map((s) => ({ ...s, id: `storage/${s.node}/${s.storage}`, type: 'storage' })),
        ];
      }

      case 'list_nodes':
        return this.mockNodes;

      case 'node_status': {
        const node = this.mockNodes.find((n) => n.node === args.node);
        if (!node) throw new Error(`Node ${args.node} not found`);
        return node;
      }

      case 'list_storage':
        return this.mockStorage.filter((s) => !args.node || s.node === args.node);

      case 'list_qemu':
        return this.mockVms.filter(
          (v) => v.type === 'qemu' && (!args.node || v.node === args.node),
        );

      case 'list_lxc':
        return this.mockVms.filter(
          (v) => v.type === 'lxc' && (!args.node || v.node === args.node),
        );

      case 'qemu_start':
      case 'lxc_start': {
        const vm = this.mockVms.find((v) => v.vmid === Number(args.vmid));
        if (!vm) throw new Error(`VM/LXC with VMID ${args.vmid} not found`);
        vm.status = 'running';
        vm.uptime = 10;
        return {
          upid: `UPID:${vm.node}:00001A2B:00000000:${Math.floor(Date.now() / 1000)}:qmstart:${vm.vmid}:root@pam:`,
          targetKind: vm.type,
          node: vm.node,
          vmid: vm.vmid,
          status: 'started',
        };
      }

      case 'qemu_shutdown':
      case 'lxc_shutdown':
      case 'qemu_stop':
      case 'lxc_stop': {
        const vm = this.mockVms.find((v) => v.vmid === Number(args.vmid));
        if (!vm) throw new Error(`VM/LXC with VMID ${args.vmid} not found`);
        vm.status = 'stopped';
        vm.uptime = 0;
        return {
          upid: `UPID:${vm.node}:00001A2C:00000000:${Math.floor(Date.now() / 1000)}:qmstop:${vm.vmid}:root@pam:`,
          targetKind: vm.type,
          node: vm.node,
          vmid: vm.vmid,
          status: 'stopped',
        };
      }

      case 'qemu_reboot':
      case 'lxc_reboot': {
        const vm = this.mockVms.find((v) => v.vmid === Number(args.vmid));
        if (!vm) throw new Error(`VM/LXC with VMID ${args.vmid} not found`);
        vm.status = 'running';
        vm.uptime = 5;
        return {
          upid: `UPID:${vm.node}:00001A2D:00000000:${Math.floor(Date.now() / 1000)}:qmreboot:${vm.vmid}:root@pam:`,
          targetKind: vm.type,
          node: vm.node,
          vmid: vm.vmid,
          status: 'rebooted',
        };
      }

      case 'qemu_force_stop': {
        if (!args.confirm) {
          throw new Error('Safety Guard: qemu_force_stop requires confirm: true');
        }
        const vm = this.mockVms.find((v) => v.vmid === Number(args.vmid));
        if (!vm) throw new Error(`VM with VMID ${args.vmid} not found`);
        vm.status = 'stopped';
        vm.uptime = 0;
        return {
          upid: `UPID:${vm.node}:00001A2E:00000000:${Math.floor(Date.now() / 1000)}:qmforcestop:${vm.vmid}:root@pam:`,
          targetKind: TargetKind.QEMU,
          node: vm.node,
          vmid: vm.vmid,
          status: 'force_stopped',
        };
      }

      case 'qemu_delete':
      case 'lxc_delete': {
        if (!args.confirm) {
          throw new Error('Safety Guard: Deletion requires confirm: true');
        }
        const idx = this.mockVms.findIndex((v) => v.vmid === Number(args.vmid));
        if (idx === -1) throw new Error(`Target VMID ${args.vmid} not found`);
        const deleted = this.mockVms.splice(idx, 1)[0];
        return {
          upid: `UPID:${deleted.node}:00001A2F:00000000:${Math.floor(Date.now() / 1000)}:vmdel:${deleted.vmid}:root@pam:`,
          targetKind: deleted.type,
          node: deleted.node,
          vmid: deleted.vmid,
          status: 'deleted',
        };
      }

      case 'qemu_create':
      case 'lxc_create': {
        const type = name.startsWith('qemu') ? 'qemu' : 'lxc';
        const vmid = Number(args.vmid) || Math.floor(200 + Math.random() * 800);
        const newVm: ProxmoxVmDto = {
          vmid,
          name: args.name || `new-${type}-${vmid}`,
          node: args.node || 'pve-node-01',
          status: 'stopped',
          type,
          cpu: 0,
          cpus: args.cpus || 2,
          mem: 0,
          maxmem: (args.memory || 2048) * 1024 * 1024,
          disk: 0,
          maxdisk: (args.diskSize || 32) * 1024 * 1024 * 1024,
          uptime: 0,
        };
        this.mockVms.push(newVm);
        return {
          upid: `UPID:${newVm.node}:00001A30:00000000:${Math.floor(Date.now() / 1000)}:qmcreate:${vmid}:root@pam:`,
          targetKind: type,
          node: newVm.node,
          vmid,
          status: 'created',
          vm: newVm,
        };
      }

      case 'qemu_snapshot_create': {
        const vm = this.mockVms.find((v) => v.vmid === Number(args.vmid));
        if (!vm) throw new Error(`VM with VMID ${args.vmid} not found`);
        const snapname = args.snapname || `snap-${Date.now()}`;
        return {
          upid: `UPID:${vm.node}:00001A31:00000000:${Math.floor(Date.now() / 1000)}:qmsnapshot:${vm.vmid}:root@pam:`,
          targetKind: vm.type,
          node: vm.node,
          vmid: vm.vmid,
          snapname,
          status: 'snapshot_created',
        };
      }

      case 'qemu_snapshot_list': {
        return [
          {
            name: 'clean-install',
            snaptime: Math.floor(Date.now() / 1000) - 86400,
            description: 'OS 설치 직후 베이스라인 스냅샷',
            vmstate: 0,
          },
          {
            name: 'pre-deployment',
            snaptime: Math.floor(Date.now() / 1000) - 3600,
            description: '운영 배포 전 스냅샷',
            vmstate: 1,
          },
        ];
      }

      case 'qemu_resize_disk': {
        const vm = this.mockVms.find((v) => v.vmid === Number(args.vmid));
        if (!vm) throw new Error(`VM with VMID ${args.vmid} not found`);
        vm.maxdisk += 10 * 1024 * 1024 * 1024; // +10GB
        return {
          upid: `UPID:${vm.node}:00001A32:00000000:${Math.floor(Date.now() / 1000)}:qmresize:${vm.vmid}:root@pam:`,
          targetKind: vm.type,
          node: vm.node,
          vmid: vm.vmid,
          disk: args.disk || 'scsi0',
          size: args.size || '+10G',
          status: 'resized',
        };
      }

      case 'list_networks':
        return this.mockNetworks.filter((nw) => !args.node || nw.node === args.node);

      case 'list_tasks':
        return this.mockTasks.filter((t) => !args.node || t.node === args.node);

      case 'task_status':
        return { status: 'stopped', exitstatus: 'OK' };

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Helper method for frontend dashboard summary
   */
  async getClusterSummary(): Promise<ClusterSummaryDto> {
    const nodes: ProxmoxNodeDto[] = await this.callTool('list_nodes');
    const vms: ProxmoxVmDto[] = await this.callTool('cluster_resources', { type: 'vm' });
    const storage: ProxmoxStorageDto[] = await this.callTool('cluster_resources', { type: 'storage' });

    let totalCpuUsage = 0;
    let totalMemUsage = 0;
    let totalDiskUsage = 0;

    if (nodes.length > 0) {
      totalCpuUsage = nodes.reduce((acc, n) => acc + (n.cpu || 0), 0) / nodes.length;
      const totalMem = nodes.reduce((acc, n) => acc + (n.maxmem || 0), 0);
      const usedMem = nodes.reduce((acc, n) => acc + (n.mem || 0), 0);
      totalMemUsage = totalMem > 0 ? usedMem / totalMem : 0;

      const totalDisk = nodes.reduce((acc, n) => acc + (n.maxdisk || 0), 0);
      const usedDisk = nodes.reduce((acc, n) => acc + (n.disk || 0), 0);
      totalDiskUsage = totalDisk > 0 ? usedDisk / totalDisk : 0;
    }

    return {
      version: 'Proxmox VE 8.2 (MCP Ready)',
      nodes,
      vms,
      storage,
      totalCpuUsage,
      totalMemUsage,
      totalDiskUsage,
    };
  }
}
