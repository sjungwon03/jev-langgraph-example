'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { StatCards } from '@/components/dashboard/StatCards';
import { NodeCard } from '@/components/dashboard/NodeCard';
import { VmTable } from '@/components/dashboard/VmTable';
import { CreateVmModal } from '@/components/dashboard/CreateVmModal';
import { ClusterSummary, fetchClusterSummary } from '@/lib/api';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const [summary, setSummary] = useState<ClusterSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchClusterSummary();
      setSummary(data);
    } catch (err: any) {
      setError(err.message);
      setSummary({
        version: 'Proxmox VE (연결 실패 또는 오프라인)',
        nodes: [],
        vms: [],
        storage: [],
        totalCpuUsage: 0,
        totalMemUsage: 0,
        totalDiskUsage: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000); // 15s polling
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <Header onRefresh={loadData} isRefreshing={loading} />

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stat Overview */}
        <StatCards summary={summary} />

        {/* Proxmox Nodes Grid */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-100">클러스터 컴퓨트 노드</h2>
            <span className="text-xs text-slate-400 font-mono">
              {summary?.nodes.length || 0} Nodes
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summary?.nodes.map((node) => (
              <NodeCard key={node.node} node={node} />
            ))}
          </div>
        </section>

        {/* VMs & Containers Table */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100">가상 인스턴스 현황</h2>
              <p className="text-xs text-slate-400">배포된 가상머신(QEMU) 및 컨테이너(LXC) 자원 및 라이프사이클 관리</p>
            </div>
            <Button
              onClick={() => setIsCreateModalOpen(true)}
              size="sm"
              className="flex items-center gap-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700"
            >
              <Plus className="w-4 h-4" />
              <span>새 인스턴스 배포</span>
            </Button>
          </div>
          <VmTable vms={summary?.vms || []} onActionComplete={loadData} />
        </section>
      </main>

      {/* Instance Creation Modal */}
      <CreateVmModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={loadData}
        nodes={summary?.nodes || []}
      />
    </div>
  );
}
