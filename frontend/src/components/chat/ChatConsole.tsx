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
  Plus,
  Trash2,
  MessagesSquare,
  MessageSquare,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
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

export interface Message {
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

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: Message[];
  executionState?: GraphExecutionState;
}

const STORAGE_SESSIONS_KEY = 'pve_chat_sessions_v2';
const STORAGE_ACTIVE_ID_KEY = 'pve_active_session_id_v2';

export function ChatConsole() {
  const { role, requesterName } = useUserRole();

  const devPrompts = [
    '내 자원 요청 내역 조회',
    '테스트용 VM 발급 신청 (2C 4GB 20GB)',
    '101번 VM 디스크 20GB 증설 요청',
    '실행 중인 VM 목록',
  ];

  const infraPrompts = [
    '대기 중인 자원 요청 큐 조회',
    'REQ-1001 자원 요청 승인',
    '104번 VM 기동',
    '105번 컨테이너 삭제 (보안 승인)',
  ];

  const quickPrompts = role === 'INFRA_TEAM' ? infraPrompts : devPrompts;

  const getWelcomeMessage = (currentRole: 'DEV_TEAM' | 'INFRA_TEAM'): Message => ({
    id: `welcome-${Date.now()}`,
    role: 'assistant',
    content:
      currentRole === 'INFRA_TEAM'
        ? 'Proxmox VE 인프라 운영 콘솔입니다. 클러스터 자원 현황 조회, VM 전원 제어, 개발팀 자원 신청 티켓(REQ-XXXX) 심사 및 자동 배포를 수행할 수 있습니다.'
        : '서비스 개발팀 인프라 셀프서비스 콘솔입니다. 필요한 서버 사양(CPU, RAM, Disk)과 용도를 입력하시면 인프라팀 승인 큐로 자원 요청서가 접수됩니다.',
  });

  // Sessions state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [isSessionSidebarOpen, setIsSessionSidebarOpen] = useState(true);

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

  // 1. Initial Load from LocalStorage
  useEffect(() => {
    try {
      const savedSessions = localStorage.getItem(STORAGE_SESSIONS_KEY);
      const savedActiveId = localStorage.getItem(STORAGE_ACTIVE_ID_KEY);

      if (savedSessions) {
        const parsed: ChatSession[] = JSON.parse(savedSessions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSessions(parsed);
          const active = parsed.find((s) => s.id === savedActiveId) || parsed[0];
          setActiveSessionId(active.id);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved chat sessions from localStorage:', e);
    }

    // Default initial session
    const initialSessionId = `session-${Date.now()}`;
    const initialSession: ChatSession = {
      id: initialSessionId,
      title: '새 인프라 세션',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [getWelcomeMessage(role)],
    };
    setSessions([initialSession]);
    setActiveSessionId(initialSessionId);
    try {
      localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify([initialSession]));
      localStorage.setItem(STORAGE_ACTIVE_ID_KEY, initialSessionId);
    } catch (e) {}
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const messages = activeSession ? activeSession.messages : [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming]);

  // Helper to persist session changes
  const updateActiveSessionMessages = (
    updater: (prevMessages: Message[]) => Message[],
    forcedTitle?: string,
  ) => {
    setSessions((prevSessions) => {
      const targetId = activeSessionId || prevSessions[0]?.id;
      const nextSessions = prevSessions.map((s) => {
        if (s.id !== targetId) return s;
        const newMessages = updater(s.messages);
        let title = s.title;
        if (forcedTitle) {
          title = forcedTitle;
        } else if (s.title === '새 인프라 세션' || s.title === '새로운 대화') {
          const firstUserMsg = newMessages.find((m) => m.role === 'user');
          if (firstUserMsg) {
            title = firstUserMsg.content.slice(0, 24);
          }
        }
        return {
          ...s,
          title,
          updatedAt: new Date().toISOString(),
          messages: newMessages,
        };
      });

      try {
        localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(nextSessions));
      } catch (e) {}

      return nextSessions;
    });
  };

  const handleCreateNewSession = () => {
    const newSessionId = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id: newSessionId,
      title: '새 인프라 세션',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [getWelcomeMessage(role)],
    };
    const nextSessions = [newSession, ...sessions];
    setSessions(nextSessions);
    setActiveSessionId(newSessionId);
    setExecutionState({
      activeNodeId: null,
      visitedNodeIds: [],
      isLlmActive: false,
      isJevActive: false,
    });
    try {
      localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(nextSessions));
      localStorage.setItem(STORAGE_ACTIVE_ID_KEY, newSessionId);
    } catch (e) {}
  };

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setExecutionState({
      activeNodeId: null,
      visitedNodeIds: [],
      isLlmActive: false,
      isJevActive: false,
    });
    try {
      localStorage.setItem(STORAGE_ACTIVE_ID_KEY, sessionId);
    } catch (e) {}
  };

  const handleDeleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length <= 1) {
      // If only 1 session exists, reset it to empty
      handleCreateNewSession();
      return;
    }
    const filtered = sessions.filter((s) => s.id !== sessionId);
    setSessions(filtered);
    if (activeSessionId === sessionId) {
      setActiveSessionId(filtered[0].id);
    }
    try {
      localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(filtered));
      if (activeSessionId === sessionId) {
        localStorage.setItem(STORAGE_ACTIVE_ID_KEY, filtered[0].id);
      }
    } catch (e) {}
  };

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || isStreaming) return;

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `asst-${Date.now()}`;

    // Add user & empty assistant messages to active session
    updateActiveSessionMessages(
      (prev) => [
        ...prev,
        { id: userMsgId, role: 'user', content: query },
        { id: assistantMsgId, role: 'assistant', content: '', thought: '의도 분석 및 실행 계획 수립 중...' },
      ],
      activeSession?.title === '새 인프라 세션' ? query.slice(0, 24) : undefined,
    );

    setInput('');
    setIsStreaming(true);

    // ⚡ 1. START -> JEV Controller: First point of entry & governance binding
    setExecutionState({
      activeNodeId: 'jev_service',
      visitedNodeIds: ['__start__', 'jev_service'],
      isLlmActive: false,
      isJevActive: true,
      statusMessage: `⚡ JEV Controller: 사용자 요청 접수 및 거버넌스 정책(역할: ${role === 'INFRA_TEAM' ? '인프라 관리팀' : '서비스 개발팀'}) 검증 중...`,
    });

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          threadId: activeSessionId || 'main-thread',
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
                const isJev = Boolean(chunk.content?.includes('JEV'));
                const isLlm = Boolean(chunk.content?.includes('LLM'));
                const targetNode = isLlm ? 'synthesizer' : (isJev ? 'jev_service' : 'router');
                setExecutionState((prev) => ({
                  ...prev,
                  activeNodeId: targetNode,
                  isLlmActive: isLlm,
                  isJevActive: isJev,
                  visitedNodeIds: Array.from(new Set([...prev.visitedNodeIds, targetNode])),
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
                  isJevActive: hasTool,
                  statusMessage: hasTool
                    ? `도구 결정 [${chunk.decision?.tool}]: ⚡ JEV 안전 거버넌스 가드레일 검증`
                    : '일반 질문: 🤖 LLM Synthesizer 대화 답변 생성',
                }));
              } else if (chunk.type === 'confirmation_required') {
                setExecutionState((prev) => ({
                  ...prev,
                  activeNodeId: 'safety_check',
                  visitedNodeIds: Array.from(new Set([...prev.visitedNodeIds, 'safety_check'])),
                  isLlmActive: false,
                  isJevActive: true,
                  statusMessage: '⚠️ 고위험 작업 감지: ⚡ JEV Safety Gate Human-in-the-Loop 승인 대기',
                }));
              } else if (chunk.type === 'tool_start') {
                setExecutionState((prev) => ({
                  ...prev,
                  activeNodeId: 'tool_executor',
                  visitedNodeIds: Array.from(new Set([...prev.visitedNodeIds, 'tool_executor'])),
                  isLlmActive: false,
                  isJevActive: true,
                  statusMessage: `⚡ JEV Controller: Proxmox ${chunk.tool}() 실행 중...`,
                }));
              } else if (chunk.type === 'tool_end') {
                setExecutionState((prev) => ({
                  ...prev,
                  activeNodeId: 'synthesizer',
                  visitedNodeIds: Array.from(new Set([...prev.visitedNodeIds, 'synthesizer'])),
                  isLlmActive: true,
                  isJevActive: false,
                  statusMessage: '실행 결과 수신: 🤖 LLM 최종 대화 응답 합성 중...',
                }));
              } else if (chunk.type === 'done') {
                setExecutionState((prev) => ({
                  ...prev,
                  activeNodeId: '__end__',
                  visitedNodeIds: Array.from(new Set([...prev.visitedNodeIds, '__end__'])),
                  isLlmActive: false,
                  isJevActive: false,
                  statusMessage: 'LangGraph 워크플로우 정상 완료',
                }));
              }

              // Update active session messages
              updateActiveSessionMessages((prev) =>
                prev.map((msg) => {
                  if (msg.id !== assistantMsgId) return msg;

                  if (chunk.type === 'thought') {
                    return { ...msg, thought: chunk.content };
                  }
                  if (chunk.type === 'decision') {
                    return {
                      ...msg,
                      decision: chunk.decision,
                      thought: `도구 결정: ${chunk.decision?.tool || '없음 (직접 답변)'}`,
                    };
                  }
                  if (chunk.type === 'tool_start') {
                    const currentCalls = msg.toolCalls || [];
                    return {
                      ...msg,
                      thought: `도구 실행 중: ${chunk.tool || ''}...`,
                      toolCalls: [...currentCalls, { tool: chunk.tool || '', input: chunk.input }],
                    };
                  }
                  if (chunk.type === 'tool_end') {
                    const currentCalls = msg.toolCalls || [];
                    const updated = currentCalls.map((tc) =>
                      tc.tool === (chunk.tool || '') ? { ...tc, output: chunk.output } : tc,
                    );
                    return {
                      ...msg,
                      thought: '결과 종합 중...',
                      toolCalls: updated,
                    };
                  }
                  if (chunk.type === 'confirmation_required') {
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
      updateActiveSessionMessages((prev) =>
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
      updateActiveSessionMessages((prev) =>
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

  const formatSessionTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      if (isToday) {
        return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      }
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800/80 text-xs shrink-0">
        <div className="flex items-center gap-2">
          {/* Session Sidebar Toggle Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSessionSidebarOpen(!isSessionSidebarOpen)}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white hover:bg-slate-900 border border-slate-800 h-7 px-2"
            title="대화 세션 목록 열기/닫기"
          >
            {isSessionSidebarOpen ? (
              <PanelLeftClose className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <PanelLeftOpen className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span className="font-medium">세션 목록</span>
            <Badge variant="outline" className="text-[10px] px-1 py-0 border-slate-700 bg-slate-900 text-slate-300">
              {sessions.length}
            </Badge>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateNewSession}
            className="flex items-center gap-1 text-xs text-emerald-400 border-emerald-900/60 bg-emerald-950/30 hover:bg-emerald-900/40 h-7 px-2.5"
            title="새 대화 세션 시작"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>새 세션</span>
          </Button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <span className="font-semibold text-slate-200 truncate max-w-[200px]" title={activeSession?.title}>
            {activeSession?.title || '인프라 제어 콘솔'}
          </span>
          <span className="text-[11px] text-slate-500 font-mono hidden md:inline">• LangGraph Orchestration</span>
          <Badge
            variant={role === 'INFRA_TEAM' ? 'warning' : 'outline'}
            className="text-[10px] py-0 px-2 font-mono shrink-0"
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
            <span className="hidden sm:inline">상세 그래프</span>
          </Button>

          {/* Execution Trace Logs Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDecisionModalOpen(true)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800/80 h-7 px-2.5"
          >
            <Activity className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">실행 로그</span>
          </Button>
        </div>
      </div>

      {/* Main Split View: Left (Session Sidebar) + Center (Chat) + Right (Live LangGraph Canvas) */}
      <div className="flex-1 flex overflow-hidden">
        {/* 1. Left Collapsible Session Sidebar */}
        {isSessionSidebarOpen && (
          <div className="w-64 min-w-[240px] max-w-[280px] bg-slate-950/95 border-r border-slate-800/80 flex flex-col h-full shrink-0 select-none">
            {/* Session Sidebar Header */}
            <div className="p-3 border-b border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <MessagesSquare className="w-4 h-4 text-blue-400" />
                <span>대화 세션 내역</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateNewSession}
                className="h-6 px-2 text-[11px] gap-1 text-slate-300 hover:text-white border-slate-700 bg-slate-900 hover:bg-slate-800"
              >
                <Plus className="w-3 h-3" />
                <span>생성</span>
              </Button>
            </div>

            {/* Session List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {sessions.map((sess) => {
                const isActive = sess.id === activeSessionId;
                const msgCount = sess.messages.filter((m) => m.role === 'user').length;

                return (
                  <div
                    key={sess.id}
                    onClick={() => handleSelectSession(sess.id)}
                    className={`group relative flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all border ${
                      isActive
                        ? 'bg-blue-950/50 border-blue-600/60 shadow-sm shadow-blue-500/10 text-slate-100'
                        : 'bg-slate-900/40 border-slate-800/50 hover:bg-slate-900/90 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <MessageSquare
                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                        isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-400'
                      }`}
                    />

                    <div className="flex-1 min-w-0 pr-5">
                      <div className="text-xs font-medium truncate leading-tight">
                        {sess.title || '새 인프라 세션'}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatSessionTime(sess.updatedAt)}
                        </span>
                        <span>•</span>
                        <span>질의 {msgCount}건</span>
                      </div>
                    </div>

                    {/* Delete Session Button */}
                    <button
                      onClick={(e) => handleDeleteSession(sess.id, e)}
                      title="세션 삭제"
                      className="absolute right-2 top-2.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Sidebar Footer info */}
            <div className="p-2.5 border-t border-slate-800/80 text-[10px] text-slate-500 flex items-center justify-between">
              <span>총 {sessions.length}개 세션 보관 중</span>
              <span className="text-slate-600">Auto-saved</span>
            </div>
          </div>
        )}

        {/* 2. Center: Chat Container */}
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
                    className={`p-4 rounded-xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-slate-900/90 text-slate-200 border border-slate-800/90 shadow-sm'
                    }`}
                  >
                    {/* Live Thought Streaming Badge */}
                    {msg.thought && isStreaming && msg.id === messages[messages.length - 1]?.id && (
                      <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-800 text-xs text-blue-400 font-mono animate-pulse">
                        <Activity className="w-3.5 h-3.5 animate-spin" />
                        <span>{msg.thought}</span>
                      </div>
                    )}

                    {/* Decision info card */}
                    {msg.decision && (
                      <div className="mb-3 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-slate-400 font-mono">
                          <span className="flex items-center gap-1.5 text-blue-400 font-semibold">
                            <GitFork className="w-3 h-3" />
                            {msg.decision.intent}
                          </span>
                          {msg.decision.latencyMs && (
                            <span className="text-[10px] text-slate-500">
                              {msg.decision.latencyMs}ms
                            </span>
                          )}
                        </div>
                        <div className="text-slate-300 text-[11px] leading-snug">
                          {msg.decision.why}
                        </div>
                        {msg.decision.tool && (
                          <div className="pt-1 flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                            <span>호출 도구:</span>
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 border-emerald-800 bg-emerald-950/50">
                              {msg.decision.tool}
                            </Badge>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tool Calls execution record */}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="mb-3 space-y-1.5">
                        {msg.toolCalls.map((tc, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded bg-slate-950/50 border border-slate-800/70 font-mono text-xs"
                          >
                            <div className="flex items-center justify-between text-slate-400">
                              <span className="text-purple-400">⚡ {tc.tool}</span>
                              <span className="text-[10px] text-slate-500">
                                {tc.output ? '완료' : '실행 중...'}
                              </span>
                            </div>
                            {tc.output && (
                              <div className="mt-1 text-[11px] text-slate-400 max-h-24 overflow-y-auto">
                                <pre className="whitespace-pre-wrap">{JSON.stringify(tc.output, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Main Content Markdown */}
                    {msg.content ? (
                      <MarkdownRenderer content={msg.content} />
                    ) : isStreaming ? (
                      <div className="flex items-center gap-1.5 py-1 text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" />
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce delay-100" />
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce delay-200" />
                      </div>
                    ) : null}

                    {/* Safety Gate Confirmation Card (HITL) */}
                    {msg.confirmation && (
                      <div className="mt-3 p-3.5 rounded-lg bg-amber-950/30 border border-amber-600/50 space-y-2.5">
                        <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                          <ShieldAlert className="w-4 h-4 shrink-0" />
                          <span>파괴적 고위험 작업 확인 (보안 승인 필요)</span>
                        </div>
                        <div className="text-xs text-slate-300">
                          {msg.confirmation.description}
                        </div>
                        <div className="flex items-center gap-2 pt-1 font-mono text-xs text-slate-400">
                          <span>노드: {msg.confirmation.node}</span>
                          <span>•</span>
                          <span>VMID: {msg.confirmation.vmid}</span>
                        </div>
                        <div className="flex items-center gap-2 pt-2">
                          <Button
                            size="sm"
                            onClick={() => handleConfirmApproval(msg.id, msg.confirmation!.token, true)}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs h-7 px-3 font-semibold"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            승인 및 실행
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleConfirmApproval(msg.id, msg.confirmation!.token, false)}
                            className="border-slate-700 hover:bg-slate-800 text-slate-300 text-xs h-7 px-3"
                          >
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            취소 (반려)
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Bar */}
          <div className="px-6 py-2 border-t border-slate-900 bg-slate-950/70 flex items-center gap-2 overflow-x-auto text-xs shrink-0">
            <span className="text-[11px] text-slate-500 font-medium shrink-0 flex items-center gap-1">
              <ListFilter className="w-3 h-3 text-slate-400" />
              추천:
            </span>
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(prompt)}
                disabled={isStreaming}
                className="whitespace-nowrap px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800/80 text-slate-300 hover:text-white border border-slate-800 transition-colors disabled:opacity-40 text-xs"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-4 border-t border-slate-800/80 bg-slate-950/95 shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  role === 'INFRA_TEAM'
                    ? '인프라 명령 입력 (예: "대기 중인 자원 요청 큐 조회", "101번 VM 기동")...'
                    : '요청 입력 (예: "내 자원 요청 내역 조회", "테스트용 VM 2C 4GB 20GB 신청")...'
                }
                disabled={isStreaming}
                className="flex-1 bg-slate-900/90 border-slate-800 focus-visible:ring-1 focus-visible:ring-blue-500 text-sm h-10"
              />
              <Button
                type="submit"
                disabled={isStreaming || !input.trim()}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 h-10 shrink-0 font-medium"
              >
                <Send className="w-4 h-4 mr-1.5" />
                <span>전송</span>
              </Button>
            </form>
          </div>
        </div>

        {/* 3. Right: Live LangGraph Canvas Split Panel */}
        {showLiveGraph && (
          <div className="w-[42%] min-w-[340px] max-w-[560px] flex flex-col h-full bg-slate-950 shrink-0">
            <LangGraphCanvas
              executionState={executionState}
              onSelectNode={(nodeId) => {
                console.log('Selected node on live canvas:', nodeId);
              }}
              className="h-full"
            />
          </div>
        )}
      </div>

      {/* Decision Logs Modal */}
      <DecisionLogsModal
        isOpen={isDecisionModalOpen}
        onClose={() => setIsDecisionModalOpen(false)}
      />

      {/* LangGraph Visualizer Fullscreen Modal */}
      <LangGraphVisualizerModal
        isOpen={isGraphModalOpen}
        onClose={() => setIsGraphModalOpen(false)}
        executionState={executionState}
      />
    </div>
  );
}
