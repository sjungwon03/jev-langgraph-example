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
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
    },
    {
      title: '활성 VM / LXC',
      value: `${runningVms} / ${totalVms}`,
      desc: `${totalVms - runningVms} Stopped`,
      icon: Layers,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
    },
    {
      title: '클러스터 평균 CPU',
      value: `${avgCpu}%`,
      desc: 'Total Core Utilization',
      icon: Activity,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
    },
    {
      title: '클러스터 총 메모리',
      value: `${avgMem}%`,
      desc: 'Allocated vs Capacity',
      icon: Terminal,
      color: 'text-teal-400',
      bgColor: 'bg-teal-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <Card key={i} className="glow-card border-slate-800 bg-slate-900/70">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 font-medium">{stat.title}</p>
                <h4 className="text-2xl font-bold text-slate-100 mt-1 font-mono tracking-tight">
                  {stat.value}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">{stat.desc}</p>
              </div>
              <div className={`w-11 h-11 rounded-xl ${stat.bgColor} flex items-center justify-center ${stat.color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
