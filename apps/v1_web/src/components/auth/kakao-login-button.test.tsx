import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KakaoLoginButton } from './kakao-login-button';
import { V1ApiError } from '@/lib/api-client';
import { KAKAO_OAUTH_STATE_STORAGE_KEY } from './auth.view-model';
import { parseKakaoOAuthAttempt } from '@/lib/kakao-oauth';
import { readPendingSocialLink } from '@/lib/pending-social-link';
import { v1Keys } from '@/lib/query-keys';
import { V1_SESSION_HINT_KEY } from '@/lib/session-storage';
import { readWithdrawalCancel } from '@/lib/withdrawal-cancel-storage';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const api = vi.hoisted(() => ({ v1Post: vi.fn() }));
const sdk = vi.hoisted(() => ({ getInitializedKakaoJsSdk: vi.fn() }));
const reporter = vi.hoisted(() => ({ reportClientError: vi.fn() }));
const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  v1Post: api.v1Post,
}));
vi.mock('@/lib/kakao-js-sdk', () => ({ getInitializedKakaoJsSdk: sdk.getInitializedKakaoJsSdk }));
vi.mock('@/lib/analytics', () => ({ trackEvent: analytics.trackEvent }));
vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: reporter.reportClientError }));

const HREF = 'https://kauth.kakao.com/oauth/authorize?client_id=rest&redirect_uri=https%3A%2F%2Fteameet.test%2Fcallback%2Fkakao&response_type=code&scope=name%2Cphone_number';
const authorize = vi.fn();
let reply: Record<string, unknown> = {};
let assigned: string | null = null;

function installShell() {
  window.TeameetNative = {
    supports: ['sign-in-with-kakao'],
    postMessage: vi.fn((message: string) => {
      const request = JSON.parse(message) as { requestId: string };
      window.dispatchEvent(new CustomEvent('teameet:native-kakao-result', { detail: { requestId: request.requestId, ...reply } }));
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient = new QueryClient();
  assigned = null;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { search: '', pathname: '/login', set href(value: string) { assigned = value; } },
  });
  vi.stubEnv('NEXT_PUBLIC_KAKAO_LOGIN_JS_KEY', 'login-js-key');
  vi.stubEnv('NEXT_PUBLIC_KAKAO_MAPS_JS_KEY', 'different-maps-app-key');
  api.v1Post.mockResolvedValue({ session: { userId: 'u1', userEmail: null }, next: { route: '/home' } });
  sdk.getInitializedKakaoJsSdk.mockResolvedValue({ Auth: { authorize } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete window.TeameetNative;
  window.sessionStorage.clear();
});

let queryClient: QueryClient;
// 버튼이 저장하는 값은 state 만이 아니라 시도 전체(JSON)다. 콜백이 mode 로 로그인·연결을 가른다.
const storedAttempt = () => parseKakaoOAuthAttempt(window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY));
const storedState = () => storedAttempt()?.state ?? null;
const apiError = (statusCode: number, code: string, details?: Record<string, unknown>) =>
  new V1ApiError({ status: 'error', statusCode, code, message: '실패', details, timestamp: '2026-10-31T00:00:00.000Z' });
const renderButton = () => render(
  <QueryClientProvider client={queryClient}>
    <KakaoLoginButton href={HREF} label="카카오" />
  </QueryClientProvider>,
);
const click = () => userEvent.click(screen.getByRole('link', { name: '카카오' }));

describe('KakaoLoginButton', () => {
  describe('native shell', () => {
    beforeEach(installShell);

    it('exchanges the shell token at /auth/kakao/token and follows the server route', async () => {
      reply = { accessToken: 'kakao-token' };
      renderButton();
      await click();
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'));
      expect(api.v1Post).toHaveBeenCalledWith('/auth/kakao/token', { accessToken: 'kakao-token' });
      expect(JSON.parse(vi.mocked(window.TeameetNative!.postMessage).mock.calls[0][0])).toMatchObject({
        type: 'sign-in-with-kakao', scopes: ['name', 'phone_number'],
      });
      expect(sdk.getInitializedKakaoJsSdk).not.toHaveBeenCalled();
    });

    it('drops the previous identity cache, records the session hint and tracks the login', async () => {
      queryClient.setQueryData([...v1Keys.all, 'chat-rooms'], ['previous-user-room']);
      reply = { accessToken: 'kakao-token' };
      renderButton();
      await click();
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'));
      expect(queryClient.getQueryData([...v1Keys.all, 'chat-rooms'])).toBeUndefined();
      expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active');
      expect(analytics.trackEvent).toHaveBeenCalledWith('login', { method: 'kakao' });
    });

    it('tracks sign_up_start when the server routes to social onboarding', async () => {
      reply = { accessToken: 'kakao-token' };
      api.v1Post.mockResolvedValue({ session: { userId: 'u1', userEmail: null }, next: { route: '/signup/social' } });
      renderButton();
      await click();
      await waitFor(() => expect(router.replace).toHaveBeenCalled());
      expect(analytics.trackEvent).toHaveBeenCalledWith('sign_up_start', { method: 'kakao' });
    });

    it('stays silent on cancel', async () => {
      reply = { cancelled: true };
      renderButton();
      await click();
      await waitFor(() => expect(window.TeameetNative?.postMessage).toHaveBeenCalled());
      expect(screen.queryByRole('alert')).toBeNull();
      expect(api.v1Post).not.toHaveBeenCalled();
    });

    it('shows a Korean message and logs when the shell reports an error', async () => {
      reply = { error: 'KOE101' };
      renderButton();
      await click();
      expect(await screen.findByRole('alert')).toHaveTextContent('카카오 로그인에 실패했어요');
      expect(reporter.reportClientError).toHaveBeenCalled();
      expect(analytics.trackEvent).toHaveBeenCalledWith('login_failed', { method: 'kakao', reason: 'KOE101' });
      expect(api.v1Post).not.toHaveBeenCalled();
    });

    it('shows the server error when the token is rejected', async () => {
      reply = { accessToken: 'bad' };
      api.v1Post.mockRejectedValue(new Error('로그인 정보를 확인할 수 없어요.'));
      renderButton();
      await click();
      expect(await screen.findByRole('alert')).toHaveTextContent('로그인 정보를 확인할 수 없어요.');
    });

    it('routes a blocked account to /auth/blocked like the callback path', async () => {
      reply = { accessToken: 'blocked' };
      api.v1Post.mockRejectedValue(new V1ApiError({ status: 'error', statusCode: 403, code: 'PERMISSION_DENIED', message: '차단된 계정이에요.', timestamp: '2026-10-12T00:00:00.000Z' }));
      renderButton();
      await click();
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/blocked'));
      expect(screen.queryByRole('alert')).toBeNull();
      expect(analytics.trackEvent).toHaveBeenCalledWith('login_failed', { method: 'kakao', reason: 'PERMISSION_DENIED' });
    });

    it.each([
      ['unverified email', 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL'],
      ['contact conflict', 'SOCIAL_LINK_CONTACT_CONFLICT'],
    ])('keeps the link token and opens the sign-in-then-link guide on a 409 (%s)', async (_label, code) => {
      reply = { accessToken: 'kakao-token' };
      api.v1Post.mockRejectedValue(apiError(409, code, {
        next: 'sign_in_then_link', provider: 'kakao', linkToken: 'link-token-1', linkTokenExpiresInSeconds: 600,
      }));
      renderButton();
      await click();
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/account-conflict?provider=kakao'));
      expect(readPendingSocialLink()).toMatchObject({ linkToken: 'link-token-1', provider: 'kakao' });
      expect(screen.queryByRole('alert')).toBeNull();
      expect(analytics.trackEvent).toHaveBeenCalledWith('login_failed', { method: 'kakao', reason: code });
    });

    it('carries the saved redirect into the guide and the withdrawal screen', async () => {
      reply = { accessToken: 'kakao-token' };
      window.location.search = '?redirect=%2Fteams%2Fnew';
      api.v1Post.mockRejectedValueOnce(apiError(409, 'SOCIAL_LINK_CONTACT_CONFLICT', {
        next: 'sign_in_then_link', provider: 'kakao', linkToken: 'link-token-2', linkTokenExpiresInSeconds: 600,
      }));
      renderButton();
      await click();
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/account-conflict?provider=kakao&redirect=%2Fteams%2Fnew'));

      api.v1Post.mockRejectedValueOnce(apiError(403, 'ACCOUNT_WITHDRAWAL_PENDING', {
        withdrawalCancelToken: 'withdrawal-token-1', expiresInSeconds: 600,
      }));
      await click();
      await waitFor(() => expect(router.replace).toHaveBeenLastCalledWith('/auth/withdrawal-cancel'));
      expect(readWithdrawalCancel()).toMatchObject({ token: 'withdrawal-token-1', returnTo: '/teams/new' });
    });

    it('shows the server message instead of a guide when the 409 carries no sign-in-then-link details', async () => {
      reply = { accessToken: 'kakao-token' };
      api.v1Post.mockRejectedValue(apiError(409, 'SOCIAL_LINK_CONTACT_CONFLICT'));
      renderButton();
      await click();
      expect(await screen.findByRole('alert')).toHaveTextContent('실패');
      expect(router.replace).not.toHaveBeenCalled();
      expect(readPendingSocialLink()).toBeNull();
    });

    it('shows a Korean message when the shell never answers (timeout)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        reply = {};
        (window.TeameetNative as { postMessage: unknown }).postMessage = vi.fn();
        renderButton();
        await click();
        await act(() => vi.advanceTimersByTimeAsync(120_000));
        expect(await screen.findByRole('alert')).toHaveTextContent('카카오 로그인에 실패했어요');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('browser', () => {
    it('uses the URL after a stalled SDK request and ignores its late completion', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let complete: (value: unknown) => void = () => {};
      const pending = new Promise((resolve) => { complete = resolve; });
      sdk.getInitializedKakaoJsSdk.mockReturnValue(pending);
      try {
        renderButton();
        await click();
        await vi.advanceTimersByTimeAsync(8_000);
        expect(assigned).toBe(`${HREF}&state=${storedState()}`);
        expect(reporter.reportClientError).toHaveBeenCalledTimes(1);
        complete({ Auth: { authorize } });
        await vi.advanceTimersByTimeAsync(1);
        expect(authorize).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('uses the login key independently of Maps with the same redirectUri, scope and stored state', async () => {
      renderButton();
      await click();
      await waitFor(() => expect(authorize).toHaveBeenCalledTimes(1));
      const stored = storedState();
      expect(stored).toMatch(/^[0-9a-f]{32}$/);
      expect(storedAttempt()).toEqual({ state: stored, mode: 'login', returnTo: null });
      expect(authorize).toHaveBeenCalledWith({
        redirectUri: 'https://teameet.test/callback/kakao',
        scope: 'name,phone_number',
        state: stored,
        throughTalk: true,
      });
      expect(sdk.getInitializedKakaoJsSdk).toHaveBeenCalledWith('login-js-key');
      expect(assigned).toBeNull();
    });

    it('keeps the plain authorize-URL flow in an old shell that does not advertise the action', async () => {
      window.TeameetNative = { postMessage: vi.fn() };
      renderButton();
      await click();
      await waitFor(() => expect(assigned).not.toBeNull());
      const stored = storedState();
      expect(assigned).toBe(`${HREF}&state=${stored}`);
      expect(window.TeameetNative.postMessage).not.toHaveBeenCalled();
      expect(authorize).not.toHaveBeenCalled();
    });

    it('ignores a second tap while the first attempt is still loading the SDK', async () => {
      let release: (value: unknown) => void = () => {};
      sdk.getInitializedKakaoJsSdk.mockReturnValue(new Promise((resolve) => { release = resolve; }));
      renderButton();
      await click();
      const firstState = storedState();
      await click();
      expect(storedState()).toBe(firstState);
      release({ Auth: { authorize } });
      await waitFor(() => expect(authorize).toHaveBeenCalledTimes(1));
      expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ state: firstState }));
    });

    it('falls back to the authorize URL with state and logs when the JS key is missing', async () => {
      vi.stubEnv('NEXT_PUBLIC_KAKAO_LOGIN_JS_KEY', '');
      renderButton();
      await click();
      await waitFor(() => expect(assigned).not.toBeNull());
      const stored = storedState();
      expect(assigned).toBe(`${HREF}&state=${stored}`);
      expect(reporter.reportClientError).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn' }));
      expect(authorize).not.toHaveBeenCalled();
      expect(sdk.getInitializedKakaoJsSdk).not.toHaveBeenCalled();
    });

    it('falls back and logs when the SDK fails to load', async () => {
      sdk.getInitializedKakaoJsSdk.mockRejectedValue(new Error('Failed to load Kakao JS SDK script'));
      renderButton();
      await click();
      await waitFor(() => expect(assigned).toContain('state='));
      expect(reporter.reportClientError).toHaveBeenCalledTimes(1);
    });
  });
});
