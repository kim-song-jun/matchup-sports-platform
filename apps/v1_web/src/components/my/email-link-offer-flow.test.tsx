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

const failure = (statusCode: number, code: string) => HttpResponse.json(
  { status: 'error', statusCode, code, message: '실패', details: null, timestamp: '2026-11-08T00:00:00.000Z' },
  { status: statusCode },
);

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
    expect(await screen.findByText('이 계정에는 이미 이메일 로그인이 있어요.')).toBeVisible();
  });

  // 서버는 호출자 자신이 쥔 주소의 이메일 로그인 연결을 받아 준다 — 계정 이메일과 같아도 연결 화면까지 이어 간다.
  it('보관한 이메일이 이 계정의 이메일과 같아도(이메일 로그인은 없는 계정) 연결 화면으로 이어 간다', async () => {
    savePendingEmailLink({ email: TYPED });
    serveAccount(['kakao'], TYPED.toUpperCase());
    mountJourney();

    expect(await screen.findByRole('heading', { level: 1, name: '이메일을 연결할까요?' })).toBeInTheDocument();
    expect(screen.getByLabelText('이메일')).toHaveValue(TYPED);
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(EMAIL_LINK_ROUTE);
    await waitFor(() => expect(readPendingEmailLink()).toBeNull());
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

describe('이메일 없이 뜻만 이어 온 경우(번호 인증이 먼저라 이메일을 아직 적기 전)', () => {
  it('로그인하면 연결 화면으로 한 번 가서 빈 칸에 이메일을 적어 인증번호를 받고, 보관한 칸은 비워진다', async () => {
    savePendingEmailLink({ email: null, returnTo: '/matches/abc' });
    serveAccount(['kakao']);
    mountJourney();

    expect(await screen.findByRole('heading', { level: 1, name: '이메일을 연결할까요?' })).toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledExactlyOnceWith(`${EMAIL_LINK_ROUTE}?redirect=%2Fmatches%2Fabc`);
    expect(screen.getByLabelText('이메일')).toHaveValue('');
    expect(screen.getByText('가입하려던 이메일을 적어 주세요. 비밀번호는 저장하지 않아서 새로 정해 주세요.')).toBeInTheDocument();
    await waitFor(() => expect(readPendingEmailLink()).toBeNull());

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('이메일'), TYPED);
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }));
    expect(await screen.findByRole('heading', { level: 1, name: '인증번호를 입력해 주세요' })).toBeInTheDocument();
    expect(requestedEmails).toEqual([TYPED]);
  });

  it('나중에 할게요를 누르면 요청 없이 가려던 곳으로 돌아가고, 계정이 다시 읽혀도 제안이 되살아나지 않는다', async () => {
    savePendingEmailLink({ email: null, returnTo: '/matches/abc' });
    serveAccount(['kakao']);
    mountJourney();
    await screen.findByRole('heading', { level: 1, name: '이메일을 연결할까요?' });

    await userEvent.setup().click(screen.getByRole('button', { name: '나중에 할게요' }));

    expect(await screen.findByRole('heading', { level: 1, name: '/matches/abc' })).toBeInTheDocument();
    await client.invalidateQueries({ queryKey: v1Keys.authMe() });
    await accountLoaded();
    expect(requestedEmails).toEqual([]);
    expect(readPendingEmailLink()).toBeNull();
    expect(navigation.replace).toHaveBeenCalledTimes(2);
  });

  // 운영자 계정은 서버가 요청 단계에서 거절한다 — 화면은 안내로 멈추고 보관한 뜻은 이미 비어 있어 되풀이되지 않는다.
  it('운영자 계정이면 서버의 거절 안내로 멈추고, 계정이 다시 읽혀도 연결 화면으로 되돌아가지 않는다', async () => {
    savePendingEmailLink({ email: null });
    serveAccount(['kakao']);
    server.use(http.post('*/api/v1/auth/link/email/request', () => failure(403, 'SOCIAL_LINK_ADMIN_FORBIDDEN')));
    mountJourney();
    await screen.findByRole('heading', { level: 1, name: '이메일을 연결할까요?' });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('이메일'), TYPED);
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }));

    expect(await screen.findByRole('heading', { level: 1, name: '이메일 로그인을 연결할 수 없어요' })).toBeInTheDocument();
    expect(readPendingEmailLink()).toBeNull();
    await client.invalidateQueries({ queryKey: v1Keys.authMe() });
    await accountLoaded();
    expect(screen.getByRole('heading', { level: 1, name: '이메일 로그인을 연결할 수 없어요' })).toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledTimes(1);
  });

  it('로그아웃하면 앞사람이 남긴 뜻은 다음 로그인에서 이어지지 않는다', async () => {
    savePendingEmailLink({ email: null });

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
