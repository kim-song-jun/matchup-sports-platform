import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { serializeKakaoOAuthAttempt } from '@/lib/kakao-oauth';
import { peekPendingSocialLink } from '@/lib/pending-social-link';
import { readWithdrawalCancel } from '@/lib/withdrawal-cancel-storage';
import { LINK_MSW, PENDING_LINK_MSW } from '@/test/msw/auth-link-handlers';
import { server } from '@/test/msw/server';
import { AccountExistsGuide } from './account-exists-guide';
import { KAKAO_OAUTH_STATE_STORAGE_KEY } from './auth.view-model';
import { EmailLoginClient } from './email-login-client';
import { KakaoCallbackClient } from './kakao-callback-client';
import { PendingSocialSignupGate } from './pending-social-signup-gate';

const navigation = vi.hoisted(() => ({ pathname: '/', replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => <a href={href} className={className}>{children}</a>,
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const LOGIN_METHODS_RESULT = '/my/settings/login-methods?linkResult=linked&provider=kakao';
let client: QueryClient;
const requests: string[] = [];

// 주소 변경만 Next.js 대신 맡고, 콜백·안내 화면·이메일 로그인·앱 전역 게이트·자동 연결·API 훅은 실제다.
function Journey({ initialRoute }: { initialRoute: string }) {
  const [route, setRoute] = useState(initialRoute);
  const navigate = (path: string) => {
    window.history.replaceState({}, '', path);
    navigation.pathname = window.location.pathname;
    setRoute(path);
  };
  navigation.replace.mockImplementation(navigate);
  navigation.push.mockImplementation(navigate);
  const url = new URL(route, window.location.origin);
  const provider = url.searchParams.get('provider');
  return (
    <PendingSocialSignupGate>
      {url.pathname === '/callback/kakao' ? <KakaoCallbackClient />
        : url.pathname === '/auth/account-conflict' ? <AccountExistsGuide provider={provider === 'kakao' || provider === 'apple' ? provider : null} redirectPath={url.searchParams.get('redirect')} />
          : url.pathname === '/login/email' ? <EmailLoginClient redirectPath={url.searchParams.get('redirect')} />
            : <h1>{route}</h1>}
    </PendingSocialSignupGate>
  );
}

function openCallback(code: string) {
  window.sessionStorage.setItem(KAKAO_OAUTH_STATE_STORAGE_KEY, serializeKakaoOAuthAttempt({ state: 'state-1', mode: 'login', returnTo: null }));
  const path = `/callback/kakao?code=${code}&state=state-1`;
  window.history.replaceState({}, '', path);
  navigation.pathname = '/callback/kakao';
  render(<QueryClientProvider client={client}><Journey initialRoute={path} /></QueryClientProvider>);
}

async function loginWithEmail(user: ReturnType<typeof userEvent.setup>) {
  fireEvent.change(await screen.findByLabelText('이메일'), { target: { value: 'owner@example.test' } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'synthetic-password' } });
  await user.click(screen.getByRole('button', { name: '로그인' }));
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  requests.length = 0;
  navigation.replace.mockReset();
  navigation.push.mockReset();
  vi.stubEnv('NEXT_PUBLIC_KAKAO_REDIRECT_URI', 'https://teameet.test/callback/kakao');
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } } });
  server.use(
    // 기본 /auth/me 는 사용자 객체만 돌려주는 단순 목이라, 게이트가 읽는 실제 응답 모양(user·profile)으로 바꾼다.
    http.get('*/api/v1/auth/me', () => HttpResponse.json({ status: 'success', data: {
      user: { id: 'owner-1', email: 'owner@example.test', accountStatus: 'active', onboardingStatus: 'completed', authProvider: 'email' },
      profile: { displayName: '원래 계정' },
      verification: { emailVerified: false, phoneVerified: true },
      termsCompliance: { compliant: true, pendingRequiredDocumentIds: [], nextRoute: null },
    } })),
    http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })),
  );
  server.events.removeAllListeners();
  server.events.on('request:start', ({ request }) => {
    const { pathname } = new URL(request.url);
    if (pathname.includes('/auth/link/') || pathname.endsWith('/auth/kakao') || pathname.endsWith('/auth/login')) requests.push(`${request.method} ${pathname}`);
  });
});
afterEach(() => { cleanup(); client.clear(); server.resetHandlers(); vi.unstubAllEnvs(); });

describe('카카오 로그인 충돌 → 원래 계정 로그인 → 자동 연결', () => {
  it('409 에서 토큰을 보관하고 안내 화면을 거쳐, 이메일 로그인 한 번으로 연결 결과 화면까지 간다', async () => {
    openCallback(LINK_MSW.loginConflicts.unverifiedEmail);

    // 1) 충돌 409 → 안내 화면 + 보관된 토큰
    expect(await screen.findByRole('heading', { level: 1, name: '이미 팀밋 계정이 있어요' })).toBeInTheDocument();
    expect(navigation.replace).toHaveBeenCalledWith('/auth/account-conflict?provider=kakao');
    expect(peekPendingSocialLink()).toMatchObject({ linkToken: PENDING_LINK_MSW.tokens.kakao, provider: 'kakao' });
    expect(screen.getByText('30분 안에 로그인하면 카카오 로그인이 자동으로 연결돼요')).toBeInTheDocument();
    expect(requests).toEqual(['POST /api/v1/auth/kakao']);

    // 2) 안내 화면의 "이메일로 로그인하기" → 이메일 로그인 화면(연결 안내가 함께 보인다)
    expect(screen.getByRole('link', { name: '이메일로 로그인하기' })).toHaveAttribute('href', '/login/email');
    const user = userEvent.setup();
    act(() => navigation.push('/login/email'));
    expect(await screen.findByText(/로그인하면 카카오 로그인이 이 계정에 연결돼요\./)).toBeInTheDocument();

    // 3) 로그인 → 앱 전역 게이트가 토큰으로 한 번 연결하고 결과와 함께 로그인 방법 화면으로 보낸다
    await loginWithEmail(user);
    await screen.findByRole('heading', { level: 1, name: LOGIN_METHODS_RESULT });
    expect(window.location.pathname + window.location.search).toBe(LOGIN_METHODS_RESULT);
    expect(requests).toEqual(['POST /api/v1/auth/kakao', 'POST /api/v1/auth/login', 'POST /api/v1/auth/link/pending']);
    expect(peekPendingSocialLink()).toBeNull();
  });

  it('연결 안 하기를 누르고 로그인하면 로그인만 되고 연결 요청은 나가지 않는다', async () => {
    openCallback(LINK_MSW.loginConflicts.unverifiedEmail);
    await screen.findByRole('heading', { level: 1, name: '이미 팀밋 계정이 있어요' });
    const user = userEvent.setup();
    act(() => navigation.push('/login/email'));

    await user.click(await screen.findByRole('button', { name: '연결 안 하기' }));
    await loginWithEmail(user);

    await screen.findByRole('heading', { level: 1, name: '/home' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests).toEqual(['POST /api/v1/auth/kakao', 'POST /api/v1/auth/login']);
    expect(navigation.replace).not.toHaveBeenLastCalledWith(expect.stringContaining('linkResult'));
  });

  it('로그인 방법 화면까지 갔더라도 같은 토큰으로 다시 연결하지 않는다', async () => {
    openCallback(LINK_MSW.loginConflicts.contactConflict);
    await screen.findByRole('heading', { level: 1, name: '이미 팀밋 계정이 있어요' });
    const user = userEvent.setup();
    act(() => navigation.push('/login/email'));
    await loginWithEmail(user);
    await screen.findByRole('heading', { level: 1, name: LOGIN_METHODS_RESULT });

    act(() => navigation.push('/home'));
    await screen.findByRole('heading', { level: 1, name: '/home' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requests.filter((request) => request.includes('/auth/link/'))).toEqual(['POST /api/v1/auth/link/pending']);
  });
});

describe('카카오 콜백의 탈퇴 철회 갈래', () => {
  it('탈퇴 신청 계정의 로그인은 철회 토큰을 보관하고 철회 화면 경로로 보낸다', async () => {
    // WITHDRAWAL_MSW 는 이메일 로그인만 가로채므로, 카카오 코드로 403 을 내는 핸들러를 더한다.
    server.use(http.post('*/api/v1/auth/kakao', () => HttpResponse.json({
      status: 'error', statusCode: 403, code: 'ACCOUNT_WITHDRAWAL_PENDING', message: '탈퇴 신청 중인 계정이에요.',
      details: { withdrawalCancelToken: 'withdrawal-token-1', expiresInSeconds: 600 },
    }, { status: 403 })));
    openCallback('any-code');
    await screen.findByRole('heading', { level: 1, name: '/auth/withdrawal-cancel' });
    expect(readWithdrawalCancel()).toMatchObject({ token: 'withdrawal-token-1' });
  });
});
