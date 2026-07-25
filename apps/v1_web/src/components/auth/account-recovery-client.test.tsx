import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountRecoveryClient } from './account-recovery-client';

const hooks = vi.hoisted(() => ({
  findAccountMutateAsync: vi.fn(),
  resetPasswordMutateAsync: vi.fn(),
  verifyPurpose: null as null | string,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1FindAccountByPhone: () => ({ mutateAsync: hooks.findAccountMutateAsync, isPending: false }),
  useV1ResetPasswordByPhone: () => ({ mutateAsync: hooks.resetPasswordMutateAsync, isPending: false }),
}));

// 카드 내부(발급·폴링)와 디커플 — 부모가 넘긴 purpose 를 드러내고 onVerified 만 직접 트리거한다.
vi.mock('@/components/auth/phone-verification/phone-verification-card', () => ({
  PhoneVerificationCard: ({ purpose, onVerified }: { purpose?: string; onVerified: (t?: string) => void }) => {
    hooks.verifyPurpose = purpose ?? null;
    return <button type="button" onClick={() => onVerified('RESET-TOKEN')}>__stub_verify__</button>;
  },
}));

function enterPhone() {
  fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: '01012345678' } });
}

describe('AccountRecoveryClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.verifyPurpose = null;
    hooks.findAccountMutateAsync.mockResolvedValue({
      maskedEmail: 'ru***@example.com',
      providers: ['email'],
      hasPassword: true,
    });
    hooks.resetPasswordMutateAsync.mockResolvedValue({ ok: true });
  });

  // 가입용 증명으로 남의 비밀번호를 바꿀 수 없어야 하므로, 이 화면은 반드시 재설정 용도를 요청한다.
  it('본인인증을 password_reset 용도로 요청한다', () => {
    render(<AccountRecoveryClient />);
    enterPhone();

    expect(hooks.verifyPurpose).toBe('password_reset');
  });

  it('인증하면 마스킹된 이메일을 보여주고 전체 주소는 노출하지 않는다', async () => {
    render(<AccountRecoveryClient />);
    enterPhone();
    fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));

    expect(await screen.findByText('ru***@example.com')).toBeInTheDocument();
    expect(screen.queryByText(/runner@example\.com/)).not.toBeInTheDocument();
    expect(hooks.findAccountMutateAsync).toHaveBeenCalledWith({
      phone: '01012345678',
      proofToken: 'RESET-TOKEN',
    });
  });

  it('비밀번호 재설정 탭에서 새 비밀번호를 저장한다', async () => {
    render(<AccountRecoveryClient />);
    fireEvent.click(screen.getByRole('tab', { name: '비밀번호 재설정' }));
    enterPhone();
    fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));

    const password = await screen.findByLabelText('새 비밀번호');
    fireEvent.change(password, { target: { value: 'brand-new-pass' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'brand-new-pass' } });
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    await waitFor(() => expect(hooks.resetPasswordMutateAsync).toHaveBeenCalledWith({
      phone: '01012345678',
      proofToken: 'RESET-TOKEN',
      newPassword: 'brand-new-pass',
    }));
    expect(await screen.findByText('비밀번호를 바꿨어요')).toBeInTheDocument();
  });

  it('비밀번호가 일치하지 않으면 저장 버튼이 잠긴다', async () => {
    render(<AccountRecoveryClient />);
    fireEvent.click(screen.getByRole('tab', { name: '비밀번호 재설정' }));
    enterPhone();
    fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));

    fireEvent.change(await screen.findByLabelText('새 비밀번호'), { target: { value: 'brand-new-pass' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'different-pass' } });

    expect(screen.getByRole('button', { name: '비밀번호 바꾸기' })).toBeDisabled();
    expect(screen.getByText('비밀번호가 일치하지 않아요.')).toBeInTheDocument();
  });

  // 카카오 전용 계정에 비밀번호 입력칸을 띄우면 있지도 않은 비밀번호를 바꾸라고 하는 셈이다.
  it('카카오 전용 계정에는 재설정 입력 대신 안내를 띄운다', async () => {
    hooks.findAccountMutateAsync.mockResolvedValue({
      maskedEmail: 'ka***@example.com',
      providers: ['kakao'],
      hasPassword: false,
    });
    render(<AccountRecoveryClient />);
    fireEvent.click(screen.getByRole('tab', { name: '비밀번호 재설정' }));
    enterPhone();
    fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));

    expect(await screen.findByText('비밀번호가 없는 계정이에요')).toBeInTheDocument();
    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
  });

  // 번호를 고치면 앞 번호로 받은 증명은 더는 유효하지 않다.
  it('번호를 바꾸면 이전 인증 결과를 버린다', async () => {
    render(<AccountRecoveryClient />);
    enterPhone();
    fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));
    expect(await screen.findByText('ru***@example.com')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: '01099998888' } });

    expect(screen.queryByText('ru***@example.com')).not.toBeInTheDocument();
  });
});
