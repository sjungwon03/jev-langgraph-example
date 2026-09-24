'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, ShieldAlert, Wrench, CheckCircle2, XCircle, Sparkles, Brain, ClipboardCheck } from 'lucide-react';
import { StreamChunk, confirmAction } from '@/lib/api';
import { DecisionLogsModal } from './DecisionLogsModal';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useUserRole } from '@/lib/role-context';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  thought?: string;
  decision?: {
    intent: string;
    tool?: string;
    why: string;
    safetyEvaluation?: string;
    args?: Record<string, any>;
    latencyMs?: number;
  };
  toolCalls?: { tool: string; input: any; output?: any }[];
  confirmation?: {
    token: string;
    action: string;
    node: string;
    vmid: number;
    description: string;
  };
}

export function ChatConsole() {
  const { role, requesterName, department } = useUserRole();

  const devPrompts = [
    '🖥️ 프론트엔드 테스트용 VM 1대 요청해줘 (자원 신청 티켓 발급)',
    '💾 101번 VM 디스크 20GB 증설 요청해줘',
    '📋 내가 신청한 자원 요청 목록 보여줘',
    '📦 실행 중인 가상머신 전체 목록 보여줘',
  ];

  const infraPrompts = [
    '📋 대기 중인 자원 요청 티켓 목록 보여줘',
    '✅ REQ-1001 자원 요청 승인하고 프로비저닝해줘',
    '🚀 104번 VM (staging-test-runner) 기동해줘',
    '⚠️ 105번 컨테이너 삭제해줘 (보안 승인 테스트)',
  ];

  const quickPrompts = role === 'INFRA_TEAM' ? infraPrompts : devPrompts;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        role === 'INFRA_TEAM'
          ? '안녕하세요! **Proxmox MCP & LangGraph 인프라 관리자 AI 에이전트**입니다. 🛠️\n\n인프라팀 권한으로 접속되었습니다. 개발팀의 **자원 신청 티켓(REQ-XXXX) 검토/승인 및 자동 프로비저닝**, 클러스터 가상머신 제어, 자율 복구 작업을 수행할 수 있습니다.'
          : '안녕하세요! **Proxmox MCP & LangGraph 개발팀 셀프서비스 AI 어시스턴트**입니다. 👨‍💻\n\n신규 가상머신(VM) 생성이나 디스크 증설이 필요하시면 자연어로 말씀해 주세요. **인프라팀 승인 티켓이 자동으로 작성 및 접수**됩니다!',
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || isStreaming) return;

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: query },
      { id: assistantMsgId, role: 'assistant', content: '', thought: '사고 및 계획 수립 중...' },
    ]);
    setInput('');
    setIsStreaming(true);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          threadId: 'main-thread',
          role,
          requesterName,
        }),
      });

      if (!response.body) throw new Error('ReadableStream not supported');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const chunk: StreamChunk = JSON.parse(line.slice(6));

              setMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== assistantMsgId) return msg;

                  if (chunk.type === 'thought') {
                    return { ...msg, thought: chunk.content };
                  }
                  if (chunk.type === 'decision' && chunk.decision) {
                    return { ...msg, decision: chunk.decision };
                  }
                  if (chunk.type === 'tool_start') {
                    const calls = msg.toolCalls || [];
                    return {
                      ...msg,
                      thought: undefined,
                      toolCalls: [...calls, { tool: chunk.tool || '', input: chunk.input }],
                    };
                  }
                  if (chunk.type === 'tool_end') {
                    const calls = [...(msg.toolCalls || [])];
                    if (calls.length > 0) {
                      calls[calls.length - 1].output = chunk.output;
                    }
                    return { ...msg, toolCalls: calls };
                  }
                  if (chunk.type === 'confirmation_required' && chunk.confirmation) {
                    return {
                      ...msg,
                      confirmation: chunk.confirmation,
                    };
                  }
                  if (chunk.type === 'content') {
                    return {
                      ...msg,
                      content: chunk.content || '',
                      thought: undefined,
                    };
                  }
                  return msg;
                }),
              );
            } catch (e) {}
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, content: `❌ 오류가 발생했습니다: ${err.message}`, thought: undefined }
            : msg,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleConfirmApproval = async (msgId: string, token: string, approved: boolean) => {
    try {
      const res = await confirmAction(token, approved);
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== msgId) return msg;
          return {
            ...msg,
            confirmation: undefined,
            content:
              msg.content +
              `\n\n> 🛡️ **[승인 응답 결과]**: ${res.message || (approved ? '작업이 실행되었습니다.' : '취소되었습니다.')}`,
          };
        }),
      );
    } catch (err: any) {
      alert(`승인 처리 실패: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950/40">
      {/* Agent Header Toolbar with Decision Logs Button */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-slate-900/60 border-b border-slate-800 text-xs shrink-0">
        <div className="flex items-center gap-2.5 text-slate-400">
          <Bot className="w-4 h-4 text-emerald-400" />
          <span className="font-medium text-slate-300">Proxmox VE AI 인프라 엔지니어</span>
          <span className="text-[10px] text-slate-500 font-mono">• LangGraph StateGraph</span>
          <Badge
            variant={role === 'INFRA_TEAM' ? 'warning' : 'info'}
            className="text-[10px] py-0.5 px-2 font-mono gap-1"
          >
            <ClipboardCheck className="w-3 h-3" />
            {role === 'INFRA_TEAM' ? '인프라 관리팀 모드' : '개발팀 셀프서비스 모드'}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsDecisionModalOpen(true)}
          className="flex items-center gap-1.5 bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border-purple-500/30 text-xs h-7"
        >
          <Brain className="w-3.5 h-3.5 text-purple-400" />
          <span>AI 툴 판단 로그 (Reasoning Trace)</span>
        </Button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 max-w-3xl ${
              msg.role === 'user' ? 'ml-auto justify-end' : 'mr-auto justify-start'
            }`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-slate-950 shrink-0 mt-1 shadow-md shadow-emerald-500/20">
                <Bot className="w-4 h-4" />
              </div>
            )}

            <div className="space-y-2 max-w-[85%]">
              {/* Message Bubble */}
              <div
                className={`p-4 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-tr-none shadow-md shadow-emerald-600/20'
                    : 'glow-card rounded-tl-none border border-slate-800 text-slate-100'
                }`}
              >
                {/* Active Thought / Reasoning Badge */}
                {msg.thought && (
                  <Badge variant="outline" className="flex items-center gap-2 mb-2 text-xs text-emerald-400 font-mono bg-emerald-500/10 border-emerald-500/20 px-2.5 py-1">
                    <Sparkles className="w-3.5 h-3.5 animate-spin" />
                    <span>{msg.thought}</span>
                  </Badge>
                )}

                {/* AI Decision Rationale Card */}
                {msg.decision && (
                  <Card className="mb-3 p-3 border-purple-500/30 bg-purple-950/20 space-y-1.5 text-xs font-sans">
                    <div className="flex items-center justify-between text-purple-300 font-semibold">
                      <span className="flex items-center gap-1.5 font-mono">
                        <Brain className="w-3.5 h-3.5 text-purple-400" />
                        AI 의사결정: {msg.decision.tool ? `[${msg.decision.tool}] 도구 호출` : '대화 응답'}
                      </span>
                      {msg.decision.latencyMs && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          추론 {msg.decision.latencyMs}ms
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-200 leading-relaxed bg-slate-900/70 p-2 rounded-lg border border-purple-500/20">
                      <strong className="text-purple-300">선택 이유: </strong>
                      {msg.decision.why}
                    </div>
                    {msg.decision.safetyEvaluation && (
                      <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        <span className="text-teal-400">보안 검증:</span> {msg.decision.safetyEvaluation}
                      </div>
                    )}
                  </Card>
                )}

                {/* Tool calls execution details */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {msg.toolCalls.map((tc, idx) => (
                      <div
                        key={idx}
                        className="text-xs bg-slate-900/90 rounded-lg p-2.5 border border-slate-800 font-mono space-y-1 text-slate-300"
                      >
                        <div className="flex items-center justify-between text-teal-400 font-semibold">
                          <span className="flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-teal-400" /> MCP Tool: {tc.tool}
                          </span>
                          <Badge variant="success" className="text-[10px] py-0 px-1.5 font-mono">
                            EXECUTED
                          </Badge>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Args: {JSON.stringify(tc.input)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Content Render */}
                {msg.role === 'assistant' ? (
                  <MarkdownRenderer content={msg.content} />
                ) : (
                  <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                )}

                {/* Human-in-the-loop Confirmation Card */}
                {msg.confirmation && (
                  <div className="mt-4 p-3.5 bg-amber-500/15 border border-amber-500/40 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      <span>보안 승인 요청 (Destructive Action Confirmation)</span>
                    </div>
                    <div className="text-xs text-slate-200">
                      {msg.confirmation.description}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          handleConfirmApproval(msg.id, msg.confirmation!.token, true)
                        }
                        className="flex items-center gap-1.5 text-xs font-semibold"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> 최종 승인 및 실행
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          handleConfirmApproval(msg.id, msg.confirmation!.token, false)
                        }
                        className="flex items-center gap-1.5 text-xs font-medium"
                      >
                        <XCircle className="w-3.5 h-3.5" /> 취소
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0 mt-1">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts Chips */}
      <div className="px-6 py-2 border-t border-slate-800/60 bg-slate-950/80 flex items-center gap-2 overflow-x-auto">
        <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0 font-medium">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> 추천:
        </span>
        {quickPrompts.map((p, idx) => (
          <Button
            key={idx}
            variant="outline"
            size="sm"
            onClick={() => handleSend(p)}
            disabled={isStreaming}
            className="rounded-full text-xs text-slate-300 border-slate-800 hover:border-emerald-500/40 h-7 px-3 shrink-0"
          >
            {p}
          </Button>
        ))}
      </div>

      {/* Input bar */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-3 max-w-4xl mx-auto"
        >
          <Input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isStreaming}
            placeholder="자연어로 인프라를 제어하세요 (예: 101번 VM 시작해줘, 노드 상태 알려줘...)"
            className="h-11 px-4 text-sm"
          />
          <Button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="h-11 px-5 flex items-center gap-2 font-semibold shadow-md shadow-emerald-500/10"
          >
            <Send className="w-4 h-4 fill-current" />
            <span>전송</span>
          </Button>
        </form>
      </div>

      {/* AI Decision Logs Modal */}
      <DecisionLogsModal
        isOpen={isDecisionModalOpen}
        onClose={() => setIsDecisionModalOpen(false)}
      />
    </div>
  );
}
