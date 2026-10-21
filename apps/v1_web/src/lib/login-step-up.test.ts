import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearLoginStepUp,
  getEmailLoginPath,
  LOGIN_STEP_UP_STORAGE_KEY,
  readLoginStepUp,
  saveLoginStepUp,
  updateLoginStepUpTimes,
} from './login-step-up';

const challenge = {
  challengeToken: 'opaque-token',
  maskedEmail: 'mi***@email.com',
  expiresAt: '2026-10-21T00:05:00.000Z',
  resendAvailableAt: '2026-10-21T00:00:30.000Z',
};

describe('login step-up storage', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('keeps the challenge in sessionStorage only and returns it with a sanitized redirect', () => {
    expect(saveLoginStepUp(challenge, '/my/teams')).toBe(true);

    expect(readLoginStepUp()).toEqual({ ...challenge, redirect: '/my/teams' });
    expect(window.localStorage.getItem(LOGIN_STEP_UP_STORAGE_KEY)).toBeNull();
  });

  it.each(['//evil.example', '/\\evil.example', 'https://evil.example', '/login/email'])(
    'drops the unsafe redirect %s instead of storing it',
    (redirect) => {
      saveLoginStepUp(challenge, redirect);

      expect(readLoginStepUp()?.redirect).toBeNull();
    },
  );

  it('re-sanitizes a redirect that was tampered with after it was stored', () => {
    window.sessionStorage.setItem(
      LOGIN_STEP_UP_STORAGE_KEY,
      JSON.stringify({ ...challenge, redirect: '//evil.example' }),
    );

    expect(readLoginStepUp()?.redirect).toBeNull();
  });

  it.each([
    ['not JSON', 'not json'],
    ['a missing token', JSON.stringify({ ...challenge, challengeToken: undefined, redirect: null })],
    ['an unparseable expiry', JSON.stringify({ ...challenge, expiresAt: 'tomorrow', redirect: null })],
    ['a non-string devCode', JSON.stringify({ ...challenge, devCode: 123456, redirect: null })],
  ])('treats %s as no challenge and removes the broken entry', (_label, raw) => {
    window.sessionStorage.setItem(LOGIN_STEP_UP_STORAGE_KEY, raw);

    expect(readLoginStepUp()).toBeNull();
    expect(window.sessionStorage.getItem(LOGIN_STEP_UP_STORAGE_KEY)).toBeNull();
  });

  it('reports a blocked sessionStorage so the login screen can say why it did not move on', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(saveLoginStepUp(challenge, null)).toBe(false);
  });

  it('refreshes the times after a resend but keeps the token and redirect, and drops a stale devCode', () => {
    saveLoginStepUp({ ...challenge, devCode: '111111' }, '/my');

    updateLoginStepUpTimes({ expiresAt: '2026-10-21T00:10:00.000Z', resendAvailableAt: '2026-10-21T00:05:30.000Z' });

    expect(readLoginStepUp()).toEqual({
      ...challenge,
      expiresAt: '2026-10-21T00:10:00.000Z',
      resendAvailableAt: '2026-10-21T00:05:30.000Z',
      redirect: '/my',
    });
  });

  it('does not create a challenge out of a resend result when nothing is stored', () => {
    updateLoginStepUpTimes({ expiresAt: '2026-10-21T00:10:00.000Z', resendAvailableAt: '2026-10-21T00:05:30.000Z' });

    expect(readLoginStepUp()).toBeNull();
  });

  it('clears the challenge', () => {
    saveLoginStepUp(challenge, null);

    clearLoginStepUp();

    expect(readLoginStepUp()).toBeNull();
  });

  it('builds the way back to email login and keeps only a safe redirect', () => {
    expect(getEmailLoginPath('/my/teams')).toBe('/login/email?redirect=%2Fmy%2Fteams');
    expect(getEmailLoginPath('//evil.example')).toBe('/login/email');
    expect(getEmailLoginPath(null)).toBe('/login/email');
  });
});
