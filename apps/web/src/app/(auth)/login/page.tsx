'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useDevLogin, useEmailLogin, useEmailRegister } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';

export default function LoginPage() {
  const router = useRouter();
  const devLogin = useDevLogin();
  const emailLogin = useEmailLogin();
  const emailRegister = useEmailRegister();
  const { toast } = useToast();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [devNickname, setDevNickname] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const { isAuthenticated } = useAuthStore();
  useEffect(() => {
    if (isAuthenticated) router.replace('/home');
  }, [isAuthenticated, router]);

  const handleEmailSubmit = async () => {
    if (!email || !password) return toast('error', '이메일과 비밀번호를 입력해주세요');
    if (mode === 'register' && !nickname) return toast('error', '닉네임을 입력해주세요');
    if (password.length < 6) return toast('error', '비밀번호는 6자 이상이어야 해요');

    setIsLoading(true);
    try {
      if (mode === 'register') {
        await emailRegister.mutateAsync({ email, password, nickname });
        toast('success', '가입 완료! 환영합니다');
        router.push('/onboarding');
      } else {
        await emailLogin.mutateAsync({ email, password });
        router.push('/home');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast('error', msg || (mode === 'register' ? '가입에 실패했어요' : '로그인에 실패했어요'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevLogin = async (name?: string) => {
    setIsLoading(true);
    try {
      await devLogin.mutateAsync(name || devNickname || '테스트유저');
      router.push('/home');
    } catch { /* handled by mutation */ } finally { setIsLoading(false); }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-white dark:bg-gray-900">
      {/* 상단 — 뒤로가기 */}
      <div className="flex items-center px-4 pt-4">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 min-h-[44px] min-w-[44px] px-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          aria-label="홈으로 돌아가기"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11 14L6 9L11 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>홈으로</span>
        </Link>
      </div>

      {/* 상단 — 브랜드 */}
      <div className="flex flex-col items-center justify-center px-6 pt-8 pb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">TeamMeet</h1>
        <p className="mt-2 text-base text-gray-500 leading-relaxed text-center">
          같이 운동할 사람, 찾고 계셨죠?
        </p>
      </div>

      {/* 이메일 로그인/회원가입 */}
      <div className="flex-1 px-6">
        <div className="max-w-sm mx-auto">
          {/* 탭 */}
          <div className="flex mb-5">
            {(['login', 'register'] as const).map(tab => (
              <button key={tab} onClick={() => setMode(tab)}
                className={`flex-1 py-2.5 text-base font-medium border-b-2 transition-colors ${
                  mode === tab ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                {tab === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>

          {/* 폼 */}
          <div className="space-y-3">
            <label htmlFor="login-email" className="sr-only">이메일 주소</label>
            <input id="login-email" type="email" placeholder="이메일" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-colors" />
            <label htmlFor="login-password" className="sr-only">비밀번호</label>
            <input id="login-password" type="password" placeholder="비밀번호 (6자 이상)" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && mode === 'login' && handleEmailSubmit()}
              className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-colors" />
            {mode === 'register' && (
              <>
                <label htmlFor="login-nickname" className="sr-only">닉네임</label>
                <input id="login-nickname" type="text" placeholder="닉네임" value={nickname} onChange={e => setNickname(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEmailSubmit()}
                  className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-3 text-base text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-colors" />
              </>
            )}
            <button onClick={handleEmailSubmit} disabled={isLoading}
              className="w-full rounded-xl bg-blue-500 py-3 text-md font-bold text-white hover:bg-blue-600 active:bg-blue-700 active:scale-[0.98] disabled:opacity-50 transition-[colors,transform]">
              {isLoading ? (mode === 'login' ? '로그인 중...' : '가입 중...') : mode === 'login' ? '로그인' : '가입하기'}
            </button>
          </div>

          {/* 소셜 로그인 (준비중) */}
          <div className="mt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs text-gray-400">또는</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>
            <div className="space-y-2">
              <button disabled aria-disabled="true" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FEE500] px-6 py-3 text-base font-semibold text-[#191919] opacity-50 cursor-not-allowed">
                카카오로 시작하기
                <span className="text-xs font-normal opacity-70">(준비 중)</span>
              </button>
              <button disabled aria-disabled="true" className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#03C75A] px-6 py-3 text-base font-semibold text-white opacity-50 cursor-not-allowed">
                네이버로 시작하기
                <span className="text-xs font-normal opacity-70">(준비 중)</span>
              </button>
            </div>
          </div>

          {/* 둘러보기 — 로그인 없이 홈으로 */}
          <div className="mt-5 text-center">
            <Link
              href="/home"
              className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors min-h-[44px]"
            >
              로그인 없이 둘러보기
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 7H11M8 4L11 7L8 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      {/* 개발 빠른 로그인 — 개발 환경에서만 표시 */}
      {process.env.NODE_ENV !== 'production' && <div className="w-full bg-gray-50 dark:bg-gray-800 rounded-t-2xl px-6 pt-4 pb-6">
        <p className="text-center text-xs text-gray-400 mb-3">개발 모드</p>
        <div className="flex gap-2 max-w-sm mx-auto">
          <input type="text" placeholder="닉네임" aria-label="테스트 닉네임" value={devNickname} onChange={e => setDevNickname(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleDevLogin()}
            className="flex-1 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 outline-none" />
          <button onClick={() => handleDevLogin()} disabled={isLoading}
            className="rounded-xl bg-gray-900 dark:bg-white px-5 py-2.5 text-sm font-bold text-white dark:text-gray-900 disabled:opacity-50 transition-colors">
            입장
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 justify-center max-w-sm mx-auto">
          {['축구왕민수', '농구러버지영', '하키마스터준호'].map(name => (
            <button key={name} onClick={() => handleDevLogin(name)} disabled={isLoading}
              className="rounded-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2.5 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-100 disabled:opacity-50 transition-colors">
              {name}
            </button>
          ))}
        </div>
      </div>}
    </div>
  );
}
