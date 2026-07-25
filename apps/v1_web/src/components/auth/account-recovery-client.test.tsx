import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountRecoveryClient } from './account-recovery-client';

const hooks = vi.hoisted(() => ({
  findAccountMutateAsync: vi.fn(),
  resetPasswordMutateAsync: vi.fn(),
  resetPasswordByEmailMutateAsync: vi.fn(),
  verifyPurpose: null as null | string,
  emailCardEmail: null as null | string,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1FindAccountByPhone: () => ({ mutateAsync: hooks.findAccountMutateAsync, isPending: false }),
  useV1ResetPasswordByPhone: () => ({ mutateAsync: hooks.resetPasswordMutateAsync, isPending: false }),
  useV1ResetPasswordByEmail: () => ({
    mutateAsync: hooks.resetPasswordByEmailMutateAsync,
    isPending: false,
  }),
}));

// 카드 내부(발급·폴링)와 디커플 — 부모가 넘긴 purpose 를 드러내고 onVerified 만 직접 트리거한다.
vi.mock('@/components/auth/phone-verification/phone-verification-card', () => ({
  PhoneVerificationCard: ({ purpose, onVerified }: { purpose?: string; onVerified: (t?: string) => void }) => {
    hooks.verifyPurpose = purpose ?? null;
    return <button type="button" onClick={() => onVerified('RESET-TOKEN')}>__stub_verify__</button>;
  },
}));

vi.mock('@/components/auth/email-verification/email-verification-card', () => ({
  EmailVerificationCard: ({ email, onVerified }: { email: string; onVerified: (t?: string) => void }) => {
    hooks.emailCardEmail = email;
    return <button type="button" onClick={() => onVerified('EMAIL-RESET-TOKEN')}>__stub_email_verify__</button>;
  },
}));

function enterPhone() {
  fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: '01012345678' } });
}

function goToEmailReset() {
  fireEvent.click(screen.getByRole('tab', { name: '비밀번호 재설정' }));
  fireEvent.click(screen.getByRole('tab', { name: '이메일' }));
}

function enterEmail(value = 'runner@example.com') {
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value } });
}

async function fillNewPassword(value = 'brand-new-pass') {
  fireEvent.change(await screen.findByLabelText('새 비밀번호'), { target: { value } });
  fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value } });
}

describe('AccountRecoveryClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.verifyPurpose = null;
    hooks.emailCardEmail = null;
    hooks.findAccountMutateAsync.mockResolvedValue({
      maskedEmail: 'ru***@example.com',
      providers: ['email'],
      hasPassword: true,
    });
    hooks.resetPasswordMutateAsync.mockResolvedValue({ ok: true });
    hooks.resetPasswordByEmailMutateAsync.mockResolvedValue({ ok: true });
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

    await fillNewPassword();
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

describe('AccountRecoveryClient — 이메일 재설정', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.emailCardEmail = null;
    hooks.resetPasswordByEmailMutateAsync.mockResolvedValue({ ok: true });
  });

  // 이메일로 이메일을 찾을 수는 없다 — 방법 선택은 재설정 탭에서만 의미가 있다.
  it('아이디 찾기 탭에는 본인 확인 방법 선택이 없다', () => {
    render(<AccountRecoveryClient />);
    expect(screen.queryByRole('tab', { name: '이메일' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '비밀번호 재설정' }));
    expect(screen.getByRole('tab', { name: '이메일' })).toBeInTheDocument();
  });

  it('주소를 다 입력해야 인증 카드가 뜨고, 표준형 주소로 넘긴다', () => {
    render(<AccountRecoveryClient />);
    goToEmailReset();

    enterEmail('runner@');
    expect(screen.queryByRole('button', { name: '__stub_email_verify__' })).not.toBeInTheDocument();

    enterEmail('  Runner@Example.COM ');
    expect(screen.getByRole('button', { name: '__stub_email_verify__' })).toBeInTheDocument();
    expect(hooks.emailCardEmail).toBe('runner@example.com');
  });

  it('이메일 인증 후 새 비밀번호를 저장한다', async () => {
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));

    await fillNewPassword();
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    await waitFor(() => expect(hooks.resetPasswordByEmailMutateAsync).toHaveBeenCalledWith({
      email: 'runner@example.com',
      proofToken: 'EMAIL-RESET-TOKEN',
      newPassword: 'brand-new-pass',
    }));
    expect(await screen.findByText('비밀번호를 바꿨어요')).toBeInTheDocument();
    // 휴대폰 경로 API 를 잘못 부르면 증명이 안 맞아 서버에서 막히지만, 화면 단계에서 먼저 갈라 둔다.
    expect(hooks.resetPasswordMutateAsync).not.toHaveBeenCalled();
  });

  /**
   * 카카오 전용 계정은 요청 단계에서 알려 주면 계정 종류가 새므로, 사서함 주인임을 증명한
   * 뒤 서버가 막을 때 비로소 안내로 바뀐다.
   */
  it('카카오 전용 계정이면 저장 시점에 안내로 바뀐다', async () => {
    hooks.resetPasswordByEmailMutateAsync.mockRejectedValue({
      code: 'PASSWORD_LOGIN_UNAVAILABLE',
      message: '이 계정은 카카오 로그인으로 가입했어요. 카카오로 로그인해 주세요.',
    });
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));

    await fillNewPassword();
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    expect(await screen.findByText('비밀번호가 없는 계정이에요')).toBeInTheDocument();
    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
  });

  // 없는 계정이라고 화면이 단정하면, 서버가 감춘 가입 여부를 화면이 대신 알려 주는 셈이 된다.
  it('가입 여부를 단정하지 않는 안내를 보여준다', () => {
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();

    expect(screen.getByText(/가입된 이메일이면 인증번호를 보내드려요/)).toBeInTheDocument();
  });

  /**
   * 휴대폰 경로는 찾은 계정 카드가 인증 성공을 대신 알려 주지만 이메일 경로는 그런 카드가
   * 없다 — 인증 카드까지 사라지면 성공했다는 표시가 화면 어디에도 남지 않는다.
   */
  it('인증 뒤에도 인증 카드는 남고, 발송 안내만 내려간다', async () => {
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    await screen.findByLabelText('새 비밀번호');

    expect(screen.getByRole('button', { name: '__stub_email_verify__' })).toBeInTheDocument();
    expect(screen.queryByText(/가입된 이메일이면 인증번호를 보내드려요/)).not.toBeInTheDocument();
  });

  it('주소를 바꾸면 이전 인증 증명을 버린다', async () => {
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    expect(await screen.findByLabelText('새 비밀번호')).toBeInTheDocument();

    enterEmail('other@example.com');

    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '__stub_email_verify__' })).toBeInTheDocument();
  });

  // 방법을 오가는 동안 앞 방법의 증명이 남으면 "인증 안 했는데 인증된 화면"이 된다.
  it('방법을 바꾸면 앞 방법의 인증 상태를 버린다', async () => {
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    expect(await screen.findByLabelText('새 비밀번호')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '휴대폰' }));

    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
    expect(screen.getByLabelText('휴대폰 번호')).toBeInTheDocument();
  });
});
