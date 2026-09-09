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

  it('marks a sign-out revocation on the message and leaves the field off otherwise', async () => {
    const messages: Array<Record<string, unknown>> = [];
    window.TeameetNative = {
      postMessage: vi.fn((message) => {
        const request = JSON.parse(message) as { requestId: string };
        messages.push(request);
        window.dispatchEvent(new CustomEvent('teameet:native-push-result', {
          detail: { requestId: request.requestId, permission: 'granted', subscribed: false },
        }));
      }),
    };

    await requestNativePush('revoke-push-device', { reason: 'sign-out' });
    await requestNativePush('revoke-push-device');

    expect(messages[0]).toMatchObject({ type: 'revoke-push-device', reason: 'sign-out' });
    // Older shells parse the whole object; an absent key is the contract, not `reason: undefined`.
    expect(messages[1]).toEqual({ type: 'revoke-push-device', requestId: expect.any(String) });
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

  it('also waits for the user to return from Android notification settings', async () => {
    vi.useFakeTimers();
    window.TeameetNative = { postMessage: vi.fn() };
    let outcome = 'pending';
    void requestNativePush('open-notification-settings').then(
      () => { outcome = 'resolved'; },
      () => { outcome = 'rejected'; },
    );

    await vi.advanceTimersByTimeAsync(15_001);
    expect(outcome).toBe('pending');
    await vi.advanceTimersByTimeAsync(104_999);
    expect(outcome).toBe('rejected');
  });
});
