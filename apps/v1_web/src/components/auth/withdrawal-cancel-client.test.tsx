import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { v1Keys } from '@/lib/query-keys';
import { V1_SESSION_HINT_KEY } from '@/lib/session-storage';
import {
  readWithdrawalCancel,
  saveWithdrawalCancel,
  WITHDRAWAL_CANCEL_STORAGE_KEY,
} from '@/lib/withdrawal-cancel-storage';
import { WITHDRAWAL_MSW } from '@/test/msw/auth-link-handlers';
import { server } from '@/test/msw/server';
import { WithdrawalCancelClient } from './withdrawal-cancel-client';

const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }));

const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));

vi.mock('@/lib/analytics', () => ({ trackEvent: analytics.trackEvent }));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/auth/withdrawal-cancel',
}));

const INTRO_CTA = '탈퇴 신청 취소하고 다시 쓰기';
const CONFIRM_LABEL = '취소하고 다시 쓰기';
const ACK_LABEL = '빠진 팀·명단이 돌아오지 않는 것을 이해했어요';

let cancelRequests: Request[] = [];

function seedToken(token: string = WITHDRAWAL_MSW.tokens.valid, returnTo: string | null = null) {
  saveWithdrawalCancel({ token, expiresInSeconds: WITHDRAWAL_MSW.expiresInSeconds }, returnTo);
}

function renderScreen() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <WithdrawalCancelClient />
    </QueryClientProvider>,
  );
  return { queryClient };
}

async function openConfirm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: INTRO_CTA }));
  return screen.findByRole('dialog');
}

async function acknowledgeAndConfirm(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
  await user.click(within(dialog).getByRole('checkbox', { name: ACK_LABEL }));
  await user.click(within(dialog).getByRole('button', { name: CONFIRM_LABEL }));
}

function serverError(statusCode: number, code: string, message: string) {
  return HttpResponse.json(
    { status: 'error', statusCode, code, message, details: null, timestamp: '2026-10-31T00:00:00.000Z' },
    { status: statusCode },
  );
}

beforeAll(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
  server.listen({ onUnhandledRequest: 'error' });
  server.events.on('request:start', ({ request }) => {
    if (new URL(request.url).pathname.endsWith('/auth/withdrawal/cancel')) cancelRequests.push(request.clone());
  });
});
afterAll(() => {
  server.events.removeAllListeners();
  server.close();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.clearAllMocks();
  cancelRequests = [];
  window.sessionStorage.clear();
  window.localStorage.clear();
  // 실패 응답은 api-client 가 서버로 보고한다.
  server.use(http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', data: {} })));
});
afterEach(() => server.resetHandlers());

describe('WithdrawalCancelClient entry', () => {
  it('asks to sign in again instead of cancelling when there is no stored token', async () => {
    renderScreen();

    expect(await screen.findByRole('heading', { level: 1, name: '다시 로그인해 주세요' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '다시 로그인하기' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: INTRO_CTA })).not.toBeInTheDocument();
    expect(cancelRequests).toHaveLength(0);
  });

  it('treats an expired token like a missing one and drops it', async () => {
    saveWithdrawalCancel(
      { token: WITHDRAWAL_MSW.tokens.valid, expiresInSeconds: WITHDRAWAL_MSW.expiresInSeconds },
      null,
      Date.now() - (WITHDRAWAL_MSW.expiresInSeconds + 1) * 1000,
    );

    renderScreen();

    expect(await screen.findByRole('heading', { level: 1, name: '다시 로그인해 주세요' })).toBeInTheDocument();
    expect(window.sessionStorage.getItem(WITHDRAWAL_CANCEL_STORAGE_KEY)).toBeNull();
    expect(cancelRequests).toHaveLength(0);
  });

  it('explains the consequences and offers the cancel for a live token', async () => {
    seedToken();

    renderScreen();

    expect(await screen.findByRole('heading', { level: 1, name: '탈퇴를 신청한 계정이에요' })).toBeInTheDocument();
    expect(screen.getByText(/신청할 때 빠진 팀과 경기 명단은 돌아오지 않아요/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: INTRO_CTA })).toBeInTheDocument();
    expect(cancelRequests).toHaveLength(0);
  });

  it('keeps the withdrawal, drops the token and returns to sign-in with the original destination', async () => {
    seedToken(WITHDRAWAL_MSW.tokens.valid, '/matches/42');
    const user = userEvent.setup();
    renderScreen();

    await user.click(await screen.findByRole('button', { name: '그대로 두기' }));

    expect(router.replace).toHaveBeenCalledWith('/login?redirect=%2Fmatches%2F42');
    expect(readWithdrawalCancel()).toBeNull();
    expect(cancelRequests).toHaveLength(0);
  });
});

describe('WithdrawalCancelClient confirmation', () => {
  it('keeps the confirm button disabled until the irreversible loss is acknowledged', async () => {
    seedToken();
    const user = userEvent.setup();
    renderScreen();

    const dialog = await openConfirm(user);
    expect(within(dialog).getByText(/팀에 다시 가입 신청을 해 주세요/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: CONFIRM_LABEL });
    expect(confirm).toBeDisabled();

    await user.click(confirm);
    expect(cancelRequests).toHaveLength(0);

    await user.click(within(dialog).getByRole('checkbox', { name: ACK_LABEL }));
    expect(confirm).toBeEnabled();
  });

  it('closes the dialog without any request and keeps the token when the user backs out', async () => {
    seedToken();
    const user = userEvent.setup();
    renderScreen();

    const dialog = await openConfirm(user);
    await user.click(within(dialog).getByRole('checkbox', { name: ACK_LABEL }));
    await user.click(within(dialog).getByRole('button', { name: '그대로 두기' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { level: 1, name: '탈퇴를 신청한 계정이에요' })).toBeInTheDocument();
    expect(cancelRequests).toHaveLength(0);
    expect(readWithdrawalCancel()?.token).toBe(WITHDRAWAL_MSW.tokens.valid);
  });
});

describe('WithdrawalCancelClient success', () => {
  it('cancels once, signs the browser in like a login and shows what to check next', async () => {
    seedToken();
    const user = userEvent.setup();
    const { queryClient } = renderScreen();
    queryClient.setQueryData(v1Keys.profile(), { userId: 'previous-identity' });

    const dialog = await openConfirm(user);
    await user.click(within(dialog).getByRole('checkbox', { name: ACK_LABEL }));
    await user.dblClick(within(dialog).getByRole('button', { name: CONFIRM_LABEL }));

    const heading = await screen.findByRole('heading', { level: 1, name: '탈퇴 신청을 취소했어요' });
    expect(heading).toHaveFocus();
    expect(screen.getByText('알림을 다시 켜 주세요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '홈으로 가기' })).toHaveAttribute('href', '/home');
    expect(cancelRequests).toHaveLength(1);
    await expect(cancelRequests[0].json()).resolves.toEqual({ token: WITHDRAWAL_MSW.tokens.valid });
    expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active');
    expect(analytics.trackEvent).toHaveBeenCalledWith('login', { method: 'withdrawal_cancel' });
    expect(queryClient.getQueryCache().findAll({ queryKey: v1Keys.all })).toHaveLength(0);
    expect(readWithdrawalCancel()).toBeNull();
  });

  it('continues to the stored return path when it is on this site', async () => {
    seedToken(WITHDRAWAL_MSW.tokens.valid, '/matches/42');
    const user = userEvent.setup();
    renderScreen();

    await acknowledgeAndConfirm(user, await openConfirm(user));

    expect(await screen.findByRole('link', { name: '계속하기' })).toHaveAttribute('href', '/matches/42');
  });

  it('never continues to another origin even if the stored return path was tampered with', async () => {
    window.sessionStorage.setItem(WITHDRAWAL_CANCEL_STORAGE_KEY, JSON.stringify({
      token: WITHDRAWAL_MSW.tokens.valid,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      returnTo: 'https://evil.example/phish',
    }));
    const user = userEvent.setup();
    renderScreen();

    await acknowledgeAndConfirm(user, await openConfirm(user));

    expect(await screen.findByRole('link', { name: '홈으로 가기' })).toHaveAttribute('href', '/home');
  });

  it('follows the route the server asks for, such as an unfinished onboarding step', async () => {
    seedToken(WITHDRAWAL_MSW.tokens.valid, '/matches/42');
    server.use(http.post('*/api/v1/auth/withdrawal/cancel', () => HttpResponse.json({
      status: 'success',
      data: {
        user: { id: 'user-1', email: 'user@example.test', onboardingStatus: 'profile_required' },
        profile: { displayName: '테스트' },
        session: { userId: 'user-1', userEmail: 'user@example.test' },
        next: { route: '/onboarding/region' },
      },
      timestamp: '2026-10-31T00:00:00.000Z',
    })));
    const user = userEvent.setup();
    renderScreen();

    await acknowledgeAndConfirm(user, await openConfirm(user));

    expect(await screen.findByRole('link', { name: '계속하기' })).toHaveAttribute('href', expect.stringMatching(/^\/onboarding\/region/));
  });
});

describe('WithdrawalCancelClient failures', () => {
  it('sends an expired server token back to sign-in and keeps the original destination', async () => {
    seedToken(WITHDRAWAL_MSW.tokens.expired, '/matches/42');
    const user = userEvent.setup();
    renderScreen();

    await acknowledgeAndConfirm(user, await openConfirm(user));

    expect(await screen.findByRole('heading', { level: 1, name: '이 요청은 더 이상 쓸 수 없어요' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '다시 로그인하기' })).toHaveAttribute('href', '/login?redirect=%2Fmatches%2F42');
    expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
    expect(readWithdrawalCancel()).toBeNull();
  });

  it('tells the user the withdrawal is already processed and offers sign-up and contact without promising a re-signup', async () => {
    seedToken(WITHDRAWAL_MSW.tokens.processed);
    const user = userEvent.setup();
    renderScreen();

    await acknowledgeAndConfirm(user, await openConfirm(user));

    expect(await screen.findByRole('heading', { level: 1, name: '이미 탈퇴 처리가 끝난 계정이에요' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '새로 가입하기' })).toHaveAttribute('href', '/terms?mode=signup');
    expect(screen.getByRole('link', { name: '문의하기' })).toHaveAttribute('href', '/contact');
    expect(screen.queryByText(/같은 정보로/)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
    expect(readWithdrawalCancel()).toBeNull();
  });

  it('keeps the dialog and the token on a transient failure so the user can retry', async () => {
    seedToken();
    server.use(
      http.post('*/api/v1/auth/withdrawal/cancel', () => serverError(503, 'SERVICE_UNAVAILABLE', '서버가 바빠요. 잠시 후 다시 시도해 주세요.'), { once: true }),
    );
    const user = userEvent.setup();
    renderScreen();

    const dialog = await openConfirm(user);
    await acknowledgeAndConfirm(user, dialog);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('서버가 바빠요. 잠시 후 다시 시도해 주세요.');
    expect(readWithdrawalCancel()?.token).toBe(WITHDRAWAL_MSW.tokens.valid);
    expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: CONFIRM_LABEL }));

    expect(await screen.findByRole('heading', { level: 1, name: '탈퇴 신청을 취소했어요' })).toBeInTheDocument();
    expect(cancelRequests).toHaveLength(2);
  });
});
