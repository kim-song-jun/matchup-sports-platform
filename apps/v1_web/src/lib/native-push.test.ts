import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNativePushAvailable, requestNativePush } from './native-push';

afterEach(() => {
  delete window.TeameetNative;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('native push bridge', () => {
  it('correlates the native response with the originating request', async () => {
    window.TeameetNative = {
      postMessage: vi.fn((message) => {
        const request = JSON.parse(message) as { requestId: string; type: string };
        window.dispatchEvent(new CustomEvent('teameet:native-push-result', {
          detail: { requestId: 'another-request', permission: 'denied', subscribed: false },
        }));
        window.dispatchEvent(new CustomEvent('teameet:native-push-result', {
          detail: { requestId: request.requestId, permission: 'granted', subscribed: true },
        }));
      }),
    };

    await expect(requestNativePush('request-notification-permission')).resolves.toMatchObject({
      permission: 'granted',
      subscribed: true,
    });
    expect(isNativePushAvailable()).toBe(true);
  });

  it('fails explicitly when the native bridge is unavailable', async () => {
    await expect(requestNativePush('get-push-state')).rejects.toThrow('unavailable');
  });

  it('does not time out while the Android permission dialog is still reasonably actionable', async () => {
    vi.useFakeTimers();
    window.TeameetNative = { postMessage: vi.fn() };
    let outcome = 'pending';
    void requestNativePush('request-notification-permission').then(
      () => { outcome = 'resolved'; },
      () => { outcome = 'rejected'; },
    );

    await vi.advanceTimersByTimeAsync(15_001);
    expect(outcome).toBe('pending');
    await vi.advanceTimersByTimeAsync(104_999);
    expect(outcome).toBe('rejected');
  });
});
