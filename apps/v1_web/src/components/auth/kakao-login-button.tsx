'use client';

import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { V1ApiError, v1Post } from '@/lib/api-client';
import { trackEvent } from '@/lib/analytics';
import { LOGIN_METHOD_UNLINKED_CODE } from '@/lib/auth-error-codes';
import { extractErrorMessage } from '@/lib/error-message';
import { reportClientError } from '@/lib/client-error-reporter';
import { prepareKakaoAuthorize, resetKakaoAuthorizeAttempt, startKakaoAuthorize } from '@/lib/kakao-oauth';
import { isUnlinkedLoginError, unlinkedLoginMessage } from '@/lib/login-method';
import { isNativeKakaoSignInAvailable, KAKAO_WEB_HANDOFF_MESSAGE, NativeKakaoSignInError, requestNativeKakaoSignIn } from '@/lib/native-kakao';
import { clearV1IdentityCache } from '@/lib/query-keys';
import { clearSavedRedirectPath, getSavedRedirectPath, saveRedirectPath, saveStoredV1Session } from '@/lib/session-storage';
import type { V1AuthSessionResponse } from '@/types/api';
import { isSocialOnboardingRoute, KAKAO_LOGIN_LABEL } from './auth.view-model';
import { KakaoButtonFace } from './kakao-symbol';
import { routeSocialLoginRecovery } from './login-recovery-route';

const NATIVE_FAILURE_MESSAGE = '카카오 로그인에 실패했어요. 잠시 후 다시 시도해 주세요.';
// 카카오톡을 다녀와 결과가 없어도 이만큼 화면이 보이면 다시 누를 수 있다. 그 사이 도착하는 답이 먼저 처리될 틈이다.
const KAKAO_RETAP_LOCK_MS = 2_000;
const STORAGE_UNAVAILABLE_MESSAGE = '브라우저 설정으로 로그인을 진행할 수 없어요. 시크릿/프라이빗 모드를 끄고 다시 시도해 주세요.';

// 카카오 로그인 버튼(클라이언트). 누르면 CSRF 방지 state 를 저장(mode: 'login')한 뒤 경로를 고른다.
// 저장은 SSR 이 아닌 실제 브라우저에서 일어나야 kakao-callback-client.tsx 의 대조 검증이 성립한다(로그인 CSRF/세션 고정 방지).
//   1) 셸이 sign-in-with-kakao 를 광고하면 네이티브 SDK 토큰 → POST /auth/kakao/token
//      네이티브 단계가 실패하면(오류 응답·토큰 없음·무응답) 안내 한 줄과 함께 3) 으로 이어진다.
//      서버가 토큰을 거절한 경우는 이어 가지 않는다 — 같은 계정 판정이 웹 경로에서도 반복될 뿐이다.
//   2) 셸이 아니면 JS SDK 간편로그인(같은 redirectUri·scope·state → /callback/kakao).
//      모바일 브라우저에서는 마운트 때 SDK 와 state 를 미리 준비해, 탭 안에서 authorize 까지 끝낸다.
//   3) SDK/키를 쓸 수 없으면 경고 로그를 남기고 인가 주소로 이동한다.
//   capability 를 광고하지 않는 옛 셸은 톡 앱 핸드오프(커스텀 스킴)를 허용 목록이 막으므로 1·2 를 건너뛰고 3 만 쓴다.
export function KakaoLoginButton({
  href,
  label = KAKAO_LOGIN_LABEL,
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [webHandoff, setWebHandoff] = useState(false);
  // 시작한 시도가 끝나기 전에 다시 누르면 시도가 겹친다.
  const busyRef = useRef(false);
  // SDK 를 부른 뒤의 잠금은 시간으로 푼다. 카카오톡이 열리지 않거나 승인 없이 돌아와도 페이지는 그대로라 pageshow 가 없다.
  const retapArmedRef = useRef(false);
  const retapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRetapTimer = () => {
    if (retapTimerRef.current !== null) clearTimeout(retapTimerRef.current);
    retapTimerRef.current = null;
  };
  const startRetapTimer = () => {
    clearRetapTimer();
    retapTimerRef.current = setTimeout(() => {
      retapTimerRef.current = null;
      retapArmedRef.current = false;
      busyRef.current = false;
    }, KAKAO_RETAP_LOCK_MS);
  };
  const armRetapRelease = () => {
    retapArmedRef.current = true;
    if (document.visibilityState !== 'hidden') startRetapTimer();
  };

  useEffect(() => {
    void prepareKakaoAuthorize();
  }, []);

  // 뒤로가기(bfcache)로 돌아오면 이동 중이던 시도는 끝난 것이다.
  useEffect(() => {
    const release = (event: Event) => {
      clearRetapTimer();
      retapArmedRef.current = false;
      busyRef.current = false;
      setWebHandoff(false);
      if ((event as PageTransitionEvent).persisted) {
        resetKakaoAuthorizeAttempt();
        void prepareKakaoAuthorize();
      }
    };
    window.addEventListener('pageshow', release);
    return () => window.removeEventListener('pageshow', release);
  }, []);

  // 화면이 가려진 시간(카카오톡에 있는 동안)은 세지 않고, 다시 보이면 2초를 새로 센다.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!retapArmedRef.current) return;
      if (document.visibilityState === 'visible') startRetapTimer();
      else clearRetapTimer();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearRetapTimer();
    };
  }, []);

  const failNative = (reason: string, message: string) => {
    trackEvent('login_failed', { method: 'kakao', reason });
    setError(message);
  };

  const requestNativeToken = async (): Promise<
    | { status: 'token'; accessToken: string }
    | { status: 'cancelled' }
    | { status: 'failed'; reason: string; error?: unknown }
  > => {
    try {
      saveRedirectPath(new URLSearchParams(window.location.search).get('redirect'));
      const scopes = new URL(href).searchParams.get('scope')?.split(',').filter(Boolean) ?? [];
      const result = await requestNativeKakaoSignIn(scopes);
      if (result.cancelled) return { status: 'cancelled' };
      if (result.error || !result.accessToken) return { status: 'failed', reason: result.error ?? 'missing-token' };
      return { status: 'token', accessToken: result.accessToken };
    } catch (error) {
      return { status: 'failed', reason: error instanceof NativeKakaoSignInError ? error.reason : 'native-request-error', error };
    }
  };

  // 네이티브 단계가 끝내 토큰을 못 줬을 때 웹 인가 화면으로 넘어간다. 이동이 시작되면 busyRef 를 유지해 재탭이 새 시도를 만들지 않게 한다.
  const continueOnWeb = async (reason: string, cause?: unknown) => {
    reportClientError({
      message: 'Native Kakao sign-in failed',
      stack: cause instanceof Error ? cause.stack : undefined,
      level: 'warn',
      context: { reason, fallback: 'web_authorize' },
    });
    // 셸 안에서는 이동이 곧바로 시작되므로 안내를 저장 직후, 이동 전에 DOM 에 반영한다.
    const started = await startKakaoAuthorize({
      mode: 'login',
      returnTo: null,
      authorizeUrl: new URL(href),
      onCommitted: () => flushSync(() => setWebHandoff(true)),
    });
    if (started.status === 'unavailable') {
      busyRef.current = false;
      failNative('state_storage_unavailable', NATIVE_FAILURE_MESSAGE);
    }
  };

  const exchangeNativeToken = async (accessToken: string) => {
    try {
      const session = await v1Post<V1AuthSessionResponse>('/auth/kakao/token', { accessToken });
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
      if (isUnlinkedLoginError(err)) {
        failNative(LOGIN_METHOD_UNLINKED_CODE, unlinkedLoginMessage('kakao'));
        return;
      }
      if (err instanceof V1ApiError && err.code === 'PERMISSION_DENIED') {
        trackEvent('login_failed', { method: 'kakao', reason: err.code });
        router.replace('/auth/blocked');
        return;
      }
      const recovery = routeSocialLoginRecovery(err, getSavedRedirectPath());
      if (recovery) {
        trackEvent('login_failed', { method: 'kakao', reason: err instanceof V1ApiError ? err.code : 'unknown' });
        if (recovery.type === 'navigate') router.replace(recovery.path);
        else setError(recovery.message);
        return;
      }
      failNative(err instanceof V1ApiError ? err.code : 'unknown', extractErrorMessage(err, NATIVE_FAILURE_MESSAGE));
    } finally {
      busyRef.current = false;
    }
  };

  const signInNative = async () => {
    const native = await requestNativeToken();
    if (native.status === 'failed') {
      await continueOnWeb(native.reason, native.error);
      return;
    }
    if (native.status === 'cancelled') {
      busyRef.current = false;
      return;
    }
    await exchangeNativeToken(native.accessToken);
  };

  const signInOnWeb = async () => {
    const started = await startKakaoAuthorize({
      mode: 'login',
      returnTo: null,
      authorizeUrl: new URL(href),
      onCommitted: () => saveRedirectPath(new URLSearchParams(window.location.search).get('redirect')),
    });
    if (started.status === 'unavailable') {
      busyRef.current = false;
      // sessionStorage 사용 불가(프라이빗 모드/quota 초과) 시 CSRF 방지 state를 저장할 수 없어
      // 안전한 로그인이 불가능하다. 조용히 실패하지 않고 사용자에게 알린 뒤 중단한다(fail-closed).
      window.alert(STORAGE_UNAVAILABLE_MESSAGE);
      return;
    }
    trackEvent('login_start', { method: 'kakao', login_path: started.path, sdk_ready: started.sdkReady });
    if (started.path !== 'account_url') armRetapRelease();
  };

  const handleClick = () => {
    if (busyRef.current) return;
    setError(null);
    busyRef.current = true;
    if (isNativeKakaoSignInAvailable()) {
      trackEvent('login_start', { method: 'kakao', login_path: 'native' });
      void signInNative();
      return;
    }
    // 준비가 끝나 있으면 이 호출 안에서 authorize 까지 간다 — 앞에 await 를 두지 않는다.
    void signInOnWeb();
  };

  return (
    <>
      <button type="button" className={className} onClick={handleClick}>
        <KakaoButtonFace label={label} />
      </button>
      {error ? (
        <p className="tm-text-caption tm-auth-provider-note" role="alert">{error}</p>
      ) : webHandoff ? (
        <p className="tm-text-caption tm-auth-provider-note tm-auth-provider-status" role="status">{KAKAO_WEB_HANDOFF_MESSAGE}</p>
      ) : null}
    </>
  );
}
