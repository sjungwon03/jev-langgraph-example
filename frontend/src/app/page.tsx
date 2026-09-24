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
      // Fallback mock if backend server is starting up
      setSummary({
        version: 'Proxmox VE 8.2 (Simulation)',
        nodes: [
          {
            node: 'pve-node-01',
            status: 'online',
            cpu: 0.28,
            maxcpu: 16,
            mem: 19543162880,
            maxmem: 34359738368,
            disk: 128849018880,
            maxdisk: 536870912000,
            uptime: 846200,
          },
          {
            node: 'pve-node-02',
            status: 'online',
            cpu: 0.62,
            maxcpu: 16,
            mem: 30601641984,
            maxmem: 34359738368,
            disk: 225485783040,
            maxdisk: 536870912000,
            uptime: 1205300,
          },
        ],
        vms: [
          {
            vmid: 100,
            name: 'web-gateway-prod',
            node: 'pve-node-01',
            status: 'running',
            type: 'qemu',
            cpu: 0.15,
            cpus: 2,
            mem: 2147483648,
            maxmem: 4294967296,
            disk: 32212254720,
            maxdisk: 64424509440,
            uptime: 360000,
          },
          {
            vmid: 101,
            name: 'app-api-worker',
            node: 'pve-node-01',
            status: 'running',
            type: 'qemu',
            cpu: 0.42,
            cpus: 4,
            mem: 5368709120,
            maxmem: 8589934592,
            disk: 42949672960,
            maxdisk: 85899345920,
            uptime: 240000,
          },
          {
            vmid: 102,
            name: 'db-postgres-primary',
            node: 'pve-node-02',
            status: 'running',
            type: 'qemu',
            cpu: 0.58,
            cpus: 8,
            mem: 15032385536,
            maxmem: 17179869184,
            disk: 161061273600,
            maxdisk: 214748364800,
            uptime: 890000,
          },
          {
            vmid: 103,
            name: 'redis-cluster-cache',
            node: 'pve-node-02',
            status: 'running',
            type: 'lxc',
            cpu: 0.12,
            cpus: 2,
            mem: 3221225472,
            maxmem: 4294967296,
            disk: 10737418240,
            maxdisk: 21474836480,
            uptime: 650000,
          },
          {
            vmid: 104,
            name: 'staging-test-runner',
            node: 'pve-node-01',
            status: 'stopped',
            type: 'qemu',
            cpu: 0.0,
            cpus: 2,
            mem: 0,
            maxmem: 4294967296,
            disk: 21474836480,
            maxdisk: 42949672960,
            uptime: 0,
          },
          {
            vmid: 105,
            name: 'backup-syncer',
            node: 'pve-node-02',
            status: 'stopped',
            type: 'lxc',
            cpu: 0.0,
            cpus: 1,
            mem: 0,
            maxmem: 2147483648,
            disk: 8589934592,
            maxdisk: 17179869184,
            uptime: 0,
          },
        ],
        storage: [],
        totalCpuUsage: 0.45,
        totalMemUsage: 0.72,
        totalDiskUsage: 0.35,
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
