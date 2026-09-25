'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { AuthGuard } from '@/components/auth/AuthGuard';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';

  if (isLoginPage) {
    return <div className="w-full min-h-screen bg-slate-50 dark:bg-[#070b13] text-slate-900 dark:text-slate-100">{children}</div>;
  }

  return (
    <AuthGuard>
      <div className="flex w-full h-screen overflow-hidden bg-slate-50 dark:bg-[#070b13] text-slate-900 dark:text-slate-100 transition-colors duration-200">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {children}
        </div>
      </div>
    </AuthGuard>
  );
}
