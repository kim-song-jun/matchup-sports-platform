import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingSocialSignupGate } from '@/components/auth/pending-social-signup-gate';
import { clearAuthHandoffStorage } from '@/lib/auth-handoff-storage';
import { readPendingEmailLink, savePendingEmailLink } from '@/lib/pending-email-link';
import { savePendingSocialLink } from '@/lib/pending-social-link';
import { v1Keys } from '@/lib/query-keys';
import { EMAIL_LINK_MSW, PENDING_LINK_MSW } from '@/test/msw/auth-link-handlers';
import { server } from '@/test/msw/server';
import { EmailLinkClient } from './email-link-client';

const navigation = vi.hoisted(() => ({ pathname: '/home', replace: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('@/components/auth/use-sign-out-and-leave', () => ({
  useSignOutAndLeave: () => ({ signOutAndLeave: vi.fn(), pending: false, error: null }),
}));

const EMAIL_LINK_ROUTE = '/my/settings/login-methods/email';
const TYPED = EMAIL_LINK_MSW.emails.ok;
let client: QueryClient;
let requestedEmails: string[];

function me(providers: string[], email: string | null, onboardingStatus: string) {
  return {
    user: { id: 'owner-1', email, accountStatus: 'active', onboardingStatus, authProvider: providers[0], authProviders: providers },
    profile: { displayName: '원래 계정' },
    verification: { emailVerified: false, phoneVerified: true },
    termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
  };
}

function serveAccount(providers: string[], email: string | null = null, onboardingStatus = 'completed') {
  server.use(http.get('*/api/v1/auth/me', () => HttpResponse.json({ status: 'success', data: me(providers, email, onboardingStatus) })));
}

// 주소 변경만 Next.js 대신 맡고, 앱 전역 게이트·제안 훅·연결 화면·API 훅은 실제다.
function Journey() {
  const [route, setRoute] = useState('/home');
  navigation.replace.mockImplementation((path: string) => {
    const commitUrl = () => window.history.replaceState({}, '', path);
    // Next 는 이동한 주소를 같은 렌더의 효과들이 돈 뒤에 반영한다. 연결 결과 화면으로의 이동은 그 시차를 그대로 둬서,
    // 주소만 보고는 "결과 화면이 떠 있다"를 알 수 없는 순서를 만든다.
    if (path.includes('linkResult=')) setTimeout(commitUrl, 0);
    else commitUrl();
    navigation.pathname = new URL(path, window.location.origin).pathname;
    setRoute(path);
  });
  return (
    <PendingSocialSignupGate>
      {new URL(route, window.location.origin).pathname === EMAIL_LINK_ROUTE ? <EmailLinkClient /> : <h1>{route}</h1>}
    </PendingSocialSignupGate>
  );
}

/** 게이트가 계정을 읽어 올 때까지 기다린다 — 이동이 없다는 단언이 읽기 전의 빈 시간에 통과하지 않게. */
async function accountLoaded() {
  await waitFor(() => expect(client.getQueryState(v1Keys.authMe())?.status).toBe('success'));
}

function mountJourney() {
  render(<QueryClientProvider client={client}><Journey /></QueryClientProvider>);
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  server.listen({ onUnhandledRequest: 'error' });
});
afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  // 게이트는 로그인 흔적(세션 힌트)이 있어야 /auth/me 를 읽는다.
  window.localStorage.setItem('teameet.v1.userId', 'owner-1');
  window.localStorage.setItem('teameet.v1.userEmail', 'owner@example.com');
  navigation.pathname = '/home';
  window.history.replaceState({}, '', '/home');
  navigation.replace.mockReset();
  requestedEmails = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } } });
  server.use(
    http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })),
    http.post('*/api/v1/auth/link/email/request', async ({ request }) => {
      requestedEmails.push(((await request.clone().json()) as { email: string }).email);
      return undefined;
    }),
  );
});
afterEach(() => {
  window.history.replaceState({}, '', '/');
  cleanup();
  client.clear();
  server.resetHandlers();
});

describe('가입 화면에서 이어 온 이메일 → 원래 계정 로그인 → 이메일 연결 화면', () => {
  it('이메일 로그인이 없는 계정으로 로그인하면 연결 화면으로 한 번 가서 이메일이 채워지고, 보관한 칸은 비워진다', async () => {
    savePendingEmailLink({ email: TYPED });
    serveAccount(['kakao']);
    mountJourney();

    expect(await screen.findByRole('heading', { level: 1, name: '이메일을 연결할까요?' })).toBeInTheDocument();
    expect(screen.getByLabelText('이메일')).toHaveValue(TYPED);
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(EMAIL_LINK_ROUTE);
    await waitFor(() => expect(readPendingEmailLink()).toBeNull());

    // 채워진 이메일로 탭 한 번에 인증번호가 간다 — 비밀번호는 다음 단계에서 새로 정한다.
    await userEvent.setup().click(screen.getByRole('button', { name: '인증번호 받기' }));
    expect(await screen.findByRole('heading', { level: 1, name: '인증번호를 입력해 주세요' })).toBeInTheDocument();
    expect(requestedEmails).toEqual([TYPED]);
    expect(navigation.replace).toHaveBeenCalledTimes(1);
  });

  it('이미 이메일 로그인이 있는 계정이면 연결 화면으로 가지 않고 칸만 비운다', async () => {
    savePendingEmailLink({ email: TYPED });
    serveAccount(['email', 'kakao'], 'owner@example.com');
    mountJourney();

    expect(await screen.findByRole('heading', { level: 1, name: '/home' })).toBeInTheDocument();
    await waitFor(() => expect(readPendingEmailLink()).toBeNull());
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('보관한 이메일이 이미 이 계정의 이메일이면 제안하지 않는다', async () => {
    savePendingEmailLink({ email: TYPED });
    serveAccount(['kakao'], TYPED.toUpperCase());
    mountJourney();

    expect(await screen.findByRole('heading', { level: 1, name: '/home' })).toBeInTheDocument();
    await waitFor(() => expect(readPendingEmailLink()).toBeNull());
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('가입 화면을 거치지 않고 로그인한 계정에는 아무 제안도 없다', async () => {
    serveAccount(['kakao']);
    mountJourney();

    await accountLoaded();
    expect(screen.getByRole('heading', { level: 1, name: '/home' })).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('로그아웃하면 앞사람이 입력한 이메일은 다음 로그인에서 제안되지 않는다', async () => {
    savePendingEmailLink({ email: TYPED });

    clearAuthHandoffStorage();
    serveAccount(['kakao']);
    mountJourney();

    await accountLoaded();
    expect(screen.getByRole('heading', { level: 1, name: '/home' })).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});

describe('원래 목적지와 다른 자동 이동과의 순서', () => {
  it('가입 화면이 보관한 목적지가 연결 화면으로 이어져, 첫 단계의 뒤로 가기가 그곳으로 간다', async () => {
    savePendingEmailLink({ email: TYPED, returnTo: '/matches/abc?tab=info' });
    serveAccount(['kakao']);
    mountJourney();

    expect(await screen.findByRole('heading', { level: 1, name: '이메일을 연결할까요?' })).toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(`${EMAIL_LINK_ROUTE}?redirect=%2Fmatches%2Fabc%3Ftab%3Dinfo`);
    expect(screen.getAllByRole('link', { name: '뒤로가기' })[0]).toHaveAttribute('href', '/matches/abc?tab=info');
    expect(screen.getByLabelText('이메일')).toHaveValue(TYPED);
  });

  // 리졸버가 만료 안내로 곧바로 보내는 순서: 같은 렌더에서 리졸버가 먼저 이동하고 제안이 뒤따른다.
  it('소셜 연결 시간이 지났다는 안내(expired)를 리졸버가 먼저 보였다면 제안이 그 화면을 덮어쓰지 않고 이메일은 비워진다', async () => {
    savePendingEmailLink({ email: TYPED });
    savePendingSocialLink(
      { next: 'sign_in_then_link', provider: 'kakao', linkToken: PENDING_LINK_MSW.tokens.kakao, linkTokenExpiresInSeconds: PENDING_LINK_MSW.expiresInSeconds },
      Date.now() - 24 * 60 * 60 * 1000,
    );
    serveAccount(['kakao']);
    mountJourney();

    expect(await screen.findByRole('heading', { level: 1, name: '/my/settings/login-methods?linkResult=expired&provider=kakao' })).toBeInTheDocument();
    await client.invalidateQueries({ queryKey: v1Keys.authMe() });
    await accountLoaded();

    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith('/my/settings/login-methods?linkResult=expired&provider=kakao');
    expect(readPendingEmailLink()).toBeNull();
  });

  // 연결이 진행되는 동안 계정이 갱신되고, 결과 화면이 뜬 뒤에도 계정이 다시 갱신되는 순서.
  it('소셜 연결이 진행 중이다가 결과 화면이 뜬 뒤에는, 계정이 다시 갱신돼도 그 화면을 이메일 제안이 덮어쓰지 않는다', async () => {
    savePendingEmailLink({ email: TYPED });
    savePendingSocialLink({
      next: 'sign_in_then_link',
      provider: 'kakao',
      linkToken: PENDING_LINK_MSW.tokens.kakao,
      linkTokenExpiresInSeconds: PENDING_LINK_MSW.expiresInSeconds,
    });
    serveAccount(['kakao']);
    mountJourney();

    const resultRoute = '/my/settings/login-methods?linkResult=linked&provider=kakao';
    expect(await screen.findByRole('heading', { level: 1, name: resultRoute })).toBeInTheDocument();
    // 결과 화면이 떠 있는 동안 계정이 다시 읽혀도(창 포커스 갱신 등) 화면은 그대로다.
    await client.invalidateQueries({ queryKey: v1Keys.authMe() });
    await accountLoaded();
    await waitFor(() => expect(readPendingEmailLink()).toBeNull());

    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(resultRoute);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(resultRoute);
  });

  it('새 소셜 계정으로 가입하는 중이면 그 계정이 가입을 마친 뒤에도 이메일을 제안하지 않는다', async () => {
    savePendingEmailLink({ email: TYPED });
    serveAccount(['kakao'], null, 'social_profile_required');
    mountJourney();

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/signup/social'));
    await waitFor(() => expect(readPendingEmailLink()).toBeNull());

    serveAccount(['kakao']);
    await client.invalidateQueries({ queryKey: v1Keys.authMe() });
    await accountLoaded();

    expect(navigation.replace).not.toHaveBeenCalledWith(expect.stringContaining(EMAIL_LINK_ROUTE));
  });
});
