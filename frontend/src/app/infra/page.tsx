'use client';

import { useEffect, useState } from 'react';
import {
  Server,
  Database,
  Network,
  Terminal,
  Layers,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { TopologyView } from '@/components/infra/TopologyView';
import { StorageOverview } from '@/components/infra/StorageOverview';
import { NetworkOverview } from '@/components/infra/NetworkOverview';
import { TaskQueueTable } from '@/components/infra/TaskQueueTable';
import { VmDetailModal } from '@/components/infra/VmDetailModal';
import { SnapshotModal } from '@/components/dashboard/SnapshotModal';
import { ResizeDiskModal } from '@/components/dashboard/ResizeDiskModal';
import {
  ClusterTopology,
  ProxmoxStorage,
  ProxmoxNetwork,
  ProxmoxTask,
  ProxmoxVm,
  fetchTopology,
  fetchStorage,
  fetchNetworks,
  fetchTasks,
} from '@/lib/api';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export default function InfraExplorerPage() {
  const [activeTab, setActiveTab] = useState<string>('topology');
  const [loading, setLoading] = useState(true);
  const [topology, setTopology] = useState<ClusterTopology | null>(null);
  const [storage, setStorage] = useState<ProxmoxStorage[]>([]);
  const [networks, setNetworks] = useState<ProxmoxNetwork[]>([]);
  const [tasks, setTasks] = useState<ProxmoxTask[]>([]);

  // Modals
  const [inspectVm, setInspectVm] = useState<ProxmoxVm | null>(null);
  const [snapshotVm, setSnapshotVm] = useState<ProxmoxVm | null>(null);
  const [resizeVm, setResizeVm] = useState<ProxmoxVm | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [topoData, storageData, netData, taskData] = await Promise.all([
        fetchTopology().catch(() => null),
        fetchStorage().catch(() => []),
        fetchNetworks().catch(() => []),
        fetchTasks().catch(() => []),
      ]);

      setTopology(topoData || { datacenter: 'Proxmox VE Cluster', nodes: [] });
      setStorage(storageData || []);
      setNetworks(netData || []);
      setTasks(taskData || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 dark:bg-[#070b13] text-slate-900 dark:text-slate-100">
      <Header onRefresh={loadData} isRefreshing={loading} />

      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* Navigation Tabs Header */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Server className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span>클러스터 인프라 아키텍처 & 자원 상세</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                데이터센터 토폴로지, 공유 스토리지 풀, 가상 브릿지 네트워크 및 백그라운드 태스크 제어
              </p>
            </div>

            {/* Tab Selector */}
            <TabsList>
              <TabsTrigger value="topology" className="flex items-center gap-2 text-xs">
                <Layers className="w-3.5 h-3.5" />
                <span>토폴로지 맵</span>
              </TabsTrigger>
              <TabsTrigger value="storage" className="flex items-center gap-2 text-xs">
                <Database className="w-3.5 h-3.5" />
                <span>스토리지 풀</span>
              </TabsTrigger>
              <TabsTrigger value="network" className="flex items-center gap-2 text-xs">
                <Network className="w-3.5 h-3.5" />
                <span>가상 네트워크</span>
              </TabsTrigger>
              <TabsTrigger value="tasks" className="flex items-center gap-2 text-xs">
                <Terminal className="w-3.5 h-3.5" />
                <span>작업 큐 & UPID</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab Content Panes */}
          <TabsContent value="topology" className="m-0">
            <TopologyView
              topology={topology}
              onSelectVm={(vm) => setInspectVm(vm)}
            />
          </TabsContent>

          <TabsContent value="storage" className="m-0">
            <StorageOverview storage={storage} />
          </TabsContent>

          <TabsContent value="network" className="m-0">
            <NetworkOverview networks={networks} />
          </TabsContent>

          <TabsContent value="tasks" className="m-0">
            <TaskQueueTable tasks={tasks} />
          </TabsContent>
        </Tabs>
      </main>

      {/* VM Detail Inspector Modal */}
      <VmDetailModal
        vm={inspectVm}
        isOpen={Boolean(inspectVm)}
        onClose={() => setInspectVm(null)}
        onOpenSnapshot={(vm) => setSnapshotVm(vm)}
        onOpenResize={(vm) => setResizeVm(vm)}
        onActionComplete={loadData}
      />

      {/* Snapshot Modal */}
      <SnapshotModal
        vm={snapshotVm}
        isOpen={Boolean(snapshotVm)}
        onClose={() => setSnapshotVm(null)}
      />

      {/* Resize Disk Modal */}
      <ResizeDiskModal
        vm={resizeVm}
        isOpen={Boolean(resizeVm)}
        onClose={() => setResizeVm(null)}
        onSuccess={loadData}
      />
    </div>
  );
}
