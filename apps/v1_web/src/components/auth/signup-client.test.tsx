import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignupClient } from './signup-client';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  registerMutateAsync: vi.fn(),
  updateProfileMutateAsync: vi.fn(),
  uploadImagesMutateAsync: vi.fn(),
  checkNicknameMutate: vi.fn(),
  checkEmailMutate: vi.fn(),
  phoneIssueMutateAsync: vi.fn(),
  phoneVerifyMutateAsync: vi.fn(),
  authedPhoneRequestMutateAsync: vi.fn(),
  authedPhoneConfirmMutateAsync: vi.fn(),
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
  useV1Register: () => ({ mutateAsync: hooks.registerMutateAsync, isPending: false }),
  useV1UpdateProfile: () => ({ mutateAsync: hooks.updateProfileMutateAsync, isPending: false }),
  useV1UploadImages: () => ({ mutateAsync: hooks.uploadImagesMutateAsync, isPending: false }),
  useV1CheckNickname: () => ({ mutate: hooks.checkNicknameMutate, isPending: false }),
  useV1CheckEmail: () => ({ mutate: hooks.checkEmailMutate, isPending: false }),
  useV1PhoneIssue: () => ({ mutateAsync: hooks.phoneIssueMutateAsync, isPending: false }),
  useV1PhoneVerify: () => ({ mutateAsync: hooks.phoneVerifyMutateAsync, isPending: false }),
  useV1AuthedPhoneRequest: () => ({ mutateAsync: hooks.authedPhoneRequestMutateAsync, isPending: false }),
  useV1AuthedPhoneConfirm: () => ({ mutateAsync: hooks.authedPhoneConfirmMutateAsync, isPending: false }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

// 부모(회원가입 폼)는 register 게이트만 검증한다. 카드 내부(자동 발급·폴링)와 디커플하기 위해
// PhoneVerificationCard를 stub으로 대체하고 onVerified만 직접 트리거한다.
vi.mock('@/components/auth/phone-verification/phone-verification-card', () => ({
  PhoneVerificationCard: ({ onVerified }: { onVerified: (proofToken?: string) => void }) => (
    <button type="button" onClick={() => onVerified('PROOF-TOKEN')}>
      __stub_verify__
    </button>
  ),
}));

type AvailabilityCallbacks = {
  readonly onSuccess: (result: { readonly available: boolean }) => void;
};

async function completePhoneVerification(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: '__stub_verify__' }));
}

async function advanceToProfile(): Promise<void> {
  fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '테스트닉' } });
  fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'signup@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('8자 이상'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByPlaceholderText('비밀번호 다시 입력'), { target: { value: 'password123' } });

  const duplicateButtons = screen.getAllByRole('button', { name: '중복 확인' });
  fireEvent.click(duplicateButtons[0]);
  fireEvent.click(duplicateButtons[1]);

  const nextButton = screen.getByRole('button', { name: '프로필 입력하기' });
  await waitFor(() => expect(nextButton).toBeEnabled());
  fireEvent.click(nextButton);
}

describe('SignupClient required profile contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem(
      'teameet.v1.signupTermsDocumentIds',
      JSON.stringify(['11111111-1111-4111-8111-111111111111']),
    );
    hooks.checkNicknameMutate.mockImplementation(
      (_value: string, callbacks: AvailabilityCallbacks) => callbacks.onSuccess({ available: true }),
    );
    hooks.checkEmailMutate.mockImplementation(
      (_value: string, callbacks: AvailabilityCallbacks) => callbacks.onSuccess({ available: true }),
    );
    hooks.registerMutateAsync.mockResolvedValue({
      session: { userId: 'user-email', userEmail: 'signup@example.com' },
    });
    hooks.phoneIssueMutateAsync.mockResolvedValue({
      code: 'ABC123',
      destNumber: '16663538',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    });
    hooks.phoneVerifyMutateAsync.mockResolvedValue({ verified: true, proofToken: 'PROOF-TOKEN' });
  });

  it('redirects direct signup entry to terms before accepting account input', async () => {
    window.sessionStorage.clear();

    render(<SignupClient />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/terms'));
    expect(screen.queryByRole('heading', { name: '가입 정보를 확인해 주세요' })).not.toBeInTheDocument();
  });

  it('keeps the identity-verification phrase together', async () => {
    // Given
    render(<SignupClient />);

    // When
    await advanceToProfile();

    // Then
    expect(screen.getByText('본인 확인에 필요해요.')).toHaveStyle({ whiteSpace: 'nowrap' });
  });

  it('does not let confirmation bypass missing display name, phone, or birth date', async () => {
    // Given
    render(<SignupClient />);
    await advanceToProfile();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('radio', { name: '남' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    // When
    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    // Then
    await waitFor(() => expect(hooks.registerMutateAsync).not.toHaveBeenCalled());
  });

  it('submits all four required profile values plus the phone proof token when email signup is complete', async () => {
    // Given
    render(<SignupClient />);
    await advanceToProfile();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01012345678' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.click(screen.getByRole('radio', { name: '남' }));
    await completePhoneVerification();

    // When
    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    // Then
    await waitFor(() =>
      expect(hooks.registerMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: '홍길동',
          phone: '01012345678',
          birthDate: '20000229',
          gender: 'male',
          acceptedTermsDocumentIds: ['11111111-1111-4111-8111-111111111111'],
          phoneProofToken: 'PROOF-TOKEN',
        }),
      ),
    );
  });

  it('tracks a sign_up_complete event with method=email once registration succeeds', async () => {
    // Given
    render(<SignupClient />);
    await advanceToProfile();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01012345678' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.click(screen.getByRole('radio', { name: '남' }));
    await completePhoneVerification();

    // When
    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('sign_up_complete', { method: 'email' }));
  });

  it('blocks email signup submission until phone verification is completed', async () => {
    // Given
    render(<SignupClient />);
    await advanceToProfile();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01012345678' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.click(screen.getByRole('radio', { name: '남' }));

    // When — submitting without completing phone verification
    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    // Then
    await waitFor(() => expect(screen.getByText('휴대폰 본인인증을 완료해 주세요.')).toBeInTheDocument());
    expect(hooks.registerMutateAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['phone', /^휴대폰 번호/, '010123456789'],
    ['phone', /^휴대폰 번호/, '0101234abcd'],
    ['birth date', /^생년월일/, '200002290'],
    ['birth date', /^생년월일/, '2000ab29'],
  ] as const)('blocks email signup when raw %s input is %s', async (_field, label, rawValue) => {
    // Given
    render(<SignupClient />);
    await advanceToProfile();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01012345678' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.click(screen.getByRole('radio', { name: '남' }));
    fireEvent.change(screen.getByLabelText(label), { target: { value: rawValue } });

    // When
    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    // Then
    expect(hooks.registerMutateAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['phone', /^휴대폰 번호/, '01012345678', '9', '010-1234-56789'],
    ['birth date', /^생년월일/, '20000229', '0', '2000-02-290'],
  ] as const)('retains an extra typed %s digit and disables email signup', async (_field, label, validValue, extraDigit, expectedValue) => {
    // Given
    const user = userEvent.setup();
    render(<SignupClient />);
    await advanceToProfile();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01012345678' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.click(screen.getByRole('radio', { name: '남' }));
    const input = screen.getByLabelText(label);
    fireEvent.change(input, { target: { value: validValue } });

    // When
    await user.type(input, extraDigit);

    // Then
    expect(input).toHaveValue(expectedValue);
    expect(screen.getByRole('button', { name: '가입하고 계속' })).toBeDisabled();
  });
});
