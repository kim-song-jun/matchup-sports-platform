import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KAKAO_OAUTH_STATE_STORAGE_KEY } from '@/components/auth/auth.view-model';
import {
  consumeKakaoOAuthAttempt,
  parseKakaoOAuthAttempt,
  serializeKakaoOAuthAttempt,
  startKakaoLinkAuthorize,
  storeKakaoOAuthAttempt,
} from './kakao-oauth';

const sdk = vi.hoisted(() => ({ getInitializedKakaoJsSdk: vi.fn() }));
const reporter = vi.hoisted(() => ({ reportClientError: vi.fn() }));
vi.mock('./kakao-js-sdk', () => ({ getInitializedKakaoJsSdk: sdk.getInitializedKakaoJsSdk }));
vi.mock('./client-error-reporter', () => ({ reportClientError: reporter.reportClientError }));

const STATE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const stored = () => window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY);

beforeEach(() => { vi.stubGlobal('crypto', webcrypto); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Kakao OAuth attempt storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  describe('parseKakaoOAuthAttempt', () => {
    it('round-trips a link attempt with its return path', async () => {
      const attempt = { state: STATE, mode: 'link', returnTo: '/my/settings?tab=login#methods' } as const;
      expect(parseKakaoOAuthAttempt(await serializeKakaoOAuthAttempt(attempt))).toEqual({ ...attempt, state: `sha256:${createHash('sha256').update(STATE).digest('hex')}` });
    });

    it('treats a bare state string from the previous format as a login attempt', async () => {
      expect(parseKakaoOAuthAttempt(STATE)).toEqual({ state: STATE, mode: 'login', returnTo: null });
    });

    it('keeps an all-digit legacy state a string instead of letting JSON turn it into a number', async () => {
      const digits = '12345678901234567890123456789012';
      expect(parseKakaoOAuthAttempt(digits)).toEqual({ state: digits, mode: 'login', returnTo: null });
    });

    it.each([
      ['empty', ''],
      ['missing', null],
      ['broken JSON', '{"state":"abc","mode":'],
      ['an unknown mode', JSON.stringify({ state: STATE, mode: 'merge', returnTo: null })],
      ['no mode', JSON.stringify({ state: STATE, returnTo: null })],
      ['an empty state', JSON.stringify({ state: '', mode: 'link', returnTo: null })],
      ['a non-string state', JSON.stringify({ state: 7, mode: 'link', returnTo: null })],
      ['a non-string return path', JSON.stringify({ state: STATE, mode: 'link', returnTo: { path: '/my' } })],
    ])('rejects %s instead of guessing a mode', (_label, raw) => {
      expect(parseKakaoOAuthAttempt(raw)).toBeNull();
    });

    it.each([
      ['an absolute URL', 'https://evil.example/steal'],
      ['a protocol-relative URL', '//evil.example/steal'],
      ['a path that normalizes to a protocol-relative URL', '/..//evil.example'],
      ['the login screen', '/login'],
    ])('drops %s from the return path, in what is stored and in what is read back', async (_label, returnTo) => {
      expect(JSON.parse(await serializeKakaoOAuthAttempt({ state: STATE, mode: 'link', returnTo })).returnTo).toBeNull();
      const tampered = JSON.stringify({ state: STATE, mode: 'link', returnTo });
      expect(parseKakaoOAuthAttempt(tampered)).toEqual({ state: STATE, mode: 'link', returnTo: null });
    });
  });

  describe('consumeKakaoOAuthAttempt', () => {
    it('returns the attempt when the returned state matches, and clears it', async () => {
      await storeKakaoOAuthAttempt({ state: STATE, mode: 'link', returnTo: '/my/settings' });
      expect(await consumeKakaoOAuthAttempt(STATE)).toEqual({ state: STATE, mode: 'link', returnTo: '/my/settings' });
      expect(stored()).toBeNull();
    });

    it('allows only one consumer while the verifier hash is pending', async () => {
      await storeKakaoOAuthAttempt({ state: STATE, mode: 'link', returnTo: null });
      const results = await Promise.all([consumeKakaoOAuthAttempt(STATE), consumeKakaoOAuthAttempt(STATE)]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(stored()).toBeNull();
    });

    it('fails closed and consumes the attempt when hashing is unavailable', async () => {
      await storeKakaoOAuthAttempt({ state: STATE, mode: 'link', returnTo: null });
      vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('hash unavailable'));
      expect(await consumeKakaoOAuthAttempt(STATE)).toBeNull();
      expect(stored()).toBeNull();
    });

    it('cannot be replayed with the same state', async () => {
      await storeKakaoOAuthAttempt({ state: STATE, mode: 'link', returnTo: null });
      expect(await consumeKakaoOAuthAttempt(STATE)).not.toBeNull();
      expect(await consumeKakaoOAuthAttempt(STATE)).toBeNull();
    });

    it('rejects a different state and still clears the stored attempt', async () => {
      await storeKakaoOAuthAttempt({ state: STATE, mode: 'link', returnTo: null });
      expect(await consumeKakaoOAuthAttempt('attacker-state')).toBeNull();
      expect(stored()).toBeNull();
    });

    it.each([null, ''])('rejects a missing returned state (%s)', async (returned) => {
      await storeKakaoOAuthAttempt({ state: STATE, mode: 'login', returnTo: null });
      expect(await consumeKakaoOAuthAttempt(returned)).toBeNull();
    });

    it('rejects when nothing was stored', async () => {
      expect(await consumeKakaoOAuthAttempt(STATE)).toBeNull();
    });

    it('returns null instead of throwing when the browser blocks storage', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      expect(await consumeKakaoOAuthAttempt(STATE)).toBeNull();
    });

    it('still accepts a callback whose attempt was stored as a bare state string, as a login', async () => {
      window.sessionStorage.setItem(KAKAO_OAUTH_STATE_STORAGE_KEY, STATE);
      expect(await consumeKakaoOAuthAttempt(STATE)).toEqual({ state: STATE, mode: 'login', returnTo: null });
    });
  });
});

describe('startKakaoLinkAuthorize', () => {
  const authorize = vi.fn();
  const originalLocation = Object.getOwnPropertyDescriptor(window, 'location')!;
  let assigned: string | null;

  beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
    vi.clearAllMocks();
    assigned = null;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { search: '', pathname: '/my/settings', set href(value: string) { assigned = value; } },
    });
    vi.stubEnv('NEXT_PUBLIC_KAKAO_CLIENT_ID', 'rest-key');
    vi.stubEnv('NEXT_PUBLIC_KAKAO_REDIRECT_URI', 'https://teameet.test/callback/kakao');
    vi.stubEnv('NEXT_PUBLIC_KAKAO_SCOPE', 'name,phone_number');
    vi.stubEnv('NEXT_PUBLIC_KAKAO_LOGIN_JS_KEY', 'login-js-key');
    sdk.getInitializedKakaoJsSdk.mockResolvedValue({ Auth: { authorize } });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', originalLocation);
    delete window.TeameetNative;
    window.sessionStorage.clear();
  });

  it('records a link attempt and hands the same state to the Kakao JS SDK, without login-only scopes', async () => {
    await expect(startKakaoLinkAuthorize({ returnTo: '/my/settings' })).resolves.toEqual({ status: 'redirecting' });

    const attempt = JSON.parse(stored()!);
    expect(attempt).toMatchObject({ mode: 'link', returnTo: '/my/settings' });
    const rawState = authorize.mock.calls[0][0].state;
    expect(rawState).toMatch(/^[0-9a-f]{32}$/);
    expect(attempt.state).toBe(`sha256:${createHash('sha256').update(rawState).digest('hex')}`);
    expect(stored()).not.toContain(rawState);
    expect(sdk.getInitializedKakaoJsSdk).toHaveBeenCalledWith('login-js-key');
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(authorize.mock.calls[0][0]).toEqual({
      redirectUri: 'https://teameet.test/callback/kakao',
      state: rawState,
      throughTalk: true,
    });
    expect(assigned).toBeNull();
  });

  it('stores a sanitized return path, never an off-site one', async () => {
    await startKakaoLinkAuthorize({ returnTo: 'https://evil.example/' });
    expect(JSON.parse(stored()!).returnTo).toBeNull();
  });

  it('navigates to the authorize URL with the state inside a native shell', async () => {
    window.TeameetNative = { postMessage: vi.fn(), supports: [] };
    await startKakaoLinkAuthorize({ returnTo: null });

    const attempt = JSON.parse(stored()!);
    const target = new URL(assigned!);
    const rawState = target.searchParams.get('state')!;
    expect(attempt.state).toBe(`sha256:${createHash('sha256').update(rawState).digest('hex')}`);
    expect(`${target.origin}${target.pathname}`).toBe('https://kauth.kakao.com/oauth/authorize');
    expect(Object.fromEntries(target.searchParams)).toEqual({
      client_id: 'rest-key',
      redirect_uri: 'https://teameet.test/callback/kakao',
      response_type: 'code',
      state: rawState,
    });
    expect(sdk.getInitializedKakaoJsSdk).not.toHaveBeenCalled();
  });

  it('falls back to the authorize URL and reports when the SDK cannot start', async () => {
    sdk.getInitializedKakaoJsSdk.mockRejectedValue(new Error('script blocked'));
    await expect(startKakaoLinkAuthorize({ returnTo: null })).resolves.toEqual({ status: 'redirecting' });

    expect(authorize).not.toHaveBeenCalled();
    expect(JSON.parse(stored()!).state).toBe(`sha256:${createHash('sha256').update(new URL(assigned!).searchParams.get('state')!).digest('hex')}`);
    expect(reporter.reportClientError).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn' }));
  });

  it('does not start without the OAuth keys', async () => {
    vi.stubEnv('NEXT_PUBLIC_KAKAO_CLIENT_ID', '');
    await expect(startKakaoLinkAuthorize({ returnTo: null })).resolves.toEqual({ status: 'unavailable', reason: 'not-configured' });
    expect(stored()).toBeNull();
    expect(authorize).not.toHaveBeenCalled();
    expect(assigned).toBeNull();
  });

  it('refuses to start when the state cannot be stored, because the callback could not verify it', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    await expect(startKakaoLinkAuthorize({ returnTo: null })).resolves.toEqual({ status: 'unavailable', reason: 'storage-unavailable' });
    expect(authorize).not.toHaveBeenCalled();
    expect(assigned).toBeNull();
  });
});
