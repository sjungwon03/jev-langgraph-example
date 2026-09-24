'use client';

import { useState } from 'react';
import { HardDrive, PlusCircle, Loader2, AlertCircle } from 'lucide-react';
import { resizeVmDisk, ProxmoxVm } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ResizeDiskModalProps {
  vm: ProxmoxVm | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ResizeDiskModal({ vm, isOpen, onClose, onSuccess }: ResizeDiskModalProps) {
  const [sizeIncrement, setSizeIncrement] = useState('10');
  const [disk, setDisk] = useState('scsi0');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!vm) return null;

  const currentDiskGB = ((vm.maxdisk || 0) / 1024 / 1024 / 1024).toFixed(0);
  const nextDiskGB = (Number(currentDiskGB) + Number(sizeIncrement || 0)).toString();

  const handleResize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sizeIncrement || Number(sizeIncrement) <= 0) return;

    try {
      setLoading(true);
      setError(null);
      await resizeVmDisk(vm.node, vm.vmid, `+${sizeIncrement}G`);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md border-slate-800 bg-slate-900/95">
        <DialogHeader className="pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/60 flex items-center justify-center">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base text-slate-100">
                디스크 용량 증설 (Hot-Resize)
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                {vm.name} (VMID: {vm.vmid}) on {vm.node}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg px-3.5 py-2 text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleResize} className="space-y-4 text-xs pt-1">
          {/* Target Disk */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">대상 가상 디스크 드라이브</label>
            <select
              value={disk}
              onChange={(e) => setDisk(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-amber-500"
            >
              <option value="scsi0">scsi0 (기본 OS 루트 디스크)</option>
              <option value="virtio0">virtio0 (VirtIO 고속 스토리지)</option>
              <option value="sata0">sata0 (보조 SATA 드라이브)</option>
            </select>
          </div>

          {/* Current vs Next */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 text-center font-mono">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">현재 용량</span>
              <span className="text-lg font-bold text-slate-200">{currentDiskGB} GB</span>
            </div>
            <div>
              <span className="text-[10px] text-emerald-400 uppercase tracking-wider block">증설 후 용량</span>
              <span className="text-lg font-bold text-emerald-400">{nextDiskGB} GB</span>
            </div>
          </div>

          {/* Size Increment Quick Options */}
          <div>
            <label className="block text-slate-300 font-medium mb-1.5">증설할 용량 선택 (+GB)</label>
            <div className="grid grid-cols-4 gap-2 mb-2">
              {['5', '10', '20', '50'].map((val) => (
                <Button
                  type="button"
                  key={val}
                  variant={sizeIncrement === val ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setSizeIncrement(val)}
                  className="font-mono text-xs"
                >
                  +{val} GB
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">직접 입력:</span>
              <Input
                type="number"
                min={1}
                max={500}
                value={sizeIncrement}
                onChange={(e) => setSizeIncrement(e.target.value)}
                className="w-24 text-center font-mono text-xs"
              />
              <span className="text-slate-400 font-mono">GB 추가</span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 bg-slate-800/30 p-2.5 rounded-lg border border-slate-800">
            ℹ️ Proxmox QEMU 디스크 확장은 무중단(Online)으로 진행되며, 확장이 완료된 후 게스트 OS에서 <code className="text-amber-300">growpart</code> 및 <code className="text-amber-300">resize2fs</code> 명령을 통해 파티션을 확장할 수 있습니다.
          </div>

          <DialogFooter className="pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={loading}
              className="text-xs"
            >
              취소
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !sizeIncrement}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PlusCircle className="w-4 h-4" />
              )}
              <span>{loading ? '용량 증설 중...' : `+${sizeIncrement}GB 증설 적용`}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
