import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPendingSocialLink, peekPendingSocialLink, savePendingSocialLink, takePendingSocialLink } from '@/lib/pending-social-link';
import { PENDING_LINK_MSW } from '@/test/msw/auth-link-handlers';
import { server } from '@/test/msw/server';
import type { V1AuthMe } from '@/types/api';
import { RETRY_DELAY_MS, usePendingSocialLinkResolver } from './use-pending-social-link-resolver';

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

type Account = Pick<V1AuthMe, 'user' | 'termsCompliance'>;
const account = (overrides: { onboardingStatus?: string; compliant?: boolean } = {}): Account => ({
  user: { id: 'user-1', email: 'owner@example.test', onboardingStatus: overrides.onboardingStatus ?? 'completed' },
  termsCompliance: { compliant: overrides.compliant ?? true, pendingRequiredDocumentIds: [], nextRoute: null },
} as Account);

const storeToken = (token: string, provider: 'kakao' | 'apple' = 'kakao') =>
  savePendingSocialLink({ next: 'sign_in_then_link', provider, linkToken: token, linkTokenExpiresInSeconds: PENDING_LINK_MSW.expiresInSeconds });

let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const mount = (initial: Account | undefined) => renderHook(({ current }) => usePendingSocialLinkResolver(current), { wrapper, initialProps: { current: initial } });

const linkRequests: unknown[] = [];

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  window.sessionStorage.clear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  router.replace.mockReset();
  linkRequests.length = 0;
  server.use(http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })));
});
afterEach(() => {
  server.resetHandlers();
  clearPendingSocialLink();
});

/** 요청을 세면서 기본 핸들러(MSW 계약 핸들러)로 넘긴다. */
function countLinkRequests() {
  server.events.on('request:start', ({ request }) => {
    if (request.url.endsWith('/auth/link/pending')) linkRequests.push(request.url);
  });
}

describe('usePendingSocialLinkResolver — 로그인 뒤 자동 연결', () => {
  beforeEach(() => { server.events.removeAllListeners(); countLinkRequests(); });

  it('토큰이 있으면 한 번 연결하고 결과와 함께 로그인 방법 화면으로 보낸다', async () => {
    storeToken(PENDING_LINK_MSW.tokens.kakao);
    mount(account());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=linked&provider=kakao'));
    expect(linkRequests).toHaveLength(1);
    expect(peekPendingSocialLink()).toBeNull();
  });

  it.each([
    ['kakaoMerged', 'merged'],
    ['kakaoAlready', 'already'],
    ['providerInUse', 'in_use'],
    ['providerExists', 'exists'],
    ['recentLoginRequired', 'recent_login'],
    ['accountMismatch', 'mismatch'],
  ] as const)('서버 시나리오 %s 는 linkResult=%s 로 전달된다', async (scenario, linkResult) => {
    storeToken(PENDING_LINK_MSW.tokens[scenario]);
    mount(account());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/my/settings/login-methods?linkResult=${linkResult}&provider=kakao`));
    expect(peekPendingSocialLink()).toBeNull();
  });

  it('Apple 토큰은 provider=apple 결과로 돌아온다', async () => {
    storeToken(PENDING_LINK_MSW.tokens.apple, 'apple');
    mount(account());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=linked&provider=apple'));
  });

  it('서버가 거절한 토큰(만료·불량)은 failed 로 안내하고 다시 쓰지 않는다', async () => {
    storeToken('msw-unknown-token-that-the-server-rejects');
    mount(account());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=failed&provider=kakao'));
    expect(peekPendingSocialLink()).toBeNull();
  });

  it('운영자 계정은 연결할 수 없다는 거절(403)을 failed 로 안내하고 토큰을 지운다 — 드문 경우라 따로 만들지 않은 결과다', async () => {
    storeToken(PENDING_LINK_MSW.tokens.kakao);
    server.use(http.post('*/api/v1/auth/link/pending', () => HttpResponse.json({
      status: 'error', statusCode: 403, code: 'SOCIAL_LINK_ADMIN_FORBIDDEN', message: '운영자 계정에는 소셜 로그인을 연결할 수 없어요.',
    }, { status: 403 })));
    mount(account());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=failed&provider=kakao'));
    expect(peekPendingSocialLink()).toBeNull();
  });

  it('계정이 가입 도중이면 연결 대신 가입을 이어 가는 화면으로 보낸다', async () => {
    storeToken(PENDING_LINK_MSW.tokens.signupIncomplete);
    mount(account());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/signup/social'));
    expect(peekPendingSocialLink()).toBeNull();
  });

  it('토큰이 없으면 아무 요청도 하지 않는다', async () => {
    mount(account());
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(linkRequests).toHaveLength(0);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('로그인 전(인증 확인 전)에는 토큰을 건드리지 않는다', async () => {
    storeToken(PENDING_LINK_MSW.tokens.kakao);
    mount(undefined);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(linkRequests).toHaveLength(0);
    expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao });
  });

  it.each(['social_terms_required', 'social_profile_required'])('%s 가입 도중 계정에는 붙이지 않고 토큰을 남긴다', async (onboardingStatus) => {
    storeToken(PENDING_LINK_MSW.tokens.kakao);
    mount(account({ onboardingStatus }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(linkRequests).toHaveLength(0);
    expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao });
  });

  it('auth/me 가 여러 번 갱신돼도 같은 토큰은 한 번만 보낸다', async () => {
    storeToken(PENDING_LINK_MSW.tokens.kakao);
    const view = mount(account());
    view.rerender({ current: account() });
    view.rerender({ current: account() });
    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(linkRequests).toHaveLength(1);
  });

  it('로그인했는데 대기 값이 만료 표식이면 expired 로 안내하고 연결 요청은 보내지 않는다', async () => {
    savePendingSocialLink({ next: 'sign_in_then_link', provider: 'apple', linkToken: PENDING_LINK_MSW.tokens.apple, linkTokenExpiresInSeconds: 0.05 });
    await new Promise((resolve) => setTimeout(resolve, 80));
    mount(account());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=expired&provider=apple'));
    expect(linkRequests).toHaveLength(0);
    expect(peekPendingSocialLink()).toBeNull();
  });

  // 만료 표식은 로그인 뒤 리졸버만 소비한다 — 배너·안내 화면이 보는 것(peek)으로는 사라지지 않는다.
  it('peek 로 몇 번 봐도 만료 표식은 리졸버가 읽을 때까지 남는다', async () => {
    savePendingSocialLink({ next: 'sign_in_then_link', provider: 'kakao', linkToken: PENDING_LINK_MSW.tokens.kakao, linkTokenExpiresInSeconds: 0.05 });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(peekPendingSocialLink()).toMatchObject({ provider: 'kakao', expired: true });
    expect(peekPendingSocialLink()).toMatchObject({ provider: 'kakao', expired: true });
    mount(account());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=expired&provider=kakao'));
    expect(takePendingSocialLink()).toBeNull();
  });

  it('정보 입력을 미룬 계정도 가입 중처럼 토큰을 남기고 이동 없이 기다린다', async () => {
    storeToken(PENDING_LINK_MSW.tokens.kakao);
    mount(account({ onboardingStatus: 'social_profile_deferred' }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(linkRequests).toHaveLength(0);
    expect(router.replace).not.toHaveBeenCalled();
    expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao });
  });

  describe('요청 실패의 종류별 처리', () => {
    const failWith = (statusCode: number, code: string) => server.use(http.post('*/api/v1/auth/link/pending', () => HttpResponse.json({
      status: 'error', statusCode, code, message: '실패',
    }, { status: statusCode })));

    afterEach(() => vi.useRealTimers());

    it.each([[503, 'SERVICE_UNAVAILABLE'], [429, 'RATE_LIMITED']])('%s 은 토큰을 둔 채 다시 시도해 성공하면 그때 지운다', async (statusCode, code) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
      storeToken(PENDING_LINK_MSW.tokens.kakao);
      failWith(statusCode, code);
      mount(account());
      await waitFor(() => expect(linkRequests).toHaveLength(1));
      expect(router.replace).not.toHaveBeenCalled();
      expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao });

      server.resetHandlers();
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=linked&provider=kakao'));
      expect(linkRequests).toHaveLength(2);
      expect(peekPendingSocialLink()).toBeNull();
    });

    it('계속 실패하면 상한(재시도 2회)에서 멈추고 failed 로 안내하며 토큰을 지운다', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
      storeToken(PENDING_LINK_MSW.tokens.kakao);
      failWith(503, 'SERVICE_UNAVAILABLE');
      mount(account());
      await waitFor(() => expect(linkRequests).toHaveLength(1));
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
      await waitFor(() => expect(linkRequests).toHaveLength(2));
      expect(router.replace).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS);
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=failed&provider=kakao'));
      expect(linkRequests).toHaveLength(3);
      expect(peekPendingSocialLink()).toBeNull();
    });

    it('응답을 받지 못한 네트워크 단절도 같은 재시도 대상이다', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });
      storeToken(PENDING_LINK_MSW.tokens.kakao);
      server.use(http.post('*/api/v1/auth/link/pending', () => HttpResponse.error()));
      mount(account());
      await waitFor(() => expect(linkRequests).toHaveLength(1));
      expect(router.replace).not.toHaveBeenCalled();
      expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao });
    });

    it.each([
      [409, 'SOCIAL_LINK_PROVIDER_IN_USE', 'in_use'],
      [400, 'SOCIAL_LINK_TOKEN_INVALID', 'failed'],
      [403, 'SOCIAL_LINK_ADMIN_FORBIDDEN', 'failed'],
    ])('확정된 거절 %s %s 는 다시 시도하지 않고 토큰을 지운 채 결과로 이동한다', async (statusCode, code, linkResult) => {
      storeToken(PENDING_LINK_MSW.tokens.kakao);
      failWith(statusCode, code);
      mount(account());
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/my/settings/login-methods?linkResult=${linkResult}&provider=kakao`));
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS + 200));
      expect(linkRequests).toHaveLength(1);
      expect(peekPendingSocialLink()).toBeNull();
    }, 10_000);

    // 로그인이 풀린 것이다 — 연결 결과로 보내지도, 토큰을 지우지도, 다시 시도하지도 않는다.
    it('401 은 토큰을 그대로 두고 이동하지 않는다', async () => {
      storeToken(PENDING_LINK_MSW.tokens.kakao);
      failWith(401, 'UNAUTHENTICATED');
      mount(account());
      await waitFor(() => expect(linkRequests).toHaveLength(1));
      await new Promise((resolve) => setTimeout(resolve, 80));
      expect(router.replace).not.toHaveBeenCalled();
      expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao });
      expect(linkRequests).toHaveLength(1);
    });
  });

  describe('약관 재동의', () => {
    it('동의가 끝날 때까지 기다리고 토큰을 지우지 않는다', async () => {
      storeToken(PENDING_LINK_MSW.tokens.kakao);
      mount(account({ compliant: false }));
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(linkRequests).toHaveLength(0);
      expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao });
    });

    it('동의를 마치고 돌아오면 같은 토큰으로 이어서 연결한다', async () => {
      storeToken(PENDING_LINK_MSW.tokens.kakao);
      const view = mount(account({ compliant: false }));
      view.rerender({ current: account({ compliant: true }) });
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=linked&provider=kakao'));
      expect(linkRequests).toHaveLength(1);
    });

    it('기다리는 동안 토큰이 만료되면 동의가 끝난 계정에서 한 번 expired 로 안내한다', async () => {
      savePendingSocialLink({ next: 'sign_in_then_link', provider: 'kakao', linkToken: PENDING_LINK_MSW.tokens.kakao, linkTokenExpiresInSeconds: 0.1 });
      const view = mount(account({ compliant: false }));
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(router.replace).not.toHaveBeenCalled();
      view.rerender({ current: account({ compliant: true }) });
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=expired&provider=kakao'));
      expect(linkRequests).toHaveLength(0);
      expect(peekPendingSocialLink()).toBeNull();
    });

    it('서버가 약관 재동의 403 을 주면 토큰을 지우지 않고 동의 화면으로 보낸다', async () => {
      storeToken(PENDING_LINK_MSW.tokens.kakao);
      server.use(http.post('*/api/v1/auth/link/pending', () => HttpResponse.json({
        status: 'error', statusCode: 403, code: 'TERMS_RECONSENT_REQUIRED', message: '새 필수 약관에 동의해야 계속할 수 있어요.',
        details: { pendingDocumentIds: ['doc-1'], next: { route: '/terms?mode=renewal' } },
      }, { status: 403 })));
      mount(account());
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/terms?mode=renewal'));
      expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao });
    });
  });
});
