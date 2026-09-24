'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUserRole, UserRole } from '@/lib/role-context';
import { Loader2, ShieldAlert, ArrowLeft, LogIn } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

interface AuthGuardProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export function AuthGuard({ children, allowedRoles }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, role } = useUserRole();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      if (pathname !== '/login') {
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      }
    }
  }, [isLoading, isAuthenticated, router, pathname]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        <span className="text-xs">세션 인증 확인 중...</span>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
        <span className="text-xs">로그인이 필요합니다. 로그인 페이지로 이동 중...</span>
      </div>
    );
  }

  // Role restriction check
  if (allowedRoles && !allowedRoles.includes(role)) {
    const requiredRoleNames = allowedRoles
      .map((r) => (r === 'INFRA_TEAM' ? '인프라팀' : '개발팀'))
      .join(', ');

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md mx-auto my-auto">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-slate-100">접근 권한 제한 (403)</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            해당 메뉴는 <strong>{requiredRoleNames}</strong> 전용 기능입니다.<br />
            현재 접속 계정: <span className="text-slate-200 font-medium">{user.name}</span> (
            {role === 'DEV_TEAM' ? '개발팀' : '인프라팀'} • {user.department})
          </p>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button asChild variant="outline" size="sm" className="text-xs border-slate-800">
            <Link href="/" className="flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" />
              대시보드로 돌아가기
            </Link>
          </Button>
          <Button asChild variant="default" size="sm" className="text-xs bg-blue-600 hover:bg-blue-500">
            <Link href="/login" className="flex items-center gap-1.5">
              <LogIn className="w-3.5 h-3.5" />
              권한 계정으로 로그인
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
