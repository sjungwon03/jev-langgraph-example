import 'reflect-metadata';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { ConfigService } from '@nestjs/config';
import { ActuatorController } from '../apps/api-gateway/src/actuator/actuator.controller';
import { ProxmoxMcpClient } from '../apps/infra-service/src/mcp/proxmox-mcp.client';
import { LangGraphAgentService } from '../apps/infra-agent-service/src/agent/langgraph-agent.service';
import { InfraRemoteClient } from '../apps/infra-agent-service/src/agent/infra-remote.client';
import { ResourceRequestService } from '../apps/infra-service/src/resource-request/resource-request.service';
import { AuditService } from '../apps/infra-service/src/audit/audit.service';

describe('통합 백엔드 테스트 스위트 (Unified Backend Test Suite)', () => {
  // ==========================================
  // Suite 1: Actuator & Health Check (api-gateway)
  // ==========================================
  describe('ActuatorController', () => {
    let controller: ActuatorController;

    beforeEach(() => {
      controller = new ActuatorController();
    });

    it('should return UP health status', () => {
      const health = controller.health();
      assert.strictEqual(health.status, 'UP');
      assert.strictEqual(health.components.gateway.status, 'UP');
      assert.ok(health.components.timestamp);
    });

    it('should return application metadata info', () => {
      const info = controller.info();
      assert.strictEqual(info.app.name, 'api-gateway');
      assert.strictEqual(info.app.version, '1.0.0');
    });
  });

  // ==========================================
  // Suite 2: Proxmox MCP Client (infra-service)
  // ==========================================
  describe('ProxmoxMcpClient (infra-service Simulation & Mock Mode)', () => {
    let client: ProxmoxMcpClient;
    let configService: ConfigService;

    beforeEach(async () => {
      configService = new ConfigService({
        PROXMOX_MOCK_MODE: 'true',
      });
      client = new ProxmoxMcpClient(configService);
      await client.onModuleInit();
    });

    afterEach(async () => {
      await client.onModuleDestroy();
    });

    it('should list all available Proxmox MCP tools', async () => {
      const tools = await client.listTools();
      assert.ok(tools.length >= 10);
      const names = tools.map((t) => t.name);
      assert.ok(names.includes('cluster_resources'));
      assert.ok(names.includes('list_nodes'));
      assert.ok(names.includes('qemu_start'));
      assert.ok(names.includes('qemu_force_stop'));
    });

    it('should get cluster summary with nodes and VMs', async () => {
      const summary = await client.getClusterSummary();
      assert.ok(summary.nodes.length >= 2);
      assert.ok(summary.vms.length >= 4);
      assert.ok(summary.totalCpuUsage > 0);
    });

    it('should start a VM and return UPID receipt', async () => {
      const receipt = await client.callTool('qemu_start', {
        node: 'pve-node-01',
        vmid: 104,
      });
      assert.strictEqual(receipt.status, 'started');
      assert.ok(receipt.upid.includes('qmstart:104'));
    });

    it('should reject destructive operation if confirm: true is missing', async () => {
      await assert.rejects(
        async () => {
          await client.callTool('qemu_force_stop', {
            node: 'pve-node-01',
            vmid: 101,
          });
        },
        /Safety Guard/,
      );
    });
  });

  // ==========================================
  // Suite 3: LangGraph Agent & Remote Infra Client Delegation
  // ==========================================
  describe('LangGraphAgentService & Remote Infra Client Delegation', () => {
    let client: ProxmoxMcpClient;
    let agentService: LangGraphAgentService;
    let configService: ConfigService;
    let remoteClientMock: InfraRemoteClient;

    beforeEach(async () => {
      configService = new ConfigService({
        PROXMOX_MOCK_MODE: 'true',
      });
      client = new ProxmoxMcpClient(configService);
      await client.onModuleInit();

      // Mock InfraRemoteClient delegating to ProxmoxMcpClient
      remoteClientMock = {
        executeTool: async (tool: string, args: Record<string, any> = {}) => {
          return client.callTool(tool, args);
        },
        getClusterSummary: async () => {
          return client.getClusterSummary();
        },
        getTools: async () => {
          return client.listTools();
        },
        confirmAction: async (token: string, approved: boolean) => {
          return { success: approved };
        },
      } as any;

      agentService = new LangGraphAgentService(configService, remoteClientMock);
    });

    afterEach(async () => {
      await client.onModuleDestroy();
    });

    it('should identify destructive operations correctly', () => {
      assert.strictEqual(agentService.isDestructiveAction('qemu_delete'), true);
      assert.strictEqual(agentService.isDestructiveAction('lxc_delete'), true);
      assert.strictEqual(agentService.isDestructiveAction('qemu_force_stop'), true);
      assert.strictEqual(agentService.isDestructiveAction('qemu_delete_disk'), true);
      assert.strictEqual(agentService.isDestructiveAction('qemu_start'), false);
      assert.strictEqual(agentService.isDestructiveAction('list_nodes'), false);
    });

    it('should create and retrieve pending confirmation with token', () => {
      const confirmation = agentService.createPendingConfirmation(
        'qemu_delete',
        'pve-node-01',
        102,
        { node: 'pve-node-01', vmid: 102 },
        'Delete VM 102',
      );

      assert.ok(confirmation.token);
      assert.ok(confirmation.token.startsWith('cf_'));

      const retrieved = agentService.getConfirmation(confirmation.token);
      assert.ok(retrieved);
      assert.strictEqual(retrieved?.vmid, 102);
    });

    it('should consume confirmation only once', () => {
      const confirmation = agentService.createPendingConfirmation(
        'qemu_force_stop',
        'pve-node-01',
        105,
        { node: 'pve-node-01', vmid: 105 },
        'Force stop VM 105',
      );

      const consumed = agentService.consumeConfirmation(confirmation.token);
      assert.ok(consumed);

      // Second consumption must fail
      const secondTry = agentService.consumeConfirmation(confirmation.token);
      assert.strictEqual(secondTry, null);
    });

    it('should stream agent response, remotely invoke tool, and emit decision rationale chunk', async () => {
      const chunks: any[] = [];
      for await (const chunk of agentService.processStream('101번 VM 시작해줘', 'test-thread')) {
        chunks.push(chunk);
      }

      const types = chunks.map((c) => c.type);
      assert.ok(types.includes('thought'));
      assert.ok(types.includes('decision'));
      assert.ok(types.includes('tool_start'));
      assert.ok(types.includes('content'));
      assert.ok(types.includes('done'));

      const decisionChunk = chunks.find((c) => c.type === 'decision');
      assert.strictEqual(decisionChunk.decision.tool, 'qemu_start');
      assert.ok(decisionChunk.decision.why.length > 5);
      assert.ok(decisionChunk.decision.safetyEvaluation.includes('SAFE'));
    });
  });

  // ==========================================
  // Suite 4: Resource Request Service & Role Governance
  // ==========================================
  describe('ResourceRequestService & Role Governance (Dev Team vs Infra Team)', () => {
    let client: ProxmoxMcpClient;
    let auditService: AuditService;
    let requestService: ResourceRequestService;

    beforeEach(async () => {
      const configService = new ConfigService();
      client = new ProxmoxMcpClient(configService);
      await client.onModuleInit();
      auditService = new AuditService();
      requestService = new ResourceRequestService(client, auditService);
    });

    afterEach(async () => {
      await client.onModuleDestroy();
    });

    it('should initialize with seed requests and provide queue statistics', () => {
      const stats = requestService.getStats();
      assert.ok(stats.total >= 3);
      assert.ok(stats.pending >= 1);
    });

    it('should allow developer to create a resource request ticket', async () => {
      const created = await requestService.createRequest({
        title: '신규 프론트엔드 E2E 테스트 서버 요청',
        requesterName: 'dev-charlie',
        department: '웹프론트엔드팀',
        type: 'CREATE_VM',
        reason: 'Playwright 자동화 테스트 러너용 VM 필요',
        spec: {
          cores: 4,
          memory: 8192,
          disk: 50,
          type: 'qemu',
        },
      });

      assert.ok(created.id.startsWith('REQ-'));
      assert.strictEqual(created.status, 'PENDING');
      assert.strictEqual(created.requesterName, 'dev-charlie');

      const found = requestService.getRequestById(created.id);
      assert.strictEqual(found.title, '신규 프론트엔드 E2E 테스트 서버 요청');
    });

    it('should reject a request with comment when infra admin rejects', async () => {
      const created = await requestService.createRequest({
        title: '과도한 GPU 가상머신 요청',
        requesterName: 'dev-dave',
        department: 'AI연구팀',
        type: 'CREATE_VM',
        reason: '단순 테스트용 H100 8장 요청',
        spec: { cores: 32, memory: 131072, disk: 1000 },
      });

      const reviewed = await requestService.reviewRequest(
        created.id,
        {
          status: 'REJECTED',
          reviewerComment: '클러스터 자원 정책 한도 초과로 반려합니다.',
        },
        '인프라수석엔지니어',
      );

      assert.strictEqual(reviewed.status, 'REJECTED');
      assert.strictEqual(reviewed.reviewerName, '인프라수석엔지니어');
      assert.ok(reviewed.reviewerComment?.includes('한도 초과'));
    });

    it('should approve and automatically provision VM via Proxmox MCP when infra admin approves', async () => {
      const created = await requestService.createRequest({
        title: '신규 캐시 서버 요청',
        requesterName: 'dev-edward',
        department: '백엔드플랫폼팀',
        type: 'CREATE_VM',
        reason: 'Redis 캐시 클러스터 노드 1기 증설',
        spec: {
          node: 'pve-node-01',
          name: 'redis-cache-dev',
          cores: 2,
          memory: 4096,
          disk: 20,
          type: 'qemu',
        },
      });

      const reviewed = await requestService.reviewRequest(
        created.id,
        {
          status: 'APPROVED',
          targetNode: 'pve-node-01',
          reviewerComment: '자원 용량 적합 확인, 자동 프로비저닝 승인',
        },
        '인프라팀장',
      );

      assert.strictEqual(reviewed.status, 'PROVISIONED');
      assert.strictEqual(reviewed.reviewerName, '인프라팀장');
      assert.ok(reviewed.provisionedVmid);
      assert.ok(reviewed.upid?.startsWith('UPID:'));
    });
  });

  // ==========================================
  // Suite 5: JEV Library Base Auth & Fetch Override
  // ==========================================
  describe('JEV Library Base Auth & Fetch Override', () => {
    it('should configure LangGraphAgentService with Base Auth when environment variable is set', () => {
      const configService = new ConfigService({
        JEV_USE_BASE_AUTH: 'true',
        JEV_BASE_AUTH_USER: 'jev_operator',
        JEV_BASE_AUTH_PASS: 'cluster_secret_key',
        LLM_API_KEY: 'test-llm-key',
      });

      const mockRemoteClient = {} as InfraRemoteClient;
      const agentService = new LangGraphAgentService(configService, mockRemoteClient);

      const authConfig = agentService.getAuthConfig();
      assert.strictEqual(authConfig.useBaseAuth, true);
      assert.strictEqual(authConfig.authType, 'basic');
      assert.strictEqual(authConfig.username, 'jev_operator');
      assert.strictEqual(authConfig.password, 'cluster_secret_key');

      const customFetch = agentService.getFetch();
      assert.strictEqual(typeof customFetch, 'function');
      assert.ok(agentService.getJevClient());
    });

    it('should default to standard Bearer auth when JEV_USE_BASE_AUTH is not set', () => {
      const configService = new ConfigService({
        LLM_API_KEY: 'test-llm-key',
      });

      const mockRemoteClient = {} as InfraRemoteClient;
      const agentService = new LangGraphAgentService(configService, mockRemoteClient);

      const authConfig = agentService.getAuthConfig();
      assert.strictEqual(authConfig.useBaseAuth, false);
      assert.strictEqual(authConfig.authType, 'bearer');
    });
  });
});
