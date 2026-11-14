import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1FoundAccount } from '@/types/api';
import { AccountRecoveryClient } from './account-recovery-client';

const nativeApple = vi.hoisted(() => ({ available: false }));

vi.mock('@/lib/native-apple', () => ({
  isNativeAppleSignInAvailable: () => nativeApple.available,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn() }),
}));

const hooks = vi.hoisted(() => ({
  findAccountMutateAsync: vi.fn(),
  findAccountByEmailMutateAsync: vi.fn(),
  resetPasswordByEmailMutateAsync: vi.fn(),
  verifyPurpose: null as null | string,
  emailCardEmail: null as null | string,
  emailCardSubmitLabel: null as null | string,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: () => ({ data: { user: { email: 'runner@example.com', phone: '01012345678' } }, isError: false }),
  useV1FindAccountByPhone: () => ({ mutateAsync: hooks.findAccountMutateAsync, isPending: false }),
  useV1FindAccountByEmail: () => ({ mutateAsync: hooks.findAccountByEmailMutateAsync, isPending: false }),
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
  EmailVerificationCard: ({ email, submitLabel, onVerified }: { email: string; submitLabel?: string; onVerified: (t?: string) => void }) => {
    hooks.emailCardEmail = email;
    hooks.emailCardSubmitLabel = submitLabel ?? null;
    return <button type="button" onClick={() => onVerified('EMAIL-RESET-TOKEN')}>__stub_email_verify__</button>;
  },
}));

/** 라벨 바로 옆에 나열된 가입 수단 칩의 글자. */
function chipsUnder(label: string): string[] {
  const scope = screen.getByText(label).parentElement as HTMLElement;
  return within(scope).getAllByRole('listitem').map((item) => item.textContent ?? '');
}

function previousStep() {
  fireEvent.click(screen.getAllByRole('button', { name: '이전 단계' })[0]);
}

function findMethod(method: 'phone' | 'email') {
  if (screen.queryByRole('group', { name: '찾을 항목' })) {
    fireEvent.click(screen.getByRole('button', { name: '아이디·로그인 방법 찾기' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
  }
  while (!screen.queryByRole('group', { name: '본인 확인 방법' })) previousStep();
  fireEvent.click(screen.getByRole('button', { name: method === 'phone' ? '휴대폰으로 찾기' : '이메일로 찾기' }));
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
}

function enterPhone() {
  if (!screen.queryByLabelText('휴대폰 번호')) findMethod('phone');
  fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: '01012345678' } });
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
}

function goToEmailReset() {
  const purpose = screen.queryByRole('group', { name: '찾을 항목' });
  if (!purpose && !screen.queryByRole('button', { name: '비밀번호 재설정' })) previousStep();
  fireEvent.click(screen.getByRole('button', { name: '비밀번호 재설정' }));
  if (purpose) fireEvent.click(screen.getByRole('button', { name: '다음' }));
}

function enterEmail(value = 'runner@example.com') {
  if (!screen.queryByLabelText('이메일')) previousStep();
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value } });
  const next = screen.getByRole('button', { name: '다음' });
  if (!next.hasAttribute('disabled')) fireEvent.click(next);
}

async function fillNewPassword(value = 'brand-new-pass') {
  fireEvent.change(await screen.findByLabelText('새 비밀번호'), { target: { value } });
  fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value } });
}

/** 비밀번호 재설정은 메일함 증명 뒤에 계정이 탈퇴 대기인지 먼저 조회한다. 기본은 활성 계정이다. */
const ACTIVE_EMAIL_ACCOUNT: V1FoundAccount = {
  maskedEmail: 'ru***@example.com', emailProofAvailable: true, providers: ['email'], hasPassword: true, withdrawalPending: false, withdrawalPendingUntil: null,
};

function resetEmailLookup(account: V1FoundAccount = ACTIVE_EMAIL_ACCOUNT) {
  hooks.findAccountByEmailMutateAsync.mockReset();
  hooks.findAccountByEmailMutateAsync.mockResolvedValue(account);
}

describe('AccountRecoveryClient', () => {
  it('목적과 인증 수단을 차례로 고르고 이전 단계로 돌아갈 수 있다', () => {
    render(<AccountRecoveryClient />);
    expect(screen.getByRole('heading', { name: '어떤 도움이 필요하세요?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByRole('group', { name: '본인 확인 방법' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '이메일로 찾기' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByLabelText('이메일')).toBeVisible();
    previousStep();
    expect(screen.getByRole('button', { name: '이메일로 찾기' })).toHaveAttribute('aria-pressed', 'true');
  });
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmailLookup();
    nativeApple.available = false;
    hooks.verifyPurpose = null;
    hooks.emailCardEmail = null;
    // A phone lookup without a mailbox proof carries no masked email.
    hooks.findAccountMutateAsync.mockResolvedValue({
      maskedEmail: null,
      emailProofAvailable: true,
      providers: ['email'],
      hasPassword: true,
      withdrawalPending: false,
      withdrawalPendingUntil: null,
    });
    hooks.resetPasswordByEmailMutateAsync.mockResolvedValue({ ok: true });
  });

  it('설정에서 비밀번호 재설정으로 진입하고 인증·저장 후 설정으로 복귀한다', async () => {
    render(<AccountRecoveryClient initialMode="reset-password" backHref="/my/settings" />);
    expect(screen.getByRole('heading', { name: '가입한 이메일을 입력해 주세요' })).toBeVisible();
    screen.getAllByRole('link', { name: '뒤로가기' }).forEach((link) => expect(link).toHaveAttribute('href', '/my/settings'));
    expect(screen.getByLabelText('이메일')).toHaveValue('runner@example.com');
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
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

  // 번호는 다른 사람에게 재배정될 수 있어, 번호 인증만으로는 이메일 힌트 없이 가입 수단 이름만 보여 준다.
  it('번호 인증만으로는 이메일 힌트 없이 가입한 로그인 방법만 보여 준다', async () => {
    render(<AccountRecoveryClient />);
    enterPhone();
    fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));

    expect(await screen.findByText('가입한 로그인 방법')).toBeInTheDocument();
    expect(screen.getByText('이메일·비밀번호')).toBeInTheDocument();
    expect(screen.queryByText('가입한 이메일')).not.toBeInTheDocument();
    expect(screen.queryByText(/\*\*\*@|runner@example\.com/)).not.toBeInTheDocument();
    expect(hooks.findAccountMutateAsync).toHaveBeenCalledWith({
      phone: '01012345678',
      proofToken: 'RESET-TOKEN',
    });
  });

  it.each(['kakao', 'apple'])('이메일 인증 후에만 %s 소셜 로그인 방법을 보여 준다', async (provider) => {
    hooks.findAccountByEmailMutateAsync.mockResolvedValue({ maskedEmail: 'ru***@example.com', emailProofAvailable: true, providers: [provider], hasPassword: false, withdrawalPending: false, withdrawalPendingUntil: null });
    render(<AccountRecoveryClient />);
    findMethod('email');
    enterEmail();
    expect(hooks.findAccountByEmailMutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    const label = provider === 'kakao' ? '카카오' : 'Apple';
    expect(await screen.findByText(new RegExp(`${label} 로그인으로 가입했어요`))).toBeVisible();
    expect(hooks.findAccountByEmailMutateAsync).toHaveBeenCalledWith({ email: 'runner@example.com', proofToken: 'EMAIL-RESET-TOKEN' });
    expect(hooks.resetPasswordByEmailMutateAsync).not.toHaveBeenCalled();
  });

  it('이메일 인증 뒤 조회가 일시 실패하면 다시 조회할 수 있다', async () => {
    hooks.findAccountByEmailMutateAsync.mockRejectedValueOnce(new Error('일시 오류')).mockResolvedValueOnce({ maskedEmail: 'ru***@example.com', emailProofAvailable: true, providers: ['kakao'], hasPassword: false, withdrawalPending: false, withdrawalPendingUntil: null });
    render(<AccountRecoveryClient />);
    findMethod('email');
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    expect(await screen.findByText('일시 오류')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '다시 확인하기' }));
    expect(await screen.findByText(/카카오 로그인으로 가입했어요/)).toBeVisible();
    expect(hooks.findAccountByEmailMutateAsync).toHaveBeenCalledTimes(2);
  });

  it('이메일 조회가 늦게 끝나도 번호 찾기로 전환한 화면에 이전 결과를 보여주지 않는다', async () => {
    let resolveLookup: ((value: V1FoundAccount) => void) | undefined;
    hooks.findAccountByEmailMutateAsync.mockImplementation(() => new Promise<V1FoundAccount>((resolve) => { resolveLookup = resolve; }));
    render(<AccountRecoveryClient />);
    findMethod('email');
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    findMethod('phone');
    resolveLookup?.({ maskedEmail: 'old***@example.com', emailProofAvailable: true, providers: ['kakao'], hasPassword: false, withdrawalPending: false, withdrawalPendingUntil: null });
    await waitFor(() => expect(screen.getByLabelText('휴대폰 번호')).toBeVisible());
    expect(screen.queryByText('old***@example.com')).not.toBeInTheDocument();
  });

  it('전화번호 조회 후 재설정으로 바꿔도 새 이메일 증명 없이 비밀번호를 저장하지 않는다', async () => {
    render(<AccountRecoveryClient />);
    enterPhone();
    fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));
    await screen.findByText('가입한 로그인 방법');
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 재설정하기' }));
    expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
    expect(hooks.resetPasswordByEmailMutateAsync).not.toHaveBeenCalled();
  });

  it('흔한 비밀번호는 입력하는 순간 저장 버튼을 잠그고, 입력이 멈추면 이유를 알리며 칭찬하지 않는다', async () => {
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));

    fireEvent.change(await screen.findByLabelText('새 비밀번호'), { target: { value: 'Qwer1234' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'Qwer1234' } });

    expect(screen.getByRole('button', { name: '비밀번호 바꾸기' })).toBeDisabled();
    expect(screen.queryByText('사용할 수 있는 비밀번호예요.')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('새 비밀번호')).toHaveAccessibleDescription('너무 흔한 비밀번호예요. 다른 비밀번호를 정해 주세요.'));
    expect(screen.getByLabelText('새 비밀번호')).toBeInvalid();
    expect(screen.queryByText('사용할 수 있는 비밀번호예요.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '비밀번호 바꾸기' })).toBeDisabled();
    expect(hooks.resetPasswordByEmailMutateAsync).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('새 비밀번호'), { target: { value: 'brand-new-pass' } });
    fireEvent.change(screen.getByLabelText('새 비밀번호 확인'), { target: { value: 'brand-new-pass' } });
    expect(await screen.findByText('사용할 수 있는 비밀번호예요.')).toBeInTheDocument();
    expect(screen.queryByText('너무 흔한 비밀번호예요. 다른 비밀번호를 정해 주세요.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '비밀번호 바꾸기' })).toBeEnabled();
  });

  // 가입·이메일 연결과 같은 칸이라 보기 토글과 길이 안내가 똑같이 붙는다.
  it('새 비밀번호 칸은 가입과 같은 비밀번호 칸이라 보기 토글과 길이 안내가 있다', async () => {
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));

    const password = await screen.findByLabelText('새 비밀번호');
    expect(password).toHaveAttribute('type', 'password');
    const [toggle] = screen.getAllByRole('button', { name: '비밀번호 보기' });
    expect(screen.getAllByRole('button', { name: '비밀번호 보기' })).toHaveLength(2);
    fireEvent.click(toggle as HTMLElement);
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('새 비밀번호 확인')).toHaveAttribute('type', 'password');

    fireEvent.change(password, { target: { value: 'abc12' } });
    expect(await screen.findByText('8자 이상 입력해 주세요.')).toBeInTheDocument();
    expect(password).toBeInvalid();
  });

  // 화면의 목록과 서버의 목록이 어긋나 서버가 거절해도, 이유는 새 비밀번호 칸 아래에 서버 문구 그대로 남는다.
  it('저장할 때 서버가 흔한 비밀번호(400)로 거절하면 그 문구를 새 비밀번호 칸 아래에 보여 주고 같은 값으로는 다시 저장할 수 없다', async () => {
    hooks.resetPasswordByEmailMutateAsync.mockRejectedValueOnce(Object.assign(new Error('서버가 거절한 비밀번호예요. 다른 비밀번호를 정해 주세요.'), {
      code: 'PASSWORD_TOO_COMMON',
    }));
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    await fillNewPassword();
    fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

    await waitFor(() => expect(screen.getByLabelText('새 비밀번호')).toHaveAccessibleDescription('서버가 거절한 비밀번호예요. 다른 비밀번호를 정해 주세요.'));
    expect(screen.getByLabelText('새 비밀번호')).toBeInvalid();
    expect(screen.getAllByText('서버가 거절한 비밀번호예요. 다른 비밀번호를 정해 주세요.')).toHaveLength(1);
    expect(screen.queryByText('계정을 확인하지 못했어요')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '비밀번호 바꾸기' })).toBeDisabled();
    expect(hooks.resetPasswordByEmailMutateAsync).toHaveBeenCalledTimes(1);
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
    /** 번호 증명만 보낸 조회다 — 서버는 마스킹 이메일 없이 가입 수단만 답한다. */
    async function findAccount(account: Pick<V1FoundAccount, 'providers' | 'hasPassword'>, props: { redirectPath?: string } = {}) {
      hooks.findAccountMutateAsync.mockResolvedValue({ ...account, maskedEmail: null, emailProofAvailable: true, withdrawalPending: false, withdrawalPendingUntil: null });
      render(<AccountRecoveryClient {...props} />);
      enterPhone();
      fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));
      await screen.findByText(/^(가입한 이메일|가입한 로그인 방법|로그인 방법을 확인하지 못했어요)$/);
    }

    const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href');

    it('카카오 전용 계정은 이메일 로그인이 아니라 로그인 첫 화면의 카카오로 보내고 비밀번호 재설정은 권하지 않는다', async () => {
      await findAccount({ providers: ['kakao'], hasPassword: false });

      expect(screen.getByText('이 계정은 카카오 로그인으로 가입했어요. 가입한 방법으로 로그인해 주세요.')).toBeInTheDocument();
      expect(hrefOf('카카오 로그인')).toBe('/login');
      expect(screen.getByRole('link', { name: '카카오 로그인' })).toHaveClass('tm-auth-kakao');
      expect(screen.getByRole('link', { name: '카카오 로그인' })).not.toHaveClass('tm-btn-primary');
      expect(screen.getByRole('link', { name: '카카오 로그인' }).querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(screen.queryByRole('link', { name: '로그인하러 가기' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: '이메일로 로그인하기' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '비밀번호 재설정하기' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '비밀번호 재설정' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
      expect(hooks.resetPasswordByEmailMutateAsync).not.toHaveBeenCalled();
    });

    it('웹·안드로이드의 Apple 전용 계정은 쓸 수 없는 Apple 버튼 대신 안내와 문의 창구를 준다', async () => {
      await findAccount({ providers: ['apple'], hasPassword: false });

      expect(screen.getByText('이 계정은 Apple 로그인으로 가입했어요. 가입한 방법으로 로그인해 주세요.')).toBeInTheDocument();
      expect(screen.getByText('Apple 로그인은 iOS 앱에서 쓸 수 있어요.')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Apple로 로그인하기' })).not.toBeInTheDocument();
      expect(hrefOf('문의 창구 보기')).toBe('/contact');
      expect(screen.queryByText(/카카오/)).not.toBeInTheDocument();
    });

    it('iOS 앱의 Apple 전용 계정은 로그인 첫 화면의 Apple 버튼으로 보낸다', async () => {
      nativeApple.available = true;
      await findAccount({ providers: ['apple'], hasPassword: false });

      expect(hrefOf('Apple로 로그인하기')).toBe('/login');
      expect(screen.queryByText('Apple 로그인은 iOS 앱에서 쓸 수 있어요.')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: '문의 창구 보기' })).not.toBeInTheDocument();
    });

    // 로그인 첫 화면에 없는 제공자(naver)뿐이거나 비밀번호 없는 이메일 신원뿐이면 안내할 수단이 없다.
    it.each([
      ['naver 전용', { providers: ['naver'], hasPassword: false }],
      ['비밀번호 없는 이메일 신원', { providers: ['email'], hasPassword: false }],
    ])('%s 계정은 빈 화면 대신 문의 창구를 준다', async (_name, account) => {
      await findAccount(account);

      expect(screen.getByText('이 계정으로 로그인할 수 있는 방법을 확인하지 못했어요. 문의 창구로 알려 주세요.')).toBeInTheDocument();
      expect(hrefOf('문의 창구 보기')).toBe('/contact');
      expect(screen.queryByText('—')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /로그인/ })).not.toBeInTheDocument();
    });

    it('이메일 계정은 이메일 로그인으로 보내고 비밀번호 재설정으로 이어진다', async () => {
      await findAccount({ providers: ['email'], hasPassword: true });

      expect(hrefOf('로그인하러 가기')).toBe('/login/email');
      expect(screen.queryByRole('link', { name: '카카오 로그인' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '비밀번호 재설정하기' }));
      expect(screen.getByRole('heading', { name: '가입한 이메일을 입력해 주세요' })).toBeVisible();
      expect(screen.getByLabelText('이메일')).toBeInTheDocument();
    });

    it('내 계정이 아닌 사람을 위해, 번호를 새로 받았다면 고객센터에 알려 달라는 한 줄이 로그인 길 뒤에 붙는다', async () => {
      await findAccount({ providers: ['email'], hasPassword: true });

      const help = screen.getByRole('link', { name: '고객센터에 알려 주세요' });
      expect(help).toHaveAttribute('href', '/contact');
      expect(help.closest('p')).toHaveTextContent('내 계정이 아닌가요? 번호를 최근에 새로 받았다면고객센터에 알려 주세요');
      const lastExit = screen.getByRole('button', { name: '비밀번호 재설정하기' });
      expect(lastExit.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('소셜 전용 계정이어도, 이 환경에서 쓸 로그인 길이 없어 문의 창구 버튼이 이미 있어도 같은 한 줄이 붙는다', async () => {
      await findAccount({ providers: ['apple'], hasPassword: false });

      expect(screen.getByRole('link', { name: '문의 창구 보기' })).toHaveAttribute('href', '/contact');
      expect(screen.getByRole('link', { name: '고객센터에 알려 주세요' })).toHaveAttribute('href', '/contact');
    });

    it('수단이 여럿이면 가진 수단을 모두 보여 주고 없는 수단은 보여 주지 않는다', async () => {
      await findAccount({ providers: ['email', 'kakao'], hasPassword: true });

      expect(hrefOf('이메일로 로그인하기')).toBe('/login/email');
      expect(hrefOf('카카오 로그인')).toBe('/login');
      expect(screen.getByRole('link', { name: '이메일로 로그인하기' }).querySelector('svg')).toBeNull();
      expect(screen.queryByRole('link', { name: 'Apple로 로그인하기' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '비밀번호 재설정하기' })).toBeInTheDocument();
    });

    it('카카오와 Apple 둘 다 가입했고 iOS 앱이면 두 버튼을 모두 보여 준다', async () => {
      nativeApple.available = true;
      await findAccount({ providers: ['kakao', 'apple'], hasPassword: false });

      expect(screen.getByText('이 계정은 카카오·Apple 로그인으로 가입했어요. 가입한 방법으로 로그인해 주세요.')).toBeInTheDocument();
      expect(hrefOf('카카오 로그인')).toBe('/login');
      expect(hrefOf('Apple로 로그인하기')).toBe('/login');
      expect(screen.getByRole('link', { name: '카카오 로그인' }).querySelector('svg')).not.toBeNull();
      expect(screen.getByRole('link', { name: 'Apple로 로그인하기' }).querySelector('svg')).toBeNull();
    });

    it('돌아갈 경로는 이메일 로그인과 소셜 로그인 첫 화면 양쪽에 이어진다', async () => {
      await findAccount({ providers: ['email', 'kakao'], hasPassword: true }, { redirectPath: '/my' });

      expect(hrefOf('이메일로 로그인하기')).toBe('/login/email?redirect=%2Fmy');
      expect(hrefOf('카카오 로그인')).toBe('/login?redirect=%2Fmy');
    });
  });

  describe('번호를 쥔 계정이 탈퇴 유예 중이면 이메일까지 확인한 사람에게 두 가지 방법을 안내한다', () => {
    // KST 로는 11월 7일 00:30. 지났는지도 보므로 시계를 고정한다.
    const UNTIL = '2026-11-06T15:30:00.000Z';
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-31T00:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    /** 서버처럼 답한다 — 번호 증명만이면 이메일·날짜가 없고, 같은 계정의 이메일 증명이 함께 오면 채운다. */
    function pendingLookup(account: Pick<V1FoundAccount, 'providers' | 'hasPassword'>) {
      hooks.findAccountMutateAsync.mockImplementation(async (body: { emailProofToken?: string }) => (body.emailProofToken
        ? { ...account, maskedEmail: 'ru***@example.com', emailProofAvailable: true, withdrawalPending: true, withdrawalPendingUntil: UNTIL }
        : { ...account, maskedEmail: null, emailProofAvailable: true, withdrawalPending: true, withdrawalPendingUntil: null }));
    }

    function confirmMailbox() {
      fireEvent.click(screen.getByRole('button', { name: '이메일로 한 번 더 확인하기' }));
      fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'runner@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
      fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    }

    async function findPendingAccount(account: Pick<V1FoundAccount, 'providers' | 'hasPassword'>, props: { redirectPath?: string } = {}) {
      pendingLookup(account);
      render(<AccountRecoveryClient {...props} />);
      enterPhone();
      fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));
      await screen.findByRole('button', { name: '이메일로 한 번 더 확인하기' });
      confirmMailbox();
      await screen.findByText('ru***@example.com');
    }

    it('마스킹 이메일과 함께 방법 1(로그인해서 취소)과 방법 2(삭제일까지 기다리기)를 보여 주고 일반 결과 카드는 그리지 않는다', async () => {
      await findPendingAccount({ providers: ['email'], hasPassword: true });

      expect(screen.getByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).toBeInTheDocument();
      expect(screen.getByText('가입한 이메일')).toBeInTheDocument();
      expect(screen.getByText('이 번호를 다시 쓰는 방법은 두 가지예요.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '방법 1 지금 바로 쓰기' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '방법 2 기다리기' })).toBeInTheDocument();
      expect(screen.getByText('11월 7일')).toBeInTheDocument();
      expect(screen.getByText('위 이메일로 가입한 계정이에요.')).toBeInTheDocument();
      // 이메일까지 확인한 결과이므로 더 확인하자는 안내는 사라진다.
      expect(screen.queryByRole('button', { name: '이메일로 한 번 더 확인하기' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '비밀번호 재설정하기' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '비밀번호 재설정' })).toBeVisible();
    });

    it('"내 계정이 아닌가요?" 한 줄은 싣지 않는다 — 비밀번호를 잊은 사람용 고객센터 링크는 방법 1 에 이미 있다', async () => {
      await findPendingAccount({ providers: ['email'], hasPassword: true });

      expect(screen.queryByText(/내 계정이 아닌가요/)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: '고객센터에 알려 주세요' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: '비밀번호가 기억나지 않으면 고객센터로 알려 주세요' })).toHaveAttribute('href', '/contact');
    });

    it('이메일 계정이면 버튼이 이메일 로그인으로, 돌아갈 경로를 이어서 간다', async () => {
      await findPendingAccount({ providers: ['email'], hasPassword: true }, { redirectPath: '/my' });

      expect(screen.getByRole('link', { name: '로그인하고 탈퇴 취소하기' })).toHaveAttribute('href', '/login/email?redirect=%2Fmy');
    });

    it('카카오 전용 계정이면 로그인 첫 화면으로 보내고 어느 수단으로 가입했는지 말해 준다', async () => {
      await findPendingAccount({ providers: ['kakao'], hasPassword: false });

      expect(screen.getByRole('link', { name: '로그인하고 탈퇴 취소하기' })).toHaveAttribute('href', '/login');
      expect(screen.getByText('카카오 로그인으로 가입한 계정이에요.')).toBeInTheDocument();
    });

    it('수단이 여럿이면 주된 길은 탈퇴 취소 버튼이고 나머지 수단은 이어서 보여 준다', async () => {
      await findPendingAccount({ providers: ['email', 'kakao'], hasPassword: true });

      expect(screen.getByRole('link', { name: '로그인하고 탈퇴 취소하기' })).toHaveAttribute('href', '/login/email');
      expect(screen.getByRole('link', { name: '카카오 로그인' })).toHaveAttribute('href', '/login');
      expect(screen.getByRole('link', { name: '카카오 로그인' }).querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    });

    it('이 환경에서 쓸 수 있는 로그인 수단이 없으면 막다른 길 대신 문의 창구로 보낸다', async () => {
      await findPendingAccount({ providers: ['apple'], hasPassword: false });

      expect(screen.queryByRole('link', { name: '로그인하고 탈퇴 취소하기' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: '문의 창구 보기' })).toHaveAttribute('href', '/contact');
      expect(screen.getByText('Apple 로그인은 iOS 앱에서 쓸 수 있어요.')).toBeInTheDocument();
    });

    it('결과가 뜨면 포커스가 제목으로 옮겨 간다', async () => {
      await findPendingAccount({ providers: ['email'], hasPassword: true });
      // 제목이 DOM 에 나타난 시점에는 포커스 효과가 아직 돌지 않았을 수 있다(이전 단계의 h1 포커스가 남는다).
      await waitFor(() => expect(screen.getByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).toHaveFocus());
    });

    it('번호를 고치면 탈퇴 안내도 함께 사라진다', async () => {
      await findPendingAccount({ providers: ['email'], hasPassword: true });

      previousStep();
      fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: '01099998888' } });

      expect(screen.queryByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).not.toBeInTheDocument();
    });

    it('비밀번호가 있는 계정이면 방법 1 에 고객센터 링크가 있고, 비밀번호가 없는 계정에는 없다', async () => {
      await findPendingAccount({ providers: ['email'], hasPassword: true });
      expect(screen.getByRole('link', { name: '비밀번호가 기억나지 않으면 고객센터로 알려 주세요' })).toHaveAttribute('href', '/contact');
      cleanup();

      await findPendingAccount({ providers: ['kakao'], hasPassword: false });
      expect(screen.queryByRole('link', { name: /고객센터로 알려 주세요/ })).not.toBeInTheDocument();
    });

    // 서버가 이미 지난 종료일을 주면 "방법 2 기다리기"가 틀린 날짜를 말하게 되므로 그리지 않는다. 탈퇴 취소 길은 그대로다.
    it('유예 종료 시각이 이미 지났으면 날짜가 없는 것과 같아 방법 2 는 그리지 않고 로그인하면 취소할 수 있다는 안내만 남는다', async () => {
      vi.setSystemTime(Date.parse(UNTIL));
      await findPendingAccount({ providers: ['email'], hasPassword: true });

      expect(screen.getByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).toBeInTheDocument();
      expect(screen.getByText('로그인하면 탈퇴를 취소할 수 있어요.')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '방법 2 기다리기' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: '로그인하고 탈퇴 취소하기' })).toHaveAttribute('href', '/login/email');
    });

    it('활성 계정에는 탈퇴 안내를 붙이지 않는다', async () => {
      render(<AccountRecoveryClient />);
      enterPhone();
      fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));

      await screen.findByText('가입한 로그인 방법');
      expect(screen.queryByText(/탈퇴를 신청한 계정이에요/)).not.toBeInTheDocument();
    });

    it.each([
      ['이메일 로그인만 있는 계정', ['email'], true, ['이메일·비밀번호']],
      ['이메일과 카카오를 함께 쓰는 계정', ['email', 'kakao'], true, ['이메일·비밀번호', '카카오']],
      ['카카오만 쓰는 계정', ['kakao'], false, ['카카오']],
    ])('이메일 힌트가 없어도 %s 은 가입한 로그인 방법을 수단 칩으로 알린다', async (_label, providers, hasPassword, chips) => {
      hooks.findAccountMutateAsync.mockResolvedValue({ maskedEmail: null, emailProofAvailable: true, providers, hasPassword, withdrawalPending: false, withdrawalPendingUntil: null });
      render(<AccountRecoveryClient />);
      enterPhone();
      fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));

      expect(await screen.findByText('가입한 로그인 방법')).toBeInTheDocument();
      expect(chipsUnder('가입한 로그인 방법')).toEqual(chips);
      expect(screen.queryByText('로그인 방법을 확인하지 못했어요')).not.toBeInTheDocument();
    });

    it('날짜가 없으면(null) 일반 결과 카드가 그대로 나온다', async () => {
      hooks.findAccountMutateAsync.mockResolvedValue({ maskedEmail: null, emailProofAvailable: true, providers: ['email'], hasPassword: true, withdrawalPending: false, withdrawalPendingUntil: null });
      render(<AccountRecoveryClient />);
      enterPhone();
      fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));

      expect(await screen.findByText('가입한 로그인 방법')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /탈퇴를 신청한 계정/ })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: '로그인하러 가기' })).toBeInTheDocument();
    });
  });

  describe('번호 인증만 마친 결과는 가입 수단만 보여 주고, 이메일은 별도 단계에서 한 번 더 확인한다', () => {
    const UNTIL = '2099-11-30T00:00:00.000Z';
    const NOT_MINE_CODE = '찾은 계정의 이메일이 아니에요';

    /** 서버처럼 답한다. 번호 증명만이면 마스킹 이메일·날짜가 null 이고, 같은 계정의 이메일(owner@) 증명이 함께 오면 채운다. */
    function lookup({ pending }: { pending: boolean }) {
      hooks.findAccountMutateAsync.mockImplementation(async (body: { email?: string; emailProofToken?: string }) => {
        const ownMailbox = Boolean(body.emailProofToken) && body.email === 'owner@example.com';
        return {
          maskedEmail: ownMailbox ? 'ow***@example.com' : null,
          emailProofAvailable: true,
          providers: ['email', 'kakao'],
          hasPassword: true,
          withdrawalPending: pending,
          withdrawalPendingUntil: ownMailbox && pending ? UNTIL : null,
        } satisfies V1FoundAccount;
      });
    }

    async function reachPhoneResult() {
      render(<AccountRecoveryClient />);
      enterPhone();
      fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));
      await screen.findByRole('button', { name: '이메일로 한 번 더 확인하기' });
    }

    function enterMailbox(email: string) {
      fireEvent.change(screen.getByLabelText('이메일'), { target: { value: email } });
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
    }

    it('탈퇴 대기 계정: 가입 수단 칩과 로그인 버튼, 날짜 없는 취소 안내만 보이고 이메일·삭제 예정일은 없다', async () => {
      lookup({ pending: true });
      await reachPhoneResult();

      expect(screen.getByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).toBeInTheDocument();
      expect(screen.getByText('로그인하면 탈퇴를 취소할 수 있어요.')).toBeInTheDocument();
      expect(screen.getByText('가입한 로그인 방법')).toBeInTheDocument();
      expect(chipsUnder('가입한 로그인 방법')).toEqual(['이메일·비밀번호', '카카오']);
      expect(screen.getByRole('link', { name: '로그인하고 탈퇴 취소하기' })).toHaveAttribute('href', '/login/email');
      expect(screen.getByRole('link', { name: '카카오 로그인' })).toHaveAttribute('href', '/login');
      expect(screen.getByRole('link', { name: '카카오 로그인' }).querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(screen.getByRole('link', { name: '로그인하고 탈퇴 취소하기' }).querySelector('svg')).toBeNull();
      expect(screen.queryByText(/\*\*\*@/)).not.toBeInTheDocument();
      expect(screen.queryByText('가입한 이메일')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '방법 2 기다리기' })).not.toBeInTheDocument();
      expect(document.querySelector('time')).toBeNull();
      expect(screen.getByRole('button', { name: '이메일로 한 번 더 확인하기' })).toHaveAccessibleDescription('확인하면 가입한 이메일과 삭제 예정일을 볼 수 있어요.');
    });

    it('탈퇴 대기가 아닌 계정: 보조 버튼 설명에는 삭제 예정일이 빠진다', async () => {
      lookup({ pending: false });
      await reachPhoneResult();

      expect(screen.getByRole('button', { name: '이메일로 한 번 더 확인하기' })).toHaveAccessibleDescription('확인하면 가입한 이메일을 볼 수 있어요.');
      expect(screen.queryByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).not.toBeInTheDocument();
    });

    // 이메일이 없는 계정은 어떤 이메일로도 증명이 맞을 수 없다 — 권하면 사용자가 인증 메일만 반복해 받는 막다른 길이 된다.
    it.each([
      ['활성 계정', false],
      ['탈퇴 대기 계정', true],
    ])('이메일이 없는 %s 은 이메일로 한 번 더 확인하자고 권하지 않고 가입 수단 결과는 그대로 보여 준다', async (_label, pending) => {
      hooks.findAccountMutateAsync.mockResolvedValue({
        maskedEmail: null, emailProofAvailable: false, providers: ['kakao'], hasPassword: false, withdrawalPending: pending, withdrawalPendingUntil: null,
      } satisfies V1FoundAccount);
      render(<AccountRecoveryClient />);
      enterPhone();
      fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));

      expect(await screen.findByText('가입한 로그인 방법')).toBeInTheDocument();
      expect(chipsUnder('가입한 로그인 방법')).toEqual(['카카오']);
      expect(screen.getByRole('link', { name: pending ? '로그인하고 탈퇴 취소하기' : '카카오 로그인' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '이메일로 한 번 더 확인하기' })).not.toBeInTheDocument();
      expect(screen.queryByText(/확인하면 가입한 이메일/)).not.toBeInTheDocument();
    });

    it('이메일 입력 → 인증번호 → 상세 결과: 같은 계정의 이메일이면 마스킹 이메일과 방법 2 일정(삭제 예정일)이 채워진다', async () => {
      lookup({ pending: true });
      await reachPhoneResult();

      fireEvent.click(screen.getByRole('button', { name: '이메일로 한 번 더 확인하기' }));
      expect(screen.getByRole('heading', { name: '가입한 이메일을 입력해 주세요' })).toBeVisible();
      expect(screen.getByText('이메일로 인증번호를 보내 드려요. 이 번호로 찾은 계정의 이메일이어야 해요.')).toBeVisible();
      enterMailbox('Owner@Example.com');
      expect(screen.getByRole('heading', { name: '인증번호를 입력해 주세요' })).toBeVisible();
      expect(hooks.emailCardEmail).toBe('owner@example.com');
      expect(hooks.emailCardSubmitLabel).toBe('인증하고 보기');
      fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));

      expect(await screen.findByText('ow***@example.com')).toBeInTheDocument();
      expect(screen.getByText('가입한 이메일')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '방법 2 기다리기' })).toBeInTheDocument();
      expect(screen.getByText('11월 30일')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '이메일로 한 번 더 확인하기' })).not.toBeInTheDocument();
      expect(hooks.findAccountMutateAsync).toHaveBeenNthCalledWith(1, { phone: '01012345678', proofToken: 'RESET-TOKEN' });
      expect(hooks.findAccountMutateAsync).toHaveBeenNthCalledWith(2, {
        phone: '01012345678', proofToken: 'RESET-TOKEN', email: 'owner@example.com', emailProofToken: 'EMAIL-RESET-TOKEN',
      });
    });

    it('다른 계정의 이메일이면 값이 안 채워진 답을 받아 "찾은 계정의 이메일이 아니에요" 한 가지로만 말하고 재입력·고객센터 길을 둔다', async () => {
      lookup({ pending: true });
      await reachPhoneResult();
      fireEvent.click(screen.getByRole('button', { name: '이메일로 한 번 더 확인하기' }));
      enterMailbox('stranger@example.com');
      fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));

      expect(await screen.findByText(NOT_MINE_CODE)).toBeInTheDocument();
      // 이메일이 틀렸는지 번호가 틀렸는지 알려 주지 않는다 — 오류 문구는 하나다.
      expect(screen.getAllByRole('alert')).toHaveLength(1);
      expect(screen.getByRole('alert')).toHaveTextContent('다른 이메일로 다시 입력해 주세요');
      expect(screen.getByLabelText('이메일')).toHaveValue('stranger@example.com');
      expect(screen.getByRole('link', { name: '고객센터에 알려 주세요' })).toHaveAttribute('href', '/contact');
      expect(screen.queryByText('ow***@example.com')).not.toBeInTheDocument();
      expect(screen.queryByText(/\*\*\*@/)).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '방법 2 기다리기' })).not.toBeInTheDocument();

      // 이메일을 고치면 안내가 걷히고, 같은 번호 인증으로 다시 확인해 맞는 이메일이면 상세가 열린다.
      fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'owner@example.com' } });
      expect(screen.queryByText(NOT_MINE_CODE)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
      fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
      expect(await screen.findByText('ow***@example.com')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '__stub_verify__' })).not.toBeInTheDocument();
    });

    it('뒤로 가도 문자 인증을 다시 하지 않는다 — 인증번호 단계 → 이메일 입력 → 결과로 돌아가며 번호 증명과 결과가 그대로다', async () => {
      lookup({ pending: true });
      await reachPhoneResult();
      fireEvent.click(screen.getByRole('button', { name: '이메일로 한 번 더 확인하기' }));
      enterMailbox('owner@example.com');

      previousStep();
      expect(screen.getByRole('heading', { name: '가입한 이메일을 입력해 주세요' })).toBeVisible();
      expect(screen.getByLabelText('이메일')).toHaveValue('owner@example.com');
      expect(screen.queryByRole('button', { name: '__stub_verify__' })).not.toBeInTheDocument();

      previousStep();
      expect(screen.getByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '이메일로 한 번 더 확인하기' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '__stub_verify__' })).not.toBeInTheDocument();
      // 번호 조회는 처음 한 번뿐이다 — 문자 인증 카드를 다시 거치지도, 다시 조회하지도 않았다.
      expect(hooks.findAccountMutateAsync).toHaveBeenCalledTimes(1);

      // 다시 눌러 끝까지 가면 처음 받은 번호 증명으로 조회한다.
      fireEvent.click(screen.getByRole('button', { name: '이메일로 한 번 더 확인하기' }));
      enterMailbox('owner@example.com');
      fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
      expect(await screen.findByText('ow***@example.com')).toBeInTheDocument();
      expect(hooks.findAccountMutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ proofToken: 'RESET-TOKEN', emailProofToken: 'EMAIL-RESET-TOKEN' }));
    });

    it('이메일 인증 뒤 조회가 일시 실패하면 오류를 알리고 같은 이메일 증명으로 다시 확인할 수 있다', async () => {
      lookup({ pending: true });
      await reachPhoneResult();
      const succeed = hooks.findAccountMutateAsync.getMockImplementation();
      hooks.findAccountMutateAsync.mockRejectedValueOnce(new Error('일시 오류'));
      fireEvent.click(screen.getByRole('button', { name: '이메일로 한 번 더 확인하기' }));
      enterMailbox('owner@example.com');
      fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));

      expect(await screen.findByText('일시 오류')).toBeVisible();
      hooks.findAccountMutateAsync.mockImplementation(succeed as never);
      fireEvent.click(screen.getByRole('button', { name: '다시 확인하기' }));
      expect(await screen.findByText('ow***@example.com')).toBeInTheDocument();
    });

    it('번호 인증이 그새 만료됐으면 이메일 쪽을 다시 시키지 않고 처음부터 번호 인증을 다시 하게 한다', async () => {
      lookup({ pending: true });
      await reachPhoneResult();
      hooks.findAccountMutateAsync.mockRejectedValueOnce(Object.assign(new Error('휴대폰 본인인증을 다시 진행해 주세요.'), { code: 'PHONE_NOT_VERIFIED' }));
      fireEvent.click(screen.getByRole('button', { name: '이메일로 한 번 더 확인하기' }));
      enterMailbox('owner@example.com');
      fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));

      expect(await screen.findByText('휴대폰 본인인증을 다시 진행해 주세요.')).toBeVisible();
      expect(screen.getByLabelText('휴대폰 번호')).toBeVisible();
      expect(screen.queryByRole('button', { name: '이메일로 한 번 더 확인하기' })).not.toBeInTheDocument();
    });
  });

  // 번호를 고치면 앞 번호로 받은 증명은 더는 유효하지 않다.
  it('번호를 바꾸면 이전 인증 결과를 버린다', async () => {
    render(<AccountRecoveryClient />);
    enterPhone();
    fireEvent.click(screen.getByRole('button', { name: '__stub_verify__' }));
    expect(await screen.findByText('가입한 로그인 방법')).toBeInTheDocument();

    previousStep();
    fireEvent.change(screen.getByLabelText('휴대폰 번호'), { target: { value: '01099998888' } });

    expect(screen.queryByText('가입한 로그인 방법')).not.toBeInTheDocument();
  });
});

describe('AccountRecoveryClient — 이메일 재설정', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmailLookup();
    hooks.emailCardEmail = null;
    hooks.resetPasswordByEmailMutateAsync.mockResolvedValue({ ok: true });
  });

  it('아이디 찾기는 전화번호, 비밀번호 재설정은 이메일 폼만 보여 준다', () => {
    render(<AccountRecoveryClient />);
    expect(screen.queryByRole('tab', { name: '이메일' })).not.toBeInTheDocument();

    goToEmailReset();
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

  it('인증 뒤에는 발급 안내 대신 새 비밀번호 단계를 보여준다', async () => {
    render(<AccountRecoveryClient />);
    goToEmailReset();
    enterEmail();
    fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    await screen.findByLabelText('새 비밀번호');

    expect(screen.queryByRole('button', { name: '__stub_email_verify__' })).not.toBeInTheDocument();
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

    previousStep();
    fireEvent.click(screen.getByRole('button', { name: '로그인 방법 찾기' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
    expect(screen.getByLabelText('휴대폰 번호')).toBeInTheDocument();
    goToEmailReset();
    expect(screen.queryByLabelText('새 비밀번호')).not.toBeInTheDocument();
  });
  describe('메일함을 인증한 계정이 탈퇴 대기이면 비밀번호 단계 대신 탈퇴 안내로 간다', () => {
    // 지난 날짜는 화면이 "모른다"로 다루므로 먼 미래로 둔다.
    const UNTIL = '2099-01-31T00:00:00.000Z';
    const PENDING_EMAIL_ACCOUNT: V1FoundAccount = { ...ACTIVE_EMAIL_ACCOUNT, withdrawalPending: true, withdrawalPendingUntil: UNTIL };
    const verifyMailbox = () => {
      goToEmailReset();
      enterEmail();
      fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));
    };

    it('같은 탈퇴 안내(방법 1·2)를 이메일 문구로 보여 주고 새 비밀번호 칸은 그리지 않는다', async () => {
      resetEmailLookup(PENDING_EMAIL_ACCOUNT);
      render(<AccountRecoveryClient />);
      verifyMailbox();

      expect(await screen.findByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).toBeInTheDocument();
      expect(screen.getByText('이 이메일을 다시 쓰는 방법은 두 가지예요.')).toBeInTheDocument();
      expect(screen.queryByText(/이 번호를/)).not.toBeInTheDocument();
      expect(screen.getByText('이 이메일을 다시 쓸 수 있어요')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '로그인하고 탈퇴 취소하기' })).toHaveAttribute('href', '/login/email');
      expect(screen.queryByPlaceholderText('8자 이상')).not.toBeInTheDocument();
      expect(hooks.findAccountByEmailMutateAsync).toHaveBeenCalledWith({ email: 'runner@example.com', proofToken: 'EMAIL-RESET-TOKEN' });
      expect(hooks.resetPasswordByEmailMutateAsync).not.toHaveBeenCalled();
    });

    it('끝나는 날을 모르는 탈퇴 대기 계정도 비밀번호 단계로 보내지 않고 취소 안내만 보여 준다', async () => {
      resetEmailLookup({ ...PENDING_EMAIL_ACCOUNT, withdrawalPendingUntil: null });
      render(<AccountRecoveryClient />);
      verifyMailbox();

      expect(await screen.findByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).toBeInTheDocument();
      expect(screen.getByText('로그인하면 탈퇴를 취소할 수 있어요.')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '방법 2 기다리기' })).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText('8자 이상')).not.toBeInTheDocument();
      expect(screen.queryByText(/번호를 쥔 사람/)).not.toBeInTheDocument();
    });

    it('활성 계정은 조회 한 번 뒤 그대로 비밀번호 단계로 간다', async () => {
      render(<AccountRecoveryClient />);
      verifyMailbox();

      expect(await screen.findByPlaceholderText('8자 이상')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).not.toBeInTheDocument();
      expect(hooks.findAccountByEmailMutateAsync).toHaveBeenCalledTimes(1);
    });

    it('조회가 일시 실패하면 비밀번호 단계로 넘어가지 않고 다시 확인할 수 있다', async () => {
      hooks.findAccountByEmailMutateAsync.mockReset();
      hooks.findAccountByEmailMutateAsync.mockRejectedValueOnce(new Error('일시 오류')).mockResolvedValueOnce(PENDING_EMAIL_ACCOUNT);
      render(<AccountRecoveryClient />);
      verifyMailbox();

      expect(await screen.findByText('일시 오류')).toBeVisible();
      expect(screen.queryByPlaceholderText('8자 이상')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '다시 확인하기' }));
      expect(await screen.findByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).toBeInTheDocument();
    });

    // 인증을 마친 뒤 다른 곳에서 탈퇴를 신청한 경우 — 서버가 저장 시점에 거절하면 같은 안내로 간다.
    it('비밀번호를 저장할 때 서버가 ACCOUNT_WITHDRAWAL_PENDING 으로 거절하면 같은 안내로 바뀐다', async () => {
      hooks.findAccountByEmailMutateAsync.mockReset();
      hooks.findAccountByEmailMutateAsync.mockResolvedValueOnce(ACTIVE_EMAIL_ACCOUNT).mockResolvedValueOnce(PENDING_EMAIL_ACCOUNT);
      hooks.resetPasswordByEmailMutateAsync.mockRejectedValueOnce(Object.assign(new Error('탈퇴를 신청한 계정이라 비밀번호를 바꿀 수 없어요.'), {
        code: 'ACCOUNT_WITHDRAWAL_PENDING',
      }));
      render(<AccountRecoveryClient />);
      verifyMailbox();
      await fillNewPassword();
      fireEvent.click(screen.getByRole('button', { name: '비밀번호 바꾸기' }));

      expect(await screen.findByRole('heading', { name: '탈퇴를 신청한 계정이에요' })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('8자 이상')).not.toBeInTheDocument();
      expect(hooks.findAccountByEmailMutateAsync).toHaveBeenCalledTimes(2);
    });

    it('설정에서 들어온 로그인 사용자는 조회 없이 바로 비밀번호 단계로 간다', async () => {
      render(<AccountRecoveryClient initialMode="reset-password" backHref="/my/settings" />);
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
      fireEvent.click(screen.getByRole('button', { name: '__stub_email_verify__' }));

      expect(await screen.findByPlaceholderText('8자 이상')).toBeInTheDocument();
      expect(hooks.findAccountByEmailMutateAsync).not.toHaveBeenCalled();
    });
  });
});
