import { createHash, webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KAKAO_OAUTH_STATE_STORAGE_KEY } from '@/components/auth/auth.view-model';
import {
  consumeKakaoOAuthAttempt,
  parseKakaoOAuthAttempt,
  encodeKakaoStateVerifier,
  prepareKakaoAuthorize,
  resetKakaoAuthorizeAttempt,
  startKakaoAuthorize,
  startKakaoLinkAuthorize,
  type KakaoOAuthAttempt,
} from './kakao-oauth';

const sdk = vi.hoisted(() => ({ getInitializedKakaoJsSdk: vi.fn() }));
const reporter = vi.hoisted(() => ({ reportClientError: vi.fn() }));
vi.mock('./kakao-js-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./kakao-js-sdk')>()),
  getInitializedKakaoJsSdk: sdk.getInitializedKakaoJsSdk,
}));
vi.mock('./client-error-reporter', () => ({ reportClientError: reporter.reportClientError }));

const STATE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const stored = () => window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY);
const storeKakaoOAuthAttempt = async (attempt: KakaoOAuthAttempt) =>
  window.sessionStorage.setItem(KAKAO_OAUTH_STATE_STORAGE_KEY, await encodeKakaoStateVerifier(attempt));

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
      expect(parseKakaoOAuthAttempt(await encodeKakaoStateVerifier(attempt))).toEqual({ ...attempt, state: `sha256:${createHash('sha256').update(STATE).digest('hex')}` });
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
      expect(JSON.parse(await encodeKakaoStateVerifier({ state: STATE, mode: 'link', returnTo })).returnTo).toBeNull();
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
    resetKakaoAuthorizeAttempt();
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

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  windowsDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
const ANDROID_KAKAOTALK = `${UA.androidChrome} KAKAOTALK 10.9.0`;
const IPHONE_KAKAOTALK = `${UA.iphoneSafari} KAKAOTALK 10.9.0`;
const IPHONE_INSTAGRAM = `${UA.iphoneSafari} Instagram 330.0.0.12.114`;
const ANDROID_INSTAGRAM = `${UA.androidChrome} Instagram 330.0.0.12.114`;

describe('Kakao authorize preparation and start', () => {
  const authorize = vi.fn();
  const fakeSdk = { init: vi.fn(), isInitialized: () => true, Auth: { authorize } };
  const originalLocation = Object.getOwnPropertyDescriptor(window, 'location')!;
  const authorizeUrl = () => new URL(
    'https://kauth.kakao.com/oauth/authorize?client_id=rest-key&redirect_uri=https%3A%2F%2Fteameet.test%2Fcallback%2Fkakao&response_type=code&scope=name%2Cphone_number',
  );
  let assigned: string | null;

  function device(userAgent: string, maxTouchPoints = 0) {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    Object.defineProperty(window.navigator, 'maxTouchPoints', { configurable: true, value: maxTouchPoints });
  }

  beforeEach(() => {
    vi.stubGlobal('crypto', webcrypto);
    vi.clearAllMocks();
    resetKakaoAuthorizeAttempt();
    assigned = null;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { search: '', pathname: '/login', set href(value: string) { assigned = value; } },
    });
    vi.stubEnv('NEXT_PUBLIC_KAKAO_CLIENT_ID', 'rest-key');
    vi.stubEnv('NEXT_PUBLIC_KAKAO_REDIRECT_URI', 'https://teameet.test/callback/kakao');
    vi.stubEnv('NEXT_PUBLIC_KAKAO_SCOPE', 'name,phone_number');
    vi.stubEnv('NEXT_PUBLIC_KAKAO_LOGIN_JS_KEY', 'login-js-key');
    // A real load leaves an initialised window.Kakao behind.
    sdk.getInitializedKakaoJsSdk.mockImplementation(async () => { window.Kakao = fakeSdk; return fakeSdk; });
    device(UA.androidChrome, 5);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', originalLocation);
    delete window.Kakao;
    delete window.TeameetNative;
    window.sessionStorage.clear();
  });

  describe('prepareKakaoAuthorize', () => {
    it.each([
      ['Android Chrome', UA.androidChrome, 5, 1],
      ['iPhone Safari', UA.iphoneSafari, 5, 1],
      ['iPad in desktop mode', UA.ipadDesktopMode, 5, 1],
      ['iPhone Instagram in-app browser', IPHONE_INSTAGRAM, 5, 1],
      ['a Mac desktop', UA.macDesktop, 0, 0],
      ['a Windows desktop', UA.windowsDesktop, 0, 0],
      ['the KakaoTalk in-app browser on Android', ANDROID_KAKAOTALK, 5, 0],
      ['the KakaoTalk in-app browser on iOS', IPHONE_KAKAOTALK, 5, 0],
      ['the Android Instagram in-app browser', ANDROID_INSTAGRAM, 5, 0],
    ])('asks for the SDK the expected number of times on %s', async (_label, userAgent, touchPoints, requests) => {
      device(userAgent, touchPoints);
      await prepareKakaoAuthorize();
      expect(sdk.getInitializedKakaoJsSdk).toHaveBeenCalledTimes(requests);
      if (requests) expect(sdk.getInitializedKakaoJsSdk).toHaveBeenCalledWith('login-js-key');
    });

    it('does nothing inside an app shell even on a mobile user agent', async () => {
      window.TeameetNative = { postMessage: vi.fn(), supports: [] };
      await prepareKakaoAuthorize();
      expect(sdk.getInitializedKakaoJsSdk).not.toHaveBeenCalled();
    });

    it.each([
      ['no JS key', 'NEXT_PUBLIC_KAKAO_LOGIN_JS_KEY'],
      ['no REST key (no authorize URL)', 'NEXT_PUBLIC_KAKAO_CLIENT_ID'],
    ])('does nothing with %s', async (_label, variable) => {
      vi.stubEnv(variable, '');
      await prepareKakaoAuthorize();
      expect(sdk.getInitializedKakaoJsSdk).not.toHaveBeenCalled();
    });

    it('prepares once however many times it is called', async () => {
      await Promise.all([prepareKakaoAuthorize(), prepareKakaoAuthorize()]);
      await prepareKakaoAuthorize();
      expect(sdk.getInitializedKakaoJsSdk).toHaveBeenCalledTimes(1);
    });

    it('neither reports nor writes storage when the SDK cannot load', async () => {
      sdk.getInitializedKakaoJsSdk.mockRejectedValue(new Error('script blocked'));
      await expect(prepareKakaoAuthorize()).resolves.toBeUndefined();
      expect(reporter.reportClientError).not.toHaveBeenCalled();
      expect(window.sessionStorage).toHaveLength(0);
    });

    it('does not write storage even when it succeeds', async () => {
      await prepareKakaoAuthorize();
      expect(window.sessionStorage).toHaveLength(0);
    });
  });

  describe('startKakaoAuthorize', () => {
    const start = (mode: 'login' | 'link' = 'login', returnTo: string | null = null, onCommitted?: () => void) =>
      startKakaoAuthorize({ mode, returnTo, authorizeUrl: authorizeUrl(), onCommitted });

    it('stores the verifier and calls authorize before the first await when prepared', async () => {
      await prepareKakaoAuthorize();
      const result = start();

      expect(authorize).toHaveBeenCalledTimes(1);
      const call = authorize.mock.calls[0][0];
      expect(call).toEqual({
        redirectUri: 'https://teameet.test/callback/kakao',
        state: expect.stringMatching(/^[0-9a-f]{32}$/),
        scope: 'name,phone_number',
        throughTalk: true,
      });
      expect(JSON.parse(stored()!)).toEqual({
        state: `sha256:${createHash('sha256').update(call.state).digest('hex')}`,
        mode: 'login',
        returnTo: null,
      });
      await expect(result).resolves.toEqual({ status: 'redirecting', path: 'talk', sdkReady: true });
    });

    it('runs onCommitted after the verifier is stored and before authorize', async () => {
      await prepareKakaoAuthorize();
      const order: string[] = [];
      authorize.mockImplementation(() => order.push('authorize'));
      void start('login', null, () => order.push(stored() ? 'committed-with-verifier' : 'committed-without'));
      expect(order).toEqual(['committed-with-verifier', 'authorize']);
    });

    it('waits for the SDK and the fingerprint when nothing was prepared', async () => {
      const result = start();
      expect(authorize).not.toHaveBeenCalled();
      await expect(result).resolves.toEqual({ status: 'redirecting', path: 'talk', sdkReady: false });
      expect(authorize).toHaveBeenCalledTimes(1);
      expect(stored()).toContain('sha256:');
    });

    it('still waits when the state is ready but the SDK failed to load', async () => {
      sdk.getInitializedKakaoJsSdk.mockRejectedValueOnce(new Error('script blocked'));
      await prepareKakaoAuthorize();
      const result = start();
      expect(authorize).not.toHaveBeenCalled();
      await expect(result).resolves.toMatchObject({ status: 'redirecting', path: 'talk', sdkReady: false });
      expect(authorize).toHaveBeenCalledTimes(1);
    });

    it('reports the SDK path as sdk_account where Kakao Talk cannot be opened', async () => {
      device(UA.windowsDesktop, 0);
      await expect(start()).resolves.toEqual({ status: 'redirecting', path: 'sdk_account', sdkReady: false });
      expect(authorize).toHaveBeenCalledTimes(1);
    });

    it('goes to the authorize URL with a warning when the SDK cannot start', async () => {
      sdk.getInitializedKakaoJsSdk.mockRejectedValue(new Error('script blocked'));
      await expect(start()).resolves.toEqual({ status: 'redirecting', path: 'account_url', sdkReady: false });
      expect(authorize).not.toHaveBeenCalled();
      expect(new URL(assigned!).searchParams.get('state')).toMatch(/^[0-9a-f]{32}$/);
      expect(reporter.reportClientError).toHaveBeenCalledTimes(1);
    });

    it('falls back to the authorize URL when authorize itself throws', async () => {
      await prepareKakaoAuthorize();
      authorize.mockImplementation(() => { throw new Error('boom'); });
      await expect(start()).resolves.toEqual({ status: 'redirecting', path: 'account_url', sdkReady: true });
      expect(assigned).not.toBeNull();
      expect(reporter.reportClientError).toHaveBeenCalledTimes(1);
    });

    it('uses the authorize URL inside an app shell and never loads the SDK', async () => {
      window.TeameetNative = { postMessage: vi.fn(), supports: [] };
      await expect(start()).resolves.toMatchObject({ status: 'redirecting', path: 'account_url' });
      expect(sdk.getInitializedKakaoJsSdk).not.toHaveBeenCalled();
      expect(authorize).not.toHaveBeenCalled();
      expect(assigned).not.toBeNull();
    });

    it('stops with storage-unavailable and never calls authorize when storage or onCommitted throws', async () => {
      await prepareKakaoAuthorize();
      await expect(start('login', null, () => { throw new Error('no storage for you'); }))
        .resolves.toEqual({ status: 'unavailable', reason: 'storage-unavailable' });
      expect(authorize).not.toHaveBeenCalled();

      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
      await expect(start()).resolves.toEqual({ status: 'unavailable', reason: 'storage-unavailable' });
      expect(authorize).not.toHaveBeenCalled();
      expect(assigned).toBeNull();
    });

    it('does not start without an authorize redirect URI', async () => {
      await prepareKakaoAuthorize();
      const noRedirect = new URL('https://kauth.kakao.com/oauth/authorize?client_id=rest-key&response_type=code');
      await startKakaoAuthorize({ mode: 'login', returnTo: null, authorizeUrl: noRedirect });
      expect(authorize).not.toHaveBeenCalled();
      expect(reporter.reportClientError).toHaveBeenCalledTimes(1);
    });
  });

  describe('reusing the state of a live attempt', () => {
    const start = (mode: 'login' | 'link', returnTo: string | null = null) =>
      startKakaoAuthorize({ mode, returnTo, authorizeUrl: authorizeUrl(), onCommitted: undefined });
    const stateOf = (call: number) => authorize.mock.calls[call][0].state as string;

    it('keeps the same state and stored verifier when the same attempt starts twice, so a late first answer is still accepted', async () => {
      await prepareKakaoAuthorize();
      await start('login');
      const firstStored = stored();
      await start('login');

      expect(authorize).toHaveBeenCalledTimes(2);
      expect(stateOf(1)).toBe(stateOf(0));
      expect(stored()).toBe(firstStored);
      expect(await consumeKakaoOAuthAttempt(stateOf(0))).toEqual({ state: stateOf(0), mode: 'login', returnTo: null });
    });

    it('uses a new state after resetKakaoAuthorizeAttempt', async () => {
      await prepareKakaoAuthorize();
      await start('login');
      resetKakaoAuthorizeAttempt();
      await start('login');
      expect(stateOf(1)).not.toBe(stateOf(0));
      expect(JSON.parse(stored()!).state).toBe(`sha256:${createHash('sha256').update(stateOf(1)).digest('hex')}`);
    });

    it('uses a new state when the mode changes, and stores the new mode', async () => {
      await prepareKakaoAuthorize();
      await start('login');
      await start('link', '/my/settings/login-methods');
      expect(stateOf(1)).not.toBe(stateOf(0));
      expect(JSON.parse(stored()!)).toMatchObject({ mode: 'link', returnTo: '/my/settings/login-methods' });
    });

    it('uses a new state when only the return path changes', async () => {
      await prepareKakaoAuthorize();
      await start('link', '/my/a');
      await start('link', '/my/b');
      expect(stateOf(1)).not.toBe(stateOf(0));
    });

    it('rewrites the verifier when the stored value was lost, keeping the state', async () => {
      await prepareKakaoAuthorize();
      await start('login');
      window.sessionStorage.clear();
      await start('login');
      expect(stateOf(1)).toBe(stateOf(0));
      expect(await consumeKakaoOAuthAttempt(stateOf(0))).not.toBeNull();
    });
  });
});
