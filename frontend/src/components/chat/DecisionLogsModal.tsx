'use client';

import { useState, useEffect } from 'react';
import {
  Brain,
  Wrench,
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
} from 'lucide-react';
import { fetchDecisionLogs, AuditLog } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface DecisionLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DecisionLogsModal({ isOpen, onClose }: DecisionLogsModalProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedTool, setSelectedTool] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await fetchDecisionLogs(50);
      setLogs(data);
      if (data.length > 0 && !selectedLog) {
        setSelectedLog(data[0]);
      }
    } catch (err: any) {
      console.error('Failed to load decision logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen]);

  const tools = Array.from(new Set(logs.map((l) => l.details?.tool || l.action))).filter(Boolean);

  const filteredLogs = logs.filter((l) => {
    const prompt = l.details?.prompt || '';
    const why = l.details?.why || '';
    const tool = l.details?.tool || l.action || '';
    const matchSearch =
      prompt.toLowerCase().includes(search.toLowerCase()) ||
      why.toLowerCase().includes(search.toLowerCase()) ||
      tool.toLowerCase().includes(search.toLowerCase());

    const matchTool = selectedTool === 'all' || tool === selectedTool;
    return matchSearch && matchTool;
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0 gap-0 border-slate-800 bg-slate-900/95 overflow-hidden">
        {/* Header */}
        <DialogHeader className="p-4 border-b border-slate-800 flex flex-row items-center justify-between bg-slate-950/60 space-y-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base text-slate-100">
                  AI 툴 호출 & 판단 근거 로그 (AI Decision Trace Logs)
                </DialogTitle>
                <Badge variant="purple" className="text-[10px] font-mono">
                  REASONING AUDIT
                </Badge>
              </div>
              <DialogDescription className="text-xs text-slate-400">
                AI 에이전트가 어떤 툴을 호출했고 왜 선택했는지(추론 및 보안 판단)에 대한 전체 의사결정 기록
              </DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-2 mr-6">
            <Button
              variant="outline"
              size="icon"
              onClick={loadLogs}
              disabled={loading}
              className="h-8 w-8 text-slate-400 hover:text-white"
              title="새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </DialogHeader>

        {/* Filter bar */}
        <div className="p-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <Input
              type="text"
              placeholder="사용자 질의 또는 판단 이유 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs bg-slate-800/80 border-slate-700/60"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedTool}
              onChange={(e) => setSelectedTool(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-md px-2.5 py-1 text-slate-200 font-mono text-xs focus:outline-none"
            >
              <option value="all">모든 도구 ({logs.length})</option>
              {tools.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Content Body: Left List, Right Detail */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Log Items List */}
          <div className="w-1/2 border-r border-slate-800 overflow-y-auto divide-y divide-slate-800/60">
            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                검색된 AI 판단 로그가 없습니다.
              </div>
            ) : (
              filteredLogs.map((log) => {
                const isSelected = selectedLog?.id === log.id;
                const toolName = log.details?.tool || log.action;
                const whyText = log.details?.why || '-';
                const promptText = log.details?.prompt || log.action;

                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`p-3.5 cursor-pointer transition-colors space-y-1.5 ${
                      isSelected
                        ? 'bg-purple-950/30 border-l-2 border-purple-500'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-mono">
                        <Badge variant="purple" className="text-[10px] py-0 px-1.5 font-mono">
                          {toolName}
                        </Badge>
                        {log.details?.latencyMs && (
                          <span className="text-[10px] text-slate-500">
                            {log.details.latencyMs}ms
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="text-xs font-medium text-slate-200 line-clamp-1">
                      "{promptText}"
                    </div>

                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      💡 {whyText}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {/* Right: Selected Log Deep Dive Inspector */}
          <div className="w-1/2 p-5 overflow-y-auto space-y-4 bg-slate-950/30">
            {selectedLog ? (
              <div className="space-y-4">
                {/* Header */}
                <div className="pb-3 border-b border-slate-800 flex items-start justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono">Log ID: {selectedLog.id}</span>
                    <h4 className="text-sm font-semibold text-slate-100 mt-0.5">
                      "{selectedLog.details?.prompt || selectedLog.action}"
                    </h4>
                  </div>
                  <Badge variant="success" className="text-[10px] font-mono">
                    {selectedLog.status}
                  </Badge>
                </div>

                {/* Section 1: Tool Selection & Why */}
                <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300">
                    <Brain className="w-4 h-4 text-purple-400" />
                    <span>AI 의사결정: 왜 이 도구를 선택했는가?</span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-purple-500/20">
                    {selectedLog.details?.why || '도구 선택 사유가 기록되지 않았습니다.'}
                  </p>
                  <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400 pt-1">
                    <span>의도: <strong className="text-purple-300">{selectedLog.details?.intent || '-'}</strong></span>
                    <span>도구: <strong className="text-emerald-400">{selectedLog.details?.tool || selectedLog.action}</strong></span>
                    {selectedLog.details?.latencyMs && (
                      <span>추론: <strong className="text-cyan-300">{selectedLog.details.latencyMs}ms</strong></span>
                    )}
                  </div>
                </div>

                {/* Section 2: Safety Evaluation */}
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-slate-300">
                    <ShieldCheck className="w-4 h-4 text-teal-400" />
                    <span>보안 및 안전성 평가 (Safety Check)</span>
                  </div>
                  <p className="text-slate-300 bg-slate-800/40 p-2 rounded-lg border border-slate-700/60 font-mono text-[11px]">
                    {selectedLog.details?.safetyEvaluation || 'SAFE - 안전한 작업'}
                  </p>
                </div>

                {/* Section 3: Tool Arguments & Execution Result */}
                <div className="space-y-2 text-xs">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-cyan-400" />
                    도구 호출 인자 (Arguments)
                  </span>
                  <pre className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto">
                    {JSON.stringify(selectedLog.details?.args || {}, null, 2)}
                  </pre>
                </div>

                {selectedLog.details?.upid && (
                  <div className="space-y-1 text-xs">
                    <span className="text-slate-400 font-mono">Proxmox UPID 영수증:</span>
                    <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[10px] text-cyan-400 break-all">
                      {selectedLog.details.upid}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                좌측 목록에서 로그를 선택하세요.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono">총 {logs.length}건의 판단 로그가 기록되어 있습니다.</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="text-xs"
          >
            닫기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
