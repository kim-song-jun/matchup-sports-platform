import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import { SignupClient } from './signup-client';

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  registerMutateAsync: vi.fn(),
  updateProfileMutateAsync: vi.fn(),
  uploadImagesMutateAsync: vi.fn(),
  checkNicknameMutateAsync: vi.fn(),
  checkEmailMutateAsync: vi.fn(),
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
  useV1CheckNickname: () => ({ mutateAsync: hooks.checkNicknameMutateAsync, isPending: false }),
  useV1CheckEmail: () => ({ mutateAsync: hooks.checkEmailMutateAsync, isPending: false }),
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

async function completePhoneVerification(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: '__stub_verify__' }));
}

/** 1단계(계정)를 채우고 두 칸을 벗어나 중복 확인까지 마친다. 라벨은 필수 표시(*·(필수))가 붙어 부분 일치로 찾는다. */
function fillAccountStep(): void {
  fireEvent.change(screen.getByLabelText(/^닉네임/), { target: { value: '테스트닉' } });
  fireEvent.change(screen.getByLabelText(/^이메일/), { target: { value: 'signup@example.com' } });
  fireEvent.change(screen.getByPlaceholderText('8자 이상'), { target: { value: 'password123' } });
  fireEvent.change(screen.getByPlaceholderText('비밀번호 다시 입력'), { target: { value: 'password123' } });

  // 칸을 벗어나면 0.5초를 기다리지 않고 바로 중복을 확인한다.
  fireEvent.blur(screen.getByLabelText(/^닉네임/));
  fireEvent.blur(screen.getByLabelText(/^이메일/));
}

/** 1단계(계정) 통과 → 2단계(본인인증) 진입. */
async function advanceToVerify(): Promise<void> {
  fillAccountStep();
  const nextButton = screen.getByRole('button', { name: '본인인증 하기' });
  await waitFor(() => expect(nextButton).toBeEnabled());
  fireEvent.click(nextButton);
}

/** 2단계에서 번호 입력 + 인증까지 마치면 3단계(프로필)로 자동 이동한다. */
async function advanceToProfile(phone = '01012345678'): Promise<void> {
  await advanceToVerify();
  fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: phone } });
  await completePhoneVerification();
  // 완료 표시를 잠깐 보여준 뒤 넘어가므로(VERIFY_ADVANCE_DELAY_MS) 프로필 필드 등장으로 대기한다.
  await screen.findByLabelText(/^이름/, {}, { timeout: 3000 });
}

describe('SignupClient required profile contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem(
      'teameet.v1.signupTermsDocumentIds',
      JSON.stringify(['11111111-1111-4111-8111-111111111111']),
    );
    hooks.checkNicknameMutateAsync.mockResolvedValue({ available: true });
    hooks.checkEmailMutateAsync.mockResolvedValue({ available: true });
    hooks.registerMutateAsync.mockResolvedValue({
      session: { userId: 'user-email', userEmail: 'signup@example.com' },
    });
    hooks.phoneIssueMutateAsync.mockResolvedValue({
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    });
    hooks.phoneVerifyMutateAsync.mockResolvedValue({ verified: true, proofToken: 'PROOF-TOKEN' });
  });

  it('redirects direct signup entry to terms before accepting account input', async () => {
    window.sessionStorage.clear();

    render(<SignupClient />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/terms?mode=signup'));
    expect(screen.queryByRole('heading', { name: '가입 정보를 확인해 주세요' })).not.toBeInTheDocument();
  });

  it('keeps the identity-verification phrase together', async () => {
    // Given
    render(<SignupClient />);

    // When
    await advanceToProfile();

    // Then
    expect(screen.getByText('본인 확인에 쓰여요.')).toHaveStyle({ whiteSpace: 'nowrap' });
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
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.click(screen.getByRole('radio', { name: '남' }));

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
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.click(screen.getByRole('radio', { name: '남' }));

    // When
    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('sign_up_complete', { method: 'email' }));
  });

  it('인증을 마치기 전에는 프로필 단계로 넘어갈 수 없다', async () => {
    // Given
    render(<SignupClient />);
    await advanceToVerify();
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01012345678' } });

    // When — 인증하지 않은 채 다음을 누른다
    const next = screen.getByRole('button', { name: '다음' });
    expect(next).toBeDisabled();
    fireEvent.click(next);

    // Then — 프로필 필드는 나타나지 않는다(가입 자체가 시작되지 않는다)
    expect(screen.queryByLabelText(/^이름/)).not.toBeInTheDocument();
    expect(hooks.registerMutateAsync).not.toHaveBeenCalled();
  });

  it('인증이 끝나면 버튼을 누르지 않아도 프로필 단계로 넘어간다', async () => {
    // Given
    render(<SignupClient />);
    await advanceToVerify();
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01012345678' } });

    // When
    await completePhoneVerification();

    // Then — 자동 이동(완료 표시를 잠깐 보여준 뒤)
    expect(await screen.findByLabelText(/^이름/, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('필수 항목은 별표만이 아니라 접근성 이름으로도 필수임을 알린다', async () => {
    // Given
    render(<SignupClient />);

    // Then — 색(빨간 별)에만 의존하면 색각 이상·스크린리더에서 정보가 사라진다.
    // 별표는 장식(aria-hidden)이므로 단언하지 않는다 — 의미를 지고 있는 건 "(필수)" 텍스트다.
    for (const field of [/닉네임/, /이메일/]) {
      const label = screen.getByLabelText(field).closest('label');
      expect(label?.textContent).toContain('(필수)');
    }
  });

  it('인증 직후 이전을 누르면 예약된 자동 이동이 취소된다', async () => {
    // Given — 인증 성공 ~ 자동 이동 사이(900ms)에 사용자가 되돌아가는 경우.
    // 실시간 대기 대신 예약된 타이머만 앞당긴다. shouldAdvanceTime 을 켜서 waitFor 같은
    // 기존 비동기 유틸이 그대로 동작하게 한다.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<SignupClient />);
      await advanceToVerify();
      fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: '01012345678' } });
      await completePhoneVerification();

      // When — 자동 이동이 발동하기 전에 '이전'
      fireEvent.click(screen.getByRole('button', { name: '이전 단계' }));

      // Then — 예약이 남아 있으면 잠시 뒤 프로필로 끌려간다. 그러면 안 된다.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(screen.queryByLabelText(/^이름/)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^닉네임/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('성별 라디오그룹도 필수임을 접근성 이름으로 알린다', async () => {
    // Given — label 로 감싸지지 않는 radiogroup 은 aria-labelledby 로 라벨을 물려야 한다
    render(<SignupClient />);
    await advanceToProfile();

    // Then
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAccessibleName(expect.stringContaining('(필수)'));
    expect(group).toHaveAttribute('aria-required', 'true');
  });

  it.each([
    ['010123456789'],
    ['0101234abcd'],
  ] as const)('휴대폰 원시 입력이 %s 이면 인증 카드가 열리지 않는다', async (rawValue) => {
    // Given
    render(<SignupClient />);
    await advanceToVerify();

    // When
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: rawValue } });

    // Then — 11자리 정상 번호가 아니면 인증을 시작할 수 없다
    expect(screen.queryByRole('button', { name: '__stub_verify__' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  it.each([
    ['birth date', /^생년월일/, '200002290'],
    ['birth date', /^생년월일/, '2000ab29'],
  ] as const)('blocks email signup when raw %s input is %s', async (_field, label, rawValue) => {
    // Given
    render(<SignupClient />);
    await advanceToProfile();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.click(screen.getByRole('radio', { name: '남' }));
    fireEvent.change(screen.getByLabelText(label), { target: { value: rawValue } });

    // When
    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    // Then
    expect(hooks.registerMutateAsync).not.toHaveBeenCalled();
  });

  it('휴대폰에 한 자리를 더 치면 값은 남고 인증 카드는 닫힌다', async () => {
    // Given
    const user = userEvent.setup();
    render(<SignupClient />);
    await advanceToVerify();
    const input = screen.getByLabelText(/^휴대폰 번호/);
    fireEvent.change(input, { target: { value: '01012345678' } });
    expect(await screen.findByRole('button', { name: '__stub_verify__' })).toBeInTheDocument();

    // When
    await user.type(input, '9');

    // Then
    expect(input).toHaveValue('010-1234-56789');
    expect(screen.queryByRole('button', { name: '__stub_verify__' })).not.toBeInTheDocument();
  });

  it.each([
    ['birth date', /^생년월일/, '20000229', '0', '2000-02-290'],
  ] as const)('retains an extra typed %s digit and disables email signup', async (_field, label, validValue, extraDigit, expectedValue) => {
    // Given
    const user = userEvent.setup();
    render(<SignupClient />);
    await advanceToProfile();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '홍길동' } });
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

  // 이 화면만 상단바 없이 렌더돼 가입을 시작하면 빠져나갈 컨트롤이 없었다.
  // 목적지는 직전 단계인 약관 화면이고, 거기서 다시 /login 으로 나갈 수 있다.
  it('상단에 약관 화면으로 돌아가는 뒤로가기를 노출한다', () => {
    render(<SignupClient />);

    expect(screen.getAllByRole('link', { name: '뒤로가기' })[0]).toHaveAttribute('href', '/terms?mode=signup');
  });
});

describe('SignupClient 닉네임·이메일 자동 중복 확인', () => {
  const TERMS_KEY = 'teameet.v1.signupTermsDocumentIds';

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.sessionStorage.setItem(TERMS_KEY, JSON.stringify(['11111111-1111-4111-8111-111111111111']));
    hooks.checkNicknameMutateAsync.mockResolvedValue({ available: true });
    hooks.checkEmailMutateAsync.mockResolvedValue({ available: true });
  });

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
  }

  it('중복 확인 버튼 없이, 입력을 멈추고 0.5초가 지나야 한 번 확인한다', async () => {
    vi.useFakeTimers();
    try {
      render(<SignupClient />);
      const input = screen.getByLabelText(/^닉네임/);
      expect(screen.queryByRole('button', { name: '중복 확인' })).not.toBeInTheDocument();

      fireEvent.change(input, { target: { value: '테스트' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      // 계속 입력하면 기다리는 시간이 처음부터 다시 시작한다.
      fireEvent.change(input, { target: { value: '테스트닉' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(499); });
      expect(hooks.checkNicknameMutateAsync).not.toHaveBeenCalled();

      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(hooks.checkNicknameMutateAsync).toHaveBeenCalledTimes(1);
      expect(hooks.checkNicknameMutateAsync).toHaveBeenCalledWith('테스트닉');
      expect(screen.getByText('사용 가능한 닉네임이에요.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('칸을 벗어나면 기다리지 않고 바로 확인하고, 뒤이어 타이머가 지나가도 다시 묻지 않는다', async () => {
    vi.useFakeTimers();
    try {
      render(<SignupClient />);
      const input = screen.getByLabelText(/^이메일/);

      fireEvent.change(input, { target: { value: ' Signup@Example.com ' } });
      fireEvent.blur(input);
      await act(async () => { await Promise.resolve(); });
      // 서버에는 공백을 걷고 소문자로 맞춘 값이 간다.
      expect(hooks.checkEmailMutateAsync).toHaveBeenCalledWith('signup@example.com');

      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(hooks.checkEmailMutateAsync).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('늦게 도착한 옛 요청의 응답이 최신 입력의 결과를 덮지 않는다', async () => {
    const stale = deferred<{ available: boolean }>();
    hooks.checkNicknameMutateAsync
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ available: true });
    render(<SignupClient />);
    const input = screen.getByLabelText(/^닉네임/);

    fireEvent.change(input, { target: { value: '테스트' } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: '테스트닉' } });
    fireEvent.blur(input);
    expect(await screen.findByText('사용 가능한 닉네임이에요.')).toBeInTheDocument();

    // 앞선 '테스트' 요청이 뒤늦게 "이미 사용 중"으로 돌아온다.
    await act(async () => { stale.resolve({ available: false }); });

    expect(screen.getByText('사용 가능한 닉네임이에요.')).toBeInTheDocument();
    expect(screen.queryByText('이미 사용 중인 닉네임이에요.')).not.toBeInTheDocument();
  });

  it.each([
    ['닉네임', hooks.checkNicknameMutateAsync, '이미 사용 중인 닉네임이에요.'],
    ['이메일', hooks.checkEmailMutateAsync, '이미 가입된 이메일이에요.'],
  ] as const)('이미 쓰는 %s이면 안내하고 본인인증 단계로 넘어갈 수 없다', async (label, check, message) => {
    check.mockResolvedValue({ available: false });
    render(<SignupClient />);
    fireEvent.change(screen.getByLabelText(/^닉네임/), { target: { value: '테스트닉' } });
    fireEvent.change(screen.getByLabelText(/^이메일/), { target: { value: 'signup@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('8자 이상'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('비밀번호 다시 입력'), { target: { value: 'password123' } });
    fireEvent.blur(screen.getByLabelText(new RegExp(`^${label}`)));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: '본인인증 하기' })).toBeDisabled();
  });

  it('확인을 마친 값을 고치면 이전 판정이 사라져 다음 단계가 다시 막힌다', async () => {
    render(<SignupClient />);
    fillAccountStep();
    const next = screen.getByRole('button', { name: '본인인증 하기' });
    await waitFor(() => expect(next).toBeEnabled());

    fireEvent.change(screen.getByLabelText(/^닉네임/), { target: { value: '다른닉네임' } });

    expect(screen.queryByText('사용 가능한 닉네임이에요.')).not.toBeInTheDocument();
    expect(next).toBeDisabled();
  });

  it('확인 요청이 실패하면 알리고, 칸을 다시 벗어날 때 재시도한다', async () => {
    hooks.checkNicknameMutateAsync
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ available: true });
    render(<SignupClient />);
    const input = screen.getByLabelText(/^닉네임/);

    fireEvent.change(input, { target: { value: '테스트닉' } });
    fireEvent.blur(input);
    expect(await screen.findByRole('alert')).toHaveTextContent('중복 확인에 실패했어요. 다시 시도해 주세요.');

    fireEvent.blur(input);
    expect(await screen.findByText('사용 가능한 닉네임이에요.')).toBeInTheDocument();
  });

  it('2자 미만 닉네임은 요청 없이 형식만 안내한다', async () => {
    vi.useFakeTimers();
    try {
      render(<SignupClient />);
      const input = screen.getByLabelText(/^닉네임/);

      fireEvent.change(input, { target: { value: '가' } });
      fireEvent.blur(input);
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });

      expect(screen.getByRole('alert')).toHaveTextContent('닉네임은 2자 이상 입력해 주세요.');
      expect(hooks.checkNicknameMutateAsync).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('가입 요청이 닉네임 중복(409)으로 거절되면 가입 정보 단계에서 그 사실을 알린다', async () => {
    hooks.phoneIssueMutateAsync.mockResolvedValue({ expiresAt: new Date(Date.now() + 300000).toISOString() });
    hooks.phoneVerifyMutateAsync.mockResolvedValue({ verified: true, proofToken: 'PROOF-TOKEN' });
    hooks.registerMutateAsync.mockRejectedValue(new V1ApiError({
      status: 'error',
      statusCode: 409,
      code: 'NICKNAME_CONFLICT',
      message: '이미 사용 중인 닉네임이에요.',
      timestamp: '2026-09-30T00:00:00.000Z',
    }));
    render(<SignupClient />);
    await advanceToProfile();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '홍길동' } });
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.click(screen.getByRole('radio', { name: '남' }));

    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 사용 중인 닉네임이에요.');
    expect(screen.getByLabelText(/^닉네임/)).toHaveAttribute('aria-invalid', 'true');
  });
});
