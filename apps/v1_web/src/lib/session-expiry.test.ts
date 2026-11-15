import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from './api-client';
import { clearStoredV1SessionAfterAuthLoss } from './session-expiry';
import { clearStoredV1Session, hasStoredV1Session, saveStoredV1Session, V1_SESSION_HINT_KEY } from './session-storage';

// What gtag.js will replay once it loads: the `session_expired` events with their parameters.
function sessionExpiredEvents(): unknown[][] {
  return (window.dataLayer ?? [])
    .map((entry) => Array.from(entry as ArrayLike<unknown>))
    .filter((command) => command[0] === 'event' && command[1] === 'session_expired');
}

function apiError(statusCode: number, code: string) {
  return new V1ApiError({ status: 'error', statusCode, code, message: code, timestamp: '2026-11-15T00:00:00.000Z' });
}

const UNAUTHENTICATED = apiError(401, 'UNAUTHENTICATED');

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_GA_MEASUREMENT_ID', 'G-TEST123');
  // analytics installs the gtag stub once per module and pushes to whatever `window.dataLayer` is
  // at call time, so each test starts a fresh queue instead of resetting modules (which would give
  // the helper a V1ApiError class different from the one the errors below are built from).
  window.dataLayer = [];
  window.localStorage.clear();
});

afterEach(() => {
  delete (window as { TeameetNative?: unknown }).TeameetNative;
  delete (window as { webkit?: unknown }).webkit;
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe('clearStoredV1SessionAfterAuthLoss', () => {
  // Production keeps only the hint key; the other environments keep the user id. Both must count.
  it.each(['production', 'test'])('counts one expiry and clears the hint when it was on and the answer was 401 (%s)', (nodeEnv) => {
    vi.stubEnv('NODE_ENV', nodeEnv);
    saveStoredV1Session({ userId: 'user-1' });
    expect(hasStoredV1Session()).toBe(true);

    clearStoredV1SessionAfterAuthLoss('require_auth', UNAUTHENTICATED);

    expect(sessionExpiredEvents()).toEqual([['event', 'session_expired', { gate: 'require_auth', app_shell: 'web' }]]);
    expect(hasStoredV1Session()).toBe(false);
    expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
  });

  it('names the entry gate when that gate noticed the expiry', () => {
    saveStoredV1Session({ userId: 'user-1' });

    clearStoredV1SessionAfterAuthLoss('entry_gate', UNAUTHENTICATED);

    expect(sessionExpiredEvents()).toEqual([['event', 'session_expired', { gate: 'entry_gate', app_shell: 'web' }]]);
  });

  it('does not count a browser that never signed in', () => {
    vi.stubEnv('NODE_ENV', 'production');

    clearStoredV1SessionAfterAuthLoss('require_auth', UNAUTHENTICATED);

    expect(sessionExpiredEvents()).toEqual([]);
  });

  it('does not count a 401 that arrives after the user signed out on purpose', () => {
    vi.stubEnv('NODE_ENV', 'production');
    saveStoredV1Session({ userId: 'user-1' });
    clearStoredV1Session();

    clearStoredV1SessionAfterAuthLoss('require_auth', UNAUTHENTICATED);

    expect(sessionExpiredEvents()).toEqual([]);
  });

  it.each([
    ['inactive account (403)', apiError(403, 'PERMISSION_DENIED')],
    ['server outage (503)', apiError(503, 'SERVICE_UNAVAILABLE')],
    ['no response', apiError(0, 'NETWORK_ERROR')],
    ['a non-API failure', new Error('boom')],
  ])('does not count %s, yet still clears the hint', (_label, error) => {
    saveStoredV1Session({ userId: 'user-1' });

    clearStoredV1SessionAfterAuthLoss('entry_gate', error);

    expect(sessionExpiredEvents()).toEqual([]);
    expect(hasStoredV1Session()).toBe(false);
  });

  it('counts the same expiry once when two passes both see the 401', () => {
    saveStoredV1Session({ userId: 'user-1' });

    clearStoredV1SessionAfterAuthLoss('require_auth', UNAUTHENTICATED);
    clearStoredV1SessionAfterAuthLoss('entry_gate', UNAUTHENTICATED);
    clearStoredV1SessionAfterAuthLoss('require_auth', UNAUTHENTICATED);

    expect(sessionExpiredEvents()).toHaveLength(1);
  });

  it('names the Android shell when the Android bridge is installed', () => {
    saveStoredV1Session({ userId: 'user-1' });
    window.TeameetNative = { postMessage: vi.fn() };

    clearStoredV1SessionAfterAuthLoss('require_auth', UNAUTHENTICATED);

    expect(sessionExpiredEvents()).toEqual([['event', 'session_expired', { gate: 'require_auth', app_shell: 'android' }]]);
  });

  it('names the iOS shell when the WebKit message handler is installed', () => {
    saveStoredV1Session({ userId: 'user-1' });
    (window as unknown as { webkit: unknown }).webkit = { messageHandlers: { TeameetNative: { postMessage: vi.fn() } } };

    clearStoredV1SessionAfterAuthLoss('require_auth', UNAUTHENTICATED);

    expect(sessionExpiredEvents()).toEqual([['event', 'session_expired', { gate: 'require_auth', app_shell: 'ios' }]]);
  });
});
