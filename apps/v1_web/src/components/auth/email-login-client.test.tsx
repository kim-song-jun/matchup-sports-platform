import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailLoginClient } from './email-login-client';
import { V1ApiError } from '@/lib/api-client';
import { __resetNavigationHistoryForTests, installNavigationHistory } from '@/lib/navigation-history';
import { readPendingSocialLink, savePendingSocialLink } from '@/lib/pending-social-link';
import { getSavedRedirectPath, resolveAuthContinuationPath } from '@/lib/session-storage';
import { readWithdrawalCancel } from '@/lib/withdrawal-cancel-storage';

const router = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  loginMutate: vi.fn(),
}));

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

const nativeApple = vi.hoisted(() => ({ available: false }));

vi.mock('@/lib/native-apple', () => ({
  isNativeAppleSignInAvailable: () => nativeApple.available,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ removeQueries: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1EmailLogin: () => ({ mutate: hooks.loginMutate, isPending: false }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

type LoginCallbacks = {
  readonly onSuccess?: (result: {
    readonly session: { readonly userId: string; readonly userEmail: string | null };
    readonly next?: { readonly route: string };
  }) => void;
  readonly onError?: (error: unknown) => void;
  readonly onSettled?: () => void;
};

async function submitLogin(email: string, password: string): Promise<void> {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
}

describe('EmailLoginClient GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeApple.available = false;
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/login/email');
  });

  it('tracks a login event with method=email on successful sign-in', async () => {
    // Given
    hooks.loginMutate.mockImplementation((_body: unknown, callbacks: LoginCallbacks) =>
      callbacks.onSuccess?.({
        session: { userId: 'user-1', userEmail: 'me@example.com' },
        next: { route: '/home' },
      }),
    );
    render(<EmailLoginClient />);

    // When
    await submitLogin('me@example.com', 'password123');

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('login', { method: 'email' }));
  });

  it('routes a non-compliant user straight to mandatory renewal and preserves the original destination', async () => {
    window.history.replaceState({}, '', '/login/email?redirect=%2Fmy');
    hooks.loginMutate.mockImplementation((_body: unknown, callbacks: LoginCallbacks) =>
      callbacks.onSuccess?.({
        session: { userId: 'user-1', userEmail: 'me@example.com' },
        next: { route: '/terms?mode=renewal' },
      }),
    );
    render(<EmailLoginClient />);

    await submitLogin('me@example.com', 'password123');

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/terms?mode=renewal'),
    );
    // 필수 단계에서 원 목적지는 sessionStorage에 보존하고 마지막 성공에서 소비한다.
    expect(getSavedRedirectPath()).toBe('/my');
    expect(resolveAuthContinuationPath('/home')).toBe('/my');
    expect(getSavedRedirectPath()).toBeNull();
  });

  it('tracks a login_failed event carrying the API error code as reason', async () => {
    // Given
    hooks.loginMutate.mockImplementation((_body: unknown, callbacks: LoginCallbacks) =>
      callbacks.onError?.(
        new V1ApiError({
          status: 'error',
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          message: 'invalid credentials',
          timestamp: new Date().toISOString(),
        }),
      ),
    );
    render(<EmailLoginClient />);

    // When
    await submitLogin('me@example.com', 'wrongpass');

    // Then
    await waitFor(() =>
      expect(analytics.trackEvent).toHaveBeenCalledWith('login_failed', { method: 'email', reason: 'UNAUTHENTICATED' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      "이메일 또는 비밀번호가 맞지 않아요. 카카오로 가입하셨다면 로그인 첫 화면의 '카카오' 버튼으로 로그인해 주세요.",
    );
    expect(screen.getByLabelText('이메일')).toHaveAttribute('aria-describedby', 'email-login-error');
    expect(screen.getByLabelText('비밀번호')).toHaveAttribute('aria-describedby', 'email-login-error');
  });

  it('iOS 앱(Apple 로그인 가능)에서는 401 안내에 Apple 버튼도 함께 알려준다', async () => {
    nativeApple.available = true;
    hooks.loginMutate.mockImplementation((_body: unknown, callbacks: LoginCallbacks) =>
      callbacks.onError?.(
        new V1ApiError({
          status: 'error',
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          message: 'invalid credentials',
          timestamp: new Date().toISOString(),
        }),
      ),
    );
    render(<EmailLoginClient />);

    await submitLogin('me@example.com', 'wrongpass');

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        "이메일 또는 비밀번호가 맞지 않아요. 카카오나 Apple로 가입하셨다면 로그인 첫 화면의 '카카오' 또는 'Apple로 계속하기' 버튼으로 로그인해 주세요.",
      ),
    );
  });

  it('401 이 아닌 실패(네트워크 오류)는 소셜 안내 없이 일반 문구를 보여준다', async () => {
    hooks.loginMutate.mockImplementation((_body: unknown, callbacks: LoginCallbacks) =>
      callbacks.onError?.(new Error('Network Error')),
    );
    render(<EmailLoginClient />);

    await submitLogin('me@example.com', 'wrongpass');

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('지금은 로그인할 수 없어요. 잠시 후 다시 시도해 주세요.'));
    expect(screen.getByRole('alert')).not.toHaveTextContent('카카오');
  });
});

describe('EmailLoginClient back to the login start screen', () => {
  const loginUrl = '/login?redirect=%2Ftournaments%2Ft1%2Fmy';

  beforeEach(() => {
    vi.clearAllMocks();
    __resetNavigationHistoryForTests();
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/home');
    installNavigationHistory();
  });

  it('keeps redirect on the back target so the restored login still knows where it came from', () => {
    render(<EmailLoginClient redirectPath="/tournaments/t1/my" />);

    for (const back of screen.getAllByRole('link', { name: '뒤로가기' })) {
      expect(back).toHaveAttribute('href', loginUrl);
    }
  });

  it('pops the email step instead of stacking a second login entry on top of it', () => {
    window.history.pushState({}, '', '/tournaments/t1');
    window.history.pushState({}, '', loginUrl);
    window.history.pushState({}, '', '/login/email?redirect=%2Ftournaments%2Ft1%2Fmy');
    render(<EmailLoginClient redirectPath="/tournaments/t1/my" />);

    fireEvent.click(screen.getAllByRole('link', { name: '뒤로가기' })[0]);

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe('EmailLoginClient 탈퇴 철회와 대기 연결 안내', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nativeApple.available = false;
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/login/email');
  });

  const withdrawalError = (details?: Record<string, unknown>) => new V1ApiError({
    status: 'error', statusCode: 403, code: 'ACCOUNT_WITHDRAWAL_PENDING', message: '탈퇴 신청 중인 계정이에요.', details, timestamp: '2026-10-31T00:00:00.000Z',
  });

  it('자격이 맞은 탈퇴 신청 계정은 철회 토큰을 보관하고 철회 화면으로 보낸다', async () => {
    window.history.replaceState({}, '', '/login/email?redirect=%2Fchat');
    hooks.loginMutate.mockImplementation((_body: unknown, callbacks: LoginCallbacks) =>
      callbacks.onError?.(withdrawalError({ withdrawalCancelToken: 'withdrawal-token-1', expiresInSeconds: 600 })));
    render(<EmailLoginClient />);

    await submitLogin('withdrawn@example.com', 'password123');

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/auth/withdrawal-cancel'));
    expect(readWithdrawalCancel()).toMatchObject({ token: 'withdrawal-token-1', returnTo: '/chat' });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('철회 토큰이 없는 403 은 철회 화면으로 보내지 않고 일반 실패 문구를 보여 준다', async () => {
    hooks.loginMutate.mockImplementation((_body: unknown, callbacks: LoginCallbacks) => callbacks.onError?.(withdrawalError()));
    render(<EmailLoginClient />);

    await submitLogin('withdrawn@example.com', 'password123');

    expect(await screen.findByRole('alert')).toHaveTextContent('지금은 로그인할 수 없어요');
    expect(router.push).not.toHaveBeenCalled();
    expect(readWithdrawalCancel()).toBeNull();
  });

  it('대기 연결 토큰이 있으면 로그인하면 연결된다고 알리고, 연결 안 하기로 끊을 수 있다', async () => {
    savePendingSocialLink({ next: 'sign_in_then_link', provider: 'kakao', linkToken: 'link-token-1', linkTokenExpiresInSeconds: 600 });
    render(<EmailLoginClient />);

    expect(await screen.findByText(/로그인하면 카카오 로그인이 이 계정에 연결돼요\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '연결 안 하기' }));

    expect(screen.queryByText(/로그인하면 카카오 로그인이 이 계정에 연결돼요\./)).not.toBeInTheDocument();
    expect(readPendingSocialLink()).toBeNull();
  });

  it('대기 연결 토큰이 없으면 안내를 그리지 않는다', () => {
    render(<EmailLoginClient />);
    expect(screen.queryByRole('button', { name: '연결 안 하기' })).not.toBeInTheDocument();
  });
});
