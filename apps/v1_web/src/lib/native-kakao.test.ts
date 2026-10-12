import { afterEach, describe, expect, it, vi } from 'vitest';
import { NativeKakaoSignInError, isNativeKakaoSignInAvailable, requestNativeKakaoSignIn } from './native-kakao';

afterEach(() => {
  delete window.TeameetNative;
  vi.useRealTimers();
});

function installShell(reply: (requestId: string) => Record<string, unknown> | null) {
  window.TeameetNative = {
    supports: ['sign-in-with-kakao'],
    postMessage: vi.fn((message: string) => {
      const request = JSON.parse(message) as { requestId: string; type: string };
      expect(request.type).toBe('sign-in-with-kakao');
      const detail = reply(request.requestId);
      if (detail) window.dispatchEvent(new CustomEvent('teameet:native-kakao-result', { detail }));
    }),
  };
}

describe('native Kakao sign-in bridge', () => {
  it('is unavailable in a plain browser and in shells that do not advertise the action', () => {
    expect(isNativeKakaoSignInAvailable()).toBe(false);
    window.TeameetNative = { postMessage: vi.fn() };
    expect(isNativeKakaoSignInAvailable()).toBe(false);
    window.TeameetNative = { postMessage: vi.fn(), supports: ['sign-in-with-apple'] };
    expect(isNativeKakaoSignInAvailable()).toBe(false);
  });

  it('is available once the shell advertises the action', () => {
    window.TeameetNative = { postMessage: vi.fn(), supports: ['sign-in-with-kakao'] };
    expect(isNativeKakaoSignInAvailable()).toBe(true);
  });

  it('resolves with the token from the reply that carries the same requestId', async () => {
    installShell((requestId) => ({ requestId, accessToken: 'kakao-access-token' }));
    await expect(requestNativeKakaoSignIn()).resolves.toMatchObject({ accessToken: 'kakao-access-token' });
  });

  it('ignores a reply meant for another request', async () => {
    vi.useFakeTimers();
    installShell(() => ({ requestId: 'someone-else', accessToken: 'stolen' }));
    const pending = requestNativeKakaoSignIn();
    const outcome = expect(pending).rejects.toBeInstanceOf(NativeKakaoSignInError);
    await vi.advanceTimersByTimeAsync(120_000);
    await outcome;
  });

  it('passes cancellation and shell errors through untouched', async () => {
    installShell((requestId) => ({ requestId, cancelled: true }));
    await expect(requestNativeKakaoSignIn()).resolves.toMatchObject({ cancelled: true });
    installShell((requestId) => ({ requestId, error: 'KOE101' }));
    await expect(requestNativeKakaoSignIn()).resolves.toMatchObject({ error: 'KOE101' });
  });

  it('times out after 120 seconds with an empty message', async () => {
    vi.useFakeTimers();
    installShell(() => null);
    const pending = requestNativeKakaoSignIn();
    const outcome = expect(pending).rejects.toMatchObject({ reason: 'timeout', message: '' });
    await vi.advanceTimersByTimeAsync(119_999);
    await vi.advanceTimersByTimeAsync(1);
    await outcome;
  });

  it('rejects when there is no bridge', async () => {
    await expect(requestNativeKakaoSignIn()).rejects.toMatchObject({ reason: 'bridge-unavailable' });
  });
});
