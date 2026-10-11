import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KakaoLoginButton } from './kakao-login-button';
import { V1ApiError } from '@/lib/api-client';
import { KAKAO_OAUTH_STATE_STORAGE_KEY } from './auth.view-model';
import { v1Keys } from '@/lib/query-keys';
import { V1_SESSION_HINT_KEY } from '@/lib/session-storage';

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
const api = vi.hoisted(() => ({ v1Post: vi.fn(), v1Get: vi.fn() }));
const sdk = vi.hoisted(() => ({ getInitializedKakaoJsSdk: vi.fn() }));
const reporter = vi.hoisted(() => ({ reportClientError: vi.fn() }));
const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  v1Post: api.v1Post,
  v1Get: api.v1Get,
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
  api.v1Get.mockResolvedValue({ kakaoMapsJsKey: 'js-key' });
  api.v1Post.mockResolvedValue({ session: { userId: 'u1', userEmail: null }, next: { route: '/home' } });
  sdk.getInitializedKakaoJsSdk.mockResolvedValue({ Auth: { authorize } });
});

afterEach(() => {
  delete window.TeameetNative;
  window.sessionStorage.clear();
});

let queryClient: QueryClient;
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

    it('shows a Korean message when the shell never answers (timeout)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        reply = {};
        (window.TeameetNative as { postMessage: unknown }).postMessage = vi.fn();
        renderButton();
        await click();
        await vi.advanceTimersByTimeAsync(120_000);
        expect(await screen.findByRole('alert')).toHaveTextContent('카카오 로그인에 실패했어요');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('browser', () => {
    it('uses the JS SDK with the same redirectUri, scope and the stored state', async () => {
      renderButton();
      await click();
      await waitFor(() => expect(authorize).toHaveBeenCalledTimes(1));
      const stored = window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY);
      expect(stored).toMatch(/^[0-9a-f]{32}$/);
      expect(authorize).toHaveBeenCalledWith({
        redirectUri: 'https://teameet.test/callback/kakao',
        scope: 'name,phone_number',
        state: stored,
        throughTalk: true,
      });
      expect(sdk.getInitializedKakaoJsSdk).toHaveBeenCalledWith('js-key');
      expect(assigned).toBeNull();
    });

    it('keeps the plain authorize-URL flow in an old shell that does not advertise the action', async () => {
      window.TeameetNative = { postMessage: vi.fn() };
      renderButton();
      await click();
      await waitFor(() => expect(assigned).not.toBeNull());
      const stored = window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY);
      expect(assigned).toBe(`${HREF}&state=${stored}`);
      expect(window.TeameetNative.postMessage).not.toHaveBeenCalled();
      expect(api.v1Get).not.toHaveBeenCalled();
      expect(authorize).not.toHaveBeenCalled();
    });

    it('ignores a second tap while the first attempt is still loading the SDK', async () => {
      let release: (value: unknown) => void = () => {};
      sdk.getInitializedKakaoJsSdk.mockReturnValue(new Promise((resolve) => { release = resolve; }));
      renderButton();
      await click();
      const firstState = window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY);
      await click();
      expect(window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY)).toBe(firstState);
      release({ Auth: { authorize } });
      await waitFor(() => expect(authorize).toHaveBeenCalledTimes(1));
      expect(authorize).toHaveBeenCalledWith(expect.objectContaining({ state: firstState }));
    });

    it('falls back to the authorize URL with state and logs when the JS key is missing', async () => {
      api.v1Get.mockResolvedValue({ kakaoMapsJsKey: null });
      renderButton();
      await click();
      await waitFor(() => expect(assigned).not.toBeNull());
      const stored = window.sessionStorage.getItem(KAKAO_OAUTH_STATE_STORAGE_KEY);
      expect(assigned).toBe(`${HREF}&state=${stored}`);
      expect(reporter.reportClientError).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn' }));
      expect(authorize).not.toHaveBeenCalled();
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
