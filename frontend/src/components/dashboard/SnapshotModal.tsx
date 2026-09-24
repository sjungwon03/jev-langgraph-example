'use client';

import { useState, useEffect } from 'react';
import { Camera, Plus, Clock, CheckCircle2, Loader2 } from 'lucide-react';
import { fetchSnapshots, createSnapshot, ProxmoxVm } from '@/lib/api';
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
import { Badge } from '@/components/ui/badge';

interface SnapshotModalProps {
  vm: ProxmoxVm | null;
  isOpen: boolean;
  onClose: () => void;
}

export function SnapshotModal({ vm, isOpen, onClose }: SnapshotModalProps) {
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [snapname, setSnapname] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const loadSnapshots = async () => {
    if (!vm) return;
    try {
      setLoading(true);
      const data = await fetchSnapshots(vm.node, vm.vmid);
      setSnapshots(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('Failed to load snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && vm) {
      setMessage(null);
      setSnapname(`snap-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 1000)}`);
      setDescription('');
      loadSnapshots();
    }
  }, [isOpen, vm]);

  if (!vm) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapname.trim()) return;

    try {
      setCreating(true);
      setMessage(null);
      await createSnapshot({
        node: vm.node,
        vmid: vm.vmid,
        snapname: snapname.trim(),
        description: description.trim() || undefined,
      });
      setMessage(`스냅샷 "${snapname}" 생성이 완료되었습니다.`);
      setDescription('');
      setSnapname(`snap-${Date.now()}`);
      await loadSnapshots();
    } catch (err: any) {
      alert(`스냅샷 생성 실패: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-900/95">
        <DialogHeader className="pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base text-slate-100">
                스냅샷 관리 — {vm.name} ({vm.vmid})
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                노드: {vm.node} | 유형: {vm.type.toUpperCase()}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {message && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3.5 py-2 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* Create Snapshot Form */}
        <form onSubmit={handleCreate} className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 space-y-3 text-xs">
          <div className="font-medium text-slate-200 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            새 스냅샷 생성
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 mb-1">스냅샷 식별자</label>
              <Input
                type="text"
                required
                value={snapname}
                onChange={(e) => setSnapname(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">설명 (선택)</label>
              <Input
                type="text"
                placeholder="예: 패치 적용 전 백업"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={creating || !snapname.trim()}
              className="flex items-center gap-1 text-xs"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
              <span>{creating ? '생성 중...' : '스냅샷 생성'}</span>
            </Button>
          </div>
        </form>

        {/* Existing Snapshots List */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-300">저장된 스냅샷 목록</h4>
          {loading ? (
            <div className="flex items-center justify-center py-6 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> 스냅샷 목록 로드 중...
            </div>
          ) : snapshots.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-xs bg-slate-800/30 rounded-xl border border-slate-800">
              현재 저장된 스냅샷이 없습니다.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {snapshots.map((snap, idx) => (
                <div
                  key={snap.name || idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-slate-600 transition-colors text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-mono font-medium text-slate-200 flex items-center gap-2">
                      <Camera className="w-3 h-3 text-cyan-400" />
                      <span>{snap.name}</span>
                      {snap.vmstate === 1 && (
                        <Badge variant="success" className="text-[10px] py-0 px-1">
                          RAM 포함
                        </Badge>
                      )}
                    </div>
                    {snap.description && (
                      <p className="text-[11px] text-slate-400">{snap.description}</p>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {snap.snaptime ? new Date(snap.snaptime * 1000).toLocaleString('ko-KR') : '알 수 없음'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t border-slate-800">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            className="text-xs"
          >
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
