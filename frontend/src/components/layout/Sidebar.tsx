'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Network, MessageSquare, Zap, ShieldCheck, Server, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/lib/role-context';

export function Sidebar() {
  const pathname = usePathname();
  const { role } = useUserRole();

  const navItems = [
    { href: '/', label: '인프라 대시보드', icon: LayoutDashboard },
    { href: '/infra', label: '아키텍처 및 자원', icon: Network },
    {
      href: '/requests',
      label: role === 'INFRA_TEAM' ? '자원 승인 센터' : '자원 요청 센터',
      icon: ClipboardCheck,
      badge: role === 'INFRA_TEAM' ? '심사' : '신청',
    },
    { href: '/chat', label: '인프라 제어 콘솔', icon: MessageSquare },
    { href: '/automation', label: '자동화 및 감사로그', icon: Zap },
  ];

  return (
    <aside className="w-60 border-r border-slate-800/80 bg-slate-950 flex flex-col justify-between shrink-0">
      <div>
        {/* Brand */}
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-slate-800/80">
          <div className="w-7 h-7 rounded-md bg-slate-900 border border-slate-700/70 flex items-center justify-center text-slate-200">
            <Server className="w-4 h-4 text-slate-300" />
          </div>
          <div>
            <span className="font-semibold text-sm text-slate-100 tracking-tight">
              JEV Controller
            </span>
            <div className="text-[10px] text-slate-500 font-mono">
              Proxmox VE 8.2
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/70',
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-slate-200' : 'text-slate-500')} />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-mono font-normal',
                      role === 'INFRA_TEAM'
                        ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                        : 'bg-blue-950/60 text-blue-300 border border-blue-800/40',
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
      <div className="p-3 border-t border-slate-800/80 space-y-2">
        <div className="p-2.5 rounded-md bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> 가드레일 활성화
            </span>
            <span className="text-[10px] font-mono text-emerald-400">ENFORCED</span>
          </div>
          <div className="text-[10px] text-slate-500 leading-normal">
            다계층 보안 게이트 및 HITL 1회용 승인 토큰 보호
          </div>
        </div>

        <div className="text-[10px] text-slate-600 text-center font-mono">
          Nest-MSA • LangGraph Engine
        </div>
      </div>
    </aside>
  );
}
