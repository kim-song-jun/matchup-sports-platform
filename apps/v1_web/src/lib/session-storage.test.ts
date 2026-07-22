import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  V1_PUSH_NUDGE_DISMISSED_KEY,
  V1_SESSION_HINT_KEY,
  V1_USER_EMAIL_KEY,
  V1_USER_ID_KEY,
  clearStoredV1Session,
  dismissPushNudge,
  hasStoredV1Session,
  sanitizeRedirectPath,
  saveStoredV1Session,
  shouldProbeV1Session,
  shouldShowPushNudge,
} from './session-storage';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.unstubAllEnvs();
});

describe('sanitizeRedirectPath', () => {
  it('keeps safe root redirects', () => {
    expect(sanitizeRedirectPath('/my?tab=teams')).toBe('/my?tab=teams');
  });

  it('rejects login redirect loops', () => {
    expect(sanitizeRedirectPath('/login?redirect=%2Fmy')).toBeNull();
  });

  it('rejects protocol-relative redirects', () => {
    expect(sanitizeRedirectPath('//example.com')).toBeNull();
  });
});

describe('production session hint', () => {
  it('does not persist the user id or email outside development persona mode', () => {
    vi.stubEnv('NODE_ENV', 'production');

    saveStoredV1Session({ userId: 'user-1', userEmail: 'user@example.com' });

    expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active');
    expect(window.localStorage.getItem(V1_USER_ID_KEY)).toBeNull();
    expect(window.localStorage.getItem(V1_USER_EMAIL_KEY)).toBeNull();
    expect(hasStoredV1Session()).toBe(true);
  });

  it('clears the non-sensitive hint together with development persona keys', () => {
    window.localStorage.setItem(V1_SESSION_HINT_KEY, 'active');
    window.localStorage.setItem(V1_USER_ID_KEY, 'user-1');
    window.localStorage.setItem(V1_USER_EMAIL_KEY, 'user@example.com');

    clearStoredV1Session();

    expect(window.localStorage.length).toBe(0);
  });

  it('still probes the HttpOnly cookie when browser storage was cleared', () => {
    vi.stubEnv('NODE_ENV', 'production');

    expect(hasStoredV1Session()).toBe(false);
    expect(shouldProbeV1Session()).toBe(true);
  });
});

describe('push nudge visibility', () => {
  it('shows the nudge by default', () => {
    expect(shouldShowPushNudge()).toBe(true);
  });

  it('hides the nudge for the rest of the session after it is dismissed', () => {
    dismissPushNudge();

    expect(window.sessionStorage.getItem(V1_PUSH_NUDGE_DISMISSED_KEY)).toBe('true');
    expect(shouldShowPushNudge()).toBe(false);
  });

  it('resets the dismissal on every fresh login, so a re-login shows the nudge again', () => {
    dismissPushNudge();
    expect(shouldShowPushNudge()).toBe(false);

    saveStoredV1Session({ userId: 'user-1', userEmail: 'user@example.com' });

    expect(shouldShowPushNudge()).toBe(true);
  });
});
