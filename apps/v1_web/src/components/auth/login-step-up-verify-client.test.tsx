import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGIN_STEP_UP_STORAGE_KEY, readLoginStepUp, saveLoginStepUp } from '@/lib/login-step-up';
import { V1_SESSION_HINT_KEY } from '@/lib/session-storage';
import { STEP_UP_MSW, stepUpChallengeFixture } from '@/test/msw/auth-step-up-handlers';
import { server } from '@/test/msw/server';
import type { V1LoginStepUpChallenge } from '@/types/api';
import { LoginStepUpVerifyClient } from './login-step-up-verify-client';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/analytics', () => ({ trackEvent: mocks.trackEvent }));
// 실패 응답은 서버로 보고되는 경로가 따로 있다 — 이 테스트의 관심사가 아니라서 네트워크로 새지 않게 막는다.
vi.mock('@/lib/client-error-reporter', () => ({ reportClientError: vi.fn() }));

const PAST = '2026-10-20T00:00:00.000Z';

function storeChallenge(overrides: Partial<V1LoginStepUpChallenge> = {}, redirect: string | null = '/my') {
  saveLoginStepUp(stepUpChallengeFixture(overrides), redirect);
}

function renderVerify() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LoginStepUpVerifyClient />
    </QueryClientProvider>,
  );
}

function typeCode(value: string) {
  fireEvent.change(screen.getByLabelText('인증번호 6자리'), { target: { value } });
}

describe('LoginStepUpVerifyClient', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    server.resetHandlers();
    vi.useRealTimers();
  });

  describe('screen', () => {
    it('shows the identity check with the masked email, a one-time-code field, and the way back', async () => {
      storeChallenge();
      renderVerify();

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/본인 확인이\s*한 번 더 필요해요/);
      expect(screen.getByText(/최근 로그인 실패가 있어/)).toHaveTextContent(`(${STEP_UP_MSW.maskedEmail})`);
      const input = screen.getByLabelText('인증번호 6자리');
      expect(input).toHaveAttribute('inputmode', 'numeric');
      expect(input).toHaveAttribute('autocomplete', 'one-time-code');
      expect(screen.getByRole('button', { name: '확인하고 로그인' })).toBeDisabled();
      expect(screen.getByText(/메일이 오지 않으면 스팸함을 보거나 이메일·비밀번호를 다시 확인해 주세요/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '다른 계정으로 로그인' })).toHaveAttribute('href', '/login/email?redirect=%2Fmy');
    });

    it('keeps only digits, at most six, and enables the button once the code is complete', async () => {
      storeChallenge();
      renderVerify();
      await screen.findByLabelText('인증번호 6자리');

      typeCode('12a3-45 678');

      expect(screen.getByLabelText('인증번호 6자리')).toHaveValue('123456');
      expect(screen.getByRole('button', { name: '확인하고 로그인' })).toBeEnabled();
    });

    it('prefills the echoed code where the server provides one (alpha)', async () => {
      storeChallenge({ devCode: STEP_UP_MSW.code });
      renderVerify();

      expect(await screen.findByLabelText('인증번호 6자리')).toHaveValue(STEP_UP_MSW.code);
    });

    it('tells the user to start over when there is no stored challenge', async () => {
      renderVerify();

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('본인 확인을 이어갈 수 없어요');
      expect(screen.queryByLabelText('인증번호 6자리')).toBeNull();
      expect(screen.getByRole('link', { name: '이메일 로그인으로 돌아가기' })).toHaveAttribute('href', '/login/email');
    });

    it('treats a corrupted stored challenge like a missing one', async () => {
      window.sessionStorage.setItem(LOGIN_STEP_UP_STORAGE_KEY, '{"challengeToken":"x"}');
      renderVerify();

      expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('본인 확인을 이어갈 수 없어요');
    });
  });

  describe('verifying the code', () => {
    it('signs in with the same follow-up as a password login and goes where the user was headed', async () => {
      storeChallenge();
      renderVerify();
      await screen.findByLabelText('인증번호 6자리');

      typeCode(STEP_UP_MSW.code);
      fireEvent.click(screen.getByRole('button', { name: '확인하고 로그인' }));

      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/my'));
      expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBe('active');
      expect(mocks.trackEvent).toHaveBeenCalledWith('login', { method: 'email' });
      expect(readLoginStepUp()).toBeNull();
    });

    it('goes home when the login had no destination', async () => {
      storeChallenge({}, null);
      renderVerify();
      await screen.findByLabelText('인증번호 6자리');

      typeCode(STEP_UP_MSW.code);
      fireEvent.click(screen.getByRole('button', { name: '확인하고 로그인' }));

      await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/home'));
    });

    it('announces a wrong code, keeps the challenge for another try, and returns focus to the field', async () => {
      storeChallenge();
      renderVerify();
      await screen.findByLabelText('인증번호 6자리');

      typeCode('000000');
      fireEvent.click(screen.getByRole('button', { name: '확인하고 로그인' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('인증번호가 맞지 않아요');
      const input = screen.getByLabelText('인증번호 6자리');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input.getAttribute('aria-describedby')).toContain(alert.id);
      expect(input).toHaveFocus();
      expect(input).toHaveValue('000000');
      expect(mocks.replace).not.toHaveBeenCalled();
      expect(window.localStorage.getItem(V1_SESSION_HINT_KEY)).toBeNull();
      expect(readLoginStepUp()).not.toBeNull();
      expect(mocks.trackEvent).toHaveBeenCalledWith('login_step_up_failed', { reason: 'STEP_UP_CODE_INVALID' });
    });

    it('ends the attempt when the server says the challenge expired', async () => {
      storeChallenge({ challengeToken: STEP_UP_MSW.tokens.expired });
      renderVerify();
      await screen.findByLabelText('인증번호 6자리');

      typeCode(STEP_UP_MSW.code);
      fireEvent.click(screen.getByRole('button', { name: '확인하고 로그인' }));

      expect(await screen.findByRole('heading', { level: 1, name: '인증 시간이 지났어요' })).toBeInTheDocument();
      expect(screen.queryByLabelText('인증번호 6자리')).toBeNull();
      expect(screen.getByRole('link', { name: '이메일 로그인으로 돌아가기' })).toHaveAttribute('href', '/login/email?redirect=%2Fmy');
      expect(readLoginStepUp()).toBeNull();
    });

    it('locks the screen after too many wrong codes', async () => {
      storeChallenge({ challengeToken: STEP_UP_MSW.tokens.locked });
      renderVerify();
      await screen.findByLabelText('인증번호 6자리');

      typeCode('111111');
      fireEvent.click(screen.getByRole('button', { name: '확인하고 로그인' }));

      expect(await screen.findByRole('heading', { level: 1, name: '인증번호를 너무 많이 틀렸어요' })).toBeInTheDocument();
      expect(screen.queryByLabelText('인증번호 6자리')).toBeNull();
      expect(readLoginStepUp()).toBeNull();
    });
  });

  describe('resending the code', () => {
    it('sends a new code, starts a new wait, and stores the refreshed times', async () => {
      storeChallenge({ resendAvailableAt: PAST });
      renderVerify();
      const resend = await screen.findByRole('button', { name: '인증번호 다시 받기' });
      expect(resend).toBeEnabled();

      fireEvent.click(resend);

      expect(await screen.findByRole('status')).toHaveTextContent('인증번호를 다시 보냈어요');
      expect(screen.getByRole('button', { name: /^인증번호 다시 받기 \(\d+초\)$/ })).toBeDisabled();
      expect(screen.getByLabelText('인증번호 6자리')).toHaveFocus();
      expect(Date.parse(readLoginStepUp()?.resendAvailableAt ?? '')).toBeGreaterThan(Date.now());
    });

    it('explains the server-side wait as a notice, not as a failure', async () => {
      storeChallenge({ challengeToken: STEP_UP_MSW.tokens.cooldown, resendAvailableAt: PAST });
      renderVerify();

      fireEvent.click(await screen.findByRole('button', { name: '인증번호 다시 받기' }));

      expect(await screen.findByRole('status')).toHaveTextContent('잠시 후에 다시 받을 수 있어요');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('button', { name: /^인증번호 다시 받기 \(\d+초\)$/ })).toBeDisabled();
    });

    it('ends the attempt when the challenge can no longer be resent', async () => {
      storeChallenge({ challengeToken: STEP_UP_MSW.tokens.expired, resendAvailableAt: PAST });
      renderVerify();

      fireEvent.click(await screen.findByRole('button', { name: '인증번호 다시 받기' }));

      expect(await screen.findByRole('heading', { level: 1, name: '인증 시간이 지났어요' })).toBeInTheDocument();
    });
  });

  describe('countdown', () => {
    const START = new Date('2026-10-21T00:00:00.000Z');

    it('keeps resend disabled until the server-given time and then enables it', () => {
      vi.useFakeTimers();
      vi.setSystemTime(START);
      storeChallenge({
        expiresAt: new Date(START.getTime() + 5 * 60_000).toISOString(),
        resendAvailableAt: new Date(START.getTime() + 30_000).toISOString(),
      });
      renderVerify();

      expect(screen.getByRole('button', { name: '인증번호 다시 받기 (30초)' })).toBeDisabled();
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(screen.getByRole('button', { name: '인증번호 다시 받기 (20초)' })).toBeDisabled();
      act(() => { vi.advanceTimersByTime(20_000); });
      expect(screen.getByRole('button', { name: '인증번호 다시 받기' })).toBeEnabled();
    });

    it('locks the field and the submit button once the code has expired and says to request a new one', () => {
      vi.useFakeTimers();
      vi.setSystemTime(START);
      storeChallenge({
        expiresAt: new Date(START.getTime() + 65_000).toISOString(),
        resendAvailableAt: new Date(START.getTime() + 30_000).toISOString(),
      });
      renderVerify();
      typeCode('123456');

      expect(screen.getByText('남은 시간 1:05')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '확인하고 로그인' })).toBeEnabled();

      act(() => { vi.advanceTimersByTime(65_000); });

      expect(screen.getByText(/인증번호 입력 시간이 지났어요/)).toBeInTheDocument();
      expect(screen.getByLabelText('인증번호 6자리')).toBeDisabled();
      expect(screen.getByRole('button', { name: '확인하고 로그인' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '인증번호 다시 받기' })).toBeEnabled();
    });
  });
});
