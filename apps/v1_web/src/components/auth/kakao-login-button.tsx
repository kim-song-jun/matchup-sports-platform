'use client';

import { useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { v1Get, v1Post } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { reportClientError } from '@/lib/client-error-reporter';
import { getInitializedKakaoJsSdk } from '@/lib/kakao-js-sdk';
import { isNativeKakaoSignInAvailable, requestNativeKakaoSignIn } from '@/lib/native-kakao';
import { clearSavedRedirectPath, getSavedRedirectPath, saveRedirectPath } from '@/lib/session-storage';
import type { V1AuthSessionResponse, V1PublicKakaoMapsKeyResponse } from '@/types/api';
import { generateKakaoOAuthState, isSocialOnboardingRoute, KAKAO_OAUTH_STATE_STORAGE_KEY } from './auth.view-model';

const NATIVE_FAILURE_MESSAGE = '카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.';

// 카카오 로그인 버튼(클라이언트). 클릭 시점에 CSRF 방지 state를 생성·저장한 뒤 경로를 고른다.
// state 저장이 SSR 시점이 아닌 실제 브라우저에서 일어나야 kakao-callback-client.tsx의
// 대조 검증이 성립한다(로그인 CSRF/세션 고정 방지).
//   1) 셸이 sign-in-with-kakao 를 광고하면 네이티브 SDK 토큰 → POST /auth/kakao/token
//   2) 아니면 JS SDK 톡 로그인(같은 redirectUri·scope·state → /callback/kakao)
//   3) SDK/키를 쓸 수 없으면 기존 authorize URL 이동(경고 로그를 남기는 명시적 폴백)
export function KakaoLoginButton({
  href,
  label,
  className,
  style,
}: {
  href: string;
  label: string;
  className?: string;
  style?: CSSProperties;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const signInNative = async () => {
    try {
      saveRedirectPath(new URLSearchParams(window.location.search).get('redirect'));
      const result = await requestNativeKakaoSignIn();
      if (result.cancelled) return;
      if (result.error || !result.accessToken) {
        reportClientError({ message: 'Native Kakao sign-in failed', level: 'warn', context: { reason: result.error ?? 'missing-token' } });
        setError(NATIVE_FAILURE_MESSAGE);
        return;
      }
      const session = await v1Post<V1AuthSessionResponse>('/auth/kakao/token', { accessToken: result.accessToken });
      const route = session.next?.route ?? getSavedRedirectPath() ?? '/home';
      if (!isSocialOnboardingRoute(route)) clearSavedRedirectPath();
      router.replace(route);
      router.refresh();
    } catch (err) {
      setError(extractErrorMessage(err, NATIVE_FAILURE_MESSAGE));
    }
  };

  const signInWithJsSdk = async (state: string) => {
    const authorizeUrl = new URL(href);
    const redirectUri = authorizeUrl.searchParams.get('redirect_uri');
    const scope = authorizeUrl.searchParams.get('scope') ?? undefined;
    try {
      if (!redirectUri) throw new Error('Kakao redirect_uri is missing from the authorize URL');
      const { kakaoMapsJsKey } = await v1Get<V1PublicKakaoMapsKeyResponse>('/public/integrations/kakao-maps-key');
      if (!kakaoMapsJsKey) throw new Error('Kakao JS key is not configured');
      const sdk = await getInitializedKakaoJsSdk(kakaoMapsJsKey);
      sdk.Auth.authorize({ redirectUri, state, ...(scope ? { scope } : {}), throughTalk: true });
    } catch (err) {
      reportClientError({
        message: 'Kakao JS SDK login unavailable, falling back to authorize URL',
        stack: err instanceof Error ? err.stack : undefined,
        level: 'warn',
        context: { reason: err instanceof Error ? err.message : String(err) },
      });
      const separator = href.includes('?') ? '&' : '?';
      window.location.href = `${href}${separator}state=${encodeURIComponent(state)}`;
    }
  };

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setError(null);
    if (isNativeKakaoSignInAvailable()) {
      void signInNative();
      return;
    }
    const state = generateKakaoOAuthState();
    try {
      window.sessionStorage.setItem(KAKAO_OAUTH_STATE_STORAGE_KEY, state);
      saveRedirectPath(new URLSearchParams(window.location.search).get('redirect'));
    } catch {
      // sessionStorage 사용 불가(프라이빗 모드/quota 초과) 시 CSRF 방지 state를 저장할 수 없어
      // 안전한 로그인이 불가능하다. 조용히 실패하지 않고 사용자에게 알린 뒤 중단한다(fail-closed).
      window.alert('브라우저 설정으로 로그인을 진행할 수 없어요. 시크릿/프라이빗 모드를 끄고 다시 시도해 주세요.');
      return;
    }
    void signInWithJsSdk(state);
  };

  return (
    <>
      <a className={className} href={href} style={style} onClick={handleClick}>
        {label}
      </a>
      {error ? (
        <p className="tm-text-caption tm-auth-provider-note" role="alert">{error}</p>
      ) : null}
    </>
  );
}
