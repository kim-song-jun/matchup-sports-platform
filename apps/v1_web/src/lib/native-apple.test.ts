import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractErrorMessage } from './error-message';
import { NativeAppleSignInError, isNativeAppleSignInAvailable, requestNativeAppleSignIn } from './native-apple';

afterEach(() => {
  delete window.TeameetNative;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('native Apple sign-in bridge', () => {
  it('is unavailable in a plain browser', () => {
    expect(isNativeAppleSignInAvailable()).toBe(false);
  });

  // The Android shell installs a global with this exact name through
  // `addWebMessageListener`, and it answers push actions only. Reading the name alone put an
  // Apple button in the Android app that hung for two minutes when tapped.
  it('is unavailable in a shell that does not advertise the action', () => {
    window.TeameetNative = { postMessage: vi.fn() };
    expect(isNativeAppleSignInAvailable()).toBe(false);
  });

  it('is unavailable in a shell that advertises other actions but not this one', () => {
    window.TeameetNative = { postMessage: vi.fn(), supports: ['get-push-state', 'revoke-push-device'] };
    expect(isNativeAppleSignInAvailable()).toBe(false);
  });

  it('is available once the shell advertises the action', () => {
    window.TeameetNative = { postMessage: vi.fn(), supports: ['get-push-state', 'sign-in-with-apple'] };
    expect(isNativeAppleSignInAvailable()).toBe(true);
  });

  it('carries the nonce to the shell and correlates the reply with the request', async () => {
    window.TeameetNative = {
      supports: ['sign-in-with-apple'],
      postMessage: vi.fn((message) => {
        const request = JSON.parse(message) as { requestId: string; type: string; nonce: string };
        expect(request.type).toBe('sign-in-with-apple');
        expect(request.nonce).toBe('server-issued-nonce');
        // A reply for a different request must not resolve this one.
        window.dispatchEvent(new CustomEvent('teameet:native-apple-result', {
          detail: { requestId: 'someone-else', ok: true, identityToken: 'wrong.token' },
        }));
        window.dispatchEvent(new CustomEvent('teameet:native-apple-result', {
          detail: { requestId: request.requestId, ok: true, identityToken: 'right.token', fullName: '김선준' },
        }));
      }),
    };

    await expect(requestNativeAppleSignIn('server-issued-nonce')).resolves.toMatchObject({
      ok: true,
      identityToken: 'right.token',
      fullName: '김선준',
    });
  });

  it('fails explicitly when there is no bridge at all', async () => {
    await expect(requestNativeAppleSignIn('nonce')).rejects.toMatchObject({
      name: 'NativeAppleSignInError',
      reason: 'bridge-unavailable',
    });
  });

  // `extractErrorMessage` prefers `err.message`, so anything written there is what the reader
  // sees. These errors carry their reason as a field and leave the message empty, so the
  // login screen's own Korean wording wins.
  it('keeps its internal reason out of the message the reader would be shown', () => {
    const shown = extractErrorMessage(new NativeAppleSignInError('timeout'), '다시 시도해 주세요.');
    expect(shown).toBe('다시 시도해 주세요.');
  });
});
