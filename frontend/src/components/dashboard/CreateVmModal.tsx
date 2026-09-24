'use client';

import { useState } from 'react';
import { Layers, CheckCircle2, Cpu, MemoryStick, HardDrive } from 'lucide-react';
import { createInstance } from '@/lib/api';
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

interface CreateVmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  nodes: { node: string }[];
}

export function CreateVmModal({ isOpen, onClose, onSuccess, nodes }: CreateVmModalProps) {
  const [node, setNode] = useState(nodes[0]?.node || 'pve');
  const [vmid, setVmid] = useState(Math.floor(106 + Math.random() * 50));
  const [name, setName] = useState('');
  const [type, setType] = useState<'qemu' | 'lxc'>('qemu');
  const [cpus, setCpus] = useState(2);
  const [memory, setMemory] = useState(4096);
  const [diskSize, setDiskSize] = useState(40);
  const [osTemplate, setOsTemplate] = useState('ubuntu-24.04-standard');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setLoading(true);
      await createInstance({
        node,
        vmid: Number(vmid),
        name: name.trim(),
        type,
        cpus: Number(cpus),
        memory: Number(memory),
        diskSize: Number(diskSize),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      alert(`인스턴스 생성 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-900/95">
        <DialogHeader className="pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/60 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle className="text-base text-slate-100">새 가상 인스턴스 생성</DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Proxmox VE QEMU VM 또는 LXC 컨테이너 배포
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs pt-1">
          {/* Node & Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">대상 노드</label>
              <select
                value={node}
                onChange={(e) => setNode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {nodes.map((n) => (
                  <option key={n.node} value={n.node}>
                    {n.node}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1">인스턴스 유형</label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={type === 'qemu' ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setType('qemu')}
                  className="flex-1"
                >
                  QEMU (VM)
                </Button>
                <Button
                  type="button"
                  variant={type === 'lxc' ? 'default' : 'secondary'}
                  size="sm"
                  onClick={() => setType('lxc')}
                  className="flex-1"
                >
                  LXC (컨테이너)
                </Button>
              </div>
            </div>
          </div>

          {/* VMID & Name */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1">VMID</label>
              <Input
                type="number"
                required
                value={vmid}
                onChange={(e) => setVmid(Number(e.target.value))}
                className="font-mono"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-slate-300 font-medium mb-1">인스턴스 이름</label>
              <Input
                type="text"
                required
                placeholder="예: web-frontend-app"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          {/* CPU, Memory, Disk */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-medium mb-1 flex items-center gap-1">
                <Cpu className="w-3 h-3 text-slate-400" /> vCPU 코어
              </label>
              <select
                value={cpus}
                onChange={(e) => setCpus(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              >
                <option value={1}>1 Core</option>
                <option value={2}>2 Cores</option>
                <option value={4}>4 Cores</option>
                <option value={8}>8 Cores</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1 flex items-center gap-1">
                <MemoryStick className="w-3 h-3 text-slate-400" /> RAM (MB)
              </label>
              <select
                value={memory}
                onChange={(e) => setMemory(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
              >
                <option value={1024}>1 GB (1024)</option>
                <option value={2048}>2 GB (2048)</option>
                <option value={4096}>4 GB (4096)</option>
                <option value={8192}>8 GB (8192)</option>
                <option value={16384}>16 GB (16384)</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-300 font-medium mb-1 flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-slate-400" /> 디스크 (GB)
              </label>
              <Input
                type="number"
                min={10}
                max={500}
                value={diskSize}
                onChange={(e) => setDiskSize(Number(e.target.value))}
                className="font-mono"
              />
            </div>
          </div>

          {/* OS Template */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">운영체제 / 템플릿</label>
            <select
              value={osTemplate}
              onChange={(e) => setOsTemplate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
            >
              <option value="ubuntu-24.04-standard">Ubuntu 24.04 LTS (Noble Numbat)</option>
              <option value="debian-12-standard">Debian 12 (Bookworm)</option>
              <option value="alpine-3.20-default">Alpine Linux 3.20 (Minimal)</option>
              <option value="rockylinux-9-default">Rocky Linux 9</option>
            </select>
          </div>

          {/* Dialog Footer */}
          <DialogFooter className="pt-3 border-t border-slate-800">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={loading}
            >
              취소
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={loading || !name.trim()}
              className="flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? '생성 중...' : '인스턴스 생성하기'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
