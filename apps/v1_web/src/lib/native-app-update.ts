import { detectNativeShell } from './native-bridge';
import { randomUuid } from './uuid';

export const NATIVE_UPDATE_READY_EVENT = 'teameet:native-capabilities-ready';
const RESULT_EVENT = 'teameet:native-app-update-result';
const ACTION = 'check-app-update';
const TIMEOUT_MS = 12_000;

export interface NativeAppUpdateResult {
  requestId: string;
  platform: 'android' | 'ios';
  channel: 'production' | 'alpha';
  version: string;
  build: string;
  status: 'update-required' | 'up-to-date' | 'unavailable';
  availableVersion?: string;
  availableBuild?: number;
  error?: string;
}

export function canCheckNativeAppUpdate(): boolean {
  return typeof window !== 'undefined'
    && detectNativeShell() !== null
    && window.TeameetNative?.supports?.includes(ACTION) === true;
}

function parseResult(value: unknown, platform: NativeAppUpdateResult['platform']): NativeAppUpdateResult {
  if (!value || typeof value !== 'object') throw new Error('invalid-native-update-result');
  const result = value as Record<string, unknown>;
  if (result.platform !== platform
    || (result.channel !== 'production' && result.channel !== 'alpha')
    || !['update-required', 'up-to-date', 'unavailable'].includes(String(result.status))
    || typeof result.requestId !== 'string'
    || typeof result.version !== 'string'
    || !(result.channel === 'alpha' ? /^\d+(\.\d+){0,3}(-alpha)?$/ : /^\d+(\.\d+){0,3}$/).test(result.version)
    || typeof result.build !== 'string' || !/^\d+$/.test(result.build)
    || (result.availableVersion !== undefined && (typeof result.availableVersion !== 'string'
      || !/^\d+(\.\d+){0,3}$/.test(result.availableVersion)))
    || (result.availableBuild !== undefined && (!Number.isSafeInteger(result.availableBuild)
      || (result.availableBuild as number) < 1))
    || (result.error !== undefined && typeof result.error !== 'string')) {
    throw new Error('invalid-native-update-result');
  }
  return result as unknown as NativeAppUpdateResult;
}

/** Capability absence means an old/unsupported shell, never proof that it is current. */
export function requestNativeAppUpdate(signal: AbortSignal): Promise<NativeAppUpdateResult> {
  const platform = detectNativeShell();
  const bridge = typeof window === 'undefined' ? undefined : window.TeameetNative;
  if (!platform || !bridge || !canCheckNativeAppUpdate()) return Promise.reject(new Error('native-update-unsupported'));
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  const requestId = randomUuid();
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener(RESULT_EVENT, handleResult);
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const handleResult = (event: Event) => {
      const detail: unknown = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== 'object' || !('requestId' in detail) || detail.requestId !== requestId) return;
      cleanup();
      try { resolve(parseResult(detail, platform)); } catch (error) { reject(error); }
    };
    window.addEventListener(RESULT_EVENT, handleResult);
    signal.addEventListener('abort', abort, { once: true });
    timeout = setTimeout(() => { cleanup(); reject(new Error('native-update-timeout')); }, TIMEOUT_MS);
    try { bridge.postMessage(JSON.stringify({ type: ACTION, requestId })); } catch (error) { cleanup(); reject(error); }
  });
}
