import './native-bridge';

export type NativePushAction =
  | 'get-push-state'
  | 'request-notification-permission'
  | 'open-notification-settings'
  | 'revoke-push-device';

/**
 * Why `revoke-push-device` is being sent. The logout button says `'sign-out'`: the shell
 * then drops only the server registration and keeps the reader's in-app opt-in, so the next
 * account to sign in on that device is registered without being asked again. The settings
 * switch sends none, which every shell reads as the reader turning push off. Shells that
 * predate the field ignore it.
 */
export type NativePushRevokeReason = 'sign-out';

export interface NativePushRequestOptions {
  reason?: NativePushRevokeReason;
}

export interface NativePushResult {
  requestId: string;
  permission: NotificationPermission;
  subscribed: boolean;
  errorCode?: 'registration-failed' | 'revocation-failed';
}

const RESULT_EVENT = 'teameet:native-push-result';
const RESPONSE_TIMEOUT_MS = 15_000;
const PERMISSION_RESPONSE_TIMEOUT_MS = 120_000;

export function isNativePushAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.TeameetNative?.postMessage === 'function';
}

export function requestNativePush(
  action: NativePushAction,
  options: NativePushRequestOptions = {},
): Promise<NativePushResult> {
  return new Promise((resolve, reject) => {
    const bridge = window.TeameetNative;
    if (!bridge) {
      reject(new Error('Teameet native push bridge is unavailable.'));
      return;
    }

    const requestId = globalThis.crypto?.randomUUID?.()
      ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      window.removeEventListener(RESULT_EVENT, handleResult as EventListener);
      clearTimeout(timeoutId);
    };
    const handleResult = (event: CustomEvent<NativePushResult>) => {
      if (event.detail?.requestId !== requestId) return;
      cleanup();
      resolve(event.detail);
    };

    window.addEventListener(RESULT_EVENT, handleResult as EventListener);
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Teameet native push request timed out.'));
    }, action === 'request-notification-permission' || action === 'open-notification-settings'
      ? PERMISSION_RESPONSE_TIMEOUT_MS
      : RESPONSE_TIMEOUT_MS);

    try {
      bridge.postMessage(JSON.stringify({
        type: action,
        requestId,
        ...(options.reason ? { reason: options.reason } : {}),
      }));
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
