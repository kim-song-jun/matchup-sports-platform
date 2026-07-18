'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { V1ApiError, v1Post } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import { sanitizeRedirectPath, saveStoredV1Session } from '@/lib/session-storage';
import type { V1AuthSessionResponse } from '@/types/api';
import { AuthFrame } from './auth-page';
import { KAKAO_OAUTH_STATE_STORAGE_KEY } from './auth.view-model';

function getKakaoRedirectUri() {
  return process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI;
}

function getSavedRedirectPath() {
  if (typeof window === 'undefined') return null;
  const value = window.sessionStorage.getItem('teameet.v1.kakao.redirect');
  window.sessionStorage.removeItem('teameet.v1.kakao.redirect');
  return sanitizeRedirectPath(value);
}

// 로그인 CSRF(세션 고정) 방지: authorize 이동 시 저장해 둔 state 값을 읽고 즉시 제거한다.
// 콜백에서 kauth가 돌려준 state와 대조한 뒤에만 code 교환을 진행한다.
function getStoredKakaoOAuthState() {
  if (typeof window === 'undefined') return null;
  const value = window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY);
  window.sessionStorage.removeItem(KAKAO_OAUTH_STATE_STORAGE_KEY);
  return value;
}

export function KakaoCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const calledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const code = searchParams.get('code');
    const providerError = searchParams.get('error');

    if (providerError || !code) {
      trackEvent('login_failed', { method: 'kakao', reason: providerError || 'missing_code' });
      setError('카카오 로그인을 완료하지 못했어요.');
      return;
    }

    const returnedState = searchParams.get('state');
    const storedState = getStoredKakaoOAuthState();

    if (!returnedState || !storedState || returnedState !== storedState) {
      trackEvent('login_failed', { method: 'kakao', reason: 'invalid_state' });
      setError('로그인 요청이 유효하지 않아요. 다시 시도해 주세요.');
      return;
    }

    v1Post<V1AuthSessionResponse>('/auth/kakao', {
      code,
      redirectUri: getKakaoRedirectUri(),
    })
      .then((result) => {
        saveStoredV1Session(result.session);
        const nextRoute = result.next?.route ?? getSavedRedirectPath() ?? '/home';
        // next.route가 사회 가입 미완료 상태로 안내하면 신규 가입 진행 중, 그 외에는 기존 계정 로그인.
        if (nextRoute === '/terms?mode=social' || nextRoute === '/signup/social') {
          trackEvent('sign_up_start', { method: 'kakao' });
        } else {
          trackEvent('login', { method: 'kakao' });
        }
        router.replace(nextRoute);
      })
      .catch((nextError) => {
        const reason = nextError instanceof V1ApiError ? nextError.code : 'unknown';
        trackEvent('login_failed', { method: 'kakao', reason });

        if (nextError instanceof V1ApiError) {
          if (nextError.code === 'MISSING_EMAIL') {
            router.replace('/auth/missing-email');
            return;
          }

          if (nextError.code === 'PERMISSION_DENIED') {
            router.replace('/auth/blocked');
            return;
          }

          if (nextError.code === 'OAUTH_NOT_CONFIGURED') {
            setError('카카오 로그인 설정이 아직 완료되지 않았어요.');
            return;
          }

          if (nextError.code === 'UNAUTHENTICATED') {
            setError('카카오 인증 시간이 만료됐거나 인증 코드가 유효하지 않아요. 다시 로그인해 주세요.');
            return;
          }
        }

        setError(nextError instanceof Error ? nextError.message : '카카오 로그인에 실패했어요.');
      });
  }, [router, searchParams]);

  if (error) {
    return (
      <AuthFrame topTitle="카카오 로그인" backHref="/login">
        <div className="tm-auth-body">
          <span className="tm-badge tm-badge-orange">로그인 오류</span>
          <h1 className="tm-text-heading tm-auth-heading">로그인을 완료하지 못했어요</h1>
          <p className="tm-text-body tm-auth-sub">{error}</p>
          <Link className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" href="/login">
            다시 로그인하기
          </Link>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <div className="tm-auth-body tm-auth-center">
        <h1 className="tm-text-heading tm-auth-heading">카카오 로그인을 확인하고 있어요</h1>
        <p className="tm-text-body tm-auth-sub">잠시만 기다려 주세요.</p>
      </div>
    </AuthFrame>
  );
}
