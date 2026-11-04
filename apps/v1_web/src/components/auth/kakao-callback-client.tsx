'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useV1LinkKakao } from '@/hooks/use-v1-api';
import { V1ApiError, v1Post } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import { getSignupIncompleteRoute } from '@/lib/auth-link-errors';
import { consumeKakaoOAuthAttempt } from '@/lib/kakao-oauth';
import { buildLinkResultPath, linkResultFromError, linkResultFromSuccess } from '@/lib/link-result';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { clearSavedRedirectPath, getSavedRedirectPath, saveStoredV1Session } from '@/lib/session-storage';
import type { V1AuthSessionResponse } from '@/types/api';
import { AUTH_NOTICE_STAGE, AUTH_WELCOME_STAGE, AuthFrame } from './auth-page';
import { isSocialOnboardingRoute } from './auth.view-model';
import { routeSocialLoginRecovery } from './login-recovery-route';
import { extractErrorMessage } from '@/lib/error-message';

function getKakaoRedirectUri() {
  return process.env.NEXT_PUBLIC_KAKAO_REDIRECT_URI;
}

export function KakaoCallbackClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { mutate: linkKakao } = useV1LinkKakao();
  const calledRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const code = searchParams.get('code');
    const providerError = searchParams.get('error');
    const returnedState = searchParams.get('state');
    // Analytics reports document.location with every hit, so the OAuth code and state
    // must leave the address bar before gtag.js loads and reads it.
    window.history.replaceState(window.history.state, '', window.location.pathname);

    // 로그인 CSRF(세션 고정) 방지: 인가를 시작할 때 저장한 시도와 kauth 가 돌려준 state 를 대조한다.
    // 저장값은 한 번 읽으면 지워지고, 로그인과 연결을 가르는 mode 도 여기서만 알 수 있다.
    const attempt = consumeKakaoOAuthAttempt(returnedState);
    const returnTo = attempt?.returnTo ?? null;

    if (providerError || !code) {
      if (attempt?.mode === 'link') {
        router.replace(buildLinkResultPath({ linkResult: 'failed', provider: 'kakao' }, returnTo));
        return;
      }
      trackEvent('login_failed', { method: 'kakao', reason: providerError || 'missing_code' });
      setError('카카오 로그인을 완료하지 못했어요.');
      return;
    }

    if (!attempt) {
      trackEvent('login_failed', { method: 'kakao', reason: 'invalid_state' });
      setError('로그인 요청이 유효하지 않아요. 다시 시도해 주세요.');
      return;
    }

    if (attempt.mode === 'link') {
      setLinking(true);
      const redirectUri = getKakaoRedirectUri();
      if (!redirectUri) {
        router.replace(buildLinkResultPath({ linkResult: 'failed', provider: 'kakao' }, returnTo));
        return;
      }
      linkKakao({ code, redirectUri }, {
        onSuccess: (result) => {
          router.replace(buildLinkResultPath({ linkResult: linkResultFromSuccess(result), provider: result.provider }, returnTo));
        },
        onError: (linkError) => {
          // 가입이 덜 끝난 계정은 연결 결과가 아니라 가입을 이어 갈 화면으로 보낸다.
          const signupRoute = getSignupIncompleteRoute(linkError);
          router.replace(signupRoute ?? buildLinkResultPath({ linkResult: linkResultFromError(linkError), provider: 'kakao' }, returnTo));
        },
      });
      return;
    }

    v1Post<V1AuthSessionResponse>('/auth/kakao', {
      code,
      redirectUri: getKakaoRedirectUri(),
    })
      .then((result) => {
        saveStoredV1Session(result.session);
        clearV1IdentityCache(queryClient);
        const nextRoute = result.next?.route ?? getSavedRedirectPath() ?? '/home';
        // next.route가 사회 가입 미완료 상태로 안내하면 신규 가입 진행 중, 그 외에는 기존 계정 로그인.
        // 가입 중에는 저장된 redirect 를 가입 마지막 화면이 쓰도록 남긴다.
        if (isSocialOnboardingRoute(nextRoute)) {
          trackEvent('sign_up_start', { method: 'kakao' });
        } else {
          clearSavedRedirectPath();
          trackEvent('login', { method: 'kakao' });
        }
        router.replace(nextRoute);
      })
      .catch((nextError) => {
        const reason = nextError instanceof V1ApiError ? nextError.code : 'unknown';
        trackEvent('login_failed', { method: 'kakao', reason });

        const recovery = routeSocialLoginRecovery(nextError, getSavedRedirectPath());
        if (recovery?.type === 'navigate') {
          router.replace(recovery.path);
          return;
        }
        if (recovery) {
          setError(recovery.message);
          return;
        }

        if (nextError instanceof V1ApiError) {
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

        setError(extractErrorMessage(nextError, '카카오 로그인에 실패했어요.'));
      });
  }, [linkKakao, queryClient, router, searchParams]);

  if (error) {
    return (
      <AuthFrame topTitle="카카오 로그인" backHref="/login" stage={AUTH_NOTICE_STAGE}>
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
    <AuthFrame stage={AUTH_WELCOME_STAGE}>
      <div className="tm-auth-body tm-auth-center">
        <h1 className="tm-text-heading tm-auth-heading">{linking ? '카카오 연결을 확인하고 있어요' : '카카오 로그인을 확인하고 있어요'}</h1>
        <p className="tm-text-body tm-auth-sub">잠시만 기다려 주세요.</p>
      </div>
    </AuthFrame>
  );
}
