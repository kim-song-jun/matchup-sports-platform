/**
 * Sign in with Apple, asked of the native shell.
 *
 * Apple's own sheet is the only way this works inside a `WKWebView`: the web redirect flow
 * is blocked in embedded browsers, so the shell puts up `ASAuthorizationController` and
 * hands back the identity token. That is why there is no browser fallback here — on the web
 * the button is simply not offered.
 *
 * Same shape as `native-push.ts` (post a JSON string, wait for a CustomEvent carrying the
 * same `requestId`) so the shell has one bridge to implement rather than two.
 */

export interface NativeAppleSignInResult {
  requestId: string;
  /** False when the reader cancelled the sheet or Apple refused — not an error to report. */
  ok: boolean;
  identityToken?: string;
  /** Apple sends this on the **first** authorization only, never again. */
  fullName?: string;
  /** Present when `ok` is false; for logs, not for the reader. */
  error?: string;
}

interface TeameetNativeBridge {
  postMessage(message: string): void;
}

declare global {
  interface Window {
    TeameetNative?: TeameetNativeBridge;
  }
}

const RESULT_EVENT = 'teameet:native-apple-result';
/** The reader has to read Apple's sheet, decide, and pass Face ID. Two minutes is not long. */
const RESPONSE_TIMEOUT_MS = 120_000;

export function isNativeAppleSignInAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.TeameetNative?.postMessage === 'function';
}

export function requestNativeAppleSignIn(nonce: string): Promise<NativeAppleSignInResult> {
  return new Promise((resolve, reject) => {
    const bridge = typeof window === 'undefined' ? undefined : window.TeameetNative;
    if (!bridge) {
      reject(new Error('Teameet native bridge is unavailable.'));
      return;
    }

    const requestId = globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      window.removeEventListener(RESULT_EVENT, handleResult as EventListener);
      clearTimeout(timeoutId);
    };
    const handleResult = (event: CustomEvent<NativeAppleSignInResult>) => {
      // A reply for someone else's request is ignored rather than resolving this one — the
      // whole point of echoing the id back.
      if (event.detail?.requestId !== requestId) return;
      cleanup();
      resolve(event.detail);
    };

    window.addEventListener(RESULT_EVENT, handleResult as EventListener);
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Teameet native Apple sign-in timed out.'));
    }, RESPONSE_TIMEOUT_MS);

    try {
      bridge.postMessage(JSON.stringify({ type: 'sign-in-with-apple', requestId, nonce }));
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
