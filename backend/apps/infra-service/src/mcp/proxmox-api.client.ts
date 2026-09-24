import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProxmoxApiConfig {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
  rejectUnauthorized?: boolean;
}

@Injectable()
export class ProxmoxApiClient {
  private readonly logger = new Logger(ProxmoxApiClient.name);
  private baseUrl: string;
  private tokenId: string;
  private tokenSecret: string;
  private rejectUnauthorized: boolean;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = (
      this.configService.get<string>('PROXMOX_BASE_URL') ||
      process.env.PROXMOX_BASE_URL ||
      'https://pve.example.com:8006'
    ).replace(/\/+$/, '');

    this.tokenId =
      this.configService.get<string>('PROXMOX_TOKEN_ID') ||
      process.env.PROXMOX_TOKEN_ID ||
      '';

    this.tokenSecret =
      this.configService.get<string>('PROXMOX_TOKEN_SECRET') ||
      process.env.PROXMOX_TOKEN_SECRET ||
      '';

    this.rejectUnauthorized =
      (this.configService.get<string>('PROXMOX_REJECT_UNAUTHORIZED') ||
        process.env.PROXMOX_REJECT_UNAUTHORIZED) === 'true';

    if (!this.rejectUnauthorized) {
      // Proxmox VE commonly utilizes self-signed SSL certificates on port 8006
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    this.logger.log(`ProxmoxApiClient initialized for host: ${this.baseUrl}`);
  }

  isConfigured(): boolean {
    return (
      Boolean(this.baseUrl) &&
      Boolean(this.tokenId) &&
      Boolean(this.tokenSecret) &&
      !this.baseUrl.includes('example.com')
    );
  }

  /**
   * Core request dispatcher to Proxmox VE REST API (/api2/json)
   */
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    body?: Record<string, any>,
  ): Promise<T> {
    const cleanPath = path.replace(/^\/?api2\/json\/?|^\//, '');
    const url = new URL(`/api2/json/${cleanPath}`, `${this.baseUrl}/`);

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `PVEAPIToken=${this.tokenId}=${this.tokenSecret}`,
    };

    let requestBody: string | undefined = undefined;
    if (body && (method === 'POST' || method === 'PUT')) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const formParams = new URLSearchParams();
      for (const [k, v] of Object.entries(body)) {
        if (v !== undefined && v !== null) {
          formParams.set(k, String(v));
        }
      }
      requestBody = formParams.toString();
    }

    try {
      const res = await fetch(url.toString(), {
        method,
        headers,
        body: requestBody,
      });

      if (!res.ok) {
        let errBody = '';
        try {
          errBody = await res.text();
        } catch {}
        throw new Error(
          `Proxmox API Error [${res.status} ${res.statusText}] for ${method} ${cleanPath}: ${errBody || 'Unknown error'}`,
        );
      }

      const json: any = await res.json();
      if (json && typeof json === 'object' && 'data' in json) {
        return json.data as T;
      }
      return json as T;
    } catch (err: any) {
      this.logger.error(`Proxmox API request failed: ${method} ${url.pathname} - ${err.message}`);
      throw err;
    }
  }

  // --- Cluster Resources & Version ---

  async getClusterVersion(): Promise<any> {
    return this.request('GET', 'version');
  }

  async getClusterResources(type?: 'vm' | 'storage' | 'node'): Promise<any[]> {
    return this.request<any[]>('GET', 'cluster/resources', type ? { type } : undefined);
  }

  // --- Nodes & Node Status ---

  async getNodes(): Promise<any[]> {
    return this.request<any[]>('GET', 'nodes');
  }

  async getNodeStatus(node: string): Promise<any> {
    return this.request('GET', `nodes/${encodeURIComponent(node)}/status`);
  }

  // --- Storages ---

  async getNodeStorage(node: string): Promise<any[]> {
    return this.request<any[]>('GET', `nodes/${encodeURIComponent(node)}/storage`);
  }

  // --- Networks ---

  async getNodeNetworks(node: string): Promise<any[]> {
    return this.request<any[]>('GET', `nodes/${encodeURIComponent(node)}/network`);
  }

  // --- Tasks & Operations ---

  async getNodeTasks(node: string): Promise<any[]> {
    return this.request<any[]>('GET', `nodes/${encodeURIComponent(node)}/tasks`);
  }

  async getTaskStatus(node: string, upid: string): Promise<any> {
    return this.request('GET', `nodes/${encodeURIComponent(node)}/tasks/${encodeURIComponent(upid)}/status`);
  }

  // --- QEMU (VM) APIs ---

  async getQemuList(node: string): Promise<any[]> {
    return this.request<any[]>('GET', `nodes/${encodeURIComponent(node)}/qemu`);
  }

  async startQemu(node: string, vmid: number): Promise<string> {
    return this.request<string>('POST', `nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/start`);
  }

  async stopQemu(node: string, vmid: number): Promise<string> {
    return this.request<string>('POST', `nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/stop`);
  }

  async shutdownQemu(node: string, vmid: number): Promise<string> {
    return this.request<string>('POST', `nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/shutdown`);
  }

  async rebootQemu(node: string, vmid: number): Promise<string> {
    return this.request<string>('POST', `nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/reboot`);
  }

  async forceStopQemu(node: string, vmid: number): Promise<string> {
    return this.request<string>('POST', `nodes/${encodeURIComponent(node)}/qemu/${vmid}/status/stop`, undefined, {
      forceStop: 1,
    });
  }

  async deleteQemu(node: string, vmid: number): Promise<string> {
    return this.request<string>('DELETE', `nodes/${encodeURIComponent(node)}/qemu/${vmid}`);
  }

  async createQemu(node: string, params: Record<string, any>): Promise<string> {
    return this.request<string>('POST', `nodes/${encodeURIComponent(node)}/qemu`, undefined, params);
  }

  async resizeQemuDisk(node: string, vmid: number, disk: string, size: string): Promise<string> {
    return this.request<string>('PUT', `nodes/${encodeURIComponent(node)}/qemu/${vmid}/resize`, undefined, {
      disk,
      size,
    });
  }

  async getQemuSnapshots(node: string, vmid: number): Promise<any[]> {
    return this.request<any[]>('GET', `nodes/${encodeURIComponent(node)}/qemu/${vmid}/snapshot`);
  }

  async createQemuSnapshot(node: string, vmid: number, snapname: string, description?: string): Promise<string> {
    return this.request<string>('POST', `nodes/${encodeURIComponent(node)}/qemu/${vmid}/snapshot`, undefined, {
      snapname,
      ...(description ? { description } : {}),
    });
  }

  // --- LXC (Container) APIs ---

  async getLxcList(node: string): Promise<any[]> {
    return this.request<any[]>('GET', `nodes/${encodeURIComponent(node)}/lxc`);
  }

  async startLxc(node: string, vmid: number): Promise<string> {
    return this.request<string>('POST', `nodes/${encodeURIComponent(node)}/lxc/${vmid}/status/start`);
  }

  async stopLxc(node: string, vmid: number): Promise<string> {
    return this.request<string>('POST', `nodes/${encodeURIComponent(node)}/lxc/${vmid}/status/stop`);
  }

  async shutdownLxc(node: string, vmid: number): Promise<string> {
    return this.request<string>('POST', `nodes/${encodeURIComponent(node)}/lxc/${vmid}/status/shutdown`);
  }

  async rebootLxc(node: string, vmid: number): Promise<string> {
    return this.request<string>('POST', `nodes/${encodeURIComponent(node)}/lxc/${vmid}/status/reboot`);
  }

  async deleteLxc(node: string, vmid: number): Promise<string> {
    return this.request<string>('DELETE', `nodes/${encodeURIComponent(node)}/lxc/${vmid}`);
  }

  async createLxc(node: string, params: Record<string, any>): Promise<string> {
    return this.request<string>('POST', `nodes/${encodeURIComponent(node)}/lxc`, undefined, params);
  }
}
