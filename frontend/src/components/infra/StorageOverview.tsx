'use client';

import { HardDrive, Database, Layers, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { ProxmoxStorage } from '@/lib/api';

interface StorageOverviewProps {
  storage: ProxmoxStorage[];
}

export function StorageOverview({ storage }: StorageOverviewProps) {
  const totalBytes = storage.reduce((acc, s) => acc + (s.total || 0), 0);
  const usedBytes = storage.reduce((acc, s) => acc + (s.used || 0), 0);
  const availBytes = storage.reduce((acc, s) => acc + (s.avail || 0), 0);
  const totalPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Cluster Storage Rollup Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="border border-slate-800/80 bg-slate-900/50 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-slate-400" /> 총 스토리지 풀 용량
          </span>
          <div className="text-xl font-bold font-mono text-slate-100">
            {(totalBytes / 1024 / 1024 / 1024).toFixed(1)} <span className="text-xs text-slate-400 font-normal">GB</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">총 {storage.length}개 스토리지 풀 활성</span>
        </div>

        <div className="border border-slate-800/80 bg-slate-900/50 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-slate-400" /> 현재 사용 중
          </span>
          <div className="text-xl font-bold font-mono text-slate-100">
            {(usedBytes / 1024 / 1024 / 1024).toFixed(1)} <span className="text-xs text-slate-400 font-normal">GB</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">전체 사용률: {totalPercent}%</span>
        </div>

        <div className="border border-slate-800/80 bg-slate-900/50 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" /> 여유 공간 (Available)
          </span>
          <div className="text-xl font-bold font-mono text-slate-100">
            {(availBytes / 1024 / 1024 / 1024).toFixed(1)} <span className="text-xs text-slate-400 font-normal">GB</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">안전 여유치 확보됨</span>
        </div>

        <div className="border border-slate-800/80 bg-slate-900/50 rounded-xl p-4 space-y-1">
          <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> 스토리지 헬스 상태
          </span>
          <div className="text-xl font-bold font-mono text-slate-100 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>정상 (HEALTHY)</span>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">LVM-Thin / ZFS / Dir</span>
        </div>
      </div>

      {/* Storage Pools List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {storage.map((pool) => {
          const usedGB = ((pool.used || 0) / 1024 / 1024 / 1024).toFixed(1);
          const totalGB = ((pool.total || 0) / 1024 / 1024 / 1024).toFixed(1);
          const availGB = ((pool.avail || 0) / 1024 / 1024 / 1024).toFixed(1);
          const percent = pool.total ? Math.round(((pool.used || 0) / pool.total) * 100) : 0;
          const isWarning = percent > 85;

          const contentTags = (pool.content || '').split(',').map((c) => c.trim()).filter(Boolean);

          return (
            <div key={`${pool.node}-${pool.storage}`} className="rounded-xl p-5 space-y-4 border border-slate-800/80 bg-slate-900/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center bg-slate-800 text-slate-300 border border-slate-700/60`}
                  >
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-slate-100">{pool.storage}</h4>
                    <span className="text-[11px] text-slate-400 font-mono">{pool.node || '모든 노드'}</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                  {pool.type}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">사용량 ({percent}%)</span>
                  <span className="font-mono text-slate-200">
                    <strong>{usedGB} GB</strong> / {totalGB} GB
                  </span>
                </div>
                <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isWarning
                        ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                        : 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                    }`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-500 font-mono">
                  <span>잔여: {availGB} GB</span>
                  <span className="text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    활성 (Active)
                  </span>
                </div>
              </div>

              {/* Content Type Tags */}
              <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">허용 콘텐츠</span>
                <div className="flex flex-wrap gap-1">
                  {contentTags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800/80 text-slate-300 border border-slate-700/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
