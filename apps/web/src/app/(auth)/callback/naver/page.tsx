'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type { ApiResponse, UserProfile } from '@/types/api';

type OAuthResult = {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
};

export default function NaverCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuthStore();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Prevent double-invocation in React 19 strict mode
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error || !code) {
      setErrorMessage('네이버 로그인이 취소되었거나 오류가 발생했어요.');
      return;
    }

    // Verify state parameter to prevent CSRF attacks
    const savedState = typeof window !== 'undefined' ? sessionStorage.getItem('naverOAuthState') : null;
    if (savedState && state !== savedState) {
      setErrorMessage('보안 검증에 실패했어요. 다시 로그인해 주세요.');
      return;
    }
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('naverOAuthState');
    }

    api
      .post('/auth/naver', { code, state })
      .then((res) => {
        const { accessToken, refreshToken, user } = (res as unknown as ApiResponse<OAuthResult>).data;
        login(accessToken, refreshToken, user as never);
        router.replace('/home');
      })
      .catch(() => {
        setErrorMessage('네이버 로그인에 실패했어요. 다시 시도해 주세요.');
      });
  }, [searchParams, login, router]);

  if (errorMessage) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white dark:bg-gray-900 px-6">
        <p className="text-base text-gray-700 dark:text-gray-300 text-center">{errorMessage}</p>
        <button
          onClick={() => router.replace('/login')}
          className="min-h-[44px] rounded-xl bg-blue-500 px-6 py-3 text-base font-semibold text-white hover:bg-blue-600 transition-colors"
        >
          로그인 페이지로
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white dark:bg-gray-900">
      {/* Spinner */}
      <div
        className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500"
        role="status"
        aria-label="로그인 처리 중"
      />
      <p className="text-sm text-gray-500 dark:text-gray-400">로그인 중...</p>
    </div>
  );
}
