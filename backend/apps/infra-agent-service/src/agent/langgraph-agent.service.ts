import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InfraRemoteClient } from './infra-remote.client';
import { AgentStreamChunk } from '@nest-msa/contracts';
// Optional ChatOpenAI import with fallback
let ChatOpenAI: any = null;
try {
  ChatOpenAI = require('@langchain/openai').ChatOpenAI;
} catch (e) {}
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { StateGraph, Annotation, END, START } from '@langchain/langgraph';
import { v4 as uuidv4 } from 'uuid';

export interface PendingConfirmation {
  token: string;
  action: string;
  node: string;
  vmid: number;
  args: Record<string, any>;
  description: string;
  expiresAt: number; // timestamp
}

import { resolveJevAuthConfig, createJevFetch, JevClient, JevAuthConfig } from '@nest-msa/common';

// LangGraph State Annotation
export const InfraAgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  intent: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => 'chat',
  }),
  toolToCall: Annotation<{ name: string; args: Record<string, any> } | null>({
    reducer: (x, y) => y,
    default: () => null,
  }),
  toolResult: Annotation<any>({
    reducer: (x, y) => y,
    default: () => null,
  }),
  confirmationNeeded: Annotation<PendingConfirmation | null>({
    reducer: (x, y) => y,
    default: () => null,
  }),
  decisionWhy: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  safetyEvaluation: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => 'SAFE',
  }),
  finalResponse: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '',
  }),
  role: Annotation<'DEV_TEAM' | 'INFRA_TEAM'>({
    reducer: (x, y) => y ?? x,
    default: () => 'DEV_TEAM',
  }),
  requesterName: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => '김개발',
  }),
});

@Injectable()
export class LangGraphAgentService {
  private readonly logger = new Logger(LangGraphAgentService.name);
  private llm: any = null;
  private appGraph: any;
  private jevAuthConfig: JevAuthConfig;
  private jevClient: JevClient;
  private customFetch: typeof globalThis.fetch;

  // Integrated Safety Gate State
  private pendingConfirmations: Map<string, PendingConfirmation> = new Map();
  private readonly DESTRUCTIVE_TOOLS = new Set([
    'qemu_delete',
    'lxc_delete',
    'qemu_force_stop',
    'qemu_delete_disk',
  ]);

  constructor(
    private readonly configService: ConfigService,
    private readonly remoteClient: InfraRemoteClient,
  ) {
    // 1. Resolve JEV Authentication (Base Auth / Basic Auth vs Bearer)
    this.jevAuthConfig = resolveJevAuthConfig(this.configService);
    this.customFetch = createJevFetch(this.jevAuthConfig);

    if (this.jevAuthConfig.useBaseAuth) {
      this.logger.log(
        `🛡️ [JEV Base Auth] Activated HTTP Basic Authentication (User: ${this.jevAuthConfig.username || 'token'}, Scheme: Basic) with fetch override.`,
      );
    } else {
      this.logger.log(`🔗 [JEV Auth] Using standard authentication scheme: ${this.jevAuthConfig.authType}.`);
    }

    // 2. Initialize JevClient (System One & Decision Engine with fetch override)
    const jevBaseUrl = this.configService?.get<string>('JEV_BASE_URL') || process.env.JEV_BASE_URL;
    this.jevClient = new JevClient({
      ...this.jevAuthConfig,
      baseUrl: jevBaseUrl,
      baseFetch: this.customFetch,
    });

    // 3. Initialize LLM with fetch override
    const apiKey = this.configService?.get<string>('LLM_API_KEY') || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
    const baseURL = this.configService?.get<string>('LLM_BASE_URL') || process.env.LLM_BASE_URL || process.env.OPENAI_BASE_URL;
    const model = this.configService?.get<string>('LLM_MODEL') || process.env.LLM_MODEL || 'gpt-4o-mini';

    if (apiKey) {
      try {
        this.llm = new ChatOpenAI({
          apiKey,
          configuration: {
            baseURL: baseURL || undefined,
            fetch: this.customFetch,
          },
          modelName: model,
          temperature: 0.1,
        });
        this.logger.log(`Initialized ChatOpenAI model: ${model} (${baseURL || 'default OpenAI API'}) with custom fetch override`);
      } catch (err: any) {
        this.logger.warn(`Could not initialize ChatOpenAI: ${err.message}`);
      }
    } else {
      this.logger.log('LLM API key not provided. Hybrid Intent Router will handle natural language.');
    }

    // 2. Build LangGraph StateGraph
    const workflow = new StateGraph(InfraAgentState)
      .addNode('router', async (state) => this.routerNode(state))
      .addNode('safety_check', async (state) => this.safetyCheckNode(state))
      .addNode('tool_executor', async (state) => this.toolExecutorNode(state))
      .addNode('synthesizer', async (state) => this.synthesizerNode(state))
      .addEdge(START, 'router')
      .addConditionalEdges('router', (state) => {
        if (!state.toolToCall) return 'synthesizer';
        return 'safety_check';
      })
      .addConditionalEdges('safety_check', (state) => {
        if (state.confirmationNeeded) return 'synthesizer'; // Interrupted for confirmation
        return 'tool_executor';
      })
      .addEdge('tool_executor', 'synthesizer')
      .addEdge('synthesizer', END);

    this.appGraph = workflow.compile();
    this.logger.log('✅ LangGraph Infrastructure StateGraph compiled successfully.');
  }

  // --- Safety Gate Methods (Integrated) ---

  isDestructiveAction(toolName: string): boolean {
    return this.DESTRUCTIVE_TOOLS.has(toolName);
  }

  createPendingConfirmation(
    action: string,
    node: string,
    vmid: number,
    args: Record<string, any>,
    description: string,
  ): PendingConfirmation {
    const token = `cf_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes TTL

    const confirmation: PendingConfirmation = {
      token,
      action,
      node,
      vmid,
      args,
      description,
      expiresAt,
    };

    this.pendingConfirmations.set(token, confirmation);
    this.logger.warn(
      `🛡️ Safety Gate: Created pending confirmation [${token}] for destructive action "${action}" on ${node}:${vmid}`,
    );

    return confirmation;
  }

  getConfirmation(token: string): PendingConfirmation | null {
    const confirmation = this.pendingConfirmations.get(token);
    if (!confirmation) return null;

    if (Date.now() > confirmation.expiresAt) {
      this.pendingConfirmations.delete(token);
      return null;
    }

    return confirmation;
  }

  consumeConfirmation(token: string): PendingConfirmation | null {
    const confirmation = this.getConfirmation(token);
    if (confirmation) {
      this.pendingConfirmations.delete(token);
    }
    return confirmation;
  }

  revokeConfirmation(token: string): boolean {
    return this.pendingConfirmations.delete(token);
  }

  // --- LangGraph Workflow Nodes ---

  /**
   * 1. Router Node: Classify intent and identify Proxmox tool to execute
   */
  private async routerNode(state: typeof InfraAgentState.State) {
    const lastMsg = state.messages[state.messages.length - 1];
    const text = typeof lastMsg?.content === 'string' ? lastMsg.content.trim() : '';

    this.logger.debug(`Router Node input: "${text}"`);
    const userRole = state.role || 'DEV_TEAM';
    const requester = state.requesterName || '김개발';
    const normalized = text.toLowerCase();

    // 1. If LLM is configured (OpenAI / OpenAI-compatible / local LLM), let LLM reason and extract parameters
    if (this.llm) {
      try {
        const systemPrompt = `당신은 Proxmox VE 가상화 인프라를 자율 관리하는 지능형 AI 에이전트(LangGraph StateGraph Router)입니다.
사용자의 자연어 메시지를 심층 분석하여 의도를 파악하고, 필요한 Proxmox 도구 및 실행 인수(Arguments)를 추론하여 정확히 바인딩하세요.

[현재 세션 정보]
- 사용자 역할: ${userRole === 'INFRA_TEAM' ? '인프라 관리팀 (INFRA_TEAM)' : '서비스 개발팀 (DEV_TEAM)'}
- 신청자: ${requester}

[거버넌스 및 도구 선택 규칙]
1. 사용자 역할이 DEV_TEAM(서비스 개발팀)인 경우:
   - 가상머신 생성/발급, 디스크 증설, 인스턴스 삭제 등 인프라 변경 작업은 직접 실행하지 않고 반드시 'create_resource_request' 도구로 자원 승인 티켓을 발급해야 합니다.
   - 프롬프트를 분석하여 title, reason, type('CREATE_VM'|'RESIZE_DISK'|'DELETE_VM')을 결정하고, spec(cores, memory MB, disk GB, type)을 산출하세요.
     * 사용자가 명시한 수치(예: 8코어, 16GB, 100G)가 있다면 최우선 반영하세요.
     * 명시되지 않은 경우, 사용자의 목적(예: 머신러닝/AI는 8C 16GB 100GB, DB는 4C 8GB 50GB, 웹/테스트는 2C 4GB 30GB)을 스스로 지능적으로 판단하여 적절한 사양을 산출하세요.
   - 클러스터 현황이나 VM 목록 조회는 'cluster_resources' 또는 'list_nodes'를 호출하세요.
   - 본인이 신청한 티켓 목록 확인은 'list_resource_requests'를 호출하세요.

2. 사용자 역할이 INFRA_TEAM(인프라 관리팀)인 경우:
   - 자원 요청 목록/대기열 조회가 인입되면 'list_resource_requests'를 호출하세요.
   - 'REQ-XXXX 승인'이나 프로비저닝 요청은 'review_resource_request' (status: 'APPROVED')를 호출하세요.
   - 'REQ-XXXX 반려' 요청은 'review_resource_request' (status: 'REJECTED')를 호출하세요.
   - VM 전원 제어(qemu_start, qemu_shutdown, qemu_reboot)나 삭제(qemu_delete), 강제종료(qemu_force_stop)를 직접 실행할 수 있습니다.

[반환 형식]
반드시 아래 JSON 스키마를 만족하는 유효한 JSON 문자열만 출력하세요(코드블록, 주석 없이):
{
  "intent": "의도 식별자",
  "decisionWhy": "사용자의 발화 의도와 인수를 어떻게 분석하고 판단했는지에 대한 상세한 추론 근거",
  "safetyEvaluation": "SAFE" | "GOVERNANCE" | "CAUTION",
  "toolToCall": {
    "name": "도구명",
    "args": { ...도구별 인수... }
  }
}`;

        const llmResponse = await this.llm.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(text),
        ]);

        const raw = typeof llmResponse.content === 'string' ? llmResponse.content : JSON.stringify(llmResponse.content);
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed && parsed.intent) {
            this.logger.log(`🤖 LLM Reasoning Decision: intent=${parsed.intent}, tool=${parsed.toolToCall?.name}`);
            return parsed;
          }
        }
      } catch (err: any) {
        this.logger.warn(`LLM invocation error: ${err.message}. Falling back to Intelligent NLU Router.`);
      }
    }

    // 2. Intelligent Hybrid NLU Router (Used offline or as high-speed deterministic fallback)
    // Check for VMID pattern (e.g. "101번", "vm 101", "101")
    const vmidMatch = text.match(/(?:vm|vmid|\#)?\s*(\d{3,4})/i);
    const targetVmid = vmidMatch ? parseInt(vmidMatch[1], 10) : 101;

    // Intelligent spec extraction from natural language
    const coreMatch = text.match(/(\d+)\s*(?:코어|core|cores|cpus?|c\b)/i);
    const memGbMatch =
      text.match(/(\d+)\s*(?:gb|기가|g\b|gib)\s*(?:램|ram|메모리|memory)/i) ||
      text.match(/(?:램|ram|메모리|memory)\s*(\d+)\s*(?:gb|기가|g\b|gib)?/i);
    const memMbMatch =
      text.match(/(\d+)\s*(?:mb|메가|m\b|mib)\s*(?:램|ram|메모리|memory)/i) ||
      text.match(/(?:램|ram|메모리|memory)\s*(\d+)\s*(?:mb|메가|m\b|mib)?/i);
    const diskExplicitMatch =
      text.match(/(\d+)\s*(?:gb|기가|g\b)\s*(?:디스크|disk|스토리지|용량|ssd|hdd)/i) ||
      text.match(/(?:디스크|disk|스토리지|용량|ssd|hdd)\s*(\d+)\s*(?:gb|기가|g\b)?/i);

    const allGigaMatches = Array.from(text.matchAll(/(\d+)\s*(?:gb|기가|g\b)/gi)).map((m) =>
      parseInt(m[1], 10),
    );

    let extractedCores = coreMatch ? parseInt(coreMatch[1], 10) : 0;
    let extractedMem = memGbMatch
      ? parseInt(memGbMatch[1], 10) * 1024
      : memMbMatch
        ? parseInt(memMbMatch[1], 10)
        : allGigaMatches.length > 0
          ? allGigaMatches[0] * 1024
          : 0;

    let extractedDisk = diskExplicitMatch
      ? parseInt(diskExplicitMatch[1], 10)
      : allGigaMatches.length > 1
        ? allGigaMatches[1]
        : 0;

    // Contextual workload sizing if parameters are not explicitly mentioned
    let inferredCategory = '일반 워크로드';
    if (!extractedCores || !extractedMem) {
      if (
        normalized.includes('ai') ||
        normalized.includes('머신러닝') ||
        normalized.includes('딥러닝') ||
        normalized.includes('대용량') ||
        normalized.includes('llm') ||
        normalized.includes('학습')
      ) {
        extractedCores = extractedCores || 8;
        extractedMem = extractedMem || 16384;
        extractedDisk = extractedDisk || 100;
        inferredCategory = '고성능 AI/ML 워크로드 (8C / 16GB / 100GB)';
      } else if (
        normalized.includes('db') ||
        normalized.includes('데이터베이스') ||
        normalized.includes('postgres') ||
        normalized.includes('mysql') ||
        normalized.includes('redis') ||
        normalized.includes('캐시')
      ) {
        extractedCores = extractedCores || 4;
        extractedMem = extractedMem || 8192;
        extractedDisk = extractedDisk || 50;
        inferredCategory = '데이터베이스/캐시 워크로드 (4C / 8GB / 50GB)';
      } else if (
        normalized.includes('테스트') ||
        normalized.includes('웹') ||
        normalized.includes('프론트') ||
        normalized.includes('경량') ||
        normalized.includes('가벼운') ||
        normalized.includes('간단')
      ) {
        extractedCores = extractedCores || 2;
        extractedMem = extractedMem || 4096;
        extractedDisk = extractedDisk || 30;
        inferredCategory = '경량 웹/테스트 워크로드 (2C / 4GB / 30GB)';
      } else {
        extractedCores = extractedCores || 4;
        extractedMem = extractedMem || 8192;
        extractedDisk = extractedDisk || 50;
        inferredCategory = '표준 범용 인스턴스 (4C / 8GB / 50GB)';
      }
    } else {
      extractedDisk = extractedDisk || 50;
      inferredCategory = `사용자 지정 사양 (${extractedCores}C / ${Math.round(extractedMem / 1024)}GB / ${extractedDisk}GB)`;
    }

    // 0. INFRA_TEAM: Resource Request Approval & Queue Management
    if (userRole === 'INFRA_TEAM') {
      if (
        normalized.includes('자원 요청') ||
        normalized.includes('요청 현황') ||
        normalized.includes('요청 목록') ||
        normalized.includes('대기 중인 요청') ||
        normalized.includes('결재')
      ) {
        return {
          intent: 'list_resource_requests',
          decisionWhy: `인프라팀(Infra Team) 관리자 권한 확인: 개발팀의 자원 요청 큐 목록 조회를 위해 list_resource_requests 도구를 실행합니다.`,
          safetyEvaluation: 'SAFE - 인프라 관리자 자원 요청 대기열 조회입니다.',
          toolToCall: { name: 'list_resource_requests', args: {} },
        };
      }

      const reqMatch = text.match(/REQ-\d{4}/i);
      if (reqMatch && (normalized.includes('승인') || normalized.includes('approve'))) {
        const reqId = reqMatch[0].toUpperCase();
        return {
          intent: 'approve_resource_request',
          decisionWhy: `인프라 관리자의 승인 결정에 따라 자원 요청 [${reqId}] 승인 및 Proxmox 자동 프로비저닝을 연계 실행합니다.`,
          safetyEvaluation: 'SAFE - 인프라 관리자의 승인 검토 완료 건으로 자동 프로비저닝을 시작합니다.',
          toolToCall: {
            name: 'review_resource_request',
            args: { id: reqId, status: 'APPROVED', reviewerComment: '인프라팀 AI 챗봇에서 검토 및 승인 처리됨' },
          },
        };
      }

      if (reqMatch && (normalized.includes('반려') || normalized.includes('거절') || normalized.includes('reject'))) {
        const reqId = reqMatch[0].toUpperCase();
        return {
          intent: 'reject_resource_request',
          decisionWhy: `인프라 관리자의 반려 결정에 따라 자원 요청 [${reqId}] 반려 처리를 진행합니다.`,
          safetyEvaluation: 'SAFE - 인프라 관리자의 반려 결정입니다.',
          toolToCall: {
            name: 'review_resource_request',
            args: { id: reqId, status: 'REJECTED', reviewerComment: '인프라 관리자에 의한 반려 처리' },
          },
        };
      }
    }

    // 0. DEV_TEAM: Resource Request Governance (VM creation/deletion/resizing routed to approval queue)
    if (userRole === 'DEV_TEAM') {
      if (
        normalized.includes('생성') ||
        normalized.includes('만들') ||
        normalized.includes('배포') ||
        normalized.includes('발급') ||
        normalized.includes('신규') ||
        normalized.includes('신청') ||
        normalized.includes('요청') ||
        normalized.includes('서버 하나') ||
        normalized.includes('서버 한 대') ||
        normalized.includes('서버 1대') ||
        normalized.includes('증설') ||
        normalized.includes('확장') ||
        normalized.includes('늘려') ||
        normalized.includes('삭제')
      ) {
        const isDelete = normalized.includes('삭제') || normalized.includes('제거') || normalized.includes('반납');
        const isResize = !isDelete && (normalized.includes('증설') || normalized.includes('확장') || normalized.includes('늘려') || normalized.includes('추가'));
        const reqType = isDelete ? 'DELETE_VM' : isResize ? 'RESIZE_DISK' : 'CREATE_VM';
        const isLxc = normalized.includes('lxc') || normalized.includes('컨테이너');

        return {
          intent: 'create_resource_request',
          decisionWhy: `AI 자연어 심층 분석: 사용자 발화("${text}")에서 ${inferredCategory} 요구사항을 판별했습니다. 개발팀 거버넌스 정책에 따라 클러스터 직접 변경 대신 인프라팀에 자원 요청서(Resource Request)를 자동 작성하여 제출합니다.`,
          safetyEvaluation: 'GOVERNANCE - 개발팀 인프라 변경 작업이 자원 승인 큐로 안전하게 전달됩니다.',
          toolToCall: {
            name: 'create_resource_request',
            args: {
              title: isDelete
                ? `VMID ${targetVmid} 인스턴스 삭제 승인 요청`
                : isResize
                  ? `VMID ${targetVmid} 스토리지 디스크 용량 확장 요청`
                  : `개발팀 신규 VM 인프라 발급 요청 (${text})`,
              requesterName: requester,
              department: '서비스개발팀',
              type: reqType,
              reason: text,
              spec: {
                vmid: targetVmid,
                name: `dev-vm-${Date.now().toString().slice(-4)}`,
                cores: extractedCores,
                memory: extractedMem,
                disk: isResize ? (text.match(/\+(\d+)[gG]?/) ? text.match(/\+(\d+)[gG]?/)![0] : `+${extractedDisk}G`) : extractedDisk,
                type: isLxc ? 'lxc' : 'qemu',
              },
            },
          },
        };
      }
    }

    // 1. Destructive Operations (Requires Safety Gate)
    if (
      normalized.includes('삭제') ||
      normalized.includes('delete') ||
      normalized.includes('제거') ||
      normalized.includes('destroy')
    ) {
      return {
        intent: 'destructive_delete',
        decisionWhy: `사용자 입력 "${text}"에서 인스턴스 영구 삭제 의도 및 대상 VMID ${targetVmid}를 식별하여 qemu_delete 도구를 선택했습니다.`,
        safetyEvaluation: 'CAUTION - 파괴적(Destructive) 삭제 작업으로 분류되어 Human-in-the-Loop 보안 승인 게이트를 호출합니다.',
        toolToCall: {
          name: 'qemu_delete',
          args: { node: 'pve-node-01', vmid: targetVmid },
        },
      };
    }

    if (
      normalized.includes('강제종료') ||
      normalized.includes('강제 종료') ||
      normalized.includes('force stop') ||
      normalized.includes('forcestop')
    ) {
      return {
        intent: 'destructive_force_stop',
        decisionWhy: `사용자 입력 "${text}"에서 비정상 프로세스 강제 종료 의도 및 대상 VMID ${targetVmid}를 식별하여 qemu_force_stop 도구를 선택했습니다.`,
        safetyEvaluation: 'CAUTION - 인스턴스 데이터 유실 위험이 있는 강제 종료 작업으로 분류되어 보안 승인 토큰을 발급합니다.',
        toolToCall: {
          name: 'qemu_force_stop',
          args: { node: 'pve-node-01', vmid: targetVmid },
        },
      };
    }

    // 2. VM/Container Creation
    if (
      normalized.includes('생성') ||
      normalized.includes('만들') ||
      normalized.includes('create vm') ||
      normalized.includes('신규')
    ) {
      const isLxc = normalized.includes('lxc') || normalized.includes('컨테이너');
      const toolName = isLxc ? 'lxc_create' : 'qemu_create';
      const allocatedVmid = targetVmid && targetVmid !== 101 ? targetVmid : Math.floor(106 + Math.random() * 50);
      return {
        intent: 'create_instance',
        decisionWhy: `사용자 입력 "${text}"에서 새 ${isLxc ? 'LXC 컨테이너' : 'QEMU 가상머신'} 배포 의도를 분석하여 ${toolName} 도구를 선택하고 기본 리소스를 설정했습니다.`,
        safetyEvaluation: 'SAFE - 신규 인스턴스 프로비저닝 작업으로 비파괴 작업으로 분류되어 즉시 실행 허용되었습니다.',
        toolToCall: {
          name: toolName,
          args: {
            node: 'pve-node-01',
            vmid: allocatedVmid,
            name: `vm-ai-auto-${Date.now().toString().slice(-4)}`,
            cpus: 2,
            memory: 4096,
            diskSize: 40,
          },
        },
      };
    }

    // 3. Snapshot Management
    if (normalized.includes('스냅샷') || normalized.includes('snapshot')) {
      if (normalized.includes('목록') || normalized.includes('리스트') || normalized.includes('list')) {
        return {
          intent: 'snapshot_list',
          decisionWhy: `사용자 입력 "${text}"에서 VM ${targetVmid}의 스냅샷 이력 조회 의도를 확인하여 qemu_snapshot_list 도구를 선택했습니다.`,
          safetyEvaluation: 'SAFE - 읽기 전용 스냅샷 조회 작업입니다.',
          toolToCall: {
            name: 'qemu_snapshot_list',
            args: { node: 'pve-node-01', vmid: targetVmid },
          },
        };
      }
      return {
        intent: 'snapshot_create',
        decisionWhy: `사용자 입력 "${text}"에서 상태 보존 스냅샷 생성 의도 및 대상 VMID ${targetVmid}를 식별하여 qemu_snapshot_create 도구를 선택했습니다.`,
        safetyEvaluation: 'SAFE - 인프라 상태 백업 작업으로 안전한 작업입니다.',
        toolToCall: {
          name: 'qemu_snapshot_create',
          args: {
            node: 'pve-node-01',
            vmid: targetVmid,
            snapname: `snap-${Date.now().toString().slice(-6)}`,
            description: 'AI Agent Auto Snapshot',
          },
        },
      };
    }

    // 4. Storage & Disk Resize
    if (normalized.includes('디스크 늘려') || normalized.includes('디스크 증설') || normalized.includes('resize')) {
      return {
        intent: 'resize_disk',
        decisionWhy: `사용자 입력 "${text}"에서 가상 디스크 용량 증설 의도를 감지하여 qemu_resize_disk 도구를 선택하고 +10G 증설 인수를 바인딩했습니다.`,
        safetyEvaluation: 'SAFE - 무중단 온라인 디스크 확장 작업으로 안전한 작업입니다.',
        toolToCall: {
          name: 'qemu_resize_disk',
          args: {
            node: 'pve-node-01',
            vmid: targetVmid,
            disk: 'scsi0',
            size: '+10G',
          },
        },
      };
    }

    // 5. Lifecycle Operations (Start, Stop, Reboot)
    if (
      normalized.includes('시작') ||
      normalized.includes('켜') ||
      normalized.includes('start') ||
      normalized.includes('부팅')
    ) {
      return {
        intent: 'vm_start',
        decisionWhy: `사용자 입력 "${text}"에서 인스턴스 전원 기동 의도 및 대상 VMID ${targetVmid}를 감지하여 qemu_start 도구를 호출하도록 결정했습니다.`,
        safetyEvaluation: 'SAFE - 인스턴스 정상 가동 작업으로 즉시 실행 허용되었습니다.',
        toolToCall: {
          name: 'qemu_start',
          args: { node: 'pve-node-01', vmid: targetVmid },
        },
      };
    }

    if (
      normalized.includes('종료') ||
      normalized.includes('꺼') ||
      normalized.includes('stop') ||
      normalized.includes('shutdown')
    ) {
      return {
        intent: 'vm_shutdown',
        decisionWhy: `사용자 입력 "${text}"에서 인스턴스 정상 ACPI 셧다운 의도 및 대상 VMID ${targetVmid}를 감지하여 qemu_shutdown 도구를 선택했습니다.`,
        safetyEvaluation: 'SAFE - 정상적인 Graceful ACPI 셧다운 작업입니다.',
        toolToCall: {
          name: 'qemu_shutdown',
          args: { node: 'pve-node-01', vmid: targetVmid },
        },
      };
    }

    if (
      normalized.includes('재부팅') ||
      normalized.includes('다시 시작') ||
      normalized.includes('reboot') ||
      normalized.includes('restart')
    ) {
      return {
        intent: 'vm_reboot',
        decisionWhy: `사용자 입력 "${text}"에서 인스턴스 소프트 리부트 의도 및 대상 VMID ${targetVmid}를 확인하여 qemu_reboot 도구를 호출하도록 설정했습니다.`,
        safetyEvaluation: 'SAFE - 인스턴스 재부팅 작업입니다.',
        toolToCall: {
          name: 'qemu_reboot',
          args: { node: 'pve-node-01', vmid: targetVmid },
        },
      };
    }

    // 6. Cluster Status & Resources Query
    if (
      normalized.includes('노드') ||
      normalized.includes('node') ||
      normalized.includes('호스트')
    ) {
      return {
        intent: 'list_nodes',
        decisionWhy: `사용자 입력 "${text}"에서 클러스터 물리 노드 및 상태 정보 질의 의도를 분석하여 list_nodes 도구를 선택했습니다.`,
        safetyEvaluation: 'SAFE - 읽기 전용 클러스터 노드 쿼리입니다.',
        toolToCall: { name: 'list_nodes', args: {} },
      };
    }

    if (
      normalized.includes('vm') ||
      normalized.includes('가상머신') ||
      normalized.includes('목록') ||
      normalized.includes('리스트') ||
      normalized.includes('상태') ||
      normalized.includes('현황') ||
      normalized.includes('클러스터') ||
      normalized.includes('자원') ||
      normalized.includes('리소스')
    ) {
      return {
        intent: 'cluster_resources',
        decisionWhy: `사용자 입력 "${text}"에서 전체 가상머신 및 자원 인벤토리 조회 의도를 감지하여 cluster_resources 도구를 선택했습니다.`,
        safetyEvaluation: 'SAFE - 읽기 전용 인벤토리 쿼리입니다.',
        toolToCall: { name: 'cluster_resources', args: {} },
      };
    }

    // Default conversational chat
    return {
      intent: 'general_chat',
      decisionWhy: `사용자 입력 "${text}"는 특정 인프라 제어 명령어가 아니므로 일반 안내 및 대화 모드로 전환했습니다.`,
      safetyEvaluation: 'SAFE - 일반 질의응답 대화입니다.',
      toolToCall: null,
    };
  }

  /**
   * 2. Safety Check Node: Intercept destructive operations
   */
  private async safetyCheckNode(state: typeof InfraAgentState.State) {
    const tool = state.toolToCall;
    if (!tool) return {};

    if (this.isDestructiveAction(tool.name)) {
      this.logger.warn(`Safety Gate Intercepted: ${tool.name} requires human confirmation.`);
      const confirmation = this.createPendingConfirmation(
        tool.name,
        tool.args.node || 'pve-node-01',
        tool.args.vmid,
        tool.args,
        `Proxmox VE [${tool.args.node || 'pve-node-01'}]의 VM ${tool.args.vmid}에 대한 ${tool.name} 작업입니다.`,
      );

      return {
        confirmationNeeded: confirmation,
      };
    }

    return {};
  }

  /**
   * 3. Tool Executor Node: Execute the Proxmox MCP Tool
   */
  private async toolExecutorNode(state: typeof InfraAgentState.State) {
    const tool = state.toolToCall;
    if (!tool) return {};

    try {
      this.logger.log(`Executing tool remotely: ${tool.name} with ${JSON.stringify(tool.args)}`);
      let result: any;
      if (tool.name === 'create_resource_request') {
        result = await this.remoteClient.createResourceRequest(tool.args);
      } else if (tool.name === 'list_resource_requests') {
        result = await this.remoteClient.getResourceRequests(tool.args?.status);
      } else if (tool.name === 'review_resource_request') {
        result = await this.remoteClient.reviewResourceRequest(tool.args.id, tool.args);
      } else {
        result = await this.remoteClient.executeTool(tool.name, tool.args);
      }
      return { toolResult: result };
    } catch (err: any) {
      this.logger.error(`Error executing tool ${tool.name}: ${err.message}`);
      return { toolResult: { error: err.message } };
    }
  }

  /**
   * 4. Synthesizer Node: Format friendly user-facing markdown response
   */
  private async synthesizerNode(state: typeof InfraAgentState.State) {
    // If confirmation is required, format approval request card
    if (state.confirmationNeeded) {
      const conf = state.confirmationNeeded;
      const resp = `⚠️ **[보안 승인 필요 (Human-in-the-Loop)]**\n\n` +
        `요청하신 작업은 인프라에 영향을 미치는 **파괴적 작업 (${conf.action})** 입니다.\n\n` +
        `- **대상 노드**: \`${conf.node}\`\n` +
        `- **대상 VMID**: \`${conf.vmid}\`\n` +
        `- **작업 내용**: ${conf.description}\n` +
        `- **승인 토큰**: \`${conf.token}\`\n\n` +
        `정말 실행하시려면 하단의 **[승인]** 버튼을 클릭하거나, *"확인"* 또는 *"승인"*을 입력해 주세요. (5분 후 자동 만료)`;
      return { finalResponse: resp };
    }

    // 4-1. When LLM is active, delegate actual conversational response & dialog processing to LLM
    if (this.llm) {
      try {
        const lastMsg = state.messages[state.messages.length - 1];
        const userPrompt = typeof lastMsg?.content === 'string' ? lastMsg.content : '';
        const toolInfo = state.toolToCall
          ? `[JEV 도구 실행 내역]\n- 도구명: ${state.toolToCall.name}\n- 입력 인수: ${JSON.stringify(state.toolToCall.args)}\n- 실행 결과: ${JSON.stringify(state.toolResult)}`
          : '[도구 실행 없음 (일반 안내 대화)]';

        const systemPrompt = `당신은 Proxmox VE 가상화 인프라 전문 대화형 어시스턴트입니다.
JEV 인프라 제어 프레임워크가 툴 콜링(Tool Calling)과 가드레일(Guardrails) 검증 및 원격 실행을 완료하였습니다.
당신(LLM)의 핵심 책무는 사용자의 요청과 도구 실행 결과를 바탕으로 친절하고 자연스러운 한국어 대화 응답을 작성하는 것입니다.
- 작업이 성공했다면 결과의 핵심 내용(스펙, 노드, VMID, 승인 번호 등)을 읽기 쉬운 마크다운(표 또는 글머리 기호)으로 요약하여 답변하세요.
- 사용자에게 다음 가능한 액션을 자연스럽게 안내하세요.
${toolInfo}`;

        const llmResp = await this.llm.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(userPrompt || '결과를 요약해 줘'),
        ]);
        const content = typeof llmResp.content === 'string' ? llmResp.content : JSON.stringify(llmResp.content);
        if (content && content.trim().length > 0) {
          return { finalResponse: content.trim() };
        }
      } catch (err: any) {
        this.logger.warn(`LLM conversational dialog synthesis failed, falling back to JEV rule synthesizer: ${err.message}`);
      }
    }

    // 4-2. JEV Fallback Rule Synthesizer: When LLM is offline or unconfigured
    if (state.toolToCall && state.toolResult) {
      const toolName = state.toolToCall.name;
      const res = state.toolResult;

      if (res.error) {
        return {
          finalResponse: `❌ **작업 실패**: Proxmox 작업 중 오류가 발생했습니다.\n> ${res.error}`,
        };
      }

      if (toolName === 'create_resource_request') {
        const req = res;
        return {
          finalResponse:
            `### [개발팀 자원 요청서 접수 완료: ${req.id}]\n\n` +
            `인프라 안정성 및 거버넌스 정책에 따라 **인프라팀 승인 큐**로 정상 접수되었습니다.\n\n` +
            `| 항목 | 세부 내용 |\n` +
            `| :--- | :--- |\n` +
            `| **요청 번호** | \`${req.id}\` |\n` +
            `| **요청 유형** | \`${req.type}\` |\n` +
            `| **신청자 / 부서** | **${req.requesterName}** (${req.department}) |\n` +
            `| **신청 사유** | ${req.reason} |\n` +
            `| **도출 사양** | CPU ${req.spec?.cores || 4} Cores / RAM ${req.spec?.memory >= 1024 ? Math.round(req.spec.memory / 1024) + ' GB' : (req.spec?.memory || 4096) + ' MB'} / Disk ${req.spec?.disk || 50} GB |\n` +
            `| **진행 상태** | 승인 대기 중 (PENDING) |\n\n` +
            `> **안내**: 인프라팀 엔지니어가 클러스터 용량을 검토한 후 승인하면 Proxmox VE에 자동으로 배포됩니다. 상단 **[자원 요청 센터]** 메뉴에서 진행 상황을 확인하실 수 있습니다.`,
        };
      }

      if (toolName === 'list_resource_requests') {
        const list = Array.isArray(res) ? res : [];
        let table = `### 자원 요청 대기 및 처리 현황 (${list.length}건)\n\n`;
        table += `| 요청 ID | 제목 | 신청자 | 부서 | 유형 | 상태 | 등록일시 |\n`;
        table += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: |\n`;
        for (const r of list) {
          const statusBadge =
            r.status === 'PENDING'
              ? '대기중'
              : r.status === 'PROVISIONED'
                ? '배포완료'
                : r.status === 'APPROVED'
                  ? '승인됨'
                  : '반려';
          table += `| \`${r.id}\` | **${r.title}** | ${r.requesterName} | ${r.department} | \`${r.type}\` | ${statusBadge} | ${new Date(r.createdAt).toLocaleTimeString()} |\n`;
        }
        table += `\n> 특정 요청을 승인 또는 반려하려면 *"REQ-1001 승인"* 또는 *"REQ-1001 반려"*라고 입력하세요.`;
        return { finalResponse: table };
      }

      if (toolName === 'review_resource_request') {
        const req = res;
        const isApproved = req.status === 'PROVISIONED' || req.status === 'APPROVED';
        return {
          finalResponse:
            `### [자원 요청 ${req.id} ${isApproved ? '승인 및 자동 프로비저닝 완료' : '반려 처리 완료'}]\n\n` +
            `- **신청자**: ${req.requesterName} (${req.department})\n` +
            `- **검토자**: ${req.reviewerName || '인프라 관리자'}\n` +
            `- **처리 의견**: ${req.reviewerComment || '검토 완료'}\n` +
            `${req.provisionedVmid ? `- **프로비저닝된 VMID**: \`${req.provisionedVmid}\` (노드: \`${req.targetNode || 'pve-node-01'}\`)\n` : ''}` +
            `${req.upid ? `- **태스크 UPID**: \`${req.upid}\`\n` : ''}` +
            `\n개발팀 신청자에게 결과가 즉시 반영되었습니다.`,
        };
      }

      if (toolName === 'list_nodes') {
        const nodes = Array.isArray(res) ? res : [res];
        let table = `### Proxmox 클러스터 노드 현황\n\n`;
        table += `| 노드명 | 상태 | CPU 사용률 | 메모리 사용량 | 업타임 |\n`;
        table += `| :--- | :---: | :---: | :---: | :---: |\n`;
        for (const n of nodes) {
          const cpu = ((n.cpu || 0) * 100).toFixed(1) + '%';
          const mem = `${((n.mem || 0) / 1024 / 1024 / 1024).toFixed(1)}GB / ${((n.maxmem || 0) / 1024 / 1024 / 1024).toFixed(1)}GB`;
          const uptime = `${Math.floor((n.uptime || 0) / 86400)}일 ${Math.floor(((n.uptime || 0) % 86400) / 3600)}시간`;
          const statusBadge = n.status === 'online' ? 'Online' : 'Offline';
          table += `| **${n.node}** | ${statusBadge} | ${cpu} | ${mem} | ${uptime} |\n`;
        }
        return { finalResponse: table };
      }

      if (toolName === 'cluster_resources') {
        const items = Array.isArray(res) ? res : [];
        const vms = items.filter((i: any) => i.type === 'qemu' || i.type === 'lxc');
        let table = `### 전체 VM 및 컨테이너(LXC) 현황 (${vms.length}개)\n\n`;
        table += `| VMID | 이름 | 유형 | 노드 | 상태 | vCPU | 메모리 |\n`;
        table += `| :---: | :--- | :---: | :---: | :---: | :---: | :---: |\n`;
        for (const v of vms) {
          const status = v.status === 'running' ? 'Running' : 'Stopped';
          const mem = `${((v.mem || 0) / 1024 / 1024 / 1024).toFixed(1)}GB / ${((v.maxmem || 0) / 1024 / 1024 / 1024).toFixed(1)}GB`;
          table += `| \`${v.vmid}\` | **${v.name}** | \`${v.type.toUpperCase()}\` | ${v.node} | ${status} | ${v.cpus || 2} | ${mem} |\n`;
        }
        return { finalResponse: table };
      }

      if (toolName.includes('_start') || toolName.includes('_stop') || toolName.includes('_reboot')) {
        const actionVerb = toolName.includes('_start')
          ? '기동(Start)'
          : toolName.includes('_reboot')
            ? '재부팅(Reboot)'
            : '종료(Stop)';
        return {
          finalResponse: `### [VM ${state.toolToCall.args.vmid} ${actionVerb} 명령 완료]\n\n` +
            `- **대상**: 노드 \`${res.node || 'pve-node-01'}\` / VMID \`${res.vmid || state.toolToCall.args.vmid}\`\n` +
            `- **Task UPID**: \`${res.upid || 'UPID:SUCCESS'}\`\n` +
            `- **상태**: \`${res.status || 'processed'}\`\n\n` +
            `대시보드 또는 콘솔에서 상태 변화를 확인하실 수 있습니다.`,
        };
      }

      if (toolName === 'qemu_delete' || toolName === 'lxc_delete') {
        return {
          finalResponse: `### [VMID ${state.toolToCall.args.vmid} 삭제 완료]\n\n- Task UPID: \`${res.upid}\``,
        };
      }

      if (toolName === 'qemu_create' || toolName === 'lxc_create') {
        const vm = res.vm || {};
        return {
          finalResponse: `🎉 **새로운 ${res.targetKind.toUpperCase()} 인스턴스가 성공적으로 생성되었습니다!**\n\n` +
            `- **VMID**: \`${res.vmid}\`\n` +
            `- **이름**: **${vm.name || 'new-instance'}**\n` +
            `- **노드**: \`${res.node}\`\n` +
            `- **사양**: vCPU ${vm.cpus || 2} Core / 메모리 ${((vm.maxmem || 2048) / 1024 / 1024 / 1024).toFixed(0)}GB / 디스크 ${((vm.maxdisk || 32) / 1024 / 1024 / 1024).toFixed(0)}GB\n` +
            `- **Task UPID**: \`${res.upid}\`\n\n` +
            `대시보드에서 생성된 인스턴스를 즉시 기동하거나 관리하실 수 있습니다.`,
        };
      }

      if (toolName === 'qemu_snapshot_create') {
        return {
          finalResponse: `📸 **VM ${res.vmid} 스냅샷이 성공적으로 생성되었습니다.**\n\n` +
            `- **스냅샷 이름**: \`${res.snapname}\`\n` +
            `- **노드**: \`${res.node}\`\n` +
            `- **Task UPID**: \`${res.upid}\``,
        };
      }

      if (toolName === 'qemu_snapshot_list') {
        const snaps = Array.isArray(res) ? res : [];
        let table = `### 📸 VM ${state.toolToCall.args.vmid} 스냅샷 목록 (${snaps.length}개)\n\n`;
        table += `| 스냅샷 이름 | 생성 시각 | 설명 | RAM 상태 포함 |\n`;
        table += `| :--- | :---: | :--- | :---: |\n`;
        for (const s of snaps) {
          const date = new Date(s.snaptime * 1000).toLocaleString('ko-KR');
          const vmstate = s.vmstate ? '예 (RAM 포함)' : '아니오 (디스크만)';
          table += `| **${s.name}** | ${date} | ${s.description || '-'} | ${vmstate} |\n`;
        }
        return { finalResponse: table };
      }

      if (toolName === 'qemu_resize_disk') {
        return {
          finalResponse: `💾 **VM ${res.vmid} 디스크 크기가 확장되었습니다.**\n\n` +
            `- **디스크**: \`${res.disk}\`\n` +
            `- **추가 용량**: \`${res.size}\`\n` +
            `- **Task UPID**: \`${res.upid}\``,
        };
      }

      return {
        finalResponse: `✅ Proxmox 작업 결과:\n\`\`\`json\n${JSON.stringify(res, null, 2)}\n\`\`\``,
      };
    }

    // Default conversational response
    return {
      finalResponse: `안녕하세요! **Proxmox VE 지능형 인프라 제어 에이전트**입니다. 🚀\n\n` +
        `다음과 같은 명령을 자연어로 수행할 수 있습니다:\n` +
        `- *"현재 클러스터 노드들과 리소스 상태 보여줘"*\n` +
        `- *"실행 중인 VM 목록 알려줘"*\n` +
        `- *"101번 VM 시작해줘"* 또는 *"104번 VM 부팅"* \n` +
        `- *"100번 웹서버 VM 재부팅"* \n` +
        `- *"105번 컨테이너 삭제해줘"* (보안 승인 게이트 자동 적용)\n\n` +
        `무엇을 도와드릴까요?`,
    };
  }

  /**
   * Process a user chat message with async streaming output chunks
   */
  async *processStream(
    prompt: string,
    threadId: string = 'default-thread',
    role: 'DEV_TEAM' | 'INFRA_TEAM' = 'DEV_TEAM',
    requesterName: string = '김개발',
  ): AsyncGenerator<AgentStreamChunk, void, unknown> {
    yield {
      type: 'thought',
      content: `[${role === 'INFRA_TEAM' ? '인프라 관리팀' : '서비스 개발팀'}] 사용자 의도 분석 및 LangGraph 상태 그래프 탐색 중...`,
      threadId,
    };

    const initialState = {
      messages: [new HumanMessage(prompt)],
      role,
      requesterName,
    };

    const startTime = Date.now();
    try {
      const result = await this.appGraph.invoke(initialState);
      const latencyMs = Date.now() - startTime;

      // Yield decision chunk containing rationale and tool selection justification
      yield {
        type: 'decision',
        decision: {
          intent: result.intent,
          tool: result.toolToCall?.name,
          why: result.decisionWhy || '사용자 자연어 명령 분석 완료',
          safetyEvaluation: result.safetyEvaluation || 'SAFE',
          args: result.toolToCall?.args,
          latencyMs,
        },
        threadId,
      };

      // If tool was called
      if (result.toolToCall) {
        yield {
          type: 'tool_start',
          tool: result.toolToCall.name,
          input: result.toolToCall.args,
          threadId,
        };

        if (result.confirmationNeeded) {
          const conf = result.confirmationNeeded;
          yield {
            type: 'confirmation_required',
            confirmation: {
              token: conf.token,
              action: conf.action,
              node: conf.node,
              vmid: conf.vmid,
              description: conf.description,
              expiresAt: new Date(conf.expiresAt).toISOString(),
            },
            threadId,
          };
        } else if (result.toolResult) {
          yield {
            type: 'tool_end',
            tool: result.toolToCall.name,
            output: result.toolResult,
            threadId,
          };
        }
      }

      // Final response stream
      yield {
        type: 'content',
        content: result.finalResponse,
        threadId,
      };

      yield {
        type: 'done',
        threadId,
      };
    } catch (err: any) {
      this.logger.error(`Error in LangGraph execution: ${err.message}`);
      yield {
        type: 'error',
        error: `에이전트 실행 중 오류가 발생했습니다: ${err.message}`,
        threadId,
      };
    }
  }

  /**
   * Execute an approved destructive action after token confirmation
   */
  async executeConfirmedAction(token: string): Promise<any> {
    const confirmation = this.consumeConfirmation(token);
    if (!confirmation) {
      throw new Error('유효하지 않거나 이미 만료된 승인 토큰입니다.');
    }

    this.logger.log(
      `Executing APPROVED destructive action: ${confirmation.action} on ${confirmation.node}:${confirmation.vmid}`,
    );

    // Call tool remotely with confirm: true
    const result = await this.remoteClient.executeTool(confirmation.action, {
      ...confirmation.args,
      confirm: true,
    });

    return {
      status: 'EXECUTED',
      confirmation,
      result,
    };
  }

  /**
   * Get the active JEV Authentication configuration (Base Auth or Bearer)
   */
  getAuthConfig(): JevAuthConfig {
    return { ...this.jevAuthConfig };
  }

  /**
   * Get the dedicated JEV client instance
   */
  getJevClient(): JevClient {
    return this.jevClient;
  }

  /**
   * Get the overridden fetch implementation
   */
  getFetch(): typeof globalThis.fetch {
    return this.customFetch;
  }
}
