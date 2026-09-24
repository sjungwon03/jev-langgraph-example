import { Controller, Get, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Response } from 'express';
import { firstValueFrom } from 'rxjs';
import { ApiExcludeController } from '@nestjs/swagger';

@ApiExcludeController()
@Controller()
export class DocsController {
  private readonly chatServiceUrl: string;
  private readonly infraServiceUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.chatServiceUrl =
      this.configService.get<string>('CHAT_SERVICE_URL') ||
      process.env.CHAT_SERVICE_URL ||
      'http://localhost:3010';
    this.infraServiceUrl =
      this.configService.get<string>('INFRA_SERVICE_URL') ||
      process.env.INFRA_SERVICE_URL ||
      'http://localhost:3020';
  }

  @Get('docs-infra-json')
  async getInfraDocs(@Res() res: Response) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.infraServiceUrl}/api/docs-json`, { timeout: 3000 }),
      );
      return res.json(response.data);
    } catch {
      return res.json({ openapi: '3.0.0', info: { title: 'Infra Service Unavailable' }, paths: {} });
    }
  }

  @Get('docs-agent-json')
  async getAgentDocs(@Res() res: Response) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.chatServiceUrl}/api/docs-json`, { timeout: 3000 }),
      );
      return res.json(response.data);
    } catch {
      return res.json({ openapi: '3.0.0', info: { title: 'Agent Service Unavailable' }, paths: {} });
    }
  }

  @Get('docs-unified-json')
  async getUnifiedDocs(@Res() res: Response) {
    let infraDoc: any = { paths: {}, components: { schemas: {} } };
    let agentDoc: any = { paths: {}, components: { schemas: {} } };

    try {
      const infraRes = await firstValueFrom(
        this.httpService.get(`${this.infraServiceUrl}/api/docs-json`, { timeout: 3000 }),
      );
      infraDoc = infraRes.data;
    } catch {}

    try {
      const agentRes = await firstValueFrom(
        this.httpService.get(`${this.chatServiceUrl}/api/docs-json`, { timeout: 3000 }),
      );
      agentDoc = agentRes.data;
    } catch {}

    const unified = {
      openapi: '3.0.0',
      info: {
        title: 'Proxmox MCP & LangGraph Unified Platform API',
        description: 'Unified L7 Gateway Swagger API Specification aggregating Infra Service & AI Chat Agent',
        version: '1.0.0',
      },
      tags: [
        { name: 'Infrastructure Management', description: 'Proxmox VE Nodes, VMs, Storage, and MCP Tools' },
        { name: 'Chatbot & Agent', description: 'LangGraph Autonomous AI Agent & Real-time SSE Stream' },
        { name: 'Automation Rules', description: 'Self-healing & automated cluster triggers' },
        { name: 'Audit Logs', description: 'Infrastructure audit trail & AI reasoning history' },
        { name: 'Actuator', description: 'Gateway health and system telemetry' },
      ],
      paths: {
        '/actuator/health': {
          get: {
            tags: ['Actuator'],
            summary: 'L7 Gateway Health Status',
            responses: { 200: { description: 'UP' } },
          },
        },
        '/actuator/info': {
          get: {
            tags: ['Actuator'],
            summary: 'Application Metadata Info',
            responses: { 200: { description: 'Application metadata' } },
          },
        },
        ...(infraDoc.paths || {}),
        ...(agentDoc.paths || {}),
      },
      components: {
        schemas: {
          ...(infraDoc.components?.schemas || {}),
          ...(agentDoc.components?.schemas || {}),
        },
      },
    };

    return res.json(unified);
  }
}
