'use client';

import { useState, useEffect } from 'react';
import {
  ClipboardCheck,
  PlusCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Cpu,
  HardDrive,
  MemoryStick,
  Server,
  User,
  Building,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  fetchResourceRequests,
  fetchResourceRequestStats,
  createResourceRequest,
  reviewResourceRequest,
  fetchNodes,
  ResourceRequest,
  ResourceRequestStats,
  ProxmoxNode,
} from '@/lib/api';
import { useUserRole } from '@/lib/role-context';

export default function ResourceRequestsPage() {
  const { role, requesterName, department } = useUserRole();

  const [requests, setRequests] = useState<ResourceRequest[]>([]);
  const [stats, setStats] = useState<ResourceRequestStats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyMyRequests, setOnlyMyRequests] = useState(role === 'DEV_TEAM');

  useEffect(() => {
    setOnlyMyRequests(role === 'DEV_TEAM');
  }, [role]);

  // New Request Modal state (Dev Mode)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [reqTitle, setReqTitle] = useState('');
  const [reqType, setReqType] = useState<'CREATE_VM' | 'RESIZE_DISK' | 'DELETE_VM'>('CREATE_VM');
  const [reqCores, setReqCores] = useState(4);
  const [reqMemory, setReqMemory] = useState(8192);
  const [reqDisk, setReqDisk] = useState(50);
  const [reqVmName, setReqVmName] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Review Modal state (Infra Mode)
  const [reviewTarget, setReviewTarget] = useState<ResourceRequest | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewComment, setReviewComment] = useState('');
  const [targetNode, setTargetNode] = useState('');
  const [availableNodes, setAvailableNodes] = useState<ProxmoxNode[]>([]);
  const [reviewing, setReviewing] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const [reqList, statsData, nodesData] = await Promise.all([
        fetchResourceRequests(),
        fetchResourceRequestStats(),
        fetchNodes().catch(() => []),
      ]);
      setRequests(reqList);
      setStats(statsData);
      setAvailableNodes(nodesData || []);
      if (!targetNode && nodesData && nodesData.length > 0) {
        setTargetNode(nodesData[0].node);
      }
    } catch (err) {
      console.error('Failed to load resource requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqTitle.trim() || !reqReason.trim()) return;

    try {
      setSubmitting(true);
      await createResourceRequest({
        title: reqTitle.trim(),
        requesterName,
        department,
        type: reqType,
        reason: reqReason.trim(),
        spec: {
          name: reqVmName.trim() || `vm-${Date.now().toString().slice(-4)}`,
          cores: Number(reqCores),
          memory: Number(reqMemory),
          disk: Number(reqDisk),
          type: 'qemu',
        },
      });

      setIsCreateModalOpen(false);
      setReqTitle('');
      setReqVmName('');
      setReqReason('');
      await loadData();
    } catch (err: any) {
      alert(`자원 요청 제출 실패: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewTarget) return;

    try {
      setReviewing(true);
      await reviewResourceRequest(
        reviewTarget.id,
        {
          status: reviewDecision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          reviewerComment: reviewComment.trim(),
          targetNode,
        },
        requesterName,
      );

      setReviewTarget(null);
      setReviewComment('');
      await loadData();
    } catch (err: any) {
      alert(`요청 검토 처리 실패: ${err.message}`);
    } finally {
      setReviewing(false);
    }
  };

  const filteredRequests = requests.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (onlyMyRequests && requesterName) {
      if (!r.requesterName.includes(requesterName)) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        r.id.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.requesterName.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#070b13] overflow-y-auto">
      <Header onRefresh={loadData} isRefreshing={loading} />

      <main className="p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Banner Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/50 to-slate-950 border border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ClipboardCheck className="w-5 h-5 text-emerald-400" />
              <h1 className="text-xl font-bold tracking-tight text-white">
                {role === 'INFRA_TEAM' ? '인프라 자원 승인 센터 (Infra Review)' : '개발팀 자원 요청 센터 (Dev Requests)'}
              </h1>
              <Badge
                variant={role === 'INFRA_TEAM' ? 'warning' : 'info'}
                className="ml-2 font-mono text-[11px]"
              >
                {role === 'INFRA_TEAM' ? '인프라 관리팀' : '서비스 개발팀'}
              </Badge>
            </div>
            <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
              {role === 'INFRA_TEAM'
                ? '개발팀에서 제출한 인프라 생성 및 디스크 증설 요청을 검토하고, 원클릭으로 Proxmox MCP 자동 프로비저닝을 실행합니다.'
                : '신규 가상머신(VM) 및 컴퓨팅 자원이 필요한 경우 승인 요청서를 제출하세요. 인프라팀 승인 즉시 프로비저닝됩니다.'}
            </p>
          </div>

          {role === 'DEV_TEAM' && (
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-medium gap-2 shrink-0"
            >
              <PlusCircle className="w-4 h-4" />
              신규 자원 요청서 작성
            </Button>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">전체 요청 건수</div>
              <div className="text-2xl font-bold font-mono text-slate-100 mt-1">{stats.total}</div>
            </div>
            <Server className="w-6 h-6 text-slate-600" />
          </div>

          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">승인 심사 대기</div>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-1">{stats.pending}</div>
            </div>
            <Clock className="w-6 h-6 text-amber-500/70" />
          </div>

          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">승인 및 프로비저닝</div>
              <div className="text-2xl font-bold font-mono text-slate-100 mt-1">{stats.approved}</div>
            </div>
            <CheckCircle2 className="w-6 h-6 text-emerald-500/70" />
          </div>

          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">반려됨</div>
              <div className="text-2xl font-bold font-mono text-slate-100 mt-1">{stats.rejected}</div>
            </div>
            <XCircle className="w-6 h-6 text-slate-500" />
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          {/* Status Tabs & My Requests Filter */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 p-1 rounded-xl">
              {[
                { id: 'ALL', label: '전체' },
                { id: 'PENDING', label: '대기 중' },
                { id: 'PROVISIONED', label: '프로비저닝 완료' },
                { id: 'REJECTED', label: '반려' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    statusFilter === tab.id
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {role === 'DEV_TEAM' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOnlyMyRequests(!onlyMyRequests)}
                className={`h-9 px-3 text-xs gap-1.5 rounded-xl border transition-all ${
                  onlyMyRequests
                    ? 'bg-blue-950/80 border-blue-600/80 text-blue-300 font-medium'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>내 요청만 보기 ({requesterName || '김개발'})</span>
                {onlyMyRequests && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
              </Button>
            )}
          </div>

          {/* Search Input */}
          <div className="w-full sm:w-72">
            <Input
              placeholder="티켓번호, 제목, 신청자 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900/80 border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 h-9"
            />
          </div>
        </div>

        {/* Requests List */}
        <div className="space-y-3">
          {loading && requests.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-400" />
              자원 요청 목록을 불러오는 중...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-12 text-center border border-slate-800/80 rounded-2xl bg-slate-900/40 text-slate-500 text-sm space-y-2">
              <ClipboardCheck className="w-8 h-8 mx-auto text-slate-600" />
              <div>해당하는 자원 요청 티켓이 없습니다.</div>
              {role === 'DEV_TEAM' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="text-xs text-emerald-400 border-emerald-800/60 hover:bg-emerald-950/30 mt-2"
                >
                  새로운 자원 요청서 작성하기
                </Button>
              )}
            </div>
          ) : (
            filteredRequests.map((req) => {
              const isPending = req.status === 'PENDING';
              const isProvisioned = req.status === 'PROVISIONED';
              const isRejected = req.status === 'REJECTED';

              return (
                <div
                  key={req.id}
                  className={`p-5 rounded-xl border transition-all ${
                    isPending
                      ? 'bg-slate-900/70 border-amber-800/40 hover:border-amber-700/60 shadow-lg shadow-amber-950/10'
                      : isProvisioned
                      ? 'bg-slate-900/50 border-emerald-800/30 hover:border-emerald-700/50'
                      : 'bg-slate-900/30 border-rose-900/30'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Left: Info & Specs */}
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                          {req.id}
                        </span>

                        <h3 className="font-semibold text-slate-100 text-sm truncate">
                          {req.title}
                        </h3>

                        {isPending && (
                          <Badge variant="warning" className="gap-1 text-[10px] py-0.5">
                            <Clock className="w-3 h-3 animate-spin" /> 승인 대기
                          </Badge>
                        )}
                        {isProvisioned && (
                          <Badge variant="success" className="gap-1 text-[10px] py-0.5">
                            <CheckCircle2 className="w-3 h-3" /> 프로비저닝 완료
                          </Badge>
                        )}
                        {isRejected && (
                          <Badge variant="destructive" className="gap-1 text-[10px] py-0.5">
                            <XCircle className="w-3 h-3" /> 반려됨
                          </Badge>
                        )}

                        <span className="text-[11px] text-slate-500 font-mono">
                          {new Date(req.createdAt).toLocaleString('ko-KR')}
                        </span>
                      </div>

                      {/* Requester and Spec Chips */}
                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1 text-slate-300">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          {req.requesterName}
                        </span>
                        <span className="flex items-center gap-1 text-slate-400">
                          <Building className="w-3.5 h-3.5 text-slate-500" />
                          {req.department}
                        </span>

                        <span className="text-slate-600">•</span>

                        {req.spec.cores && (
                          <span className="flex items-center gap-1 font-mono text-slate-300 bg-slate-800/50 px-2 py-0.5 rounded">
                            <Cpu className="w-3 h-3 text-emerald-400" />
                            {req.spec.cores} Cores
                          </span>
                        )}
                        {req.spec.memory && (
                          <span className="flex items-center gap-1 font-mono text-slate-300 bg-slate-800/50 px-2 py-0.5 rounded">
                            <MemoryStick className="w-3 h-3 text-teal-400" />
                            {req.spec.memory >= 1024
                              ? `${Math.round(req.spec.memory / 1024)} GB RAM`
                              : `${req.spec.memory} MB`}
                          </span>
                        )}
                        {req.spec.disk && (
                          <span className="flex items-center gap-1 font-mono text-slate-300 bg-slate-800/50 px-2 py-0.5 rounded">
                            <HardDrive className="w-3 h-3 text-cyan-400" />
                            {req.spec.disk} GB Disk
                          </span>
                        )}
                      </div>

                      {/* Reason */}
                      <p className="text-xs text-slate-400 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60 leading-relaxed">
                        <strong className="text-slate-300 font-medium">신청 사유: </strong>
                        {req.reason}
                      </p>

                      {/* Provisioning Receipt or Review Comments */}
                      {isProvisioned && req.provisionedVmid && (
                        <div className="flex items-center gap-3 text-xs text-emerald-300 bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-800/40">
                          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                          <div>
                            <div>
                              <strong>자동 프로비저닝 완료: </strong>
                              {req.targetNode} 노드에 <strong>VMID {req.provisionedVmid}</strong> 할당 완료!
                            </div>
                            {req.upid && (
                              <div className="text-[10px] text-emerald-400/80 font-mono mt-0.5 truncate">
                                Proxmox UPID: {req.upid}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {isRejected && req.reviewerComment && (
                        <div className="flex items-center gap-2 text-xs text-rose-300 bg-rose-950/30 p-2.5 rounded-lg border border-rose-800/40">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                          <div>
                            <strong>반려 사유 ({req.reviewerName}): </strong>
                            {req.reviewerComment}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions for Infra Team */}
                    {role === 'INFRA_TEAM' && isPending && (
                      <div className="flex items-center gap-2 shrink-0 md:self-center">
                        <Button
                          size="sm"
                          onClick={() => {
                            setReviewTarget(req);
                            setReviewDecision('APPROVE');
                            setReviewComment('자원 검토 완료. 클러스터 용량 적합하여 자동 프로비저닝을 승인합니다.');
                          }}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-medium gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          승인 및 프로비저닝
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setReviewTarget(req);
                            setReviewDecision('REJECT');
                            setReviewComment('현재 클러스터 자원 정책 한도 초과로 반려합니다.');
                          }}
                          className="border-slate-800 bg-slate-900 text-slate-400 hover:text-rose-400 hover:bg-slate-800 text-xs"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          반려
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>

      {/* Modal 1: Developer New Resource Request Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-white">
              <PlusCircle className="w-5 h-5 text-emerald-400" />
              신규 자원 요청서 작성
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              인프라팀에 가상머신 또는 컴퓨팅 자원 증설을 요청합니다. 승인 시 Proxmox 클러스터에 자동 생성됩니다.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                요청 제목 *
              </label>
              <Input
                placeholder="예: 주문 결제 마이크로서비스 테스트용 VM 생성 요청"
                value={reqTitle}
                onChange={(e) => setReqTitle(e.target.value)}
                required
                className="bg-slate-950 border-slate-800 text-sm text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  신청자 이름
                </label>
                <Input
                  value={requesterName}
                  disabled
                  className="bg-slate-950/60 border-slate-800 text-xs text-slate-400"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  소속 부서 / 팀
                </label>
                <Input
                  value={department}
                  disabled
                  className="bg-slate-950/60 border-slate-800 text-xs text-slate-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  CPU Cores
                </label>
                <Input
                  type="number"
                  min="1"
                  max="16"
                  value={reqCores}
                  onChange={(e) => setReqCores(Number(e.target.value))}
                  className="bg-slate-950 border-slate-800 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  RAM (MB)
                </label>
                <Input
                  type="number"
                  min="1024"
                  step="1024"
                  max="65536"
                  value={reqMemory}
                  onChange={(e) => setReqMemory(Number(e.target.value))}
                  className="bg-slate-950 border-slate-800 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Disk (GB)
                </label>
                <Input
                  type="number"
                  min="10"
                  max="500"
                  value={reqDisk}
                  onChange={(e) => setReqDisk(Number(e.target.value))}
                  className="bg-slate-950 border-slate-800 text-sm text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                희망 인스턴스 호스트명 (선택)
              </label>
              <Input
                placeholder="예: order-api-dev"
                value={reqVmName}
                onChange={(e) => setReqVmName(e.target.value)}
                className="bg-slate-950 border-slate-800 text-sm text-slate-100"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                신청 목적 및 상세 사유 *
              </label>
              <textarea
                rows={3}
                placeholder="예: 신규 결제 모듈 부하 분산 테스트 환경 구축 및 Docker 컨테이너 실행용"
                value={reqReason}
                onChange={(e) => setReqReason(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-md p-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateModalOpen(false)}
                className="border-slate-800 text-slate-300 hover:text-white"
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                {submitting ? '제출 중...' : '요청서 제출하기'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal 2: Infra Team Review & Auto-Provision Modal */}
      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-white">
              <ClipboardCheck className="w-5 h-5 text-amber-400" />
              자원 요청 심사: [{reviewTarget?.id}]
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              {reviewTarget?.title} ({reviewTarget?.requesterName} • {reviewTarget?.department})
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleReviewSubmit} className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
              <div className="text-slate-400">
                <strong>신청 스펙: </strong>
                {reviewTarget?.spec.cores} Cores / {reviewTarget?.spec.memory} MB RAM / {reviewTarget?.spec.disk} GB Disk
              </div>
              <div className="text-slate-400">
                <strong>신청 사유: </strong>
                {reviewTarget?.reason}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                심사 결정 *
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setReviewDecision('APPROVE')}
                  className={`p-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                    reviewDecision === 'APPROVE'
                      ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  승인 및 자동 프로비저닝
                </button>
                <button
                  type="button"
                  onClick={() => setReviewDecision('REJECT')}
                  className={`p-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-2 transition-all ${
                    reviewDecision === 'REJECT'
                      ? 'bg-rose-950/40 border-rose-500 text-rose-300 shadow-md'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <XCircle className="w-4 h-4 text-rose-400" />
                  요청 반려
                </button>
              </div>
            </div>

            {reviewDecision === 'APPROVE' && (
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  프로비저닝 대상 노드 (Target Node)
                </label>
                <select
                  value={targetNode}
                  onChange={(e) => setTargetNode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-slate-200"
                >
                  {availableNodes.length > 0 ? (
                    availableNodes.map((n) => {
                      const freeRamGb = Math.max(0, ((n.maxmem || 0) - (n.mem || 0)) / 1024 / 1024 / 1024).toFixed(1);
                      return (
                        <option key={n.node} value={n.node}>
                          {n.node} ({n.status === 'online' ? '정상' : n.status}, 여유 RAM: {freeRamGb} GB)
                        </option>
                      );
                    })
                  ) : (
                    <option value="pve">기본 노드 (pve)</option>
                  )}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                검토 코멘트
              </label>
              <Input
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                placeholder="검토 의견 또는 반려 사유를 입력하세요"
                className="bg-slate-950 border-slate-800 text-xs text-slate-100"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setReviewTarget(null)}
                className="border-slate-800 text-slate-300 hover:text-white"
              >
                닫기
              </Button>
              <Button
                type="submit"
                disabled={reviewing}
                className={
                  reviewDecision === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-medium'
                    : 'bg-rose-600 hover:bg-rose-500 text-white font-medium'
                }
              >
                {reviewing ? '처리 중...' : reviewDecision === 'APPROVE' ? '승인 및 즉시 생성' : '반려 처리'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
