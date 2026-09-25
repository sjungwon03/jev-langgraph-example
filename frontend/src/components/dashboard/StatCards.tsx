import { Server, Terminal, Activity, Layers } from 'lucide-react';
import { ClusterSummary } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

export function StatCards({ summary }: { summary: ClusterSummary | null }) {
  const nodeCount = summary?.nodes.length || 0;
  const runningVms = summary?.vms.filter((v) => v.status === 'running').length || 0;
  const totalVms = summary?.vms.length || 0;
  const avgCpu = summary ? Math.round(summary.totalCpuUsage * 100) : 0;
  const avgMem = summary ? Math.round(summary.totalMemUsage * 100) : 0;

  const stats = [
    {
      title: '온라인 노드',
      value: `${nodeCount} Nodes`,
      desc: 'Proxmox VE Cluster',
      icon: Server,
      color: 'text-slate-200',
      bgColor: 'bg-slate-800/60',
    },
    {
      title: '활성 인스턴스 (VM/LXC)',
      value: `${runningVms} / ${totalVms}`,
      desc: `${totalVms - runningVms} Stopped`,
      icon: Layers,
      color: 'text-slate-200',
      bgColor: 'bg-slate-800/60',
    },
    {
      title: '클러스터 평균 CPU',
      value: `${avgCpu}%`,
      desc: 'Total Core Utilization',
      icon: Activity,
      color: 'text-slate-200',
      bgColor: 'bg-slate-800/60',
    },
    {
      title: '클러스터 메모리 점유율',
      value: `${avgMem}%`,
      desc: 'Allocated vs Total RAM',
      icon: Terminal,
      color: 'text-slate-200',
      bgColor: 'bg-slate-800/60',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <Card key={i} className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-900/80 transition-colors shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{stat.title}</p>
                <h4 className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1 font-mono tracking-tight">
                  {stat.value}
                </h4>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{stat.desc}</p>
              </div>
              <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 flex items-center justify-center text-slate-700 dark:text-slate-200">
                <Icon className="w-4 h-4" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
