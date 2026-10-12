'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { V1ApiError, v1Api, v1Post } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import { extractErrorMessage } from '@/lib/error-message';
import { reportClientError } from '@/lib/client-error-reporter';
import { getInitializedKakaoJsSdk } from '@/lib/kakao-js-sdk';
import { isNativeKakaoSignInAvailable, requestNativeKakaoSignIn } from '@/lib/native-kakao';
import { detectNativeShell } from '@/lib/native-bridge';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { clearSavedRedirectPath, getSavedRedirectPath, saveRedirectPath, saveStoredV1Session } from '@/lib/session-storage';
import type { V1AuthSessionResponse, V1PublicKakaoMapsKeyResponse } from '@/types/api';
import { generateKakaoOAuthState, isSocialOnboardingRoute, KAKAO_OAUTH_STATE_STORAGE_KEY } from './auth.view-model';

const NATIVE_FAILURE_MESSAGE = '카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.';
const SDK_PREFLIGHT_TIMEOUT_MS = 8_000;

// 카카오 로그인 버튼(클라이언트). 클릭 시점에 CSRF 방지 state를 생성·저장한 뒤 경로를 고른다.
// state 저장이 SSR 시점이 아닌 실제 브라우저에서 일어나야 kakao-callback-client.tsx의
// 대조 검증이 성립한다(로그인 CSRF/세션 고정 방지).
//   1) 셸이 sign-in-with-kakao 를 광고하면 네이티브 SDK 토큰 → POST /auth/kakao/token
//   2) 셸이 아니면 JS SDK 톡 로그인(같은 redirectUri·scope·state → /callback/kakao)
//   3) SDK/키를 쓸 수 없으면 기존 authorize URL 이동(경고 로그를 남기는 명시적 폴백)
//   capability 를 광고하지 않는 옛 셸은 톡 앱 핸드오프(커스텀 스킴)를 허용 목록이 막으므로 1·2 를 건너뛰고 3 만 쓴다.
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
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  // 키 요청·SDK 로드가 끝나기 전 재탭하면 state 가 덮어써져 콜백의 CSRF 대조가 깨진다.
  const busyRef = useRef(false);

  // 뒤로가기(bfcache)로 돌아오면 이동 중이던 시도는 끝난 것이다.
  useEffect(() => {
    const release = () => { busyRef.current = false; };
    window.addEventListener('pageshow', release);
    return () => window.removeEventListener('pageshow', release);
  }, []);

  const failNative = (reason: string, message: string) => {
    trackEvent('login_failed', { method: 'kakao', reason });
    setError(message);
  };

  const signInNative = async () => {
    try {
      saveRedirectPath(new URLSearchParams(window.location.search).get('redirect'));
      const scopes = new URL(href).searchParams.get('scope')?.split(',').filter(Boolean) ?? [];
      const result = await requestNativeKakaoSignIn(scopes);
      if (result.cancelled) return;
      if (result.error || !result.accessToken) {
        reportClientError({ message: 'Native Kakao sign-in failed', level: 'warn', context: { reason: result.error ?? 'missing-token' } });
        failNative(result.error ?? 'missing_token', NATIVE_FAILURE_MESSAGE);
        return;
      }
      const session = await v1Post<V1AuthSessionResponse>('/auth/kakao/token', { accessToken: result.accessToken });
      saveStoredV1Session(session.session);
      clearV1IdentityCache(queryClient);
      const route = session.next?.route ?? getSavedRedirectPath() ?? '/home';
      if (isSocialOnboardingRoute(route)) {
        trackEvent('sign_up_start', { method: 'kakao' });
      } else {
        clearSavedRedirectPath();
        trackEvent('login', { method: 'kakao' });
      }
      router.replace(route);
      router.refresh();
    } catch (err) {
      if (err instanceof V1ApiError && err.code === 'PERMISSION_DENIED') {
        trackEvent('login_failed', { method: 'kakao', reason: err.code });
        router.replace('/auth/blocked');
        return;
      }
      failNative(err instanceof V1ApiError ? err.code : 'unknown', extractErrorMessage(err, NATIVE_FAILURE_MESSAGE));
    } finally {
      busyRef.current = false;
    }
  };

  const navigateToAuthorizeUrl = (state: string) => {
    const separator = href.includes('?') ? '&' : '?';
    window.location.href = `${href}${separator}state=${encodeURIComponent(state)}`;
  };

  const signInWithJsSdk = async (state: string) => {
    const authorizeUrl = new URL(href);
    const redirectUri = authorizeUrl.searchParams.get('redirect_uri');
    const scope = authorizeUrl.searchParams.get('scope') ?? undefined;
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new Error('Kakao login SDK preparation timed out'));
      }, SDK_PREFLIGHT_TIMEOUT_MS);
    });
    try {
      if (!redirectUri) throw new Error('Kakao redirect_uri is missing from the authorize URL');
      const prepare = async () => {
        const { kakaoMapsJsKey } = await v1Api<V1PublicKakaoMapsKeyResponse>(
          '/public/integrations/kakao-maps-key', { method: 'GET', signal: controller.signal },
        );
        controller.signal.throwIfAborted();
        if (!kakaoMapsJsKey) throw new Error('Kakao JS key is not configured');
        return getInitializedKakaoJsSdk(kakaoMapsJsKey);
      };
      const sdk = await Promise.race([prepare(), deadline]);
      sdk.Auth.authorize({ redirectUri, state, ...(scope ? { scope } : {}), throughTalk: true });
    } catch (err) {
      reportClientError({
        message: 'Kakao JS SDK login unavailable, falling back to authorize URL',
        stack: err instanceof Error ? err.stack : undefined,
        level: 'warn',
        context: { reason: err instanceof Error ? err.message : String(err) },
      });
      navigateToAuthorizeUrl(state);
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (busyRef.current) return;
    setError(null);
    if (isNativeKakaoSignInAvailable()) {
      busyRef.current = true;
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
    busyRef.current = true;
    if (detectNativeShell()) {
      navigateToAuthorizeUrl(state);
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
        <p className="tm-text-caption tm-auth-provider-note tm-auth-provider-error" role="alert">{error}</p>
      ) : null}
    </>
  );
}
