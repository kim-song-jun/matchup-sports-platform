import {
  buildKakaoAuthUrl,
  generateKakaoOAuthState,
  KAKAO_OAUTH_STATE_STORAGE_KEY,
} from '@/components/auth/auth.view-model';
import { reportClientError } from './client-error-reporter';
import { getInitializedKakaoJsSdk, getReadyKakaoJsSdk } from './kakao-js-sdk';
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

async function fingerprintState(state: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Encode a non-secret SHA-256 verifier and redirect metadata; never persist the nonce.
 * Every storage write goes through here. Keep `encode` in the name: CodeQL's clear-text-storage
 * query only treats encode/protect/encrypt calls as a barrier.
 */
function encodeKakaoStateVerifierRecord(fingerprint: string, mode: KakaoOAuthAttempt['mode'], returnTo: string | null): string {
  return JSON.stringify({ state: fingerprint, mode, returnTo: sanitizeRedirectPath(returnTo) });
}

/** Same record for a caller that only holds the raw state. */
export async function encodeKakaoStateVerifier(attempt: KakaoOAuthAttempt): Promise<string> {
  return encodeKakaoStateVerifierRecord(await fingerprintState(attempt.state), attempt.mode, attempt.returnTo);
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

/**
 * 콜백에서 kauth 가 돌려준 state 를 저장해 둔 시도와 대조한다. 일치하면 그 시도를, 아니면 null.
 * 저장값은 일치 여부와 상관없이 한 번 읽으면 지운다(재사용 불가). 스토리지가 막힌 환경에서는 던지지 않고 null 이다.
 */
export async function consumeKakaoOAuthAttempt(returnedState: string | null): Promise<KakaoOAuthAttempt | null> {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY);
    window.sessionStorage.removeItem(KAKAO_OAUTH_STATE_STORAGE_KEY);
  } catch {
    return null;
  }
  const attempt = parseKakaoOAuthAttempt(raw);
  if (!attempt || !returnedState) return null;
  try {
    // Accept an in-flight redirect started before deployment; new attempts are always hashed.
    const verifier = attempt.state.startsWith('sha256:') ? await fingerprintState(returnedState) : returnedState;
    return attempt.state === verifier ? { ...attempt, state: returnedState } : null;
  } catch {
    return null;
  }
}

export type KakaoLinkStartResult =
  | { status: 'redirecting' }
  | { status: 'unavailable'; reason: 'not-configured' | 'storage-unavailable' };

/** talk: 카카오톡으로 넘어가는 간편로그인, sdk_account: SDK 가 여는 카카오계정 화면, account_url: 인가 주소로 직접 이동. */
export type KakaoAuthorizePath = 'talk' | 'sdk_account' | 'account_url';

export type KakaoAuthorizeStart =
  | { status: 'redirecting'; path: KakaoAuthorizePath; sdkReady: boolean }
  | { status: 'unavailable'; reason: 'storage-unavailable' };

interface KakaoStatePair {
  state: string;
  fingerprint: string;
}

const SDK_PREFLIGHT_TIMEOUT_MS = 8_000;
const IOS_USER_AGENT = /(iphone|ipad|ipod)[\s\S]*os ([\w._-]+) like/;
const ANDROID_META_IN_APP = /instagram|fb_iab|fbios|barcelona/;

let preparedState: KakaoStatePair | null = null;
let preparing: Promise<void> | null = null;
// reset 마다 올린다. 준비가 시작할 때 값을 잡아 두었다가 달라졌으면 결과를 버린다.
let generation = 0;
// 이 문서가 저장 칸에 넣은 시도. SDK 는 톡 길로 다시 부를 때만 앞 확인을 멈추므로, 이미 나간 확인 요청의 답이
// 옛 state 로 콜백에 올 수 있다. 같은 시도를 다시 시작하면 그 state 를 이어 써서 늦은 답이 거절되지 않게 한다.
let liveAttempt: (KakaoStatePair & { mode: KakaoOAuthAttempt['mode']; returnTo: string | null }) | null = null;

/** 기억한 시도와 예비 state, 진행 중인 준비를 버린다. 뒤로가기 복원처럼 이전 시도가 끝난 뒤에 부른다. */
export function resetKakaoAuthorizeAttempt(): void {
  liveAttempt = null;
  preparedState = null;
  preparing = null;
  generation += 1;
}

/** SDK 2.8.3 의 isSupportEasyLogin·checkOs 와 같은 판정이다. SDK 버전을 올릴 때 다시 대조한다. */
export function supportsKakaoTalkEasyLogin(userAgent: string, maxTouchPoints: number): boolean {
  const ua = userAgent.toLowerCase();
  const ios = IOS_USER_AGENT.test(ua) || (maxTouchPoints > 1 && ua.includes('mac os x'));
  const android = !ios && !ua.includes('windows') && ua.includes('android');
  if (!ios && !android) return false;
  if (ua.includes('kakaotalk')) return false;
  return !(android && ANDROID_META_IN_APP.test(ua));
}

function preparationJsKey(): string | null {
  if (typeof window === 'undefined' || detectNativeShell() !== null) return null;
  const jsKey = process.env.NEXT_PUBLIC_KAKAO_LOGIN_JS_KEY;
  if (!jsKey || !buildKakaoAuthUrl()) return null;
  return supportsKakaoTalkEasyLogin(window.navigator.userAgent, window.navigator.maxTouchPoints) ? jsKey : null;
}

async function prepareState(runGeneration: number): Promise<void> {
  if (preparedState) return;
  try {
    const state = generateKakaoOAuthState();
    const pair = { state, fingerprint: await fingerprintState(state) };
    if (runGeneration === generation) preparedState = pair;
  } catch {
    // 탭에서 다시 만들고, 그때의 실패를 알린다.
  }
}

async function prepareSdk(jsKey: string): Promise<void> {
  if (getReadyKakaoJsSdk()) return;
  try {
    await getInitializedKakaoJsSdk(jsKey);
  } catch {
    // 탭에서 다시 싣고, 그때의 실패를 알린다. 화면을 열기만 한 방문마다 오류를 쌓지 않는다.
  }
}

/**
 * 카카오톡으로 넘어갈 수 있는 모바일 브라우저에서만 SDK 와 state 를 탭 전에 준비한다.
 * 저장소는 건드리지 않고 거절하지 않으며, 여러 번 불러도 준비는 한 번이다.
 */
export function prepareKakaoAuthorize(): Promise<void> {
  const jsKey = preparationJsKey();
  if (!jsKey) return Promise.resolve();
  if (preparing) return preparing;
  const runGeneration = generation;
  preparing = (async () => {
    try {
      await Promise.all([prepareSdk(jsKey), prepareState(runGeneration)]);
    } finally {
      if (runGeneration === generation) preparing = null;
    }
  })();
  return preparing;
}

function takeState(mode: KakaoOAuthAttempt['mode'], returnTo: string | null): KakaoStatePair | null {
  if (liveAttempt && liveAttempt.mode === mode && liveAttempt.returnTo === returnTo) return liveAttempt;
  const taken = preparedState;
  preparedState = null;
  return taken;
}

function navigateToAuthorizeUrl(authorizeUrl: URL, state: string) {
  const target = new URL(authorizeUrl);
  target.searchParams.set('state', state);
  window.location.href = target.toString();
}

async function loadSdkWithDeadline() {
  // 로그인 앱의 REST 키와 짝인 JS 키를 쓴다(지도용 키와 앱이 다를 수 있다).
  const jsKey = process.env.NEXT_PUBLIC_KAKAO_LOGIN_JS_KEY;
  if (!jsKey) throw new Error('Kakao login JS key is not configured');
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Kakao login SDK preparation timed out')), SDK_PREFLIGHT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([getInitializedKakaoJsSdk(jsKey), deadline]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 카카오 인가를 시작한다. 로그인과 계정 연결이 함께 쓴다.
 *
 * state 와 SDK 가 준비돼 있으면 첫 `await` 전에 저장과 `authorize()` 호출까지 끝낸다 — 사용자 탭 안에서
 * 카카오톡으로 넘어가는 호출이어야 브라우저가 막지 않는다. 준비가 안 됐으면 저장 → SDK 싣기(8초까지) →
 * `authorize()` 순서이고, 실패하면 경고를 남기고 인가 주소로 이동한다.
 * 저장소를 쓸 수 없으면 state 대조 없이 인가를 시작하면 안 되므로 `storage-unavailable` 로 멈춘다.
 */
export async function startKakaoAuthorize(options: {
  mode: KakaoOAuthAttempt['mode'];
  returnTo: string | null;
  authorizeUrl: URL;
  onCommitted?: () => void;
}): Promise<KakaoAuthorizeStart> {
  const { mode, authorizeUrl, onCommitted } = options;
  const returnTo = sanitizeRedirectPath(options.returnTo);
  const inShell = detectNativeShell() !== null;
  const readySdk = inShell ? null : getReadyKakaoJsSdk();

  let pair = takeState(mode, returnTo);
  try {
    if (!pair) {
      const state = generateKakaoOAuthState();
      pair = { state, fingerprint: await fingerprintState(state) };
    }
    // 저장소에는 원래 state 가 아니라 지문만 둔다.
    window.sessionStorage.setItem(KAKAO_OAUTH_STATE_STORAGE_KEY, encodeKakaoStateVerifierRecord(pair.fingerprint, mode, returnTo));
    liveAttempt = { ...pair, mode, returnTo };
    onCommitted?.();
  } catch {
    // 예비 state 는 아직 쓰이지 않았으므로 저장소가 돌아오면 같은 탭 안에서 쓸 수 있게 돌려놓는다.
    if (pair) preparedState ??= pair;
    return { status: 'unavailable', reason: 'storage-unavailable' };
  }
  const { state } = pair;

  if (inShell) {
    navigateToAuthorizeUrl(authorizeUrl, state);
    return { status: 'redirecting', path: 'account_url', sdkReady: false };
  }

  const sdkReady = readySdk !== null;
  try {
    const redirectUri = authorizeUrl.searchParams.get('redirect_uri');
    if (!redirectUri) throw new Error('Kakao redirect_uri is missing from the authorize URL');
    const scope = authorizeUrl.searchParams.get('scope');
    const sdk = readySdk ?? (await loadSdkWithDeadline());
    sdk.Auth.authorize({ redirectUri, state, ...(scope ? { scope } : {}), throughTalk: true });
    const path = supportsKakaoTalkEasyLogin(window.navigator.userAgent, window.navigator.maxTouchPoints) ? 'talk' : 'sdk_account';
    return { status: 'redirecting', path, sdkReady };
  } catch (error) {
    reportClientError({
      message: `Kakao JS SDK ${mode} unavailable, falling back to authorize URL`,
      stack: error instanceof Error ? error.stack : undefined,
      level: 'warn',
      context: { reason: error instanceof Error ? error.message : String(error) },
    });
    navigateToAuthorizeUrl(authorizeUrl, state);
    return { status: 'redirecting', path: 'account_url', sdkReady };
  }
}

/**
 * 로그인한 계정에 카카오를 붙이려고 카카오 인가를 연결 모드로 시작한다(웹·옛 셸용 —
 * 네이티브 SDK 토큰을 받을 수 있는 셸은 `requestNativeKakaoLinkPayload` 를 쓴다).
 *
 * 로그인과 같은 redirect URI 로 돌아오므로 콜백은 `consumeKakaoOAuthAttempt` 의 `mode` 로 연결을 가른다.
 * 정체성 확인만 필요해 로그인 때 요청하는 추가 동의항목(scope)은 붙이지 않는다.
 */
export async function startKakaoLinkAuthorize(options: { returnTo: string | null }): Promise<KakaoLinkStartResult> {
  const href = buildKakaoAuthUrl();
  if (!href) return { status: 'unavailable', reason: 'not-configured' };

  const authorizeUrl = new URL(href);
  authorizeUrl.searchParams.delete('scope');

  const started = await startKakaoAuthorize({ mode: 'link', returnTo: options.returnTo, authorizeUrl });
  return started.status === 'unavailable' ? started : { status: 'redirecting' };
}
