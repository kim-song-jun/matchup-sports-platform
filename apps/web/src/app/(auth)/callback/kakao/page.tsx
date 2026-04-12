'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth-store';
import type { ApiResponse, UserProfile } from '@/types/api';
import { Button } from '@/components/ui/button';

type OAuthResult = {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
};

function KakaoCallbackPageInner() {
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
    const error = searchParams.get('error');

    if (error || !code) {
      setErrorMessage('카카오 로그인이 취소되었거나 오류가 발생했어요.');
      return;
    }

    api
      .post<ApiResponse<OAuthResult>>('/auth/kakao', { code })
      .then((res) => {
        const { accessToken, refreshToken, user } = res.data;
        login(accessToken, refreshToken, user);
        router.replace('/home');
      })
      .catch(() => {
        setErrorMessage('카카오 로그인에 실패했어요. 다시 시도해 주세요.');
      });
  }, [searchParams, login, router]);

  if (errorMessage) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white dark:bg-gray-900 px-6">
        <p className="text-base text-gray-700 dark:text-gray-300 text-center">{errorMessage}</p>
        <Button variant="primary" onClick={() => router.replace('/login')}>
          로그인 페이지로
        </Button>
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

export default function KakaoCallbackPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-white dark:bg-gray-900" />}>
      <KakaoCallbackPageInner />
    </Suspense>
  );
}
