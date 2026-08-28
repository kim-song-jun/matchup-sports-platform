export type NativePushAction =
  | 'get-push-state'
  | 'request-notification-permission'
  | 'revoke-push-device';

export interface NativePushResult {
  requestId: string;
  permission: NotificationPermission;
  subscribed: boolean;
}

interface TeameetNativeBridge {
  postMessage(message: string): void;
}

declare global {
  interface Window {
    TeameetNative?: TeameetNativeBridge;
  }
}

const RESULT_EVENT = 'teameet:native-push-result';
const RESPONSE_TIMEOUT_MS = 15_000;
const PERMISSION_RESPONSE_TIMEOUT_MS = 120_000;

export function isNativePushAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.TeameetNative?.postMessage === 'function';
}

export function requestNativePush(action: NativePushAction): Promise<NativePushResult> {
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
    }, action === 'request-notification-permission'
      ? PERMISSION_RESPONSE_TIMEOUT_MS
      : RESPONSE_TIMEOUT_MS);

    try {
      bridge.postMessage(JSON.stringify({ type: action, requestId }));
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
