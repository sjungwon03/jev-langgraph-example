'use client';

import { ExternalLink, RefreshCw, UserCheck, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserRole } from '@/lib/role-context';

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const { role, requesterName, department, setRole } = useUserRole();

  return (
    <header className="h-14 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur px-6 flex items-center justify-between shrink-0 z-10">
      <div className="flex items-center gap-4">
        {/* Status Pill */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] text-slate-300 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span>Proxmox VE Cluster</span>
        </div>

        {/* Role Switcher (Segmented Control) */}
        <div className="flex items-center bg-slate-900/90 border border-slate-800/80 p-0.5 rounded-lg text-xs">
          <button
            onClick={() => setRole('DEV_TEAM')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all font-medium ${
              role === 'DEV_TEAM'
                ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5 text-blue-400" />
            개발팀 모드
          </button>
          <button
            onClick={() => setRole('INFRA_TEAM')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all font-medium ${
              role === 'INFRA_TEAM'
                ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            인프라팀 모드
          </button>
        </div>

        <span className="text-xs text-slate-500 hidden md:inline-flex items-center gap-1.5">
          <span>세션:</span>
          <span className="text-slate-300 font-medium">
            {requesterName}
          </span>
          <span className="text-slate-500 text-[11px]">({department})</span>
        </span>
      </div>

      <div className="flex items-center gap-2">
        {onRefresh && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-900 h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        )}
        <Button
          asChild
          variant="outline"
          size="sm"
          className="text-xs text-slate-300 hover:text-white border-slate-800 bg-slate-900/60 hover:bg-slate-800 h-8"
        >
          <a
            href="http://localhost:3000/docs"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            통합 API 명세
          </a>
        </Button>
      </div>
    </header>
  );
}
