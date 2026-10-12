/**
 * Kakao login, asked of the native shell.
 *
 * Same bridge shape as `native-apple.ts`: post a JSON string, wait for a CustomEvent carrying
 * the same `requestId`. The shell returns a Kakao access token; the server verifies it
 * against our Kakao app before trusting it, so no nonce travels over the bridge.
 */

import './native-bridge';

export interface NativeKakaoSignInResult {
  requestId: string;
  accessToken?: string;
  /** The reader dismissed the login — not an error to report. */
  cancelled?: boolean;
  /** Present when the SDK failed; for logs, not for the reader. */
  error?: string;
}

const RESULT_EVENT = 'teameet:native-kakao-result';
/** Kakao Talk hand-off and consent screens take a while; two minutes matches Apple. */
const RESPONSE_TIMEOUT_MS = 120_000;

/** The action name in the shared bridge contract; also what the shell lists in `supports`. */
const KAKAO_ACTION = 'sign-in-with-kakao';

/** `message` stays empty so an English reason never reaches the Korean alert (see `NativeAppleSignInError`). */
export class NativeKakaoSignInError extends Error {
  constructor(readonly reason: 'bridge-unavailable' | 'timeout') {
    super();
    this.name = 'NativeKakaoSignInError';
  }
}

export function isNativeKakaoSignInAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = window.TeameetNative;
  if (typeof bridge?.postMessage !== 'function') return false;
  return Array.isArray(bridge.supports) && bridge.supports.includes(KAKAO_ACTION);
}

export function requestNativeKakaoSignIn(scopes: readonly string[] = []): Promise<NativeKakaoSignInResult> {
  return new Promise((resolve, reject) => {
    const bridge = typeof window === 'undefined' ? undefined : window.TeameetNative;
    if (!bridge) {
      reject(new NativeKakaoSignInError('bridge-unavailable'));
      return;
    }

    const requestId = globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      window.removeEventListener(RESULT_EVENT, handleResult as EventListener);
      clearTimeout(timeoutId);
    };
    const handleResult = (event: CustomEvent<NativeKakaoSignInResult>) => {
      if (event.detail?.requestId !== requestId) return;
      cleanup();
      resolve(event.detail);
    };

    window.addEventListener(RESULT_EVENT, handleResult as EventListener);
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new NativeKakaoSignInError('timeout'));
    }, RESPONSE_TIMEOUT_MS);

    try {
      bridge.postMessage(JSON.stringify({ type: KAKAO_ACTION, requestId, ...(scopes.length ? { scopes } : {}) }));
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
