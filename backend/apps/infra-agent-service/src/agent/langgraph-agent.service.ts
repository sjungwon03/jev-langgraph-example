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
      this.logger.warn('⚠️ LLM API key not provided. LLM is required for conversational actions (Built-in NLU fallback removed).');
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

  /**
   * Helper: Formats the guidance message when LLM / JEV connection configuration is needed.
   */
  private getSystemConnectionGuideMessage(): string {
    return (
      `⚠️ **LLM 및 JEV 시스템 연결 설정이 필요합니다.**\n\n` +
      `본 Proxmox 인프라 자율 제어 시스템은 **(1) LLM(대형 언어 모델)** 과 **(2) JEV(인프라 의사결정 및 거버넌스 프레임워크)** 2개 핵심 엔진을 함께 사용합니다.\n` +
      `현재 LLM API Key가 비어 있으며 내장된 임시 NLU 규칙이 비활성화되어 있으므로, 아래 안내에 따라 환경 설정을 완료해주세요.\n\n` +
      `---\n\n` +
      `### 1️⃣ LLM (Large Language Model) 설정\n` +
      `자연어 발화 심층 분석, 사용자 의도 파악, Proxmox 관리 툴 바인딩 및 자연스러운 대화 응답 합성을 담당합니다.\n\n` +
      `#### • OpenAI (또는 OpenAI 호환 클라우드 LLM)\n` +
      `\`\`\`yaml\n` +
      `environment:\n` +
      `  - LLM_API_KEY=sk-...                  # OpenAI API 키\n` +
      `  - LLM_MODEL=gpt-4o-mini               # 사용할 모델명 (기본값: gpt-4o-mini)\n` +
      `\`\`\`\n\n` +
      `#### • 로컬 LLM (Ollama, vLLM, DeepSeek, LocalAI 등)\n` +
      `\`\`\`yaml\n` +
      `environment:\n` +
      `  - LLM_API_KEY=ollama-local             # 임의의 API 키 또는 토큰\n` +
      `  - LLM_BASE_URL=http://<host>:11434/v1  # 로컬 LLM 엔드포인트 URL\n` +
      `  - LLM_MODEL=llama3                    # 사용할 로컬 모델명\n` +
      `\`\`\`\n\n` +
      `---\n\n` +
      `### 2️⃣ JEV (TypeSafe AI Engine & Base Auth) 설정\n` +
      `JEV 라이브러리의 Fetch Override 및 HTTP Basic(Base Auth) / Bearer 인증을 통해 인프라 거버넌스 및 의사결정 엔진과 통신합니다.\n\n` +
      `#### • JEV 기본 게이트웨이 설정 (Bearer 인증)\n` +
      `\`\`\`yaml\n` +
      `environment:\n` +
      `  - JEV_BASE_URL=https://api.typesafe.ai # JEV 게이트웨이 엔드포인트 URL\n` +
      `  - JEV_API_KEY=your-jev-api-key         # JEV Bearer API 키\n` +
      `  - JEV_AUTH_TYPE=bearer                 # 인증 타입 (기본: bearer)\n` +
      `\`\`\`\n\n` +
      `#### • JEV Base Auth (HTTP Basic Auth) 활성화 시\n` +
      `\`\`\`yaml\n` +
      `environment:\n` +
      `  - JEV_USE_BASE_AUTH=true               # HTTP Basic Base Auth 활성화 여부\n` +
      `  - JEV_AUTH_TYPE=basic                  # 인증 스키마\n` +
      `  - JEV_BASE_AUTH_USER=admin             # Base Auth 사용자 ID / 계정명\n` +
      `  - JEV_BASE_AUTH_PASS=secret1234!       # Base Auth 패스워드 또는 시크릿\n` +
      `\`\`\`\n\n` +
      `---\n\n` +
      `### 🚀 설정 적용 방법\n\n` +
      `\`infra/docker-compose.yml\`의 \`infra-agent-service\` 섹션 또는 루트 \`.env\`에 입력 후 서비스를 재시작하세요:\n` +
      `\`\`\`bash\n` +
      `docker compose -f infra/docker-compose.yml restart infra-agent-service\n` +
      `\`\`\``
    );
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
    // 1. If LLM is NOT connected, do NOT use any built-in intelligent fallback
    if (!this.llm) {
      this.logger.warn(`No LLM connected. Returning connection guide to user.`);
      return {
        intent: 'llm_not_connected',
        decisionWhy: 'LLM(대형 언어 모델)이 연결되어 있지 않아 자연어 분석을 수행하지 않고 연결 안내 메시지를 반환합니다.',
        safetyEvaluation: 'SAFE',
        toolToCall: null,
        finalResponse: this.getSystemConnectionGuideMessage(),
      };
    }

    // 2. When LLM IS configured: use LLM reasoning to determine intent and tool call
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

[사용 가능한 도구 목록 (Available Tools)]
- list_nodes: 클러스터 노드 목록 및 CPU/메모리/업타임 상태 조회 (args: {})
- cluster_resources: 클러스터 내 전체 VM, LXC 컨테이너 및 상태 목록 조회 (args: { type?: 'vm' })
- list_resource_requests: 개발팀 자원 신청 대기열 및 처리 이력 목록 조회 (args: { status?: 'PENDING'|'APPROVED'|'REJECTED'|'PROVISIONED' })
- create_resource_request: 개발팀 자원 신청 티켓 생성 (args: { title: string, reason: string, type: 'CREATE_VM'|'RESIZE_DISK'|'DELETE_VM', spec?: { cores?: number, memory?: number, disk?: number|string, type?: 'qemu'|'lxc', name?: string, node?: string, vmid?: number } })
- review_resource_request: 인프라팀 자원 신청 승인 또는 반려 (args: { id: string, status: 'APPROVED'|'REJECTED', reviewerComment?: string, targetNode?: string })
- qemu_start: VM 기동 (args: { node: string, vmid: number })
- qemu_shutdown: VM ACPI 정상 종료 (args: { node: string, vmid: number })
- qemu_reboot: VM 재부팅 (args: { node: string, vmid: number })
- qemu_force_stop: VM 강제 종료 [고위험 보안승인필요] (args: { node: string, vmid: number })
- qemu_delete: VM 영구 삭제 [고위험 보안승인필요] (args: { node: string, vmid: number })
- qemu_snapshot_list: VM 스냅샷 목록 조회 (args: { node: string, vmid: number })
- qemu_snapshot_create: VM 스냅샷 생성 (args: { node: string, vmid: number, snapname: string, description?: string })
- qemu_resize_disk: VM 디스크 크기 확장 (args: { node: string, vmid: number, disk?: string, size: string })
- get_storage: 노드별 스토리지 목록 및 잔여 용량 조회 (args: { node?: string })

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
}
* 만약 도구 호출이 필요 없는 일반 질문이나 인사말인 경우 "toolToCall": null 로 설정하세요.`;

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

      return {
        intent: 'general_chat',
        decisionWhy: 'LLM 일반 응답 (도구 호출 불필요)',
        safetyEvaluation: 'SAFE',
        toolToCall: null,
      };
    } catch (err: any) {
      this.logger.error(`LLM invocation error: ${err.message}`);
      return {
        intent: 'llm_error',
        decisionWhy: `LLM 호출 중 오류 발생: ${err.message}`,
        safetyEvaluation: 'SAFE',
        toolToCall: null,
        finalResponse: `❌ **LLM 호출 오류가 발생했습니다.**\n\n> **오류 메시지**: \`${err.message}\`\n\n설정된 \`LLM_API_KEY\` 또는 \`LLM_BASE_URL\`을 확인해주세요.`,
      };
    }

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
    // 1. If finalResponse is already set (e.g. LLM not connected guide, direct error), return it
    if (state.finalResponse) {
      return { finalResponse: state.finalResponse };
    }

    // 2. If confirmation is required, format approval request card
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

    // 3. When LLM is active, delegate actual conversational response to LLM
    if (this.llm) {
      try {
        const lastMsg = state.messages[state.messages.length - 1];
        const userPrompt = typeof lastMsg?.content === 'string' ? lastMsg.content : '';
        const toolInfo = state.toolToCall
          ? `[Proxmox 도구 실행 내역]\n- 도구명: ${state.toolToCall.name}\n- 입력 인수: ${JSON.stringify(state.toolToCall.args)}\n- 실행 결과: ${JSON.stringify(state.toolResult)}`
          : '[도구 실행 없음 (일반 대화 및 문의)]';

        const systemPrompt = `당신은 Proxmox VE 가상화 인프라 전담 AI 어시스턴트입니다.
사용자의 요청과 도구 실행 결과를 바탕으로 친절하고 자연스러운 한국어 마크다운 대화 응답을 작성하세요.
- 작업이 성공했다면 결과의 핵심 내용(스펙, 노드, VMID, 승인 번호 등)을 읽기 쉬운 마크다운(표 또는 글머리 기호)으로 요약하여 답변하세요.
- 오류가 발생했다면 원인과 해결 방안을 명확히 안내하세요.
${toolInfo}`;

        const llmResp = await this.llm.invoke([
          new SystemMessage(systemPrompt),
          new HumanMessage(userPrompt || '결과를 요약해 줘'),
        ]);
        const resContent = typeof llmResp.content === 'string' ? llmResp.content : JSON.stringify(llmResp.content);
        if (resContent && resContent.trim().length > 0) {
          return { finalResponse: resContent.trim() };
        }
      } catch (err: any) {
        this.logger.error(`LLM conversational dialog synthesis failed: ${err.message}`);
        return {
          finalResponse: state.toolResult
            ? `✅ **도구 실행 결과 (${state.toolToCall?.name})**\n\n\`\`\`json\n${JSON.stringify(state.toolResult, null, 2)}\n\`\`\`\n\n*(주의: LLM 대화 합성 중 오류 발생: ${err.message})*`
            : `❌ **LLM 응답 생성 실패**: ${err.message}`,
        };
      }
    }

    // 4. If reached without LLM, return guidance
    return {
      finalResponse: this.getSystemConnectionGuideMessage(),
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
      const stream = await this.appGraph.stream(initialState, { streamMode: 'updates' });
      let currentToolName = '';
      let currentToolArgs: any = null;
      let finalResponse = '';

      for await (const chunk of stream) {
        for (const [nodeName, nodeOutput] of Object.entries(chunk)) {
          const out: any = nodeOutput;

          if (nodeName === 'router') {
            currentToolName = out.toolToCall?.name || '';
            currentToolArgs = out.toolToCall?.args || null;
            if (out.finalResponse) finalResponse = out.finalResponse;

            yield {
              type: 'decision',
              decision: {
                intent: out.intent,
                tool: currentToolName,
                why: out.decisionWhy || '사용자 자연어 명령 분석 완료',
                safetyEvaluation: out.safetyEvaluation || 'SAFE',
                args: currentToolArgs,
                latencyMs: Date.now() - startTime,
              },
              threadId,
            };
          } else if (nodeName === 'safety_check') {
            if (out.confirmationNeeded) {
              const conf = out.confirmationNeeded;
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
            } else if (currentToolName) {
              yield {
                type: 'tool_start',
                tool: currentToolName,
                input: currentToolArgs,
                threadId,
              };
            }
          } else if (nodeName === 'tool_executor') {
            yield {
              type: 'tool_end',
              tool: currentToolName,
              output: out.toolResult,
              threadId,
            };
          } else if (nodeName === 'synthesizer') {
            finalResponse = out.finalResponse || finalResponse;
            yield {
              type: 'content',
              content: finalResponse,
              threadId,
            };
          }
        }
      }

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
   * Return the LangGraph StateGraph topology, Mermaid definition, and metadata for UI rendering.
   */
  getGraphDefinition() {
    let mermaid = '';
    try {
      if (this.appGraph?.getGraph) {
        mermaid = this.appGraph.getGraph().drawMermaid();
      }
    } catch (err: any) {
      this.logger.warn(`Could not drawMermaid from appGraph: ${err.message}`);
    }

    if (!mermaid) {
      mermaid = `graph TD
  __start__(__start__):::start --> router[Router Node (LLM 의도 분석)]
  router -->|도구 실행 필요| safety_check{Safety Gate (보안 가드레일)}
  router -->|일반 질문/대화| synthesizer[Synthesizer Node (응답 생성)]
  safety_check -->|파괴적 작업 감지| synthesizer
  safety_check -->|안전 작업 승인| tool_executor[Tool Executor (Proxmox 실행)]
  tool_executor --> synthesizer
  synthesizer --> __end__(__end__):::end
  classDef start fill:#10b981,stroke:#059669,color:#fff;
  classDef end fill:#6366f1,stroke:#4f46e5,color:#fff;`;
    }

    return {
      mermaid,
      nodes: [
        {
          id: '__start__',
          name: 'Start Node',
          label: '입력 수신 (__start__)',
          description: '사용자 자연어 프롬프트, 역할(DEV_TEAM/INFRA_TEAM), 신청자 정보 수신 및 세션 상태 초기화',
          type: 'start' as const,
          stateChanges: ['messages', 'role', 'requesterName'],
        },
        {
          id: 'router',
          name: 'Router Node (LLM Brain)',
          label: 'Router (의도 분석 & 도구 바인딩)',
          description: 'LLM 추론을 거쳐 사용자 의도(intent)를 분류하고 Proxmox MCP 도구 및 인수를 정확하게 도출',
          type: 'router' as const,
          stateChanges: ['intent', 'toolToCall', 'decisionWhy', 'safetyEvaluation'],
        },
        {
          id: 'safety_check',
          name: 'Safety Check Node (Guardrails)',
          label: 'Safety Gate (보안 가드레일)',
          description: '삭제, 강제종료 등 파괴적 고위험 작업 감지 시 작업을 일시 중단하고 Human-in-the-Loop 승인 토큰 생성',
          type: 'safety' as const,
          stateChanges: ['confirmationNeeded'],
        },
        {
          id: 'tool_executor',
          name: 'Tool Executor Node (Proxmox MCP)',
          label: 'Tool Executor (Proxmox 실행)',
          description: 'Proxmox 가상화 인프라 API 또는 개발팀 자원 신청/승인 티켓 원격 실행',
          type: 'tool' as const,
          stateChanges: ['toolResult'],
        },
        {
          id: 'synthesizer',
          name: 'Synthesizer Node (Dialogue)',
          label: 'Synthesizer (대화 요약 & 응답)',
          description: '도구 실행 결과 및 인프라 상태를 바탕으로 LLM을 통해 정돈된 한국어 마크다운 응답 작성',
          type: 'synth' as const,
          stateChanges: ['finalResponse'],
        },
        {
          id: '__end__',
          name: 'End Node',
          label: '종료 (__end__)',
          description: 'SSE 실시간 스트리밍 완료 처리 및 실행 내역 감사 로그(Audit) 영구 보관',
          type: 'end' as const,
          stateChanges: [],
        },
      ],
      edges: [
        { from: '__start__', to: 'router', label: '사용자 발화 주입' },
        { from: 'router', to: 'safety_check', label: '도구 호출 필요', condition: 'toolToCall != null' },
        { from: 'router', to: 'synthesizer', label: '일반 질문 / 대화', condition: 'toolToCall == null' },
        { from: 'safety_check', to: 'synthesizer', label: '고위험 승인 대기', condition: 'confirmationNeeded != null' },
        { from: 'safety_check', to: 'tool_executor', label: '안전 작업 승인 통과', condition: 'confirmationNeeded == null' },
        { from: 'tool_executor', to: 'synthesizer', label: '실행 결과 전달' },
        { from: 'synthesizer', to: '__end__', label: '최종 스트리밍 완료' },
      ],
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
