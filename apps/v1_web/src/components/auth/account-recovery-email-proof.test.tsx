import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountRecoveryClient } from './account-recovery-client';
import { authUiServer, failure, RECOVERY_EMAIL, RECOVERY_PHONE, renderAuthUi, resetWireScenario, wireCalls } from './mdqa133-auth-ui.fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), back: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

beforeAll(() => authUiServer.listen({ onUnhandledRequest: 'error' }));
afterAll(() => authUiServer.close());
beforeEach(() => {
  resetWireScenario();
  window.localStorage.clear();
  window.sessionStorage.clear();
});
afterEach(() => { cleanup(); authUiServer.resetHandlers(); });

async function verifyEmail(address = RECOVERY_EMAIL) {
  fireEvent.change(await screen.findByLabelText('이메일'), { target: { value: address } });
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: '인증번호 받기' }));
  await user.click(await screen.findByRole('button', { name: '확인' }));
  await screen.findByLabelText('새 비밀번호');
  return user;
}

async function submitPassword() {
  fireEvent.change(await screen.findByLabelText('새 비밀번호'), { target: { value: 'synthetic-new-password' } });
  fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'synthetic-new-password' } });
  await userEvent.setup().click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
}

describe('MD-QA #133 비밀번호 복구는 독립 이메일 증명을 사용한다', () => {
  it('비밀번호 재설정 직접 진입은 이메일 입력만 제공한다', () => {
    renderAuthUi(<AccountRecoveryClient initialMode="reset-password" />);
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.queryByLabelText('휴대폰 번호')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '휴대폰' })).not.toBeInTheDocument();
  });

  it('아이디 찾기에서 재설정으로 전환하면 전화번호 증명을 이어 쓰지 않는다', async () => {
    renderAuthUi(<AccountRecoveryClient />);
    fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: RECOVERY_PHONE } });
    fireEvent.click(screen.getByRole('tab', { name: '비밀번호 재설정' }));

    expect(await screen.findByLabelText('이메일')).toBeInTheDocument();
    expect(screen.queryByLabelText('휴대폰 번호')).not.toBeInTheDocument();
    expect(wireCalls.phoneReset).toBe(0);
  });

  it('실제 이메일 발급·확인·재설정 HTTP를 거친 뒤에만 성공 화면을 보여준다', async () => {
    renderAuthUi(<AccountRecoveryClient initialMode="reset-password" />);
    await verifyEmail('  Owner@Example.TEST ');
    await submitPassword();

    expect(await screen.findByText('비밀번호를 바꿨어요')).toBeInTheDocument();
    expect(wireCalls.emailIssue).toEqual([{ email: RECOVERY_EMAIL }]);
    expect(wireCalls.emailVerify).toEqual([{ email: RECOVERY_EMAIL, code: '123456' }]);
    expect(wireCalls.emailReset).toEqual([{ email: RECOVERY_EMAIL, proofToken: 'email-proof', newPassword: 'synthetic-new-password' }]);
    expect(wireCalls.phoneReset).toBe(0);
    expect(screen.getByRole('link', { name: '로그인하러 가기' })).toHaveAttribute('href', '/login/email');
  });

  it('이메일 재설정 서버 실패는 실제 오류와 입력을 유지하고 성공을 만들지 않는다', async () => {
    authUiServer.use(http.post('*/api/v1/auth/recovery/email/reset-password', () => failure('RECOVERY_UNAVAILABLE', '합성 이메일 복구 서비스 오류', 503)));
    renderAuthUi(<AccountRecoveryClient initialMode="reset-password" />);
    await verifyEmail();
    await submitPassword();

    expect(await screen.findByText('합성 이메일 복구 서비스 오류')).toBeInTheDocument();
    expect(screen.queryByText('비밀번호를 바꿨어요')).not.toBeInTheDocument();
    expect(screen.getByLabelText('새 비밀번호')).toHaveValue('synthetic-new-password');
    expect(wireCalls.phoneReset).toBe(0);
  });

  it('이메일 증명 뒤 소셜 전용 계정은 실제 로그인 출구로 안내한다', async () => {
    authUiServer.use(http.post('*/api/v1/auth/recovery/email/reset-password', () => failure('PASSWORD_LOGIN_UNAVAILABLE', '비밀번호가 없는 계정이에요.')));
    renderAuthUi(<AccountRecoveryClient initialMode="reset-password" />);
    await verifyEmail();
    await submitPassword();

    expect(await screen.findByRole('link', { name: '로그인 화면으로' })).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
    expect(screen.queryByText('비밀번호를 바꿨어요')).not.toBeInTheDocument();
  });

  it('아이디 찾기의 기존 전화번호 조회는 비밀번호 변경 없이 유지한다', async () => {
    renderAuthUi(<AccountRecoveryClient />);
    fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: RECOVERY_PHONE } });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }));
    await user.click(await screen.findByRole('button', { name: '확인' }));

    expect(await screen.findByText('ow***@example.test')).toBeInTheDocument();
    expect(wireCalls.phoneVerify).toEqual([{ phone: RECOVERY_PHONE, code: '123456', purpose: 'password_reset' }]);
    expect(wireCalls.findAccount).toEqual([{ phone: RECOVERY_PHONE, proofToken: 'phone-proof' }]);
    expect(wireCalls.phoneReset).toBe(0);
    expect(wireCalls.emailReset).toHaveLength(0);
  });
});
