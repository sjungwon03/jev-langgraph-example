'use client';

import { useState, useEffect } from 'react';
import {
  GitFork,
  Brain,
  ShieldAlert,
  Wrench,
  MessageSquare,
  PlayCircle,
  CheckCircle2,
  Copy,
  Check,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchLangGraphDefinition, LangGraphDefinition } from '@/lib/api';
import { LangGraphCanvas, GraphExecutionState } from './LangGraphCanvas';

interface LangGraphVisualizerContentProps {
  executionState?: GraphExecutionState;
  activeNodeId?: string | null;
  showHeader?: boolean;
}

export function LangGraphVisualizerContent({
  executionState,
  activeNodeId,
  showHeader = true,
}: LangGraphVisualizerContentProps) {
  const [graphData, setGraphData] = useState<LangGraphDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('router');
  const [viewTab, setViewTab] = useState<'VISUAL' | 'MERMAID' | 'STATE'>('VISUAL');
  const [copied, setCopied] = useState(false);

  const loadGraph = async () => {
    try {
      setLoading(true);
      const data = await fetchLangGraphDefinition();
      setGraphData(data);
    } catch (err: any) {
      console.error('Failed to load LangGraph definition:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraph();
  }, []);

  useEffect(() => {
    if (activeNodeId) {
      setSelectedNodeId(activeNodeId);
    }
  }, [activeNodeId]);

  const handleCopyMermaid = () => {
    if (!graphData?.mermaid) return;
    navigator.clipboard.writeText(graphData.mermaid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedNode = graphData?.nodes.find((n) => n.id === selectedNodeId) || graphData?.nodes[1];

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'start':
        return <PlayCircle className="w-4 h-4 text-emerald-400" />;
      case 'router':
        return <Brain className="w-4 h-4 text-blue-400" />;
      case 'safety':
        return <ShieldAlert className="w-4 h-4 text-amber-400" />;
      case 'tool':
        return <Wrench className="w-4 h-4 text-purple-400" />;
      case 'synth':
        return <MessageSquare className="w-4 h-4 text-emerald-400" />;
      case 'end':
        return <CheckCircle2 className="w-4 h-4 text-indigo-400" />;
      case 'llm_service':
        return <Brain className="w-4 h-4 text-cyan-400" />;
      case 'jev_service':
        return <Server className="w-4 h-4 text-emerald-400" />;
      default:
        return <GitFork className="w-4 h-4 text-slate-400" />;
    }
  };

  const getNodeColor = (type: string, isSelected: boolean, isActive: boolean) => {
    if (isActive) {
      return 'border-blue-500 bg-blue-950/70 shadow-lg shadow-blue-500/20 ring-2 ring-blue-400/50 animate-pulse';
    }
    if (isSelected) {
      return 'border-slate-400 bg-slate-800/90 shadow-md ring-1 ring-slate-400/40';
    }
    switch (type) {
      case 'start':
        return 'border-emerald-500/40 bg-emerald-950/20 hover:border-emerald-400/80';
      case 'router':
        return 'border-blue-500/40 bg-blue-950/20 hover:border-blue-400/80';
      case 'safety':
        return 'border-amber-500/40 bg-amber-950/20 hover:border-amber-400/80';
      case 'tool':
        return 'border-purple-500/40 bg-purple-950/20 hover:border-purple-400/80';
      case 'synth':
        return 'border-emerald-500/40 bg-emerald-950/20 hover:border-emerald-400/80';
      case 'end':
        return 'border-indigo-500/40 bg-indigo-950/20 hover:border-indigo-400/80';
      case 'llm_service':
        return 'border-cyan-500/40 bg-cyan-950/20 hover:border-cyan-400/80';
      case 'jev_service':
        return 'border-emerald-500/40 bg-emerald-950/20 hover:border-emerald-400/80';
      default:
        return 'border-slate-800 bg-slate-900/60 hover:border-slate-700';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Header Toolbar */}
      {showHeader && (
        <div className="p-4 border-b border-slate-200 dark:border-slate-800/90 flex flex-row items-center justify-between bg-white/90 dark:bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-500 dark:text-blue-400 flex items-center justify-center border border-blue-500/30 shadow-inner">
              <GitFork className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>LangGraph StateGraph 워크플로우 아키텍처</span>
                <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-mono text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-800/80 bg-blue-50 dark:bg-blue-950/40">
                  State Machine
                </Badge>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Proxmox 인프라 자율 에이전트의 상태 전이 다이어그램 및 거버넌스 분기
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher */}
            <div className="flex bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setViewTab('VISUAL')}
                className={`px-3 py-1 rounded-md transition-all ${
                  viewTab === 'VISUAL'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                비주얼 플로우차트
              </button>
              <button
                onClick={() => setViewTab('MERMAID')}
                className={`px-3 py-1 rounded-md transition-all ${
                  viewTab === 'MERMAID'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Mermaid 정의
              </button>
              <button
                onClick={() => setViewTab('STATE')}
                className={`px-3 py-1 rounded-md transition-all ${
                  viewTab === 'STATE'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                State Schema
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadGraph}
              disabled={loading}
              className="h-8 border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 px-2.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      )}

      {/* Content Body */}
      <div className="flex-1 flex overflow-hidden">
        {viewTab === 'VISUAL' ? (
          <>
            {/* Interactive HTML5 Flow Diagram Canvas */}
            <div className="flex-1 h-full overflow-hidden relative">
              <LangGraphCanvas
                executionState={executionState}
                activeNodeId={activeNodeId}
                onSelectNode={(id) => setSelectedNodeId(id)}
                compact={true}
              />
            </div>

            {/* Node Inspector Side Panel */}
            <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 flex flex-col justify-between shrink-0 overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800/80">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-200">노드 상세 속성</span>
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">ID: {selectedNode?.id}</span>
                </div>

                {selectedNode ? (
                  <div className="space-y-4">
                    {/* Name & Type */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        {getNodeIcon(selectedNode.type)}
                        <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">{selectedNode.name}</h4>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800/70">
                        {selectedNode.description}
                      </p>
                    </div>

                    {/* State Changes */}
                    {selectedNode.stateChanges && selectedNode.stateChanges.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                          업데이트되는 State Annotation
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedNode.stateChanges.map((sc) => (
                            <Badge
                              key={sc}
                              variant="outline"
                              className="font-mono text-[10px] bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700/80 text-blue-700 dark:text-blue-300"
                            >
                              {sc}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Connected Edges */}
                    <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800/80">
                      <label className="text-[11px] font-medium text-slate-700 dark:text-slate-300 block">연결된 엣지 및 전이 조건</label>
                      <div className="space-y-1.5">
                        {graphData?.edges
                          .filter((e) => e.from === selectedNode.id || e.to === selectedNode.id)
                          .map((e, idx) => (
                            <div
                              key={idx}
                              className="p-2 rounded bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800/80 text-[11px] space-y-1 font-mono"
                            >
                              <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                                <span>{e.from}</span>
                                <ArrowRight className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                                <span>{e.to}</span>
                              </div>
                              {e.label && (
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                                  설명: {e.label}
                                </div>
                              )}
                              {e.condition && (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                                  조건: {e.condition}
                                </div>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10 text-xs text-slate-500">노드를 선택하세요.</div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
                <span>LangGraph Engine</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">Compiled OK</span>
              </div>
            </div>
          </>
        ) : viewTab === 'MERMAID' ? (
          /* Mermaid Source View */
          <div className="flex-1 p-6 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                LangGraph Compiled StateGraph Mermaid Definition
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyMermaid}
                className="h-7 text-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? '복사됨' : 'Mermaid 코드 복사'}</span>
              </Button>
            </div>
            <pre className="flex-1 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-auto whitespace-pre leading-relaxed shadow-sm">
              {graphData?.mermaid || '// 로딩 중...'}
            </pre>
          </div>
        ) : (
          /* State Annotation Schema View */
          <div className="flex-1 p-6 flex flex-col bg-slate-50 dark:bg-slate-950 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-slate-200">InfraAgentState (Annotation.Root)</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">노드 간 누적/전달되는 LangGraph 세션 상태 데이터 구조</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">messages</span>
                  <Badge variant="outline" className="text-[10px] font-mono">BaseMessage[]</Badge>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">대화 히스토리 및 사용자 메시지 (reducer: concat)</p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">intent</span>
                  <Badge variant="outline" className="text-[10px] font-mono">string</Badge>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">LLM이 분류한 최종 작업 의도 식별자</p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">toolToCall</span>
                  <Badge variant="outline" className="text-[10px] font-mono">ToolCall | null</Badge>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">실행할 도구명(name) 및 파라미터(args)</p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">confirmationNeeded</span>
                  <Badge variant="outline" className="text-[10px] font-mono">Confirmation | null</Badge>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">파괴적 고위험 작업 시 발급된 Human-in-the-Loop 토큰</p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">toolResult</span>
                  <Badge variant="outline" className="text-[10px] font-mono">any</Badge>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Proxmox MCP 또는 자원 신청/승인 실행 결과 JSON</p>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400">finalResponse</span>
                  <Badge variant="outline" className="text-[10px] font-mono">string</Badge>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">사용자에게 스트리밍되는 최종 마크다운 대화 답변</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
