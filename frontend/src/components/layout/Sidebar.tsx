'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Network, MessageSquare, Zap, ShieldCheck, Server, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/lib/role-context';

export function Sidebar() {
  const pathname = usePathname();
  const { role, user } = useUserRole();

  const isInfra = role === 'INFRA_TEAM';

  const navItems = isInfra
    ? [
        { href: '/', label: '클러스터 전체 대시보드', icon: LayoutDashboard },
        { href: '/infra', label: '인프라 및 자원 토폴로지', icon: Network },
        {
          href: '/requests',
          label: '자원 심사 및 승인 센터',
          icon: ClipboardCheck,
          badge: '심사',
        },
        { href: '/chat', label: '인프라 제어 콘솔', icon: MessageSquare },
        {
          href: '/automation',
          label: '자동화 및 감사 거버넌스',
          icon: Zap,
          badge: '관리자',
        },
      ]
    : [
        { href: '/', label: '서비스 및 인스턴스 현황', icon: LayoutDashboard },
        {
          href: '/requests',
          label: '자원 요청 및 진행 센터',
          icon: ClipboardCheck,
          badge: '신청',
        },
        { href: '/chat', label: 'AI 질의 및 어시스턴트', icon: MessageSquare },
        {
          href: '/infra',
          label: '클러스터 아키텍처 조회',
          icon: Network,
          badge: '조회',
        },
      ];

  return (
    <aside className="w-60 border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950 flex flex-col justify-between shrink-0 transition-colors duration-200">
      <div>
        {/* Brand */}
        <div className="h-14 flex items-center gap-2.5 px-5 border-b border-slate-200 dark:border-slate-800/80">
          <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700/70 flex items-center justify-center text-slate-700 dark:text-slate-200">
            <Server className="w-4 h-4 text-slate-600 dark:text-slate-300" />
          </div>
          <div>
            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100 tracking-tight">
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
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/70',
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-blue-600 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500')} />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-mono font-normal',
                      role === 'INFRA_TEAM'
                        ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800/40'
                        : 'bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800/40',
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
      <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
        {/* User Profile Mini Card */}
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  role === 'DEV_TEAM' ? 'bg-blue-500' : 'bg-amber-500'
                }`}
              />
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-200 truncate">
                {user ? user.name : '게스트'}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              {user
                ? `${user.role === 'DEV_TEAM' ? '개발팀' : '인프라팀'} • ${user.department}`
                : '로그인 필요'}
            </div>
          </div>
          <Link
            href="/login"
            className="text-[10px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-800 px-2 py-1 rounded transition-colors shrink-0"
          >
            {user ? '계정전환' : '로그인'}
          </Link>
        </div>

        <div className="p-2.5 rounded-md bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-400 space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-slate-800 dark:text-slate-300 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" /> 가드레일 활성화
            </span>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">ENFORCED</span>
          </div>
          <div className="text-[10px] text-slate-500 leading-normal">
            다계층 보안 게이트 및 HITL 1회용 승인 토큰 보호
          </div>
        </div>

        <div className="text-[10px] text-slate-400 dark:text-slate-600 text-center font-mono">
          Nest-MSA • LangGraph Engine
        </div>
      </div>
    </aside>
  );
}
