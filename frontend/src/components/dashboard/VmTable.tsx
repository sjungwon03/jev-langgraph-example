'use client';

import { useState } from 'react';
import { Play, Square, RotateCw, Trash2, PowerOff, ShieldAlert, CheckCircle2, Camera, HardDrive, Info } from 'lucide-react';
import { ProxmoxVm, executeVmAction, confirmAction } from '@/lib/api';
import { SnapshotModal } from './SnapshotModal';
import { ResizeDiskModal } from './ResizeDiskModal';
import { VmDetailModal } from '../infra/VmDetailModal';
import { Card, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface VmTableProps {
  vms: ProxmoxVm[];
  onActionComplete: () => void;
}

export function VmTable({ vms, onActionComplete }: VmTableProps) {
  const [loadingVm, setLoadingVm] = useState<number | null>(null);
  const [selectedSnapshotVm, setSelectedSnapshotVm] = useState<ProxmoxVm | null>(null);
  const [selectedResizeVm, setSelectedResizeVm] = useState<ProxmoxVm | null>(null);
  const [selectedDetailVm, setSelectedDetailVm] = useState<ProxmoxVm | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    token: string;
    vmid: number;
    action: string;
    description: string;
  } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleAction = async (
    node: string,
    vmid: number,
    action: 'start' | 'stop' | 'reboot' | 'shutdown' | 'force_stop' | 'delete',
  ) => {
    try {
      setLoadingVm(vmid);
      setActionMessage(null);
      const res = await executeVmAction(node, vmid, action);

      if (res.status === 'CONFIRMATION_REQUIRED') {
        setPendingConfirm({
          token: res.confirmation.token,
          vmid,
          action,
          description: res.confirmation.description,
        });
      } else {
        setActionMessage(`VM ${vmid}: ${action.toUpperCase()} 요청 완료`);
        onActionComplete();
      }
    } catch (err: any) {
      alert(`작업 실패: ${err.message}`);
    } finally {
      setLoadingVm(null);
    }
  };

  const handleConfirmApproval = async (approved: boolean) => {
    if (!pendingConfirm) return;
    try {
      setLoadingVm(pendingConfirm.vmid);
      const res = await confirmAction(pendingConfirm.token, approved);
      if (approved) {
        setActionMessage(`보안 승인 완료: VM ${pendingConfirm.vmid} ${pendingConfirm.action} 실행됨`);
        onActionComplete();
      } else {
        setActionMessage(`작업 승인 취소됨`);
      }
    } catch (err: any) {
      alert(`승인 처리 실패: ${err.message}`);
    } finally {
      setPendingConfirm(null);
      setLoadingVm(null);
    }
  };

  return (
    <Card className="glow-card border-slate-800 bg-slate-900/70 overflow-hidden">
      {/* Action Notification Banner */}
      {actionMessage && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/30 px-5 py-2 text-xs text-emerald-300 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> {actionMessage}
          </span>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Safety Gate Confirmation Banner */}
      {pendingConfirm && (
        <div className="p-4 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-semibold text-amber-300">
                보안 승인 대기 (Human-in-the-Loop)
              </h5>
              <p className="text-xs text-slate-300">{pendingConfirm.description}</p>
              <span className="text-[10px] font-mono text-slate-400">
                Token: {pendingConfirm.token}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleConfirmApproval(true)}
              className="text-xs font-semibold"
            >
              파괴적 작업 최종 승인
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleConfirmApproval(false)}
              className="text-xs"
            >
              취소
            </Button>
          </div>
        </div>
      )}

      <CardHeader className="px-5 py-4 border-b border-slate-800/80 flex flex-row items-center justify-between space-y-0">
        <div>
          <h3 className="font-semibold text-slate-100 text-sm">가상머신 (QEMU) & 컨테이너 (LXC)</h3>
          <p className="text-xs text-slate-400">클러스터 내 인프라 인스턴스 전원 및 수명주기 제어</p>
        </div>
        <span className="text-xs text-slate-400 font-mono">총 {vms.length}대</span>
      </CardHeader>

      <div className="overflow-x-auto">
        <Table className="text-xs">
          <TableHeader className="bg-slate-900/50 uppercase font-mono text-[11px]">
            <TableRow className="border-slate-800">
              <TableHead className="py-3 px-4 text-slate-400">VMID</TableHead>
              <TableHead className="py-3 px-4 text-slate-400">인스턴스 이름</TableHead>
              <TableHead className="py-3 px-4 text-slate-400">유형</TableHead>
              <TableHead className="py-3 px-4 text-slate-400">노드</TableHead>
              <TableHead className="py-3 px-4 text-slate-400">상태</TableHead>
              <TableHead className="py-3 px-4 text-slate-400">vCPU</TableHead>
              <TableHead className="py-3 px-4 text-slate-400">메모리 (할당량)</TableHead>
              <TableHead className="py-3 px-4 text-right text-slate-400">제어 작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-800/50">
            {vms.map((vm) => {
              const isRunning = vm.status === 'running';
              const isLoading = loadingVm === vm.vmid;
              const memAllocatedGB = ((vm.maxmem || 0) / 1024 / 1024 / 1024).toFixed(1);

              return (
                <TableRow key={vm.vmid} className="hover:bg-slate-800/40 border-slate-800/50">
                  <TableCell className="py-3.5 px-4 font-mono font-medium text-emerald-400">
                    {vm.vmid}
                  </TableCell>
                  <TableCell
                    onClick={() => setSelectedDetailVm(vm)}
                    className="py-3.5 px-4 font-medium text-slate-100 hover:text-emerald-400 cursor-pointer transition-colors"
                    title="클릭하여 상세 하드웨어 사양 및 모니터링 조회"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{vm.name}</span>
                      <Info className="w-3 h-3 text-slate-500 hover:text-emerald-400" />
                    </div>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 font-mono text-slate-400">
                    <Badge variant="outline" className="bg-slate-800/80 border-slate-700 text-[10px] py-0 px-1.5 font-mono">
                      {vm.type.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 text-slate-300 font-mono">{vm.node}</TableCell>
                  <TableCell className="py-3.5 px-4">
                    <Badge
                      variant={isRunning ? 'success' : 'outline'}
                      className={`inline-flex items-center gap-1.5 text-[10px] font-mono py-0.5 px-2 ${
                        !isRunning ? 'bg-slate-800/60 text-slate-400 border-slate-700' : ''
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                        }`}
                      />
                      {vm.status.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell className="py-3.5 px-4 font-mono">{vm.cpus || 2} Cores</TableCell>
                  <TableCell className="py-3.5 px-4 font-mono text-slate-300">{memAllocatedGB} GB</TableCell>
                  <TableCell className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {!isRunning ? (
                        <Button
                          variant="outline"
                          size="icon"
                          disabled={isLoading}
                          onClick={() => handleAction(vm.node, vm.vmid, 'start')}
                          className="h-7 w-7 rounded-md bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border-emerald-500/30"
                          title="기동 (Start)"
                        >
                          <Play className="w-3 h-3 fill-current" />
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={isLoading}
                            onClick={() => handleAction(vm.node, vm.vmid, 'stop')}
                            className="h-7 w-7 rounded-md bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border-amber-500/30"
                            title="정상 종료 (Shutdown)"
                          >
                            <Square className="w-3 h-3 fill-current" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={isLoading}
                            onClick={() => handleAction(vm.node, vm.vmid, 'reboot')}
                            className="h-7 w-7 rounded-md bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border-cyan-500/30"
                            title="재부팅 (Reboot)"
                          >
                            <RotateCw className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            disabled={isLoading}
                            onClick={() => handleAction(vm.node, vm.vmid, 'force_stop')}
                            className="h-7 w-7 rounded-md bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border-rose-500/30"
                            title="강제 종료 (Force Stop)"
                          >
                            <PowerOff className="w-3 h-3" />
                          </Button>
                        </>
                      )}
                      {/* Snapshot & Disk Resize Controls */}
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isLoading}
                        onClick={() => setSelectedSnapshotVm(vm)}
                        className="h-7 w-7 rounded-md bg-slate-800 text-cyan-400 hover:bg-cyan-500/20 border-slate-700 hover:border-cyan-500/40"
                        title="스냅샷 관리"
                      >
                        <Camera className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isLoading}
                        onClick={() => setSelectedResizeVm(vm)}
                        className="h-7 w-7 rounded-md bg-slate-800 text-amber-400 hover:bg-amber-500/20 border-slate-700 hover:border-amber-500/40"
                        title="디스크 용량 증설"
                      >
                        <HardDrive className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        disabled={isLoading}
                        onClick={() => handleAction(vm.node, vm.vmid, 'delete')}
                        className="h-7 w-7 rounded-md bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-slate-700 border-slate-700"
                        title="삭제 (Delete)"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Snapshot Modal */}
      <SnapshotModal
        vm={selectedSnapshotVm}
        isOpen={Boolean(selectedSnapshotVm)}
        onClose={() => setSelectedSnapshotVm(null)}
      />

      {/* Disk Resize Modal */}
      <ResizeDiskModal
        vm={selectedResizeVm}
        isOpen={Boolean(selectedResizeVm)}
        onClose={() => setSelectedResizeVm(null)}
        onSuccess={() => {
          setActionMessage(`VM ${selectedResizeVm?.vmid}: 디스크 용량 증설 완료`);
          onActionComplete();
        }}
      />

      {/* VM Detail Inspector Modal */}
      <VmDetailModal
        vm={selectedDetailVm}
        isOpen={Boolean(selectedDetailVm)}
        onClose={() => setSelectedDetailVm(null)}
        onOpenSnapshot={(vm) => setSelectedSnapshotVm(vm)}
        onOpenResize={(vm) => setSelectedResizeVm(vm)}
        onActionComplete={onActionComplete}
      />
    </Card>
  );
}
