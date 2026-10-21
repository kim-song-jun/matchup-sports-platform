import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGIN_STEP_UP_STORAGE_KEY, readLoginStepUp } from '@/lib/login-step-up';
import { V1_SESSION_HINT_KEY } from '@/lib/session-storage';
import { STEP_UP_MSW } from '@/test/msw/auth-step-up-handlers';
import { server } from '@/test/msw/server';
import { EmailLoginClient } from './email-login-client';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: mocks.trackEvent }));
// 실패 응답은 서버로 보고되는 경로가 따로 있다 — 이 테스트의 관심사가 아니라서 네트워크로 새지 않게 막는다.
vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));

function renderLogin() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <EmailLoginClient />
    </QueryClientProvider>,
  );
}

function submitLogin(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: '로그인' }));
}

describe('EmailLoginClient step-up branch', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/login/email?redirect=%2Fmy');
  });
  afterEach(() => {
    server.resetHandlers();
    vi.restoreAllMocks();
  });

  it('moves to the identity check with the challenge in sessionStorage and nothing in the URL or session', async () => {
    renderLogin();

    // 비밀번호는 틀려도 된다 — 서버는 맞고 틀림에 관계없이 같은 모양으로 답한다.
    submitLogin(STEP_UP_MSW.email, 'wrong-password');

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/login/email/verify'));
    expect(readLoginStepUp()).toMatchObject({
      challengeToken: STEP_UP_MSW.tokens.valid,
      maskedEmail: STEP_UP_MSW.maskedEmail,
      redirect: '/my',
    });
    expect(mocks.push.mock.calls[0]?.[0]).not.toContain(STEP_UP_MSW.tokens.valid);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
    expect(mocks.trackEvent).toHaveBeenCalledWith('login_step_up_required', { method: 'email' });
    expect(mocks.trackEvent).not.toHaveBeenCalledWith('login', expect.anything());
  });

  it('still signs in directly when the server answers with a session', async () => {
    renderLogin();

    submitLogin('someone@example.com', 'password123');

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/my'));
    expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active');
    expect(mocks.push).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(LOGIN_STEP_UP_STORAGE_KEY)).toBeNull();
  });

  it('says why the screen did not move on when the browser blocks sessionStorage', async () => {
    // 검색 세션 id 등 다른 저장은 그대로 두고 챌린지 저장만 막는다.
    const realSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === LOGIN_STEP_UP_STORAGE_KEY) throw new DOMException('blocked', 'SecurityError');
      realSetItem.call(this, key, value);
    });
    renderLogin();

    submitLogin(STEP_UP_MSW.email, 'wrong-password');

    expect(await screen.findByRole('alert')).toHaveTextContent('본인 확인 화면으로 이동하지 못했어요');
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('shows a rate-limit message that is distinct from the generic outage message', async () => {
    server.use(http.post('*/api/v1/auth/login', () => HttpResponse.json({
      status: 'error', statusCode: 429, code: 'THROTTLED', message: 'ThrottlerException: Too Many Requests',
      details: null, timestamp: '2026-10-21T00:00:00.000Z',
    }, { status: 429 })));
    renderLogin();

    submitLogin('someone@example.com', 'password123');

    expect(await screen.findByRole('alert')).toHaveTextContent('로그인 시도가 많아요. 잠시 후 다시 시도해 주세요.');
    expect(screen.queryByText(/지금은 로그인할 수 없어요/)).toBeNull();
  });
});
