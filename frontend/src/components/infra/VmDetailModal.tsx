'use client';

import { useState } from 'react';
import {
  Server,
  Cpu,
  MemoryStick,
  HardDrive,
  Play,
  Square,
  RotateCw,
  PowerOff,
  Camera,
  Layers,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { ProxmoxVm, executeVmAction, confirmAction } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface VmDetailModalProps {
  vm: ProxmoxVm | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenSnapshot?: (vm: ProxmoxVm) => void;
  onOpenResize?: (vm: ProxmoxVm) => void;
  onActionComplete?: () => void;
}

export function VmDetailModal({
  vm,
  isOpen,
  onClose,
  onOpenSnapshot,
  onOpenResize,
  onActionComplete,
}: VmDetailModalProps) {
  const [loadingAction, setLoadingAction] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    token: string;
    action: string;
    description: string;
  } | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  if (!vm) return null;

  const isRunning = vm.status === 'running';
  const memUsedGB = ((vm.mem || 0) / 1024 / 1024 / 1024).toFixed(2);
  const memTotalGB = ((vm.maxmem || 0) / 1024 / 1024 / 1024).toFixed(1);
  const memUsagePercent = vm.maxmem ? Math.round(((vm.mem || 0) / vm.maxmem) * 100) : 0;

  const diskUsedGB = ((vm.disk || 0) / 1024 / 1024 / 1024).toFixed(1);
  const diskTotalGB = ((vm.maxdisk || 0) / 1024 / 1024 / 1024).toFixed(0);
  const diskUsagePercent = vm.maxdisk ? Math.round(((vm.disk || 0) / vm.maxdisk) * 100) : 0;

  const cpuPercent = Math.round((vm.cpu || 0) * 100);

  const formatUptime = (seconds: number) => {
    if (!seconds) return '중지됨 (0초)';
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d > 0 ? `${d}일 ` : ''}${h}시간 ${m}분`;
  };

  const handleAction = async (action: 'start' | 'stop' | 'reboot' | 'force_stop') => {
    try {
      setLoadingAction(true);
      setNotification(null);
      const res = await executeVmAction(vm.node, vm.vmid, action);
      if (res.status === 'CONFIRMATION_REQUIRED') {
        setPendingConfirm({
          token: res.confirmation.token,
          action,
          description: res.confirmation.description,
        });
      } else {
        setNotification(`작업 [${action.toUpperCase()}] 요청이 성공적으로 전달되었습니다.`);
        if (onActionComplete) onActionComplete();
      }
    } catch (err: any) {
      alert(`작업 실패: ${err.message}`);
    } finally {
      setLoadingAction(false);
    }
  };

  const handleConfirm = async (approved: boolean) => {
    if (!pendingConfirm) return;
    try {
      setLoadingAction(true);
      await confirmAction(pendingConfirm.token, approved);
      if (approved) {
        setNotification(`보안 승인 완료: ${pendingConfirm.action} 실행됨`);
        if (onActionComplete) onActionComplete();
      } else {
        setNotification(`작업 승인이 취소되었습니다.`);
      }
    } catch (err: any) {
      alert(`승인 처리 실패: ${err.message}`);
    } finally {
      setPendingConfirm(null);
      setLoadingAction(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl border-slate-800 bg-slate-900/95 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isRunning
                  ? 'bg-slate-800 text-slate-200 border border-slate-700'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-lg text-slate-100">{vm.name}</DialogTitle>
                <Badge variant="outline" className="font-mono text-slate-200 border-slate-700">
                  ID: {vm.vmid}
                </Badge>
                <Badge variant="secondary" className="font-mono uppercase text-slate-300">
                  {vm.type}
                </Badge>
              </div>
              <DialogDescription className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>호스트 노드: <strong className="text-slate-300 font-mono">{vm.node}</strong></span>
                <span>•</span>
                <span className="flex items-center gap-1 font-mono">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isRunning ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                  />
                  {vm.status.toUpperCase()}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Notifications & Confirmation Gate */}
        {notification && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3.5 py-2 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
        )}

        {pendingConfirm && (
          <div className="p-3.5 bg-amber-500/10 border border-amber-500/40 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>Human-in-the-Loop 보안 승인 대기</span>
            </div>
            <p className="text-xs text-slate-300">{pendingConfirm.description}</p>
            <div className="flex items-center gap-2 pt-1">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleConfirm(true)}
                className="text-xs font-semibold"
              >
                파괴적 실행 최종 승인
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleConfirm(false)}
                className="text-xs"
              >
                취소
              </Button>
            </div>
          </div>
        )}

        {/* Real-time Hardware Meters */}
        <div className="grid grid-cols-3 gap-3">
          {/* CPU Meter */}
          <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" /> vCPU
              </span>
              <span className="font-mono text-cyan-400 font-bold">{cpuPercent}%</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700/50">
              <div
                className="bg-gradient-to-r from-cyan-500 to-teal-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(cpuPercent, 100)}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              할당 코어: <strong className="text-slate-200">{vm.cpus || 2} vCPU</strong>
            </div>
          </div>

          {/* RAM Meter */}
          <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                <MemoryStick className="w-3.5 h-3.5 text-slate-400" /> RAM
              </span>
              <span className="font-mono text-slate-200 font-bold">{memUsagePercent}%</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700/50">
              <div
                className="bg-slate-300 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(memUsagePercent, 100)}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              사용량: <strong className="text-slate-200">{memUsedGB}</strong> / {memTotalGB} GB
            </div>
          </div>

          {/* Disk Meter */}
          <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                <HardDrive className="w-3.5 h-3.5 text-slate-400" /> 가상 디스크
              </span>
              <span className="font-mono text-slate-200 font-bold">{diskUsagePercent}%</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-700/50">
              <div
                className="bg-slate-300 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(diskUsagePercent, 100)}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              용량: <strong className="text-slate-200">{diskUsedGB}</strong> / {diskTotalGB} GB
            </div>
          </div>
        </div>

        {/* Virtual Hardware & Configuration Table */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" /> 가상 하드웨어 및 구성 정보
          </h4>
          <div className="grid grid-cols-2 gap-2 text-xs bg-slate-800/40 p-3 rounded-xl border border-slate-700/50">
            <div className="flex justify-between py-1 border-b border-slate-700/40">
              <span className="text-slate-400">가상화 엔진:</span>
              <span className="font-mono text-slate-200">
                {vm.type === 'qemu' ? 'KVM / QEMU 8.2' : 'LXC Container Engine'}
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-700/40">
              <span className="text-slate-400">가동 시간 (Uptime):</span>
              <span className="font-mono text-emerald-400">{formatUptime(vm.uptime)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-700/40">
              <span className="text-slate-400">스토리지 컨트롤러:</span>
              <span className="font-mono text-slate-200">virtio-scsi-single</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-700/40">
              <span className="text-slate-400">루트 드라이브:</span>
              <span className="font-mono text-amber-300">scsi0 (local-lvm, {diskTotalGB}GB)</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">가상 브릿지 인터페이스:</span>
              <span className="font-mono text-cyan-300">vmbr0 (VirtIO)</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">가상 MAC 주소:</span>
              <span className="font-mono text-slate-300">
                BC:24:11:{Math.floor(vm.vmid / 10)}:{(vm.vmid % 99).toString(16).padStart(2, '0')}:A1
              </span>
            </div>
          </div>
        </div>

        {/* Quick Operations Toolbar */}
        <DialogFooter className="flex flex-row items-center justify-between pt-3 border-t border-slate-800">
          <div className="flex items-center gap-2">
            {onOpenSnapshot && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenSnapshot(vm);
                }}
                className="text-cyan-300 border-cyan-500/30 text-xs"
              >
                <Camera className="w-3.5 h-3.5 mr-1" />
                <span>스냅샷 관리</span>
              </Button>
            )}
            {onOpenResize && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenResize(vm);
                }}
                className="text-amber-300 border-amber-500/30 text-xs"
              >
                <HardDrive className="w-3.5 h-3.5 mr-1" />
                <span>디스크 증설</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isRunning ? (
              <Button
                size="sm"
                disabled={loadingAction}
                onClick={() => handleAction('start')}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current mr-1" />
                <span>기동</span>
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingAction}
                  onClick={() => handleAction('stop')}
                  className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 text-xs"
                >
                  <Square className="w-3.5 h-3.5 fill-current mr-1" />
                  <span>종료</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingAction}
                  onClick={() => handleAction('reboot')}
                  className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border-cyan-500/40 text-xs"
                >
                  <RotateCw className="w-3.5 h-3.5 mr-1" />
                  <span>재부팅</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingAction}
                  onClick={() => handleAction('force_stop')}
                  className="bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40 text-xs"
                >
                  <PowerOff className="w-3.5 h-3.5 mr-1" />
                  <span>강제종료</span>
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              닫기
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
