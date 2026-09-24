'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Terminal,
  User,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ListFilter,
  Activity,
  GitFork,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { StreamChunk, confirmAction } from '@/lib/api';
import { DecisionLogsModal } from './DecisionLogsModal';
import { LangGraphVisualizerModal } from './LangGraphVisualizerModal';
import { LangGraphCanvas, GraphExecutionState } from './LangGraphCanvas';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  const { role, requesterName } = useUserRole();

  const devPrompts = [
    '테스트용 VM 발급 신청 (2C 4GB 20GB)',
    '101번 VM 디스크 20GB 증설 요청',
    '내 자원 요청 내역 조회',
    '실행 중인 VM 목록',
  ];

  const infraPrompts = [
    '대기 중인 자원 요청 큐 조회',
    'REQ-1001 자원 요청 승인',
    '104번 VM 기동',
    '105번 컨테이너 삭제 (보안 승인)',
  ];

  const quickPrompts = role === 'INFRA_TEAM' ? infraPrompts : devPrompts;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        role === 'INFRA_TEAM'
          ? 'Proxmox VE 인프라 운영 콘솔입니다. 클러스터 자원 현황 조회, VM 전원 제어, 개발팀 자원 신청 티켓(REQ-XXXX) 심사 및 자동 배포를 수행할 수 있습니다.'
          : '서비스 개발팀 인프라 셀프서비스 콘솔입니다. 필요한 서버 사양(CPU, RAM, Disk)과 용도를 입력하시면 인프라팀 승인 큐로 자원 요청서가 접수됩니다.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDecisionModalOpen, setIsDecisionModalOpen] = useState(false);
  const [isGraphModalOpen, setIsGraphModalOpen] = useState(false);
  const [showLiveGraph, setShowLiveGraph] = useState(true);

  // Real-time LangGraph execution state
  const [executionState, setExecutionState] = useState<GraphExecutionState>({
    activeNodeId: null,
    visitedNodeIds: [],
    isLlmActive: false,
    isJevActive: false,
  });

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
      { id: assistantMsgId, role: 'assistant', content: '', thought: '의도 분석 및 실행 계획 수립 중...' },
    ]);
    setInput('');
    setIsStreaming(true);

    // 1. START -> Router: Trigger LLM reasoning
    setExecutionState({
      activeNodeId: 'router',
      visitedNodeIds: ['__start__', 'router'],
      isLlmActive: true,
      isJevActive: false,
      statusMessage: `질의 접수 ("${query.slice(0, 18)}..."): LLM 의도 분석 및 도구 매핑 중`,
    });

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

              // State Machine visual transitions
              if (chunk.type === 'thought') {
                setExecutionState((prev) => ({
                  ...prev,
                  activeNodeId: 'router',
                  isLlmActive: true,
                  statusMessage: chunk.content,
                }));
              } else if (chunk.type === 'decision') {
                const hasTool = !!chunk.decision?.tool;
                setExecutionState((prev) => ({
                  ...prev,
                  intent: chunk.decision?.intent,
                  decisionWhy: chunk.decision?.why,
                  activeTool: chunk.decision?.tool,
                  activeToolArgs: chunk.decision?.args,
                  activeNodeId: hasTool ? 'safety_check' : 'synthesizer',
                  visitedNodeIds: Array.from(new Set([...prev.visitedNodeIds, hasTool ? 'safety_check' : 'synthesizer'])),
                  isLlmActive: !hasTool,
                  isJevActive: false,
                  statusMessage: hasTool
                    ? `도구 결정: ${chunk.decision?.tool}() (보안 검증 진행)`
                    : '일반 질의: 도구 미호출 (직접 응답 합성)',
                }));
              } else if (chunk.type === 'confirmation_required') {
                setExecutionState((prev) => ({
                  ...prev,
                  activeNodeId: 'safety_check',
                  isLlmActive: false,
                  isJevActive: false,
                  statusMessage: '보안 승인 필요: 파괴적 작업 검증 (사용자 확인 대기)',
                }));
              } else if (chunk.type === 'tool_start') {
                setExecutionState((prev) => ({
                  ...prev,
                  activeNodeId: 'tool_executor',
                  activeTool: chunk.tool,
                  activeToolArgs: chunk.input,
                  visitedNodeIds: Array.from(new Set([...prev.visitedNodeIds, 'tool_executor'])),
                  isLlmActive: false,
                  isJevActive: true,
                  statusMessage: `JEV Controller: Proxmox ${chunk.tool}() 실행 중...`,
                }));
              } else if (chunk.type === 'tool_end') {
                setExecutionState((prev) => ({
                  ...prev,
                  activeNodeId: 'synthesizer',
                  visitedNodeIds: Array.from(new Set([...prev.visitedNodeIds, 'synthesizer'])),
                  isLlmActive: true,
                  isJevActive: false,
                  statusMessage: '도구 실행 완료. LLM 응답 합성 중...',
                }));
              } else if (chunk.type === 'content') {
                setExecutionState((prev) => ({
                  ...prev,
                  activeNodeId: 'synthesizer',
                  visitedNodeIds: Array.from(new Set([...prev.visitedNodeIds, 'synthesizer'])),
                  isLlmActive: true,
                  isJevActive: false,
                  statusMessage: '최종 한국어 마크다운 답변 스트리밍 중...',
                }));
              }

              // Update message bubble content
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
            ? { ...msg, content: `작업 중 오류가 발생했습니다: ${err.message}`, thought: undefined }
            : msg,
        ),
      );
    } finally {
      setIsStreaming(false);
      setExecutionState((prev) => ({
        ...prev,
        activeNodeId: '__end__',
        visitedNodeIds: Array.from(new Set([...prev.visitedNodeIds, '__end__'])),
        isLlmActive: false,
        isJevActive: false,
        statusMessage: 'LangGraph 상태 머신 실행 완료',
      }));

      setTimeout(() => {
        setExecutionState((prev) => ({
          ...prev,
          activeNodeId: null,
        }));
      }, 4000);
    }
  };

  const handleConfirmApproval = async (msgId: string, token: string, approved: boolean) => {
    try {
      if (approved) {
        setExecutionState((prev) => ({
          ...prev,
          activeNodeId: 'tool_executor',
          visitedNodeIds: Array.from(new Set([...prev.visitedNodeIds, 'tool_executor'])),
          isJevActive: true,
          statusMessage: '승인 확인: JEV Controller 작업 즉시 실행 중...',
        }));
      }

      const res = await confirmAction(token, approved);
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== msgId) return msg;
          return {
            ...msg,
            confirmation: undefined,
            content:
              msg.content +
              `\n\n> **[승인 처리 결과]**: ${res.message || (approved ? '작업이 실행되었습니다.' : '취소되었습니다.')}`,
          };
        }),
      );

      if (approved) {
        setExecutionState((prev) => ({
          ...prev,
          activeNodeId: '__end__',
          visitedNodeIds: Array.from(new Set([...prev.visitedNodeIds, '__end__'])),
          isJevActive: false,
          statusMessage: '승인 작업 완료',
        }));
      }
    } catch (err: any) {
      alert(`승인 처리 실패: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-slate-950 border-b border-slate-800/80 text-xs shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-slate-200">인프라 제어 콘솔</span>
          <span className="text-[11px] text-slate-500 font-mono">• LangGraph Orchestration</span>
          <Badge
            variant={role === 'INFRA_TEAM' ? 'warning' : 'outline'}
            className="text-[10px] py-0 px-2 font-mono"
          >
            {role === 'INFRA_TEAM' ? '인프라팀' : '개발팀'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Live Canvas Toggle Button */}
          <Button
            variant={showLiveGraph ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowLiveGraph(!showLiveGraph)}
            className={`flex items-center gap-1.5 text-xs h-7 px-2.5 font-medium transition-colors ${
              showLiveGraph
                ? 'bg-blue-950/80 text-blue-300 border border-blue-800/80 hover:bg-blue-900/60'
                : 'text-slate-400 hover:text-slate-200 border border-slate-800/80 hover:bg-slate-900'
            }`}
          >
            <GitFork className="w-3.5 h-3.5 text-blue-400" />
            <span>실시간 그래프 {showLiveGraph ? 'ON' : 'OFF'}</span>
            {executionState.activeNodeId && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping ml-0.5" />
            )}
          </Button>

          {/* Fullscreen / Modal Graph View Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsGraphModalOpen(true)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800/80 h-7 px-2.5"
            title="그래프 전체 화면 모달"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>상세 그래프</span>
          </Button>

          {/* Execution Trace Logs Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDecisionModalOpen(true)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800/80 h-7 px-2.5"
          >
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span>실행 추적 로그</span>
          </Button>
        </div>
      </div>

      {/* Main Split View: Left (Chat) + Right (Live LangGraph Canvas) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat Container */}
        <div
          className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${
            showLiveGraph ? 'flex-1 min-w-[320px] border-r border-slate-800/80' : 'w-full'
          }`}
        >
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-3xl ${
                  msg.role === 'user' ? 'ml-auto justify-end' : 'mr-auto justify-start'
                }`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-md bg-slate-900 border border-slate-700/80 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                    <Terminal className="w-3.5 h-3.5 text-slate-300" />
                  </div>
                )}

                <div className="space-y-1.5 max-w-[88%]">
                  {/* Message Bubble */}
                  <div
                    className={`p-3.5 rounded-xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-slate-800/90 text-slate-100 rounded-tr-none border border-slate-700/60 shadow-sm'
                        : 'bg-slate-900/50 rounded-tl-none border border-slate-800/90 text-slate-200'
                    }`}
                  >
                    {/* Active Thought / Reasoning Indicator */}
                    {msg.thought && (
                      <div className="flex items-center gap-2 mb-2 text-[11px] text-slate-400 font-mono bg-slate-950/70 border border-slate-800 px-2.5 py-1 rounded-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse" />
                        <span>{msg.thought}</span>
                      </div>
                    )}

                    {/* Collapsible Execution Trace */}
                    {(msg.decision || (msg.toolCalls && msg.toolCalls.length > 0)) && (
                      <details className="group mb-2.5 rounded-lg border border-slate-800/80 bg-slate-950/60 text-xs overflow-hidden">
                        <summary className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-slate-900/60 select-none text-slate-400 font-mono text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>
                              {msg.decision?.tool ? `실행: ${msg.decision.tool}()` : '의도 분석 완료'}
                            </span>
                            {msg.decision?.latencyMs && (
                              <span className="text-slate-500 font-sans">
                                • {msg.decision.latencyMs}ms
                              </span>
                            )}
                          </div>
                          <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-open:rotate-180 transition-transform" />
                        </summary>
                        <div className="px-3 py-2.5 border-t border-slate-800/60 text-[11px] space-y-2 bg-slate-900/40 text-slate-300">
                          {msg.decision?.why && (
                            <div>
                              <span className="text-slate-400 font-medium">판단 근거: </span>
                              <span className="text-slate-300">{msg.decision.why}</span>
                            </div>
                          )}
                          {msg.decision?.safetyEvaluation && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              보안 등급: {msg.decision.safetyEvaluation}
                            </div>
                          )}
                          {msg.toolCalls?.map((tc, idx) => (
                            <div
                              key={idx}
                              className="font-mono text-[10px] text-slate-300 bg-slate-950 p-2 rounded border border-slate-800 overflow-x-auto"
                            >
                              <div className="text-slate-400 font-semibold mb-0.5">도구 호출 인수:</div>
                              <code>{JSON.stringify(tc.input, null, 2)}</code>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Content Render */}
                    {msg.role === 'assistant' ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : (
                      <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                    )}

                    {/* Human-in-the-loop Confirmation Card */}
                    {msg.confirmation && (
                      <div className="mt-3 p-3 bg-amber-950/20 border border-amber-800/50 rounded-lg space-y-2.5">
                        <div className="flex items-center gap-2 text-amber-300 font-medium text-xs">
                          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>보안 승인 필요: 파괴적 작업 검증</span>
                        </div>
                        <div className="text-[11px] text-slate-300 leading-normal">
                          {msg.confirmation.description}
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() =>
                              handleConfirmApproval(msg.id, msg.confirmation!.token, true)
                            }
                            className="flex items-center gap-1.5 text-xs h-7 px-3 font-medium"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> 승인 및 실행
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleConfirmApproval(msg.id, msg.confirmation!.token, false)
                            }
                            className="flex items-center gap-1.5 text-xs h-7 px-3 text-slate-400 border-slate-700 hover:text-white"
                          >
                            <XCircle className="w-3.5 h-3.5" /> 취소
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-md bg-slate-800 border border-slate-700/80 flex items-center justify-center text-slate-300 shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Chips */}
          <div className="px-6 py-2 border-t border-slate-800/80 bg-slate-950 flex items-center gap-2 overflow-x-auto shrink-0">
            <span className="text-[11px] text-slate-500 flex items-center gap-1 shrink-0 font-medium">
              <ListFilter className="w-3 h-3 text-slate-400" /> 추천:
            </span>
            {quickPrompts.map((p, idx) => (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                onClick={() => handleSend(p)}
                disabled={isStreaming}
                className="rounded-md text-[11px] text-slate-300 border-slate-800 bg-slate-900/60 hover:bg-slate-800 hover:text-white h-6 px-2.5 shrink-0"
              >
                {p}
              </Button>
            ))}
          </div>

          {/* Input area */}
          <div className="p-4 border-t border-slate-800/80 bg-slate-950 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex gap-2 max-w-4xl mx-auto"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  role === 'INFRA_TEAM'
                    ? '인프라 명령 입력 (예: REQ-1001 승인, 104번 VM 시작, 105번 삭제)'
                    : '자원 요청서 작성 (예: 2코어 4기가 램 20GB 디스크로 웹서버 신청)'
                }
                disabled={isStreaming}
                className="flex-1 bg-slate-900/80 border-slate-800 text-slate-100 placeholder:text-slate-500 text-xs h-10 focus-visible:ring-1 focus-visible:ring-slate-600 focus-visible:border-slate-600 rounded-lg"
              />
              <Button
                type="submit"
                disabled={isStreaming || !input.trim()}
                className="bg-slate-100 hover:bg-white text-slate-900 font-semibold px-4 h-10 rounded-lg text-xs transition-colors shrink-0"
              >
                <Send className="w-3.5 h-3.5 mr-1" /> 전송
              </Button>
            </form>
          </div>
        </div>

        {/* Right: Live LangGraph Canvas Panel */}
        {showLiveGraph && (
          <div className="flex w-[42%] min-w-[340px] max-w-[560px] flex-col h-full overflow-hidden bg-[#040711] shrink-0">
            <div className="p-3 border-b border-slate-800/80 bg-slate-950/90 flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2">
                <GitFork className="w-4 h-4 text-blue-400" />
                <span className="font-semibold text-slate-200">실시간 LangGraph 실행 캔버스</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLiveGraph(false)}
                className="h-6 w-6 p-0 text-slate-400 hover:text-slate-200"
                title="패널 닫기"
              >
                <PanelRightClose className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="flex-1 relative overflow-hidden">
              <LangGraphCanvas
                executionState={executionState}
                activeNodeId={executionState.activeNodeId}
                compact={false}
              />
            </div>
          </div>
        )}
      </div>

      {/* Decision Logs Modal */}
      <DecisionLogsModal
        isOpen={isDecisionModalOpen}
        onClose={() => setIsDecisionModalOpen(false)}
      />

      {/* LangGraph Visualizer Modal */}
      <LangGraphVisualizerModal
        isOpen={isGraphModalOpen}
        onClose={() => setIsGraphModalOpen(false)}
        activeNodeId={executionState.activeNodeId}
      />
    </div>
  );
}
