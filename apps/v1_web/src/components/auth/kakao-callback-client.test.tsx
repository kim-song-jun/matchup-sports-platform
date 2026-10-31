import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as renderUi, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KakaoCallbackClient } from './kakao-callback-client';
import { KAKAO_OAUTH_STATE_STORAGE_KEY } from './auth.view-model';
import { V1ApiError } from '@/lib/api-client';
import { serializeKakaoOAuthAttempt } from '@/lib/kakao-oauth';
import { readPendingSocialLink } from '@/lib/pending-social-link';
import { readWithdrawalCancel } from '@/lib/withdrawal-cancel-storage';

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

const api = vi.hoisted(() => ({
  v1Post: vi.fn(),
}));

let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => searchParamsValue,
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

vi.mock('@/lib/api-client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
  return { ...actual, v1Post: api.v1Post };
});

// 콜백이 연결 모드에서 쓰는 훅(useMutation)까지 실제로 돌도록 QueryClientProvider 아래에서 렌더한다.
function render(ui: ReactElement) {
  return renderUi(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{ui}</QueryClientProvider>);
}

// 로그인 시도: 옛 형식(state 문자열만)과 새 형식(JSON) 모두 로그인으로 읽혀야 한다.
function primeValidOAuthState(stored: string = 'state-123') {
  window.sessionStorage.setItem(KAKAO_OAUTH_STATE_STORAGE_KEY, stored);
  searchParamsValue = new URLSearchParams({ code: 'auth-code', state: 'state-123' });
}

function primeLinkAttempt(returnTo: string | null = '/my/settings/login-methods') {
  window.sessionStorage.setItem(KAKAO_OAUTH_STATE_STORAGE_KEY, serializeKakaoOAuthAttempt({ state: 'state-123', mode: 'link', returnTo }));
  searchParamsValue = new URLSearchParams({ code: 'auth-code', state: 'state-123' });
}

const apiError = (statusCode: number, code: string, details?: Record<string, unknown>) =>
  new V1ApiError({ status: 'error', statusCode, code, message: '실패', details, timestamp: '2026-10-31T00:00:00.000Z' });

describe('KakaoCallbackClient address bar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  it('removes the OAuth code and state from the URL before analytics can read it', async () => {
    // Given the kauth redirect landed with the one-time code in the address bar
    window.history.replaceState(null, '', '/callback/kakao?code=auth-code&state=state-123');
    primeValidOAuthState();
    api.v1Post.mockResolvedValue({ session: { userId: 'u1', userEmail: null }, next: { route: '/home' } });

    // When
    render(<KakaoCallbackClient />);

    // Then the exchange still gets the code, but the address bar no longer carries it
    await waitFor(() => expect(api.v1Post).toHaveBeenCalledWith('/auth/kakao', expect.objectContaining({ code: 'auth-code' })));
    expect(window.location.pathname).toBe('/callback/kakao');
    expect(window.location.search).toBe('');
  });
});

describe('KakaoCallbackClient GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    searchParamsValue = new URLSearchParams();
  });

  it('tracks sign_up_start when the API routes a brand-new kakao user to social terms', async () => {
    // Given
    primeValidOAuthState();
    api.v1Post.mockResolvedValue({
      session: { userId: 'new-user', userEmail: null },
      next: { route: '/terms?mode=social', reason: 'social_terms_required' },
    });

    // When
    render(<KakaoCallbackClient />);

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('sign_up_start', { method: 'kakao' }));
    expect(analytics.trackEvent).not.toHaveBeenCalledWith('login', expect.anything());
    expect(router.replace).toHaveBeenCalledWith('/terms?mode=social');
  });

  it('keeps the saved redirect through the social onboarding route, and drops it once the user is logged in', async () => {
    window.sessionStorage.setItem('teameet.v1.savedRedirect', '/teams/new');
    primeValidOAuthState();
    api.v1Post.mockResolvedValue({
      session: { userId: 'new-user', userEmail: null },
      next: { route: '/terms?mode=social', reason: 'social_terms_required' },
    });
    const { unmount } = render(<KakaoCallbackClient />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/terms?mode=social'));
    expect(window.sessionStorage.getItem('teameet.v1.savedRedirect')).toBe('/teams/new');
    unmount();

    primeValidOAuthState();
    api.v1Post.mockResolvedValue({
      session: { userId: 'existing-user', userEmail: null },
      next: { route: '/home', reason: 'ready' },
    });
    render(<KakaoCallbackClient />);
    await waitFor(() => expect(router.replace).toHaveBeenLastCalledWith('/home'));
    expect(window.sessionStorage.getItem('teameet.v1.savedRedirect')).toBeNull();
  });

  it('tracks login when the API routes a returning kakao user straight into the app', async () => {
    // Given
    primeValidOAuthState();
    api.v1Post.mockResolvedValue({
      session: { userId: 'existing-user', userEmail: 'existing@example.com' },
      next: { route: '/home', reason: 'ready' },
    });

    // When
    render(<KakaoCallbackClient />);

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('login', { method: 'kakao' }));
    expect(analytics.trackEvent).not.toHaveBeenCalledWith('sign_up_start', expect.anything());
  });

  it('tracks login_failed with the API error code when the kakao exchange fails', async () => {
    // Given
    primeValidOAuthState();
    api.v1Post.mockRejectedValue(
      new V1ApiError({
        status: 'error',
        statusCode: 400,
        code: 'OAUTH_NOT_CONFIGURED',
        message: 'kakao oauth not configured',
        timestamp: new Date().toISOString(),
      }),
    );

    // When
    render(<KakaoCallbackClient />);

    // Then
    await waitFor(() => screen.getByText('카카오 로그인 설정이 아직 완료되지 않았어요.'));
    expect(analytics.trackEvent).toHaveBeenCalledWith('login_failed', { method: 'kakao', reason: 'OAUTH_NOT_CONFIGURED' });
  });

  it('tracks login_failed with invalid_state before ever calling the API', async () => {
    // Given: state stored locally does not match the state kakao returned (CSRF guard)
    window.sessionStorage.setItem(KAKAO_OAUTH_STATE_STORAGE_KEY, 'stored-state');
    searchParamsValue = new URLSearchParams({ code: 'auth-code', state: 'mismatched-state' });

    // When
    render(<KakaoCallbackClient />);

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('login_failed', { method: 'kakao', reason: 'invalid_state' }));
    expect(api.v1Post).not.toHaveBeenCalled();
  });
});

// V7: 응답 없는 실패의 원문("Failed to fetch")은 화면 문구가 아니다.
describe('KakaoCallbackClient 응답 없는 실패', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('fetch 가 응답 없이 실패하면 영어 원문 대신 해요체 안내를 보여 준다', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api-client')>('@/lib/api-client');
    api.v1Post.mockImplementation(actual.v1Post);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    primeValidOAuthState();

    render(<KakaoCallbackClient />);

    expect(await screen.findByText('카카오 로그인에 실패했어요.')).toBeInTheDocument();
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
  });
});

describe('KakaoCallbackClient 로그인 충돌과 탈퇴 철회', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    searchParamsValue = new URLSearchParams();
  });

  it('옛 형식(state 문자열만) 저장값도 로그인으로 읽는다', async () => {
    primeValidOAuthState('state-123');
    api.v1Post.mockResolvedValue({ session: { userId: 'u1', userEmail: null }, next: { route: '/home' } });
    render(<KakaoCallbackClient />);
    await waitFor(() => expect(api.v1Post).toHaveBeenCalledWith('/auth/kakao', expect.objectContaining({ code: 'auth-code' })));
    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('새 형식(JSON, mode=login) 저장값도 로그인으로 읽는다', async () => {
    primeValidOAuthState(serializeKakaoOAuthAttempt({ state: 'state-123', mode: 'login', returnTo: null }));
    api.v1Post.mockResolvedValue({ session: { userId: 'u1', userEmail: null }, next: { route: '/home' } });
    render(<KakaoCallbackClient />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'));
    expect(api.v1Post).toHaveBeenCalledTimes(1);
    expect(api.v1Post).toHaveBeenCalledWith('/auth/kakao', expect.anything());
  });

  it('"이미 팀밋 계정이 있어요" 409 는 연결 토큰을 보관하고 안내 화면으로 보낸다', async () => {
    primeValidOAuthState();
    window.sessionStorage.setItem('teameet.v1.savedRedirect', '/teams/new');
    api.v1Post.mockRejectedValue(apiError(409, 'SOCIAL_LINK_REQUIRES_VERIFIED_EMAIL', {
      next: 'sign_in_then_link', provider: 'kakao', linkToken: 'link-token-1', linkTokenExpiresInSeconds: 600,
    }));
    render(<KakaoCallbackClient />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/account-conflict?provider=kakao&redirect=%2Fteams%2Fnew'));
    expect(readPendingSocialLink()).toMatchObject({ linkToken: 'link-token-1', provider: 'kakao' });
    expect(screen.queryByText('로그인을 완료하지 못했어요')).not.toBeInTheDocument();
  });

  it('details 가 없는 409 는 안내 화면 대신 서버 문구를 보여 주고 토큰을 만들지 않는다', async () => {
    primeValidOAuthState();
    api.v1Post.mockRejectedValue(apiError(409, 'SOCIAL_LINK_CONTACT_CONFLICT'));
    render(<KakaoCallbackClient />);
    expect(await screen.findByText('실패')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(readPendingSocialLink()).toBeNull();
  });

  it('탈퇴 신청 계정의 403 은 철회 토큰을 보관하고 철회 화면으로 보낸다', async () => {
    primeValidOAuthState();
    window.sessionStorage.setItem('teameet.v1.savedRedirect', '/chat');
    api.v1Post.mockRejectedValue(apiError(403, 'ACCOUNT_WITHDRAWAL_PENDING', { withdrawalCancelToken: 'withdrawal-token-1', expiresInSeconds: 600 }));
    render(<KakaoCallbackClient />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/auth/withdrawal-cancel'));
    expect(readWithdrawalCancel()).toMatchObject({ token: 'withdrawal-token-1', returnTo: '/chat' });
  });

  it('철회 토큰이 없는 403 은 철회 화면으로 보내지 않는다(자격이 틀리면 계정 상태를 알리지 않는다)', async () => {
    primeValidOAuthState();
    api.v1Post.mockRejectedValue(apiError(403, 'ACCOUNT_WITHDRAWAL_PENDING'));
    render(<KakaoCallbackClient />);
    expect(await screen.findByText('실패')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(readWithdrawalCancel()).toBeNull();
  });
});

describe('KakaoCallbackClient 연결 모드', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    searchParamsValue = new URLSearchParams();
    vi.stubEnv('NEXT_PUBLIC_KAKAO_REDIRECT_URI', 'https://teameet.test/callback/kakao');
  });
  afterEach(() => vi.unstubAllEnvs());

  const linked = { provider: 'kakao', alreadyLinked: false, mergedPendingAccount: false, authProviders: ['email', 'kakao'] };

  it('로그인 API 가 아니라 연결 API 에 code 와 redirectUri 를 보내고 결과를 붙여 돌아간다', async () => {
    primeLinkAttempt('/my/settings/login-methods');
    api.v1Post.mockResolvedValue(linked);
    render(<KakaoCallbackClient />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=linked&provider=kakao'));
    expect(api.v1Post).toHaveBeenCalledTimes(1);
    expect(api.v1Post).toHaveBeenCalledWith('/auth/link/kakao', { code: 'auth-code', redirectUri: 'https://teameet.test/callback/kakao' });
    expect(analytics.trackEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['이미 연결돼 있으면 already', { ...linked, alreadyLinked: true }, 'already'],
    ['만들다 만 가입 계정을 옮기면 merged', { ...linked, mergedPendingAccount: true }, 'merged'],
  ])('%s', async (_label, result, linkResult) => {
    primeLinkAttempt();
    api.v1Post.mockResolvedValue(result);
    render(<KakaoCallbackClient />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/my/settings/login-methods?linkResult=${linkResult}&provider=kakao`));
  });

  it.each([
    [409, 'SOCIAL_LINK_PROVIDER_IN_USE', 'in_use'],
    [409, 'SOCIAL_LINK_PROVIDER_EXISTS', 'exists'],
    [403, 'RECENT_LOGIN_REQUIRED', 'recent_login'],
    [401, 'UNAUTHENTICATED', 'failed'],
  ])('%s %s 는 linkResult=%s 로 돌아가고 로그인 오류 화면을 띄우지 않는다', async (statusCode, code, linkResult) => {
    primeLinkAttempt('/my/settings/login-methods');
    api.v1Post.mockRejectedValue(apiError(statusCode, code, code === 'RECENT_LOGIN_REQUIRED' ? { maxAgeSeconds: 1800 } : undefined));
    render(<KakaoCallbackClient />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/my/settings/login-methods?linkResult=${linkResult}&provider=kakao`));
    expect(screen.queryByText('로그인을 완료하지 못했어요')).not.toBeInTheDocument();
  });

  it('가입이 덜 끝난 계정(SIGNUP_INCOMPLETE)은 연결 결과 대신 가입을 이어 갈 화면으로 보낸다', async () => {
    primeLinkAttempt();
    api.v1Post.mockRejectedValue(apiError(403, 'SIGNUP_INCOMPLETE', { next: { route: '/signup/social' } }));
    render(<KakaoCallbackClient />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/signup/social'));
  });

  it('돌아갈 곳이 같은 사이트 경로가 아니면 로그인 방법 화면으로 간다', async () => {
    primeLinkAttempt('https://evil.example/steal');
    api.v1Post.mockResolvedValue(linked);
    render(<KakaoCallbackClient />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=linked&provider=kakao'));
  });

  it('카카오에서 동의를 취소하고 돌아오면 연결 API 를 부르지 않고 실패 결과로 돌아간다', async () => {
    primeLinkAttempt();
    searchParamsValue = new URLSearchParams({ error: 'access_denied', state: 'state-123' });
    render(<KakaoCallbackClient />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/my/settings/login-methods?linkResult=failed&provider=kakao'));
    expect(api.v1Post).not.toHaveBeenCalled();
  });

  // code 주입 방어: 연결을 시작한 탭의 state 와 맞지 않으면 어떤 API 도 부르지 않는다.
  it('돌려받은 state 가 저장된 연결 시도와 다르면 연결 API 를 부르지 않는다', async () => {
    primeLinkAttempt();
    searchParamsValue = new URLSearchParams({ code: 'injected-code', state: 'attacker-state' });
    render(<KakaoCallbackClient />);
    expect(await screen.findByText('로그인 요청이 유효하지 않아요. 다시 시도해 주세요.')).toBeInTheDocument();
    expect(api.v1Post).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('저장된 시도가 없으면(다른 탭·만료) 연결 API 를 부르지 않는다', async () => {
    searchParamsValue = new URLSearchParams({ code: 'injected-code', state: 'state-123' });
    render(<KakaoCallbackClient />);
    expect(await screen.findByText('로그인 요청이 유효하지 않아요. 다시 시도해 주세요.')).toBeInTheDocument();
    expect(api.v1Post).not.toHaveBeenCalled();
  });

  it('저장된 시도는 한 번 읽으면 지워져 같은 콜백을 다시 열어도 재사용되지 않는다', async () => {
    primeLinkAttempt();
    api.v1Post.mockResolvedValue(linked);
    const { unmount } = render(<KakaoCallbackClient />);
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    unmount();
    api.v1Post.mockClear();
    searchParamsValue = new URLSearchParams({ code: 'auth-code', state: 'state-123' });
    render(<KakaoCallbackClient />);
    expect(await screen.findByText('로그인 요청이 유효하지 않아요. 다시 시도해 주세요.')).toBeInTheDocument();
    expect(api.v1Post).not.toHaveBeenCalled();
  });
});
