'use client';

import React, { useEffect, useState } from 'react';
import { Header } from '@/components/layout/Header';
import {
  Zap,
  ShieldCheck,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  History,
  CheckCircle2,
  XCircle,
  Brain,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  AutomationRule,
  AuditLog,
  fetchAutomationRules,
  toggleAutomationRule,
  deleteAutomationRule,
  createAutomationRule,
  fetchAuditLogs,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export default function AutomationPage() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleThreshold, setNewRuleThreshold] = useState(90);
  const [auditFilter, setAuditFilter] = useState<'all' | 'ai-agent' | 'automation-engine' | 'user'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [r, l] = await Promise.all([
        fetchAutomationRules().catch(() => [
          {
            id: 'rule-001',
            name: '노드 메모리 임계치 감시 및 경고',
            description: '클러스터 노드의 메모리 사용률이 85%를 초과할 경우 알림 발행',
            triggerType: 'RESOURCE_THRESHOLD',
            thresholdMetric: 'mem' as const,
            thresholdValue: 85,
            actionType: 'ALERT',
            enabled: true,
            triggerCount: 3,
            lastTriggeredAt: new Date(Date.now() - 300000).toISOString(),
          },
          {
            id: 'rule-002',
            name: '중요 서비스 자율 복구 (Auto-Heal)',
            description: 'web-gateway-prod(100) 또는 app-api-worker(101) VM 다운 시 자동 재기동',
            triggerType: 'VM_STATUS_CHANGE',
            actionType: 'AUTO_HEAL_RESTART',
            enabled: true,
            triggerCount: 1,
            lastTriggeredAt: new Date(Date.now() - 3600000).toISOString(),
          },
        ] as AutomationRule[]),
        fetchAuditLogs().catch(() => [
          {
            id: 'aud-001',
            timestamp: new Date().toISOString(),
            actor: 'ai-agent',
            action: 'qemu_start',
            targetKind: 'ai-decision',
            targetId: '101',
            status: 'SUCCESS',
            details: {
              prompt: '101번 VM 기동해줘',
              intent: 'vm_start',
              tool: 'qemu_start',
              args: { node: 'pve-node-01', vmid: 101 },
              why: '사용자 입력 "101번 VM 기동해줘"에서 인스턴스 전원 기동 의도 및 대상 VMID 101을 감지하여 qemu_start 도구를 호출하도록 결정했습니다.',
              safetyEvaluation: 'SAFE - 인스턴스 정상 가동 작업으로 즉시 실행 허용되었습니다.',
              latencyMs: 14,
              upid: 'UPID:pve-node-01:00001001:00000000:1718000000:qmstart:101:root@pam:',
            },
          },
          {
            id: 'aud-002',
            timestamp: new Date(Date.now() - 600000).toISOString(),
            actor: 'automation-engine',
            action: 'threshold_alert',
            targetKind: 'node',
            targetId: 'pve-node-02',
            status: 'SUCCESS',
            details: { value: '88.5%', metric: 'mem' },
          },
        ] as AuditLog[]),
      ]);
      setRules(r);
      setLogs(l);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async (id: string) => {
    try {
      const updated = await toggleAutomationRule(id);
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: updated.enabled } : r)));
    } catch {
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 자동화 규칙을 삭제하시겠습니까?')) return;
    try {
      await deleteAutomationRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setRules((prev) => prev.filter((r) => r.id !== id));
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName.trim()) return;

    try {
      const newRule = await createAutomationRule({
        name: newRuleName,
        description: `CPU/메모리 ${newRuleThreshold}% 초과 시 알림 규칙`,
        triggerType: 'RESOURCE_THRESHOLD',
        thresholdMetric: 'mem',
        thresholdValue: newRuleThreshold,
        actionType: 'ALERT',
        enabled: true,
      });
      setRules((prev) => [...prev, newRule]);
      setShowAddModal(false);
      setNewRuleName('');
    } catch (err: any) {
      alert(`규칙 생성 실패: ${err.message}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header onRefresh={loadData} isRefreshing={loading} />

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Section 1: Automation Rules */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>스케줄러 & 자율 복구 자동화 규칙</span>
              </h2>
              <p className="text-xs text-slate-400">
                ShedLock 기반 분산 주기 실행 및 임계치 도달 시 자율 액션 트리거
              </p>
            </div>
            <Button
              onClick={() => setShowAddModal(true)}
              size="sm"
              className="flex items-center gap-1.5 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              규칙 추가
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map((rule) => (
              <Card key={rule.id} className="glow-card border-slate-800 bg-slate-900/70">
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-sm text-slate-100">{rule.name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">{rule.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggle(rule.id)}
                        className="text-slate-400 hover:text-emerald-400 transition-colors"
                        title={rule.enabled ? '비활성화' : '활성화'}
                      >
                        {rule.enabled ? (
                          <ToggleRight className="w-6 h-6 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-6 h-6 text-slate-600" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-0">
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[11px] text-cyan-400 border-slate-700">
                        {rule.triggerType}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-[11px] text-amber-300 border-slate-700">
                        {rule.actionType}
                      </Badge>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">
                      트리거 {rule.triggerCount}회
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Section 2: Audit Logs & AI Decision Trace */}
        <section className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <History className="w-4 h-4 text-teal-400" />
                <span>인프라 제어 감사 & AI 판단 로그</span>
              </h2>
              <p className="text-xs text-slate-400">
                AI 챗봇의 툴 선택 및 판단 근거(Why Selected), 사용자 명령, 자동화 엔진의 모든 작업 이력 추적
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
              <Button
                variant={auditFilter === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAuditFilter('all')}
                className="h-7 text-xs"
              >
                전체 ({logs.length})
              </Button>
              <Button
                variant={auditFilter === 'ai-agent' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAuditFilter('ai-agent')}
                className={`h-7 text-xs gap-1 ${
                  auditFilter === 'ai-agent' ? 'text-purple-300 border border-purple-500/30' : ''
                }`}
              >
                <Brain className="w-3 h-3 text-purple-400" />
                <span>AI 판단 로그 ({logs.filter((l) => l.actor === 'ai-agent').length})</span>
              </Button>
              <Button
                variant={auditFilter === 'automation-engine' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAuditFilter('automation-engine')}
                className="h-7 text-xs"
              >
                자동화 ({logs.filter((l) => l.actor === 'automation-engine').length})
              </Button>
              <Button
                variant={auditFilter === 'user' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setAuditFilter('user')}
                className="h-7 text-xs"
              >
                사용자 ({logs.filter((l) => l.actor === 'user').length})
              </Button>
            </div>
          </div>

          <Card className="glow-card border-slate-800 bg-slate-900/70 overflow-hidden">
            <Table className="text-xs">
              <TableHeader className="bg-slate-900/60 uppercase font-mono text-[11px]">
                <TableRow className="border-slate-800">
                  <TableHead className="py-3 px-4 text-slate-400">시간</TableHead>
                  <TableHead className="py-3 px-4 text-slate-400">주체 (Actor)</TableHead>
                  <TableHead className="py-3 px-4 text-slate-400">수행 작업 (Action / Tool)</TableHead>
                  <TableHead className="py-3 px-4 text-slate-400">판단 근거 / 상세 정보</TableHead>
                  <TableHead className="py-3 px-4 text-slate-400">상태</TableHead>
                  <TableHead className="py-3 px-4 text-right text-slate-400">상세 보기</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-800/50">
                {logs
                  .filter((log) => auditFilter === 'all' || log.actor === auditFilter)
                  .map((log) => {
                    const isSuccess = log.status === 'SUCCESS';
                    const isAi = log.actor === 'ai-agent';
                    const isExpanded = expandedLogId === log.id;
                    const whyText = log.details?.why;

                    return (
                      <React.Fragment key={log.id}>
                        <TableRow
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className={`hover:bg-slate-800/40 cursor-pointer border-slate-800/50 ${
                            isExpanded ? 'bg-slate-800/60' : ''
                          }`}
                        >
                          <TableCell className="py-3.5 px-4 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </TableCell>
                          <TableCell className="py-3.5 px-4 whitespace-nowrap">
                            <Badge
                              variant={isAi ? 'purple' : log.actor === 'automation-engine' ? 'warning' : 'info'}
                              className="font-mono text-[10px]"
                            >
                              {log.actor.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3.5 px-4 font-mono font-medium text-slate-200 whitespace-nowrap">
                            {log.details?.tool || log.action}
                          </TableCell>
                          <TableCell className="py-3.5 px-4">
                            {whyText ? (
                              <div className="space-y-0.5">
                                <div className="text-[11px] font-medium text-slate-200 line-clamp-1">
                                  "{log.details?.prompt}"
                                </div>
                                <div className="text-[11px] text-purple-300/90 line-clamp-1 flex items-center gap-1 font-mono">
                                  <span>💡 {whyText}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="font-mono text-[11px] text-slate-400 truncate block max-w-md">
                                {log.details ? JSON.stringify(log.details) : '-'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-3.5 px-4 whitespace-nowrap">
                            <Badge
                              variant={isSuccess ? 'success' : 'destructive'}
                              className="font-mono text-[10px] gap-1"
                            >
                              {isSuccess ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3.5 px-4 text-right">
                            <button className="text-slate-400 hover:text-slate-200">
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-emerald-400" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          </TableCell>
                        </TableRow>

                        {/* Collapsible Deep-Dive Row */}
                        {isExpanded && (
                          <TableRow className="bg-slate-950/70 border-slate-800">
                            <TableCell colSpan={6} className="p-4 space-y-3 border-t border-slate-800/80">
                              {isAi ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                  <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-1.5">
                                    <div className="font-semibold text-purple-300 flex items-center gap-1.5">
                                      <Brain className="w-3.5 h-3.5 text-purple-400" />
                                      <span>AI 판단 및 도구 선택 사유</span>
                                    </div>
                                    <p className="text-[11px] text-slate-200 leading-relaxed bg-slate-900/60 p-2 rounded-lg border border-purple-500/20">
                                      {log.details?.why || '-'}
                                    </p>
                                    <div className="text-[10px] font-mono text-slate-400 flex items-center gap-3 pt-0.5">
                                      <span>의도: <strong className="text-purple-300">{log.details?.intent || '-'}</strong></span>
                                      {log.details?.latencyMs && (
                                        <span>추론 지연: <strong className="text-cyan-300">{log.details.latencyMs}ms</strong></span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                                    <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                                      <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                                      <span>보안 평가 및 실행 영수증</span>
                                    </div>
                                    <div className="text-[11px] font-mono text-slate-300 bg-slate-800/50 p-2 rounded-lg">
                                      {log.details?.safetyEvaluation || 'SAFE'}
                                    </div>
                                    {log.details?.args && (
                                      <div className="text-[10px] font-mono text-slate-400 truncate">
                                        호출 인자: {JSON.stringify(log.details.args)}
                                      </div>
                                    )}
                                    {log.details?.upid && (
                                      <div className="text-[10px] font-mono text-cyan-400 truncate">
                                        UPID: {log.details.upid}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 font-mono text-xs text-slate-300">
                                  <pre className="text-[11px] text-slate-300 overflow-x-auto">
                                    {JSON.stringify(log.details || {}, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    );
                  })}
              </TableBody>
            </Table>
          </Card>
        </section>
      </main>

      {/* Add Rule Dialog */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-md border-slate-800 bg-slate-900/95">
          <DialogHeader>
            <DialogTitle className="text-base text-slate-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>새 자동화 규칙 생성</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateRule} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                규칙 이름
              </label>
              <Input
                type="text"
                required
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                placeholder="예: 고부하 컨테이너 자동 감시"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                메모리 임계치 (%): {newRuleThreshold}%
              </label>
              <input
                type="range"
                min="50"
                max="98"
                value={newRuleThreshold}
                onChange={(e) => setNewRuleThreshold(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>

            <DialogFooter className="pt-2 border-t border-slate-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setShowAddModal(false)}
              >
                취소
              </Button>
              <Button
                type="submit"
                size="sm"
              >
                생성하기
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
