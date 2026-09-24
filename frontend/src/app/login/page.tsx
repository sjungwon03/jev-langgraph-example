'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Server,
  Shield,
  UserCheck,
  Mail,
  Lock,
  User,
  Building,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useUserRole, UserRole } from '@/lib/role-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const { login, register, isAuthenticated, user, logout } = useUserRole();

  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('서비스개발1팀');
  const [selectedRole, setSelectedRole] = useState<UserRole>('DEV_TEAM');

  const handleRoleChange = (role: UserRole) => {
    setSelectedRole(role);
    if (role === 'DEV_TEAM') {
      setDepartment('서비스개발1팀');
    } else {
      setDepartment('클라우드인프라팀');
    }
  };

  const handleQuickFill = (role: 'DEV' | 'INFRA') => {
    if (role === 'DEV') {
      setEmail('dev@company.com');
      setPassword('dev1234!');
    } else {
      setEmail('infra@company.com');
      setPassword('infra1234!');
    }
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('이메일과 비밀번호를 모두 입력하세요.');
      return;
    }

    try {
      setLoading(true);
      if (mode === 'LOGIN') {
        const loggedUser = await login(email.trim(), password);
        setSuccessMsg(`${loggedUser.name}님 환영합니다! 대시보드로 이동합니다.`);
        setTimeout(() => {
          router.push('/');
        }, 600);
      } else {
        // Register mode
        if (password !== confirmPassword) {
          setErrorMsg('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
          setLoading(false);
          return;
        }
        if (!name.trim()) {
          setErrorMsg('이름을 입력하세요.');
          setLoading(false);
          return;
        }
        if (!department.trim()) {
          setErrorMsg('소속 부서명을 입력하세요.');
          setLoading(false);
          return;
        }

        const newUser = await register({
          email: email.trim(),
          password,
          name: name.trim(),
          department: department.trim(),
          role: selectedRole,
        });

        setSuccessMsg(
          `${newUser.name}님 회원가입이 완료되었습니다 (${selectedRole === 'DEV_TEAM' ? '개발팀' : '인프라팀'}). 대시보드로 이동합니다.`,
        );
        setTimeout(() => {
          router.push('/');
        }, 800);
      }
    } catch (err: any) {
      setErrorMsg(err.message || '인증 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#070b13] relative overflow-hidden">
      {/* Background Subtle Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 shadow-md mb-2">
            <Server className="w-6 h-6 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            Proxmox Cloud Console
          </h1>
          <p className="text-xs text-slate-400">
            개발팀 및 인프라팀 분리 거버넌스 인프라 제어 포털
          </p>
        </div>

        {/* Auth Card */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 backdrop-blur p-6 shadow-xl space-y-5">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-950 border border-slate-800 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                setMode('LOGIN');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-md transition-all ${
                mode === 'LOGIN'
                  ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('REGISTER');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`py-2 rounded-md transition-all ${
                mode === 'REGISTER'
                  ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              회원가입
            </button>
          </div>

          {/* Alert Banners */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                이메일
              </label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="bg-slate-950 border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:border-slate-700"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                비밀번호
              </label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'REGISTER' ? '최소 6자 이상' : '비밀번호 입력'}
                className="bg-slate-950 border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:border-slate-700"
              />
            </div>

            {/* Registration Extra Fields */}
            {mode === 'REGISTER' && (
              <>
                {/* Confirm Password */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    비밀번호 확인
                  </label>
                  <Input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="비밀번호 재입력"
                    className="bg-slate-950 border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:border-slate-700"
                  />
                </div>

                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    이름
                  </label>
                  <Input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="홍길동"
                    className="bg-slate-950 border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:border-slate-700"
                  />
                </div>

                {/* Team Selection (Dev vs Infra) */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300 block">
                    소속 팀 구분 (역할 및 권한)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Dev Team Card */}
                    <button
                      type="button"
                      onClick={() => handleRoleChange('DEV_TEAM')}
                      className={`p-3 rounded-lg border text-left transition-all flex flex-col gap-1.5 ${
                        selectedRole === 'DEV_TEAM'
                          ? 'border-blue-500/80 bg-blue-500/10 text-blue-200 shadow-sm'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-blue-400" />
                        <span className="font-semibold text-xs text-slate-100">개발팀</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        VM 신청, 자원 증설 요청, 워크로드 모니터링
                      </p>
                    </button>

                    {/* Infra Team Card */}
                    <button
                      type="button"
                      onClick={() => handleRoleChange('INFRA_TEAM')}
                      className={`p-3 rounded-lg border text-left transition-all flex flex-col gap-1.5 ${
                        selectedRole === 'INFRA_TEAM'
                          ? 'border-amber-500/80 bg-amber-500/10 text-amber-200 shadow-sm'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Shield className="w-4 h-4 text-amber-400" />
                        <span className="font-semibold text-xs text-slate-100">인프라팀</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        요청 승인/반려, 클러스터 거버넌스, 전원/스토리지 제어
                      </p>
                    </button>
                  </div>
                </div>

                {/* Department */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    소속 부서
                  </label>
                  <Input
                    type="text"
                    required
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="서비스개발1팀"
                    className="bg-slate-950 border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:border-slate-700"
                  />
                </div>
              </>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-100 hover:bg-white text-slate-900 font-semibold text-xs h-9 shadow transition-all flex items-center justify-center gap-1.5 mt-2"
            >
              {loading ? (
                <span>처리 중...</span>
              ) : mode === 'LOGIN' ? (
                <>
                  <span>로그인</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <span>가입 완료 ({selectedRole === 'DEV_TEAM' ? '개발팀' : '인프라팀'})</span>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </>
              )}
            </Button>
          </form>

          {/* Quick Test Accounts for Login Mode */}
          {mode === 'LOGIN' && (
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <span className="text-[11px] font-medium text-slate-400 block">
                테스트 기본 계정 원클릭 입력:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickFill('DEV')}
                  className="px-2.5 py-1.5 rounded border border-slate-800 bg-slate-950 hover:bg-slate-800/80 text-[11px] text-slate-300 flex items-center justify-center gap-1.5 transition-all"
                >
                  <UserCheck className="w-3 h-3 text-blue-400" />
                  <span>개발팀 계정</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickFill('INFRA')}
                  className="px-2.5 py-1.5 rounded border border-slate-800 bg-slate-950 hover:bg-slate-800/80 text-[11px] text-slate-300 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Shield className="w-3 h-3 text-amber-400" />
                  <span>인프라팀 계정</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Current Active Session Note */}
        {isAuthenticated && user && (
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/60 text-center text-xs text-slate-400 flex items-center justify-between">
            <span>
              현재 로그인: <strong className="text-slate-200">{user.name}</strong> ({user.department})
            </span>
            <button
              onClick={() => router.push('/')}
              className="text-blue-400 hover:text-blue-300 font-medium underline"
            >
              대시보드 바로가기 →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
