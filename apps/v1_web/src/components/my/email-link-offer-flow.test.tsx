import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingSocialSignupGate } from '@/components/auth/pending-social-signup-gate';
import { clearAuthHandoffStorage } from '@/lib/auth-handoff-storage';
import { readPendingEmailLink, savePendingEmailLink } from '@/lib/pending-email-link';
import { v1Keys } from '@/lib/query-keys';
import { EMAIL_LINK_MSW } from '@/test/msw/auth-link-handlers';
import { server } from '@/test/msw/server';
import { EmailLinkClient } from './email-link-client';

const navigation = vi.hoisted(() => ({ pathname: '/home', replace: vi.fn(), push: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/auth/use-sign-out-and-leave', () => ({
  useSignOutAndLeave: () => ({ signOutAndLeave: vi.fn(), pending: false, error: null }),
}));

const EMAIL_LINK_ROUTE = '/my/settings/login-methods/email';
const TYPED = EMAIL_LINK_MSW.emails.ok;
let client: QueryClient;
let requestedEmails: string[];

function me(providers: string[], email: string | null) {
  return {
    user: { id: 'owner-1', email, accountStatus: 'active', onboardingStatus: 'completed', authProvider: providers[0], authProviders: providers },
    profile: { displayName: '원래 계정' },
    verification: { emailVerified: false, phoneVerified: true },
    termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
  };
}

function serveAccount(providers: string[], email: string | null = null) {
  server.use(http.get('*/api/v1/auth/me', () => HttpResponse.json({ status: 'success', data: me(providers, email) })));
}

// 주소 변경만 Next.js 대신 맡고, 앱 전역 게이트·제안 훅·연결 화면·API 훅은 실제다.
function Journey() {
  const [route, setRoute] = useState('/home');
  navigation.replace.mockImplementation((path: string) => {
    navigation.pathname = path;
    setRoute(path);
  });
  return (
    <PendingSocialSignupGate>
      {route === EMAIL_LINK_ROUTE ? <EmailLinkClient /> : <h1>{route}</h1>}
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
  window.localStorage.setItem('teameet.v1.userEmail', 'owner@example.test');
  navigation.pathname = '/home';
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
  cleanup();
  client.clear();
  server.resetHandlers();
});

describe('가입 화면에서 이어 온 이메일 → 원래 계정 로그인 → 이메일 연결 화면', () => {
  it('이메일 로그인이 없는 계정으로 로그인하면 연결 화면으로 한 번 가서 이메일이 채워지고, 보관한 칸은 비워진다', async () => {
    savePendingEmailLink(TYPED);
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
    savePendingEmailLink(TYPED);
    serveAccount(['email', 'kakao'], 'owner@example.test');
    mountJourney();

    expect(await screen.findByRole('heading', { level: 1, name: '/home' })).toBeInTheDocument();
    await waitFor(() => expect(readPendingEmailLink()).toBeNull());
    expect(navigation.replace).not.toHaveBeenCalled();
  });

  it('보관한 이메일이 이미 이 계정의 이메일이면 제안하지 않는다', async () => {
    savePendingEmailLink(TYPED);
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
    savePendingEmailLink(TYPED);

    clearAuthHandoffStorage();
    serveAccount(['kakao']);
    mountJourney();

    await accountLoaded();
    expect(screen.getByRole('heading', { level: 1, name: '/home' })).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
