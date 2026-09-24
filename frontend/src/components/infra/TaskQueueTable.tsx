'use client';

import { Terminal, CheckCircle2, Clock, User, ShieldAlert, Layers } from 'lucide-react';
import { ProxmoxTask } from '@/lib/api';

interface TaskQueueTableProps {
  tasks: ProxmoxTask[];
}

export function TaskQueueTable({ tasks }: TaskQueueTableProps) {
  const getActionBadgeColor = (type: string) => {
    switch (type) {
      case 'qmstart':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
      case 'qmstop':
      case 'qmshutdown':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'qmsnapshot':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'qmresize':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'vmdel':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-400" />
            <span>클러스터 비동기 작업 큐 & UPID 이력</span>
          </h3>
          <p className="text-xs text-slate-400">
            Proxmox VE 백엔드 작업 워커가 처리한 비동기 태스크 실행 영수증
          </p>
        </div>
        <span className="text-xs font-mono text-slate-400">최근 {tasks.length}개 작업</span>
      </div>

      <div className="rounded-xl overflow-hidden border border-slate-800/80 bg-slate-900/50">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-900/60 text-slate-400 border-b border-slate-800 uppercase font-mono text-[11px]">
            <tr>
              <th className="py-3 px-4">작업 유형 (Task)</th>
              <th className="py-3 px-4">대상 ID</th>
              <th className="py-3 px-4">노드</th>
              <th className="py-3 px-4">실행 주체 (User)</th>
              <th className="py-3 px-4">상태</th>
              <th className="py-3 px-4">시작 시각</th>
              <th className="py-3 px-4">고유 UPID 영수증</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-slate-300">
            {tasks.map((task) => (
              <tr key={task.upid} className="hover:bg-slate-800/30 transition-colors">
                <td className="py-3.5 px-4">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-mono border ${getActionBadgeColor(
                      task.type,
                    )}`}
                  >
                    {task.type.toUpperCase()}
                  </span>
                </td>
                <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                  {task.id || '-'}
                </td>
                <td className="py-3.5 px-4 font-mono text-slate-300">{task.node}</td>
                <td className="py-3.5 px-4 font-mono text-slate-300 flex items-center gap-1.5">
                  <User className="w-3 h-3 text-slate-500" />
                  <span>{task.user}</span>
                </td>
                <td className="py-3.5 px-4">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/30 text-emerald-300 border border-emerald-800/40">
                    <CheckCircle2 className="w-3 h-3" />
                    {task.status}
                  </span>
                </td>
                <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400">
                  {task.starttime ? new Date(task.starttime * 1000).toLocaleTimeString() : '-'}
                </td>
                <td className="py-3.5 px-4 font-mono text-[10px] text-slate-500 truncate max-w-xs" title={task.upid}>
                  {task.upid}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
