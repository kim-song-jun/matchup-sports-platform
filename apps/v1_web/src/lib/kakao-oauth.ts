import {
  buildKakaoAuthUrl,
  generateKakaoOAuthState,
  KAKAO_OAUTH_STATE_STORAGE_KEY,
} from '@/components/auth/auth.view-model';
import { reportClientError } from './client-error-reporter';
import { getInitializedKakaoJsSdk } from './kakao-js-sdk';
import { detectNativeShell } from './native-bridge';
import { sanitizeRedirectPath } from './session-storage';

/**
 * 카카오 인가 한 번의 기록. 로그인과 계정 연결은 같은 redirect URI(`/callback/kakao`)로 돌아오므로
 * 콜백이 둘을 가르는 근거는 URL 이 아니라 인가를 시작할 때 이 탭에 저장해 둔 `mode` 뿐이다.
 */
export interface KakaoOAuthAttempt {
  /** kauth 가 그대로 돌려주는 CSRF 방지 값. */
  state: string;
  mode: 'login' | 'link';
  /** 연결을 마친 뒤 돌아갈 같은 origin 경로. 로그인은 `saveRedirectPath` 쪽 값을 쓰므로 보통 null. */
  returnTo: string | null;
}

export function serializeKakaoOAuthAttempt(attempt: KakaoOAuthAttempt): string {
  return JSON.stringify({
    state: attempt.state,
    mode: attempt.mode,
    returnTo: sanitizeRedirectPath(attempt.returnTo),
  });
}

/** 저장된 문자열을 읽는다. 알아볼 수 없는 값은 로그인으로 가정하지 않고 null 로 거절한다. */
export function parseKakaoOAuthAttempt(raw: string | null): KakaoOAuthAttempt | null {
  if (!raw) return null;
  // 로그인 버튼은 아직 state 문자열만 저장한다. JSON 객체는 항상 '{' 로 시작하므로 그 밖은 로그인 시도다.
  // JSON.parse 로 먼저 열면 숫자만 있는 state 가 숫자로 읽혀 버린다.
  if (!raw.startsWith('{')) return { state: raw, mode: 'login', returnTo: null };

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { state, mode, returnTo } = value as Record<string, unknown>;
  if (typeof state !== 'string' || state === '') return null;
  if (mode !== 'login' && mode !== 'link') return null;
  if (returnTo !== null && returnTo !== undefined && typeof returnTo !== 'string') return null;
  // 저장소 값도 신뢰하지 않는다 — 읽을 때 한 번 더 같은 origin 경로인지 거른다.
  return { state, mode, returnTo: sanitizeRedirectPath(returnTo) };
}

/** 저장소를 쓸 수 없으면(프라이빗 모드·quota) 던진다 — state 대조 없이 인가를 시작하면 안 된다. */
export function storeKakaoOAuthAttempt(attempt: KakaoOAuthAttempt): void {
  window.sessionStorage.setItem(KAKAO_OAUTH_STATE_STORAGE_KEY, serializeKakaoOAuthAttempt(attempt));
}

/**
 * 콜백에서 kauth 가 돌려준 state 를 저장해 둔 시도와 대조한다. 일치하면 그 시도를, 아니면 null.
 * 저장값은 일치 여부와 상관없이 한 번 읽으면 지운다(재사용 불가). 스토리지가 막힌 환경에서는 던지지 않고 null 이다.
 */
export function consumeKakaoOAuthAttempt(returnedState: string | null): KakaoOAuthAttempt | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY);
    window.sessionStorage.removeItem(KAKAO_OAUTH_STATE_STORAGE_KEY);
  } catch {
    return null;
  }
  const attempt = parseKakaoOAuthAttempt(raw);
  return attempt && returnedState && attempt.state === returnedState ? attempt : null;
}

export type KakaoLinkStartResult =
  | { status: 'redirecting' }
  | { status: 'unavailable'; reason: 'not-configured' | 'storage-unavailable' };

const SDK_PREFLIGHT_TIMEOUT_MS = 8_000;

function navigateToAuthorizeUrl(authorizeUrl: URL, state: string) {
  const target = new URL(authorizeUrl);
  target.searchParams.set('state', state);
  window.location.href = target.toString();
}

async function authorizeWithJsSdk(authorizeUrl: URL, state: string) {
  const redirectUri = authorizeUrl.searchParams.get('redirect_uri');
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Kakao login SDK preparation timed out')), SDK_PREFLIGHT_TIMEOUT_MS);
  });
  try {
    if (!redirectUri) throw new Error('Kakao redirect_uri is missing from the authorize URL');
    // 로그인 앱의 REST 키와 짝인 JS 키를 쓴다(지도용 키와 앱이 다를 수 있다).
    const loginJsKey = process.env.NEXT_PUBLIC_KAKAO_LOGIN_JS_KEY;
    if (!loginJsKey) throw new Error('Kakao login JS key is not configured');
    const sdk = await Promise.race([getInitializedKakaoJsSdk(loginJsKey), deadline]);
    sdk.Auth.authorize({ redirectUri, state, throughTalk: true });
  } catch (error) {
    reportClientError({
      message: 'Kakao JS SDK link unavailable, falling back to authorize URL',
      stack: error instanceof Error ? error.stack : undefined,
      level: 'warn',
      context: { reason: error instanceof Error ? error.message : String(error) },
    });
    navigateToAuthorizeUrl(authorizeUrl, state);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 로그인한 계정에 카카오를 붙이려고 카카오 인가를 연결 모드로 시작한다(웹·옛 셸용 —
 * 네이티브 SDK 토큰을 받을 수 있는 셸은 `requestNativeKakaoLinkPayload` 를 쓴다).
 *
 * 로그인과 같은 redirect URI 로 돌아오므로 콜백은 `consumeKakaoOAuthAttempt` 의 `mode` 로 연결을 가른다.
 * 정체성 확인만 필요해 로그인 때 요청하는 추가 동의항목(scope)은 붙이지 않는다.
 * 호출한 쪽은 중복 탭을 막아야 한다 — 두 번 시작하면 먼저 저장한 state 가 덮어써진다.
 */
export async function startKakaoLinkAuthorize(options: { returnTo: string | null }): Promise<KakaoLinkStartResult> {
  const href = buildKakaoAuthUrl();
  if (!href) return { status: 'unavailable', reason: 'not-configured' };

  const authorizeUrl = new URL(href);
  authorizeUrl.searchParams.delete('scope');

  const state = generateKakaoOAuthState();
  try {
    storeKakaoOAuthAttempt({ state, mode: 'link', returnTo: options.returnTo });
  } catch {
    return { status: 'unavailable', reason: 'storage-unavailable' };
  }

  if (detectNativeShell()) navigateToAuthorizeUrl(authorizeUrl, state);
  else await authorizeWithJsSdk(authorizeUrl, state);
  return { status: 'redirecting' };
}
