'use client';

import { ExternalLink, RefreshCw, UserCheck, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUserRole } from '@/lib/role-context';

interface HeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Header({ onRefresh, isRefreshing }: HeaderProps) {
  const { role, requesterName, department, setRole } = useUserRole();

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-950/70 backdrop-blur-md px-6 flex items-center justify-between shrink-0 z-10">
      <div className="flex items-center gap-3">
        <Badge variant="success" className="gap-2 py-1 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Proxmox MCP
        </Badge>

        {/* Role Switcher Pills */}
        <div className="flex items-center bg-slate-900/90 border border-slate-800 p-0.5 rounded-lg text-xs">
          <button
            onClick={() => setRole('DEV_TEAM')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all font-medium ${
              role === 'DEV_TEAM'
                ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40 shadow-sm'
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
                ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-amber-400" />
            인프라팀 모드
          </button>
        </div>

        <span className="text-xs text-slate-500 hidden md:inline-flex items-center gap-1">
          현재 사용자:{' '}
          <strong className="text-slate-300 font-mono">
            {requesterName} ({department})
          </strong>
        </span>
      </div>

      <div className="flex items-center gap-3">
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
        )}
        <Button
          asChild
          variant="outline"
          size="sm"
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          <a
            href="http://localhost:3000/docs"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            통합 Swagger
          </a>
        </Button>
      </div>
    </header>
  );
}
