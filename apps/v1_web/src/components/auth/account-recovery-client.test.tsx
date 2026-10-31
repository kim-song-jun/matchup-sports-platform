import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountRecoveryClient } from './account-recovery-client';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn() }),
}));

const hooks = vi.hoisted(() => ({
  findAccountMutateAsync: vi.fn(),
  resetPasswordByEmailMutateAsync: vi.fn(),
  verifyPurpose: null as null | string,
  emailCardEmail: null as null | string,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: () => ({ data: { user: { email: 'runner@example.com', phone: '01012345678' } }, isError: false }),
  useV1FindAccountByPhone: () => ({ mutateAsync: hooks.findAccountMutateAsync, isPending: false }),
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
    hooks.resetPasswordByEmailMutateAsync.mockResolvedValue({ ok: true });
  });

  it('설정에서 비밀번호 재설정으로 진입하고 인증·저장 후 설정으로 복귀한다', async () => {
    render(<AccountRecoveryClient initialMode="reset-password" backHref="/my/settings" />);
    expect(screen.getByRole('tab', { name: '비밀번호 재설정' })).toHaveAttribute('aria-selected', 'true');
    screen.getAllByRole('link', { name: '뒤로가기' }).forEach((link) => expect(link).toHaveAttribute('href', '/my/settings'));
    expect(screen.getByLabelText('이메일')).toHaveValue('runner@example.com');
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    await fillNewPassword();
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));
    expect(await screen.findByRole('link', { name: '계정 설정으로 돌아가기' })).toHaveAttribute('href', '/my/settings');
    expect(hooks.resetPasswordByEmailMutateAsync).toHaveBeenCalledWith({
      email: 'runner@example.com', proofToken: 'EMAIL-RESET-TOKEN', newPassword: 'brand-new-pass',
    });
  });

  it('설정에서 다른 계정의 이메일을 인증해도 현재 계정 비밀번호 변경으로 처리하지 않는다', async () => {
    render(<AccountRecoveryClient initialMode="reset-password" backHref="/my/settings" />);
    enterEmail('other@example.com');
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    expect(await screen.findByText('로그인한 계정의 이메일로 본인인증해 주세요.')).toBeInTheDocument();
    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
    expect(hooks.resetPasswordByEmailMutateAsync).not.toHaveBeenCalled();
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

  it('전화번호 조회 후 재설정으로 바꿔도 새 이메일 증명 없이 비밀번호를 저장하지 않는다', async () => {
    render(<AccountRecoveryClient />);
    enterPhone();
    fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));
    await screen.findByText('ru***@example.com');
    goToEmailReset();
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
    expect(hooks.resetPasswordByEmailMutateAsync).not.toHaveBeenCalled();
  });

  it('비밀번호가 일치하지 않으면 저장 버튼이 잠긴다', async () => {
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));

    fireEvent.change(await screen.findByLabelText('새 비밀번호'), { target: { value: 'brand-new-pass' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'different-pass' } });

    expect(screen.getByRole('button', { name: '비밀번호 바꾸기' })).toBeDisabled();
    expect(screen.getByText('비밀번호가 일치하지 않아요.')).toBeInTheDocument();
  });

  describe('아이디 찾기 결과는 계정의 실제 로그인 수단을 따른다', () => {
    async function findAccount(account: { maskedEmail: string | null; providers: string[]; hasPassword: boolean }, props: { redirectPath?: string } = {}) {
      hooks.findAccountMutateAsync.mockResolvedValue(account);
      render(<AccountRecoveryClient {...props} />);
      enterPhone();
      fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));
      await screen.findByText(/^가입한 (이메일|로그인 방법)$/);
    }

    const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href');

    it('카카오 전용 계정은 이메일 로그인이 아니라 로그인 첫 화면의 카카오로 보내고 비밀번호 재설정은 권하지 않는다', async () => {
      await findAccount({ maskedEmail: 'ka***@example.com', providers: ['kakao'], hasPassword: false });

      expect(screen.getByText('이 계정은 카카오 로그인으로 가입했어요. 가입한 방법으로 로그인해 주세요.')).toBeInTheDocument();
      expect(hrefOf('카카오로 로그인하기')).toBe('/login');
      expect(screen.queryByRole('link', { name: '로그인하러 가기' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: '이메일로 로그인하기' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '비밀번호 재설정하기' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
      expect(hooks.resetPasswordByEmailMutateAsync).not.toHaveBeenCalled();
    });

    it('Apple 전용 계정에는 카카오라고 안내하지 않는다', async () => {
      await findAccount({ maskedEmail: null, providers: ['apple'], hasPassword: false });

      expect(screen.getByText('이 계정은 Apple 로그인으로 가입했어요. 가입한 방법으로 로그인해 주세요.')).toBeInTheDocument();
      expect(hrefOf('Apple로 로그인하기')).toBe('/login');
      expect(screen.getByText('Apple 로그인은 iOS 앱에서 쓸 수 있어요.')).toBeInTheDocument();
      expect(screen.queryByText(/카카오/)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: '카카오로 로그인하기' })).not.toBeInTheDocument();
    });

    it('이메일 계정은 이메일 로그인으로 보내고 비밀번호 재설정으로 이어진다', async () => {
      await findAccount({ maskedEmail: 'ru***@example.com', providers: ['email'], hasPassword: true });

      expect(hrefOf('로그인하러 가기')).toBe('/login/email');
      expect(screen.queryByRole('link', { name: '카카오로 로그인하기' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '비밀번호 재설정하기' }));
      expect(screen.getByRole('tab', { name: '비밀번호 재설정' })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    });

    it('수단이 여럿이면 가진 수단을 모두 보여 주고 없는 수단은 보여 주지 않는다', async () => {
      await findAccount({ maskedEmail: 'ru***@example.com', providers: ['email', 'kakao'], hasPassword: true });

      expect(hrefOf('이메일로 로그인하기')).toBe('/login/email');
      expect(hrefOf('카카오로 로그인하기')).toBe('/login');
      expect(screen.queryByRole('link', { name: 'Apple로 로그인하기' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '비밀번호 재설정하기' })).toBeInTheDocument();
    });

    it('카카오와 Apple 둘 다 가입했으면 두 버튼을 모두 보여 준다', async () => {
      await findAccount({ maskedEmail: 'ka***@example.com', providers: ['kakao', 'apple'], hasPassword: false });

      expect(screen.getByText('이 계정은 카카오·Apple 로그인으로 가입했어요. 가입한 방법으로 로그인해 주세요.')).toBeInTheDocument();
      expect(hrefOf('카카오로 로그인하기')).toBe('/login');
      expect(hrefOf('Apple로 로그인하기')).toBe('/login');
    });

    it('돌아갈 경로는 이메일 로그인과 소셜 로그인 첫 화면 양쪽에 이어진다', async () => {
      await findAccount({ maskedEmail: 'ru***@example.com', providers: ['email', 'kakao'], hasPassword: true }, { redirectPath: '/my' });

      expect(hrefOf('이메일로 로그인하기')).toBe('/login/email?redirect=%2Fmy');
      expect(hrefOf('카카오로 로그인하기')).toBe('/login?redirect=%2Fmy');
    });
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

  it('아이디 찾기는 전화번호, 비밀번호 재설정은 이메일 폼만 보여 준다', () => {
    render(<AccountRecoveryClient />);
    expect(screen.queryByRole('tab', { name: '이메일' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '비밀번호 재설정' }));
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.queryByLabelText('휴대폰 번호')).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '휴대폰' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('link', { name: '로그인 화면으로' })).toHaveAttribute('href', '/login');
    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
  });

  // 서버는 이 단계에서 제공자를 알려 주지 않는다 — 카카오라고 단정하면 Apple 가입자에게 틀린 안내가 된다.
  it('소셜 전용 계정 안내는 특정 제공자를 단정하지 않는다', async () => {
    hooks.resetPasswordByEmailMutateAsync.mockRejectedValue({ code: 'PASSWORD_LOGIN_UNAVAILABLE', message: 'x' });
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    await fillNewPassword();
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    expect(await screen.findByText(/카카오나 Apple 같은 소셜 로그인으로 가입해서 바꿀 비밀번호가 없어요/)).toBeInTheDocument();
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

  // 찾기와 재설정을 오가는 동안 이메일 증명을 재사용하면 안 된다.
  it('찾기 방법을 바꾸면 앞 방법의 인증 상태를 버린다', async () => {
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    expect(await screen.findByLabelText('새 비밀번호')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '아이디 찾기' }));

    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
    expect(screen.getByLabelText('휴대폰 번호')).toBeInTheDocument();
    goToEmailReset();
    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
  });
});
