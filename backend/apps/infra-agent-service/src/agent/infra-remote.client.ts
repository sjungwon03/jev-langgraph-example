import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class InfraRemoteClient {
  private readonly logger = new Logger(InfraRemoteClient.name);
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl =
      this.configService?.get<string>('INFRA_SERVICE_URL') ||
      process.env.INFRA_SERVICE_URL ||
      'http://localhost:3020';
    this.logger.log(`🔗 InfraRemoteClient configured with base URL: ${this.baseUrl}`);
  }

  /**
   * Remotely invoke an MCP tool on the infra-service
   */
  async executeTool(tool: string, args: Record<string, any> = {}): Promise<any> {
    const url = `${this.baseUrl}/api/infra/tools/execute`;
    this.logger.debug(`[Remote RPC] Calling ${url} - tool="${tool}"`);

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, { tool, args }, { timeout: 30000 }),
      );
      return response.data;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      this.logger.error(`[Remote RPC Error] Failed to execute tool "${tool}": ${msg}`);
      throw new Error(`원격 인프라 서비스 호출 실패 (${tool}): ${msg}`);
    }
  }

  /**
   * Fetch available tools from the remote infra-service
   */
  async getTools(): Promise<any[]> {
    const url = `${this.baseUrl}/api/infra/tools`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 10000 }),
      );
      return response.data;
    } catch (err: any) {
      this.logger.warn(`Could not fetch remote tools list: ${err.message}`);
      return [];
    }
  }

  /**
   * Fetch cluster summary from the remote infra-service
   */
  async getClusterSummary(): Promise<any> {
    const url = `${this.baseUrl}/api/infra/summary`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 10000 }),
      );
      return response.data;
    } catch (err: any) {
      this.logger.warn(`Could not fetch remote cluster summary: ${err.message}`);
      return null;
    }
  }

  /**
   * Confirm or reject a pending destructive action on the remote infra-service
   */
  async confirmAction(token: string, approved: boolean): Promise<any> {
    const url = `${this.baseUrl}/api/infra/confirm`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(url, { token, approved }, { timeout: 30000 }),
      );
      return response.data;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      throw new Error(`원격 작업 승인 처리 실패: ${msg}`);
    }
  }

  /**
   * Create a new resource request from developer team
   */
  async createResourceRequest(dto: any): Promise<any> {
    const url = `${this.baseUrl}/api/infra/requests`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(url, dto, { timeout: 10000 }),
      );
      return response.data;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      throw new Error(`자원 요청 생성 실패: ${msg}`);
    }
  }

  /**
   * Fetch resource requests list
   */
  async getResourceRequests(status?: string): Promise<any[]> {
    const url = `${this.baseUrl}/api/infra/requests${status ? `?status=${status}` : ''}`;
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 10000 }),
      );
      return response.data;
    } catch (err: any) {
      this.logger.warn(`Could not fetch resource requests: ${err.message}`);
      return [];
    }
  }

  /**
   * Review (approve / reject) a resource request by infra team
   */
  async reviewResourceRequest(id: string, dto: any): Promise<any> {
    const url = `${this.baseUrl}/api/infra/requests/${id}/review`;
    try {
      const response = await firstValueFrom(
        this.httpService.post(url, dto, { timeout: 30000 }),
      );
      return response.data;
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      throw new Error(`자원 요청 검토 실패: ${msg}`);
    }
  }
}
