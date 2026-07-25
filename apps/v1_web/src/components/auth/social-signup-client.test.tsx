import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialSignupClient } from './social-signup-client';

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  checkNicknameMutate: vi.fn(),
  completeProfileMutate: vi.fn(),
  phoneIssueMutateAsync: vi.fn(),
  phoneVerifyMutateAsync: vi.fn(),
  authedPhoneRequestMutateAsync: vi.fn(),
  authedPhoneConfirmMutateAsync: vi.fn(),
  logoutMutateAsync: vi.fn(),
  // 카카오 동의항목 미승인이 기본값 — 프리필 없이 직접 입력하는 기존 흐름.
  authMe: { socialSignupPrefill: null as null | { name: string | null; phone: string | null; gender: 'male' | 'female' | null } },
}));

const analytics = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ removeQueries: vi.fn() }),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: () => ({ data: hooks.authMe }),
  useV1Logout: () => ({ mutateAsync: hooks.logoutMutateAsync, isPending: false }),
  useV1CheckNickname: () => ({ mutate: hooks.checkNicknameMutate, isPending: false }),
  useV1CompleteSocialProfile: () => ({ mutate: hooks.completeProfileMutate, isPending: false }),
  useV1PhoneIssue: () => ({ mutateAsync: hooks.phoneIssueMutateAsync, isPending: false }),
  useV1PhoneVerify: () => ({ mutateAsync: hooks.phoneVerifyMutateAsync, isPending: false }),
  useV1AuthedPhoneRequest: () => ({ mutateAsync: hooks.authedPhoneRequestMutateAsync, isPending: false }),
  useV1AuthedPhoneConfirm: () => ({ mutateAsync: hooks.authedPhoneConfirmMutateAsync, isPending: false }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

type AvailabilityCallbacks = {
  readonly onSuccess: (result: { readonly available: boolean }) => void;
};

type CompleteProfileCallbacks = {
  readonly onSuccess: (result: {
    readonly session: { readonly userId: string; readonly userEmail: string | null };
    readonly next: { readonly route: string };
  }) => void;
};

async function verifyNicknameAndSelectGender(): Promise<void> {
  fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '카카오러너' } });
  fireEvent.click(screen.getByRole('button', { name: '중복 확인' }));
  fireEvent.click(screen.getByRole('radio', { name: '여' }));
  await waitFor(() => expect(screen.getByText('사용 가능한 닉네임이에요.')).toBeInTheDocument());
}

// 부모는 완성 게이트만 검증한다. 카드 내부(자동 발급·폴링)와 디커플하기 위해 stub으로 대체.
vi.mock('@/components/auth/phone-verification/phone-verification-card', () => ({
  PhoneVerificationCard: ({ onVerified }: { onVerified: (proofToken?: string) => void }) => (
    <button type="button" onClick={() => onVerified()}>
      __stub_verify__
    </button>
  ),
}));

async function completePhoneVerification(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: '__stub_verify__' }));
}

describe('SocialSignupClient required profile contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.checkNicknameMutate.mockImplementation(
      (_value: string, callbacks: AvailabilityCallbacks) => callbacks.onSuccess({ available: true }),
    );
    hooks.authedPhoneRequestMutateAsync.mockResolvedValue({
      sent: true,
      channel: 'phone',
    });
    hooks.authedPhoneConfirmMutateAsync.mockResolvedValue({
      verified: true,
      verification: { emailVerified: false, phoneVerified: true },
    });
  });

  it.each([
    ['display name', /^이름/],
    ['phone', /^휴대폰 번호/],
    ['birth date', /^생년월일/],
  ] as const)('renders a required %s input for social signup', (_field, label) => {
    // Given
    render(<SocialSignupClient />);

    // When
    const input = screen.getByLabelText(label);

    // Then
    expect(input).toBeRequired();
  });

  it('keeps social signup blocked while the required profile inputs are empty', async () => {
    // Given
    render(<SocialSignupClient />);
    await verifyNicknameAndSelectGender();

    // When
    const submitButton = screen.getByRole('button', { name: /입력 확인 후 계속|운동 설정으로 계속/ });

    // Then
    expect(submitButton).toBeDisabled();
  });

  it('submits all four required profile values for social signup', async () => {
    // Given
    render(<SocialSignupClient />);
    await verifyNicknameAndSelectGender();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    await completePhoneVerification();

    // When
    fireEvent.click(screen.getByRole('button', { name: '운동 설정으로 계속' }));

    // Then
    await waitFor(() =>
      expect(hooks.completeProfileMutate).toHaveBeenCalledWith(
        {
          nickname: '카카오러너',
          displayName: '김러너',
          phone: '01087654321',
          birthDate: '20000229',
          gender: 'female',
        },
        expect.any(Object),
      ),
    );
  });

  it('tracks a sign_up_complete event with method=kakao once the social profile is saved', async () => {
    // Given
    hooks.completeProfileMutate.mockImplementation((_body: unknown, callbacks: CompleteProfileCallbacks) =>
      callbacks.onSuccess({ session: { userId: 'social-user', userEmail: null }, next: { route: '/onboarding/region' } }),
    );
    render(<SocialSignupClient />);
    await verifyNicknameAndSelectGender();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    await completePhoneVerification();

    // When
    fireEvent.click(screen.getByRole('button', { name: '운동 설정으로 계속' }));

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('sign_up_complete', { method: 'kakao' }));
  });

  it('follows the exact API next route after social profile completion', async () => {
    // Given
    hooks.completeProfileMutate.mockImplementation(
      (_body: unknown, callbacks: CompleteProfileCallbacks) => callbacks.onSuccess({
        session: { userId: 'social-user', userEmail: null },
        next: { route: '/onboarding/region' },
      }),
    );
    render(<SocialSignupClient />);
    await verifyNicknameAndSelectGender();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    await completePhoneVerification();

    // When
    fireEvent.click(screen.getByRole('button', { name: '운동 설정으로 계속' }));

    // Then
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/region'));
  });

  it('blocks social signup submission until phone verification is completed', async () => {
    // Given
    render(<SocialSignupClient />);
    await verifyNicknameAndSelectGender();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });

    // When — submitting without completing phone verification
    fireEvent.click(screen.getByRole('button', { name: '운동 설정으로 계속' }));

    // Then
    await waitFor(() => expect(screen.getByText('휴대폰 본인인증을 완료해 주세요.')).toBeInTheDocument());
    expect(hooks.completeProfileMutate).not.toHaveBeenCalled();
  });

  it.each([
    ['phone', /^휴대폰 번호/, '010876543210'],
    ['phone', /^휴대폰 번호/, '0108765abcd'],
    ['birth date', /^생년월일/, '200002290'],
    ['birth date', /^생년월일/, '2000ab29'],
  ] as const)('blocks social signup when raw %s input is %s', async (_field, label, rawValue) => {
    // Given
    render(<SocialSignupClient />);
    await verifyNicknameAndSelectGender();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.change(screen.getByLabelText(label), { target: { value: rawValue } });

    // When
    fireEvent.click(screen.getByRole('button', { name: /입력 확인 후 계속|운동 설정으로 계속/ }));

    // Then
    expect(hooks.completeProfileMutate).not.toHaveBeenCalled();
  });

  it.each([
    ['phone', /^휴대폰 번호/, '01087654321', '0', '010-8765-43210'],
    ['birth date', /^생년월일/, '20000229', '0', '2000-02-290'],
  ] as const)('retains an extra typed %s digit and disables social signup', async (_field, label, validValue, extraDigit, expectedValue) => {
    // Given
    const user = userEvent.setup();
    render(<SocialSignupClient />);
    await verifyNicknameAndSelectGender();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    const input = screen.getByLabelText(label);
    fireEvent.change(input, { target: { value: validValue } });

    // When
    await user.type(input, extraDigit);

    // Then
    expect(input).toHaveValue(expectedValue);
    expect(screen.getByRole('button', { name: /입력 확인 후 계속|운동 설정으로 계속/ })).toBeDisabled();
  });
});

// PendingSocialSignupGate 가 이 단계에서 다른 경로를 전부 되돌리므로, 이 버튼이 없으면
// 사용자는 가입을 끝내기 전까지 화면을 빠져나갈 방법이 아예 없다(원래 증상).
describe('SocialSignupClient 가입 중 탈출구', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.authMe.socialSignupPrefill = null;
  });

  // AuthFrame 은 모바일 상단바와 데스크톱 in-card 내비 두 벌을 함께 렌더하고 실제로는 CSS
  // (min-width:1024px)로 한쪽만 보인다. jsdom 에는 둘 다 남으므로 getAllBy* 로 받아 첫 번째를 쓴다.
  const exitButtons = () => screen.getAllByRole('button', { name: '가입 그만두기' });

  it('모바일·데스크톱 양쪽에 가입 그만두기 버튼을 노출한다', () => {
    render(<SocialSignupClient />);
    // 한쪽이라도 빠지면 그 폭에서는 화면을 빠져나갈 방법이 사라진다(데스크톱은 상단바가 숨겨짐).
    expect(exitButtons()).toHaveLength(2);
  });

  it('확인 모달에서 계속 쓰기를 고르면 로그아웃하지 않는다', async () => {
    const user = userEvent.setup();
    render(<SocialSignupClient />);

    await user.click(exitButtons()[0]);
    await user.click(await screen.findByRole('button', { name: '계속 쓰기' }));

    expect(hooks.logoutMutateAsync).not.toHaveBeenCalled();
  });

  it('그만두기를 고르면 로그아웃한다', async () => {
    const user = userEvent.setup();
    hooks.logoutMutateAsync.mockResolvedValue({ ok: true });
    render(<SocialSignupClient />);

    await user.click(exitButtons()[0]);
    await user.click(await screen.findByRole('button', { name: '그만두기' }));

    await waitFor(() => expect(hooks.logoutMutateAsync).toHaveBeenCalledTimes(1));
  });

  // 로그아웃 실패를 조용히 넘기면 로그인 화면으로 가도 게이트가 다시 끌어와
  // "눌러도 아무 일 없는" 원래 증상으로 되돌아간다.
  it('로그아웃이 실패하면 이유를 알린다', async () => {
    const user = userEvent.setup();
    hooks.logoutMutateAsync.mockRejectedValue(new Error('network down'));
    render(<SocialSignupClient />);

    await user.click(exitButtons()[0]);
    await user.click(await screen.findByRole('button', { name: '그만두기' }));

    expect(await screen.findByText(/가입 취소를 완료하지 못했어요/)).toBeInTheDocument();
  });
});

describe('SocialSignupClient 카카오 자동 채움', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.authMe.socialSignupPrefill = null;
  });

  it('카카오 값이 없으면 기존처럼 직접 입력한다', () => {
    render(<SocialSignupClient />);
    expect(screen.getByLabelText(/^이름/)).toHaveValue('');
    expect(screen.getByLabelText(/^이름/)).not.toHaveAttribute('readonly');
    expect(screen.getByRole('radio', { name: '남' })).toBeEnabled();
  });

  it('이름·성별은 채우고 수정하지 못하게 잠근다', async () => {
    hooks.authMe.socialSignupPrefill = { name: '홍길동', phone: null, gender: 'female' };
    render(<SocialSignupClient />);

    await waitFor(() => expect(screen.getByLabelText(/^이름/)).toHaveValue('홍길동'));
    expect(screen.getByLabelText(/^이름/)).toHaveAttribute('readonly');
    expect(screen.getByRole('radio', { name: '여' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: '남' })).toBeDisabled();
  });

  // 게이트가 /auth/me 를 먼저 받아 두지만 캐시가 비면 프리필이 늦게 도착할 수 있다.
  // 그때 이미 입력 중이던 번호를 덮어쓰면 사용자의 입력이 소리 없이 사라진다.
  it('프리필이 늦게 와도 이미 입력한 전화번호를 덮어쓰지 않는다', async () => {
    const { rerender } = render(<SocialSignupClient />);
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });

    hooks.authMe.socialSignupPrefill = { name: null, phone: '01012345678', gender: null };
    rerender(<SocialSignupClient />);

    await waitFor(() => expect(screen.getByLabelText(/^휴대폰 번호/)).toHaveValue('010-8765-4321'));
  });

  // 카카오 번호와 실제 쓰는 번호가 다를 수 있는데 잠그면 OTP 본인인증을 통과할 방법이 없어진다.
  it('전화번호는 채우되 수정할 수 있게 둔다', async () => {
    hooks.authMe.socialSignupPrefill = { name: null, phone: '01012345678', gender: null };
    render(<SocialSignupClient />);

    const phone = screen.getByLabelText(/^휴대폰 번호/);
    await waitFor(() => expect(phone).toHaveValue('010-1234-5678'));
    expect(phone).not.toHaveAttribute('readonly');
  });
});
