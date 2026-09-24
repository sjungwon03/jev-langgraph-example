import { Injectable, Logger } from '@nestjs/common';
import { LangGraphAgentService } from '../agent/langgraph-agent.service';
import { AuditService } from '../audit/audit.service';
import {
  AgentStreamChunk,
  ChatMessageInputDto,
  ChatThreadHistoryDto,
  ConfirmActionDto,
} from '@nest-msa/contracts';
import { Response } from 'express';

export interface StoredMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: any[];
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private threadHistories: Map<string, StoredMessage[]> = new Map();

  constructor(
    private readonly agentService: LangGraphAgentService,
    private readonly auditService: AuditService,
  ) {}

  getHistory(threadId: string): ChatThreadHistoryDto {
    const messages = this.threadHistories.get(threadId) || [];
    return { threadId, messages };
  }

  getSessions() {
    const list: { threadId: string; messageCount: number; lastMessage?: StoredMessage }[] = [];
    for (const [threadId, msgs] of this.threadHistories.entries()) {
      list.push({
        threadId,
        messageCount: msgs.length,
        lastMessage: msgs[msgs.length - 1],
      });
    }
    return list;
  }

  clearHistory(threadId: string) {
    this.threadHistories.delete(threadId);
    return { success: true, threadId };
  }

  getGraph() {
    return this.agentService.getGraphDefinition();
  }

  async streamChat(dto: ChatMessageInputDto, res: Response) {
    const threadId = dto.threadId || 'main-thread';
    const userMessage: StoredMessage = {
      role: 'user',
      content: dto.message,
      timestamp: new Date().toISOString(),
    };

    if (!this.threadHistories.has(threadId)) {
      this.threadHistories.set(threadId, []);
    }
    this.threadHistories.get(threadId)!.push(userMessage);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let fullAssistantResponse = '';
    let decisionData: any = null;
    let toolExecutionData: any = null;
    let confirmationData: any = null;

    try {
      const stream = this.agentService.processStream(
        dto.message,
        threadId,
        dto.role || 'DEV_TEAM',
        dto.requesterName || '김개발',
      );

      for await (const chunk of stream) {
        if (chunk.type === 'decision' && chunk.decision) {
          decisionData = chunk.decision;
        }
        if (chunk.type === 'tool_end') {
          toolExecutionData = { tool: chunk.tool, output: chunk.output };
        }
        if (chunk.type === 'confirmation_required' && chunk.confirmation) {
          confirmationData = chunk.confirmation;
        }
        if (chunk.type === 'content' && chunk.content) {
          fullAssistantResponse += chunk.content;
        }

        const sseData = `data: ${JSON.stringify(chunk)}\n\n`;
        res.write(sseData);
      }

      // Save assistant message to history
      if (fullAssistantResponse) {
        this.threadHistories.get(threadId)!.push({
          role: 'assistant',
          content: fullAssistantResponse,
          timestamp: new Date().toISOString(),
        });
      }

      // Record detailed AI Decision & Tool Choice Audit Log
      this.auditService.record(
        'ai-agent',
        decisionData?.tool || 'chat_reasoning',
        'ai-decision',
        threadId,
        confirmationData ? 'WAITING_CONFIRMATION' : 'SUCCESS',
        {
          prompt: dto.message,
          intent: decisionData?.intent || 'general_chat',
          tool: decisionData?.tool,
          why: decisionData?.why || '자연어 질의 분석 완료',
          safetyEvaluation: decisionData?.safetyEvaluation || 'SAFE',
          args: decisionData?.args,
          latencyMs: decisionData?.latencyMs,
          toolOutput: toolExecutionData?.output,
          confirmationToken: confirmationData?.token,
        },
      );

      res.end();
    } catch (err: any) {
      this.logger.error(`Error in streamChat: ${err.message}`);
      const errChunk: AgentStreamChunk = {
        type: 'error',
        error: err.message,
        threadId,
      };
      res.write(`data: ${JSON.stringify(errChunk)}\n\n`);
      res.end();
    }
  }

  async confirmAction(dto: ConfirmActionDto) {
    const { token, approved } = dto;
    if (!approved) {
      this.agentService.revokeConfirmation(token);
      this.auditService.record('user', 'revoke_confirmation', 'token', token, 'REJECTED');
      return {
        status: 'REJECTED',
        message: '작업 승인이 취소되었습니다.',
      };
    }

    try {
      const result = await this.agentService.executeConfirmedAction(token);
      this.auditService.record(
        'user',
        result.confirmation.action,
        'vm',
        String(result.confirmation.vmid),
        'SUCCESS',
        result,
      );
      return {
        status: 'EXECUTED',
        message: '보안 승인이 완료되어 작업이 안전하게 수행되었습니다.',
        data: result,
      };
    } catch (err: any) {
      this.auditService.record('user', 'execute_confirmed_action', 'token', token, 'FAILED', {
        error: err.message,
      });
      throw err;
    }
  }
}
