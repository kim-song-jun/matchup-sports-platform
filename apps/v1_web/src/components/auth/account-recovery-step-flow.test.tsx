import { cleanup, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountRecoveryClient } from './account-recovery-client';
import { authUiServer, RECOVERY_EMAIL, RECOVERY_PHONE, renderAuthUi, resetWireScenario, wireCalls } from './mdqa133-auth-ui.fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), back: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

beforeAll(() => authUiServer.listen({ onUnhandledRequest: 'error' }));
afterAll(() => authUiServer.close());
beforeEach(resetWireScenario);
afterEach(() => { cleanup(); authUiServer.resetHandlers(); });

describe('계정 복구 단계별 흐름', () => {
  it('목적·휴대폰 선택과 입력·문자 인증 뒤에만 로그인 방법을 보여준다', async () => {
    const user = userEvent.setup();
    renderAuthUi(<AccountRecoveryClient />);
    expect(screen.getByRole('heading', { name: '어떤 도움이 필요하세요?' })).toBeVisible();
    expect(screen.queryByLabelText('휴대폰 번호')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '아이디·로그인 방법 찾기' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('heading', { name: '어떤 방법으로 확인할까요?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: '휴대폰으로 찾기' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: RECOVERY_PHONE } });
    expect(screen.queryByRole('button', { name: '인증번호 받기' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.queryByLabelText('휴대폰 번호')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }));
    await user.click(await screen.findByRole('button', { name: '확인' }));
    expect(await screen.findByText('가입한 로그인 방법')).toBeVisible();
    expect(screen.queryByText(/\*\*\*@/)).not.toBeInTheDocument();
    expect(wireCalls.phoneVerify).toEqual([{ phone: RECOVERY_PHONE, code: '123456', purpose: 'password_reset' }]);
    expect(wireCalls.findAccount).toEqual([{ phone: RECOVERY_PHONE, proofToken: 'phone-proof' }]);
    expect(wireCalls.phoneReset).toBe(0);
  });

  it('비밀번호 재설정은 이메일 인증과 새 비밀번호를 각각 보여주고 실제 저장 뒤 완료한다', async () => {
    const user = userEvent.setup();
    renderAuthUi(<AccountRecoveryClient />);
    await user.click(screen.getByRole('button', { name: '비밀번호 재설정' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: RECOVERY_EMAIL } });
    expect(screen.queryByRole('button', { name: '인증번호 받기' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '인증번호 받기' }));
    await user.click(await screen.findByRole('button', { name: '확인' }));
    fireEvent.change(await screen.findByLabelText('새 비밀번호'), { target: { value: 'synthetic-new-password' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'synthetic-new-password' } });
    await user.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    expect(await screen.findByText('비밀번호를 바꿨어요')).toBeVisible();
    expect(wireCalls.emailReset).toEqual([{ email: RECOVERY_EMAIL, proofToken: 'email-proof', newPassword: 'synthetic-new-password' }]);
    expect(wireCalls.phoneReset).toBe(0);
  });
});
