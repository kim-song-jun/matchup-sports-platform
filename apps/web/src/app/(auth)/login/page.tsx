'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useDevLogin, useEmailLogin, useEmailRegister } from '@/hooks/use-api';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/toast';
import { extractErrorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';

// Allows only same-origin relative paths. Blocks absolute URLs, protocol-relative
// paths (//), javascript:, data:, and any scheme-containing strings.
function sanitizeRedirect(raw: string | null): string {
  if (!raw) return '/home';
  if (!raw.startsWith('/')) return '/home';
  if (raw.startsWith('//')) return '/home';
  return raw;
}

// Kakao chat-bubble icon (white path on yellow background)
function KakaoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10 3C6.134 3 3 5.492 3 8.556c0 1.942 1.195 3.654 3.007 4.706L5.3 16.178a.25.25 0 0 0 .374.27L9.29 14.09c.234.022.47.034.71.034 3.866 0 7-2.492 7-5.556C17 5.492 13.866 3 10 3Z"
        fill="#191919"
      />
    </svg>
  );
}

// Naver "N" wordmark (white on green background)
function NaverIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M11.408 10.274L8.376 5H5v10h3.592L11.624 9.726V15H15V5h-3.592z"
        fill="white"
      />
    </svg>
  );
}

// Apple logo (white on black background)
function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M13.3 3c-.2 1.1.3 2.2 1 3-.7.1-1.9-.5-2.6-1.5-.6-.9-.8-2-.2-3 .7.1 1.6.7 1.8 1.5ZM16 13.6c-.4.9-1 1.8-1.8 2.4-.6.5-1.2.9-1.9.9-.6 0-1-.2-1.5-.4-.5-.2-1-.4-1.7-.4-.7 0-1.2.2-1.7.4-.5.2-.9.4-1.5.4-.8 0-1.4-.4-2-.9C4 14.7 3 12.9 3 11c0-2.6 1.7-4 3.3-4 .7 0 1.3.2 1.8.4.4.2.7.3 1 .3.2 0 .6-.1 1-.3.6-.2 1.3-.5 2.1-.4.9.1 1.7.4 2.3 1.1-.8.5-1.4 1.3-1.3 2.3.1 1.1.8 2 1.8 2.2Z"
        fill="white"
      />
    </svg>
  );
}

// Social login buttons always render — OAuth flow is initiated server-side via /api/v1/auth/{provider}.
// Brand colors are used as-is per DESIGN.md exception: "소셜 로그인은 각 서비스 브랜드 컬러를 그대로 사용."
// Hardcoded hex values (#FEE500, #03C75A, #000000) are intentional brand exceptions, not token violations.
function SocialLoginButtons() {
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
        <span className="text-xs text-gray-400">또는</span>
        <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
      </div>
      <div className="space-y-2.5">
        <a
          href="/api/v1/auth/kakao"
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold active:scale-[0.98] transition-colors"
          style={{ backgroundColor: '#FEE500', color: '#191919' }}
          aria-label="카카오 계정으로 로그인"
        >
          <KakaoIcon />
          카카오로 시작하기
        </a>
        <a
          href="/api/v1/auth/naver"
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold active:scale-[0.98] transition-colors"
          style={{ backgroundColor: '#03C75A', color: '#ffffff' }}
          aria-label="네이버 계정으로 로그인"
        >
          <NaverIcon />
          네이버로 시작하기
        </a>
        <a
          href="/api/v1/auth/apple"
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold active:scale-[0.98] transition-colors"
          style={{ backgroundColor: '#000000', color: '#ffffff' }}
          aria-label="애플 계정으로 로그인"
        >
          <AppleIcon />
          Apple로 시작하기
        </a>
      </div>
    </div>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const redirectTo = sanitizeRedirect(searchParams.get('redirect'));

  const { isAuthenticated } = useAuthStore();
  useEffect(() => {
    if (isAuthenticated) router.replace('/home');
  }, [isAuthenticated, router]);

  const handleEmailSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !password) return toast('error', '이메일과 비밀번호를 입력해주세요');
    if (mode === 'register' && !nickname) return toast('error', '닉네임을 입력해주세요');
    if (password.length < 6) return toast('error', '비밀번호는 6자 이상이어야 해요');

    setIsLoading(true);
    try {
      if (mode === 'register') {
        await emailRegister.mutateAsync({ email, password, nickname });
        toast('success', '가입 완료! 환영합니다');
        router.push(redirectTo);
      } else {
        await emailLogin.mutateAsync({ email, password });
        router.push(redirectTo);
      }
    } catch (err: unknown) {
      toast('error', extractErrorMessage(err, mode === 'register' ? '가입에 실패했어요' : '로그인에 실패했어요'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDevLogin = async (name?: string) => {
    setIsLoading(true);
    try {
      await devLogin.mutateAsync(name || devNickname || '테스트유저');
      router.push(redirectTo);
    } catch { /* handled by mutation */ } finally { setIsLoading(false); }
  };

  return (
    <div className="relative flex min-h-dvh flex-col bg-white dark:bg-gray-900" data-testid="login-page">
      {/* Subtle sport-energy gradient decoration — blue tint fades out below the brand area */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-gradient-to-b from-blue-50/60 to-transparent dark:from-blue-950/30 dark:to-transparent"
        aria-hidden="true"
      />
      {/* 상단 — 뒤로가기 */}
      <div className="relative flex items-center px-4 pt-4">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 min-h-[44px] min-w-11 px-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          aria-label="홈으로 돌아가기"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M11 14L6 9L11 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>홈으로</span>
        </Link>
      </div>

      {/* 상단 — 브랜드 */}
      <div className="relative flex flex-col items-center justify-center px-6 pt-8 pb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">TeamMeet</h1>
        <p className="mt-2 text-base text-gray-500 leading-relaxed text-center">
          같이 운동할 사람, 찾고 계셨죠?
        </p>
      </div>

      {/* 이메일 로그인/회원가입 */}
      <div className="relative flex-1 px-6">
        <div className="max-w-sm mx-auto">
          {/* 탭 */}
          <div className="flex mb-5">
            {(['login', 'register'] as const).map(tab => (
              <button key={tab} onClick={() => setMode(tab)}
                data-testid={tab === 'login' ? 'auth-tab-login' : 'auth-tab-register'}
                className={`flex-1 py-2.5 text-base font-medium border-b-2 transition-colors ${
                  mode === tab ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                {tab === 'login' ? '로그인' : '회원가입'}
              </button>
            ))}
          </div>

          {/* 폼 */}
          <form onSubmit={handleEmailSubmit} className="space-y-3" noValidate>
            <FormField label="이메일 주소" htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="text-base"
              />
            </FormField>
            <FormField label="비밀번호" htmlFor="login-password">
              <Input
                id="login-password"
                type="password"
                placeholder="비밀번호 (6자 이상)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="text-base"
              />
            </FormField>
            {mode === 'register' && (
              <FormField label="닉네임" htmlFor="register-nickname">
                <Input
                  id="register-nickname"
                  type="text"
                  placeholder="닉네임"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="text-base"
                />
              </FormField>
            )}
            <Button type="submit" disabled={isLoading} data-testid="auth-submit" size="lg" fullWidth>
              {isLoading ? (mode === 'login' ? '로그인 중...' : '가입 중...') : mode === 'login' ? '로그인' : '가입하기'}
            </Button>
          </form>

          {/* 소셜 로그인 */}
          <SocialLoginButtons />

          {/* 둘러보기 — 로그인 없이 홈으로 */}
          <div className="mt-5 text-center">
            <Link
              href="/home"
              data-testid="browse-without-login"
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
      {process.env.NODE_ENV !== 'production' && <div className="w-full bg-gray-50 dark:bg-gray-800 rounded-t-2xl px-6 pt-4 pb-6" data-testid="dev-login-panel">
        <p className="text-center text-xs text-gray-400 mb-3">개발 모드</p>
        <div className="flex gap-2 max-w-sm mx-auto">
          <Input
            type="text"
            placeholder="닉네임"
            aria-label="테스트 닉네임"
            data-testid="dev-login-input"
            value={devNickname}
            onChange={(e) => setDevNickname(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDevLogin()}
            className="flex-1 bg-white dark:bg-gray-900"
          />
          <Button onClick={() => handleDevLogin()} disabled={isLoading} data-testid="dev-login-submit" variant="secondary">
            입장
          </Button>
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

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white dark:bg-gray-900" />}>
      <LoginPageInner />
    </Suspense>
  );
}
