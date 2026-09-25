import { Cpu, HardDrive, MemoryStick, Server } from 'lucide-react';
import { ProxmoxNode } from '@/lib/api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function NodeCard({ node }: { node: ProxmoxNode }) {
  const cpuPercent = Math.round((node.cpu || 0) * 100);
  const memUsedGB = ((node.mem || 0) / 1024 / 1024 / 1024).toFixed(1);
  const memMaxGB = ((node.maxmem || 0) / 1024 / 1024 / 1024).toFixed(1);
  const memPercent = Math.round((node.mem / (node.maxmem || 1)) * 100);
  const diskUsedGB = Math.round((node.disk || 0) / 1024 / 1024 / 1024);
  const diskMaxGB = Math.round((node.maxdisk || 0) / 1024 / 1024 / 1024);
  const diskPercent = Math.round((node.disk / (node.maxdisk || 1)) * 100);

  return (
    <Card className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 shadow-sm">
      <CardHeader className="p-5 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700/60">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{node.node}</h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Uptime: {Math.floor(node.uptime / 86400)}d {Math.floor((node.uptime % 86400) / 3600)}h
              </span>
            </div>
          </div>
          <Badge
            variant="outline"
            className="font-mono text-xs font-medium bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700/80"
          >
            {node.status.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 space-y-3">
        {/* CPU */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> CPU
            </span>
            <span className="font-mono text-slate-800 dark:text-slate-200">{cpuPercent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                cpuPercent > 80 ? 'bg-rose-500' : cpuPercent > 50 ? 'bg-amber-400' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, cpuPercent))}%` }}
            />
          </div>
        </div>

        {/* Memory */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span className="flex items-center gap-1.5">
              <MemoryStick className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> RAM ({memUsedGB} / {memMaxGB} GB)
            </span>
            <span className="font-mono text-slate-800 dark:text-slate-200">{memPercent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                memPercent > 85 ? 'bg-rose-500' : memPercent > 60 ? 'bg-amber-400' : 'bg-teal-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, memPercent))}%` }}
            />
          </div>
        </div>

        {/* Storage */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> Disk ({diskUsedGB} / {diskMaxGB} GB)
            </span>
            <span className="font-mono text-slate-800 dark:text-slate-200">{diskPercent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, diskPercent))}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
