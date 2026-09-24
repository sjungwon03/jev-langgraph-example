'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Network, MessageSquare, Zap, ShieldCheck, Cpu, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useUserRole } from '@/lib/role-context';

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useUserRole();

  const navItems = [
    { href: '/', label: '인프라 대시보드', icon: LayoutDashboard },
    { href: '/infra', label: '인프라 아키텍처 & 자원', icon: Network },
    {
      href: '/requests',
      label: role === 'INFRA_TEAM' ? '자원 승인 센터' : '자원 요청 센터',
      icon: ClipboardCheck,
      badge: role === 'INFRA_TEAM' ? '심사' : '신청',
    },
    { href: '/chat', label: 'AI 인프라 챗봇', icon: MessageSquare },
    { href: '/automation', label: '자동화 & 감사로그', icon: Zap },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-950/80 backdrop-blur-md flex flex-col justify-between shrink-0">
      <div>
        {/* Brand */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800/80">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Cpu className="w-5 h-5 text-slate-950" />
          </div>
          <div>
            <span className="font-bold text-base tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Proxmox MCP
            </span>
            <div className="text-[10px] text-slate-400 font-mono tracking-wider">
              LANGGRAPH AGENT
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all',
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60',
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-emerald-400' : 'text-slate-500')} />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-mono',
                      role === 'INFRA_TEAM'
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                        : 'bg-blue-950/80 text-blue-300 border border-blue-800/60',
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-slate-800/80 space-y-3">
        <div className="p-3 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-400 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Safety Gate
            </span>
            <Badge variant="success" className="text-[10px] py-0 px-1.5 font-mono">
              ACTIVE
            </Badge>
          </div>
          <div className="text-[11px] text-slate-500 leading-relaxed">
            파괴적 인프라 작업(삭제/강제종료)에 대한 사전 승인 토큰 검증 시스템 가동 중
          </div>
        </div>

        <div className="text-[11px] text-slate-500 text-center font-mono">
          Nest-MSA v1.0 • PVE 8.2
        </div>
      </div>
    </aside>
  );
}
