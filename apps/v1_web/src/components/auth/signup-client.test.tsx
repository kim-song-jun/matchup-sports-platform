import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PENDING_EMAIL_LINK_STORAGE_KEY, readPendingEmailLink, savePendingEmailLink } from '@/lib/pending-email-link';
import { peekPendingSocialLink, savePendingSocialLink } from '@/lib/pending-social-link';
import { consumeSignupPhotoNotice } from '@/lib/signup-photo-notice';
import { SignupClient } from './signup-client';
import {
  ACCOUNT_PASSWORD,
  OTHER_PHONE,
  PHONE,
  TERMS_DOCUMENT_ID,
  TERMS_STORAGE_KEY,
  advanceToAccount,
  advanceToProfile,
  apiError,
  completePhoneVerification,
  fillAccountStep,
  fillProfileStep,
  issueResponse,
  registeredResponse,
  storedText,
  verifiedResponse,
  verifyPhone,
} from './signup-client.fixtures';

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

/** 모든 호출을 비우고 약관 동의 상태와 정상 응답 기본값을 다시 깐다. */
function resetSignupMocks(): void {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.sessionStorage.setItem(TERMS_STORAGE_KEY, JSON.stringify([TERMS_DOCUMENT_ID]));
  hooks.checkNicknameMutateAsync.mockResolvedValue({ available: true });
  hooks.checkEmailMutateAsync.mockResolvedValue({ available: true });
  hooks.registerMutateAsync.mockResolvedValue({
    session: { userId: 'user-email', userEmail: 'signup@example.com' },
  });
  hooks.phoneIssueMutateAsync.mockImplementation(async () => issueResponse());
  hooks.phoneVerifyMutateAsync.mockResolvedValue(verifiedResponse());
}

describe('SignupClient required profile contract', () => {
  beforeEach(resetSignupMocks);

  it('인증번호 발급이 번호 중복(409)으로 거절돼도 같은 안내 카드와 출구를 보여 준다', async () => {
    hooks.phoneIssueMutateAsync.mockRejectedValue(
      apiError(409, 'PHONE_CONFLICT', '이미 사용 중인 번호예요.'),
    );
    render(<SignupClient />);
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: PHONE } });
    fireEvent.click(await screen.findByRole('button', { name: '인증번호 받기' }));

    expect(await screen.findByText('이 번호는 이미 가입돼 있어요')).toBeInTheDocument();
    expect(screen.queryByText('이미 사용 중인 번호예요.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /이메일로 가입했어요/ })).toHaveAttribute('href', '/login/email');
    expect(screen.getByRole('link', { name: /비밀번호가 기억나지 않아요/ })).toHaveAttribute('href', '/auth/find-account');
    expect(screen.getByRole('link', { name: '고객센터에 알려 주세요' })).toHaveAttribute('href', '/contact');
  });

  it('다른 인증 오류는 기존 문구 그대로 보인다', async () => {
    hooks.phoneIssueMutateAsync.mockRejectedValue(
      apiError(429, 'VERIFICATION_RESEND_COOLDOWN', '잠시 후 다시 시도해 주세요.'),
    );
    render(<SignupClient />);
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: PHONE } });
    fireEvent.click(await screen.findByRole('button', { name: '인증번호 받기' }));

    expect(await screen.findByText('잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('이 번호는 이미 가입돼 있어요')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /이메일로 가입했어요/ })).not.toBeInTheDocument();
  });

  it('redirects direct signup entry to terms before accepting account input', async () => {
    window.sessionStorage.clear();

    render(<SignupClient />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/terms?mode=signup'));
    expect(screen.queryByLabelText(/^휴대폰 번호/)).not.toBeInTheDocument();
  });

  // 사진 영역이 라벨·버튼·아이콘 셋으로 같은 일을 세 번 말하면 첫 화면이 사진에 다 쓰인다 —
  // 눌러서 올리는 컨트롤 하나만 남고, 사진을 고른 뒤에만 제거가 붙는다.
  it('프로필 사진은 눌러서 올리는 컨트롤 하나이고, 고른 뒤에만 제거 버튼이 붙는다', async () => {
    // Given
    render(<SignupClient />);
    await advanceToProfile();

    // Then — 파일 입력 하나, 별도의 "사진 선택" 버튼 없음, "선택 입력" 표기
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /사진 선택|사진 변경/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '제거' })).not.toBeInTheDocument();
    expect(screen.getByText('선택 입력')).toBeInTheDocument();
    expect(screen.getByText('눌러서 사진을 올려요. 큰 사진은 자동으로 줄여요.')).toBeInTheDocument();

    // When
    const file = new File(['x'], 'me.png', { type: 'image/png' });
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });

    // Then
    expect(await screen.findByRole('button', { name: '제거' })).toBeInTheDocument();
    expect(screen.getByText('눌러서 다른 사진으로 바꿀 수 있어요.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '제거' }));
    expect(screen.queryByRole('button', { name: '제거' })).not.toBeInTheDocument();
  });

  it('프로필 단계는 제목만 두어 입력칸이 첫 화면에 모이고, 성별은 필수 라디오다', async () => {
    // Given
    render(<SignupClient />);
    await advanceToProfile();

    // Then
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('프로필을 완성해 주세요');
    expect(document.querySelector('.tm-signup-hero .tm-auth-sub')).toBeNull();
    expect(screen.getByLabelText(/^생년월일/)).toBeInTheDocument();
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
    fillProfileStep();

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

  it('가입 폼은 공개 선택을 덮어쓰지 않고 서버 기본값을 사용한다', async () => {
    render(<SignupClient />);
    await advanceToProfile();
    fillProfileStep();
    expect(screen.queryByRole('switch', { name: '경기 기록 공개' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));
    await waitFor(() => expect(hooks.registerMutateAsync).toHaveBeenCalled());
    expect(hooks.registerMutateAsync.mock.calls[0][0]).not.toHaveProperty('recordConsent');
  });

  it('tracks a sign_up_complete event with method=email once registration succeeds', async () => {
    // Given
    render(<SignupClient />);
    await advanceToProfile();
    fillProfileStep();

    // When
    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    // Then
    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('sign_up_complete', { method: 'email' }));
  });

  // 앞서 안내받은 다른 계정용 토큰이 새로 만든 계정의 도착 화면을 가로채면 안 된다.
  it('가입이 끝나면 남아 있던 대기 연결 토큰을 지운다', async () => {
    savePendingSocialLink({ next: 'sign_in_then_link', provider: 'kakao', linkToken: 'left-from-earlier-409', linkTokenExpiresInSeconds: 1800 });
    render(<SignupClient />);
    await advanceToProfile();
    fillProfileStep();
    expect(peekPendingSocialLink()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    await waitFor(() => expect(hooks.registerMutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(peekPendingSocialLink()).toBeNull());
  });

  it('가입이 끝나면 카카오 쪽으로 나갈 때 보관해 둔 이메일도 지운다', async () => {
    savePendingEmailLink({ email: 'left-from-earlier@example.com' });
    render(<SignupClient />);
    await advanceToProfile();
    fillProfileStep();
    expect(readPendingEmailLink()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    await waitFor(() => expect(hooks.registerMutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(readPendingEmailLink()).toBeNull());
  });

  it('가입 요청이 실패하면 대기 연결 토큰은 그대로 둔다', async () => {
    savePendingSocialLink({ next: 'sign_in_then_link', provider: 'kakao', linkToken: 'left-from-earlier-409', linkTokenExpiresInSeconds: 1800 });
    hooks.registerMutateAsync.mockRejectedValue(new Error('network'));
    render(<SignupClient />);
    await advanceToProfile();
    fillProfileStep();

    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    await waitFor(() => expect(hooks.registerMutateAsync).toHaveBeenCalled());
    expect(peekPendingSocialLink()).not.toBeNull();
  });

  describe('가입은 됐는데 프로필 사진을 올리지 못한 경우', () => {
    async function submitWithPhoto() {
      render(<SignupClient />);
      await advanceToProfile();
      fillProfileStep();
      const file = new File(['x'], 'me.png', { type: 'image/png' });
      fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
      await screen.findByRole('button', { name: '제거' });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' })); });
    }

    it('사진 업로드가 실패해도 가입을 막지 않고 완료 화면으로 가며, 완료 화면이 사진 안내를 띄우게 표시를 남긴다', async () => {
      hooks.uploadImagesMutateAsync.mockRejectedValue(new Error('upload failed'));

      await submitWithPhoto();

      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/signup/complete'));
      expect(hooks.registerMutateAsync).toHaveBeenCalledTimes(1);
      expect(hooks.updateProfileMutateAsync).not.toHaveBeenCalled();
      expect(screen.queryByText('회원가입에 실패했어요.')).not.toBeInTheDocument();
      expect(consumeSignupPhotoNotice()).toBe(true);
    });

    it('올린 사진을 프로필에 붙이는 요청이 실패해도 같다', async () => {
      hooks.uploadImagesMutateAsync.mockResolvedValue({ urls: ['/uploads/me.png'] });
      hooks.updateProfileMutateAsync.mockRejectedValue(new Error('patch failed'));

      await submitWithPhoto();

      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/signup/complete'));
      expect(hooks.updateProfileMutateAsync).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('회원가입에 실패했어요.')).not.toBeInTheDocument();
      expect(consumeSignupPhotoNotice()).toBe(true);
    });

    it('사진까지 잘 올라가면 안내 표시를 남기지 않는다', async () => {
      hooks.uploadImagesMutateAsync.mockResolvedValue({ urls: ['/uploads/me.png'] });
      hooks.updateProfileMutateAsync.mockResolvedValue({});

      await submitWithPhoto();

      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/signup/complete'));
      expect(consumeSignupPhotoNotice()).toBe(false);
    });

    it('가입 요청 자체가 실패하면 사진은 건드리지 않고 안내 표시도 남기지 않는다', async () => {
      hooks.registerMutateAsync.mockRejectedValue(new Error('network'));

      await submitWithPhoto();

      expect(await screen.findByText('network')).toBeInTheDocument();
      expect(hooks.uploadImagesMutateAsync).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalledWith('/signup/complete');
      expect(consumeSignupPhotoNotice()).toBe(false);
    });
  });

  it('인증번호를 받아도 확인하기 전에는 가입 정보 단계로 넘어갈 수 없다', async () => {
    // Given
    render(<SignupClient />);
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: PHONE } });

    // When — 인증번호만 받고 확인하지 않는다
    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));

    // Then — 확인 버튼은 6자리를 넣기 전까지 잠겨 있고, 계정 입력칸은 나타나지 않는다
    expect(await screen.findByLabelText('인증번호 6자리')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증번호 확인' })).toBeDisabled();
    expect(screen.queryByLabelText(/^닉네임/)).not.toBeInTheDocument();
    expect(hooks.registerMutateAsync).not.toHaveBeenCalled();
  });

  it('인증이 끝나면 버튼을 누르지 않아도 가입 정보 단계로 넘어가고, 프로필 단계로는 가지 않는다', async () => {
    // Given
    render(<SignupClient />);
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: PHONE } });

    // When
    await completePhoneVerification();

    // Then — 자동 이동(완료 표시를 잠깐 보여준 뒤). 계정 정보를 받기 전에는 프로필을 묻지 않는다.
    expect(await screen.findByLabelText(/^닉네임/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^이름/)).not.toBeInTheDocument();
  });

  it('필수 항목은 별표만이 아니라 접근성 이름으로도 필수임을 알린다', async () => {
    // Given — 번호 칸은 첫 화면에, 닉네임·이메일 칸은 인증 뒤 화면에 있다
    render(<SignupClient />);
    expect(screen.getByLabelText(/휴대폰 번호/).closest('label')?.textContent).toContain('(필수)');
    await advanceToAccount();

    // Then — 색(빨간 별)에만 의존하면 색각 이상·스크린리더에서 정보가 사라진다.
    // 별표는 장식(aria-hidden)이므로 단언하지 않는다 — 의미를 지고 있는 건 "(필수)" 텍스트다.
    for (const field of [/닉네임/, /이메일/]) {
      const label = screen.getByLabelText(field).closest('label');
      expect(label?.textContent).toContain('(필수)');
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
  ] as const)('휴대폰 원시 입력이 %s 이면 인증번호를 받을 수 없다', async (rawValue) => {
    // Given
    render(<SignupClient />);

    // When
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: rawValue } });

    // Then — 11자리 정상 번호가 아니면 인증번호를 받을 수 없다
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeDisabled();
    expect(hooks.phoneIssueMutateAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['birth date', /^생년월일/, '200002290'],
    ['birth date', /^생년월일/, '2000ab29'],
  ] as const)('blocks email signup when raw %s input is %s', async (_field, label, rawValue) => {
    // Given
    render(<SignupClient />);
    await advanceToProfile();
    fillProfileStep();
    fireEvent.change(screen.getByLabelText(label), { target: { value: rawValue } });

    // When
    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    // Then
    expect(hooks.registerMutateAsync).not.toHaveBeenCalled();
  });

  it('인증번호를 받은 뒤 휴대폰에 한 자리를 더 치면 값은 남고 인증은 처음으로 돌아간다', async () => {
    // Given
    const user = userEvent.setup();
    render(<SignupClient />);
    const input = screen.getByLabelText(/^휴대폰 번호/);
    fireEvent.change(input, { target: { value: PHONE } });
    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
    expect(await screen.findByLabelText('인증번호 6자리')).toBeInTheDocument();

    // When
    await user.type(input, '9');

    // Then — 이전 번호로 받은 인증번호로는 확인할 수 없다
    expect(input).toHaveValue('010-1234-56789');
    expect(screen.queryByLabelText('인증번호 6자리')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeDisabled();
  });

  it.each([
    ['birth date', /^생년월일/, '20000229', '0', '2000-02-290'],
  ] as const)('retains an extra typed %s digit and disables email signup', async (_field, label, validValue, extraDigit, expectedValue) => {
    // Given
    const user = userEvent.setup();
    render(<SignupClient />);
    await advanceToProfile();
    fillProfileStep();
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
  beforeEach(resetSignupMocks);

  /** 번호 인증을 마치고 계정 입력 단계에서 시작한다. 시계는 이 뒤에 가짜로 바꾼다 — 인증 흐름은 실제 타이머가 필요하다. */
  async function renderAccountStep(): Promise<void> {
    render(<SignupClient />);
    await advanceToAccount();
  }

  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((done) => { resolve = done; });
    return { promise, resolve };
  }

  it('중복 확인 버튼 없이, 입력을 멈추고 0.5초가 지나야 한 번 확인한다', async () => {
    await renderAccountStep();
    vi.useFakeTimers();
    try {
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
    await renderAccountStep();
    vi.useFakeTimers();
    try {
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
    await renderAccountStep();
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
  ] as const)('이미 쓰는 %s이면 안내하고 다음 단계로 넘어갈 수 없다', async (label, check, message) => {
    check.mockResolvedValue({ available: false });
    await renderAccountStep();
    fireEvent.change(screen.getByLabelText(/^닉네임/), { target: { value: '테스트닉' } });
    fireEvent.change(screen.getByLabelText(/^이메일/), { target: { value: 'signup@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('8자 이상'), { target: { value: 'Sunny-ride-4' } });
    fireEvent.change(screen.getByPlaceholderText('비밀번호 다시 입력'), { target: { value: 'Sunny-ride-4' } });
    fireEvent.blur(screen.getByLabelText(new RegExp(`^${label}`)));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });

  // 서버가 거절할 비밀번호에 "사용할 수 있는 비밀번호예요"를 띄우면 안 된다 — 서버와 같은 판정 파일을 쓴다.
  it('서버가 거절할 흔한 비밀번호는 사용할 수 있다고 하지 않고 입력이 멈추면 이유를 알리며 다음 단계를 바로 막는다', async () => {
    await renderAccountStep();
    fillAccountStep();
    const next = screen.getByRole('button', { name: '다음' });
    await waitFor(() => expect(next).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText('8자 이상'), { target: { value: 'Qwer1234' } });
    fireEvent.change(screen.getByPlaceholderText('비밀번호 다시 입력'), { target: { value: 'Qwer1234' } });

    // 문구는 입력이 멈춘 뒤에 나오지만, 버튼은 입력하는 순간 잠기고 이유를 알린다.
    expect(next).toBeDisabled();
    expect(screen.getByText('다른 비밀번호를 정해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('사용할 수 있는 비밀번호예요.')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByPlaceholderText('8자 이상')).toHaveAccessibleDescription('너무 흔한 비밀번호예요. 다른 비밀번호를 정해 주세요.'));
    expect(screen.getByPlaceholderText('8자 이상')).toBeInvalid();
    expect(screen.queryByText('사용할 수 있는 비밀번호예요.')).not.toBeInTheDocument();
    expect(next).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('8자 이상'), { target: { value: 'Sunny-ride-4' } });
    fireEvent.change(screen.getByPlaceholderText('비밀번호 다시 입력'), { target: { value: 'Sunny-ride-4' } });
    expect(await screen.findByText('사용할 수 있는 비밀번호예요.')).toBeInTheDocument();
    expect(next).toBeEnabled();
  });

  it('8자가 안 되는 비밀번호도 입력이 멈춘 뒤에 알리고, 그동안 다음 단계는 잠겨 있다', async () => {
    await renderAccountStep();
    fillAccountStep();
    const next = screen.getByRole('button', { name: '다음' });
    await waitFor(() => expect(next).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText('8자 이상'), { target: { value: 'abc12' } });

    expect(next).toBeDisabled();
    expect(await screen.findByText('8자 이상 입력해 주세요.')).toBeInTheDocument();
  });

  it('확인을 마친 값을 고치면 이전 판정이 사라져 다음 단계가 다시 막힌다', async () => {
    await renderAccountStep();
    fillAccountStep();
    const next = screen.getByRole('button', { name: '다음' });
    await waitFor(() => expect(next).toBeEnabled());

    fireEvent.change(screen.getByLabelText(/^닉네임/), { target: { value: '다른닉네임' } });

    expect(screen.queryByText('사용 가능한 닉네임이에요.')).not.toBeInTheDocument();
    expect(next).toBeDisabled();
  });

  it('확인 요청이 실패하면 알리고, 칸을 다시 벗어날 때 재시도한다', async () => {
    hooks.checkNicknameMutateAsync
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ available: true });
    await renderAccountStep();
    const input = screen.getByLabelText(/^닉네임/);

    fireEvent.change(input, { target: { value: '테스트닉' } });
    fireEvent.blur(input);
    expect(await screen.findByRole('alert')).toHaveTextContent('중복 확인에 실패했어요. 다시 시도해 주세요.');

    fireEvent.blur(input);
    expect(await screen.findByText('사용 가능한 닉네임이에요.')).toBeInTheDocument();
  });

  // `kim@` 에서 0.5초 쉬면 "사용 가능"이 뜨고 형식이 틀린 채 다음 단계로 넘어갔다.
  it.each([['kim@'], ['kim@a']])('형식이 덜 된 이메일 %s 는 확인 요청 없이 형식만 안내한다', async (typed) => {
    await renderAccountStep();
    vi.useFakeTimers();
    try {
      const input = screen.getByLabelText(/^이메일/);

      fireEvent.change(input, { target: { value: typed } });
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(hooks.checkEmailMutateAsync).not.toHaveBeenCalled();
      expect(screen.queryByText('사용 가능한 이메일이에요.')).not.toBeInTheDocument();

      fireEvent.blur(input);
      expect(screen.getByRole('alert')).toHaveTextContent('이메일 형식을 확인해 주세요.');
      expect(hooks.checkEmailMutateAsync).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('형식을 갖춘 이메일 kim@a.com 은 입력을 멈추면 확인 요청을 보낸다', async () => {
    await renderAccountStep();
    vi.useFakeTimers();
    try {

      fireEvent.change(screen.getByLabelText(/^이메일/), { target: { value: 'kim@a.com' } });
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });

      expect(hooks.checkEmailMutateAsync).toHaveBeenCalledWith('kim@a.com');
    } finally {
      vi.useRealTimers();
    }
  });

  it('2자 미만 닉네임은 요청 없이 형식만 안내한다', async () => {
    await renderAccountStep();
    vi.useFakeTimers();
    try {
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
    hooks.registerMutateAsync.mockRejectedValue(apiError(409, 'NICKNAME_CONFLICT', '이미 사용 중인 닉네임이에요.'));
    render(<SignupClient />);
    await advanceToProfile();
    fillProfileStep();

    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 사용 중인 닉네임이에요.');
    expect(screen.getByLabelText(/^닉네임/)).toHaveAttribute('aria-invalid', 'true');
  });

  // 화면의 목록과 서버의 목록이 어긋나 서버가 거절해도, 이유는 비밀번호 칸 아래에 서버 문구 그대로 남는다.
  it('가입 요청이 흔한 비밀번호(400)로 거절되면 가입 정보 단계로 돌아가 서버 문구를 비밀번호 칸 아래에 보여 준다', async () => {
    hooks.registerMutateAsync.mockRejectedValue(
      apiError(400, 'PASSWORD_TOO_COMMON', '서버가 거절한 비밀번호예요. 다른 비밀번호를 정해 주세요.'),
    );
    render(<SignupClient />);
    await advanceToProfile();
    fillProfileStep();

    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    const password = await screen.findByPlaceholderText('8자 이상');
    expect(password).toHaveAccessibleDescription('서버가 거절한 비밀번호예요. 다른 비밀번호를 정해 주세요.');
    expect(password).toBeInvalid();
    expect(screen.getAllByText('서버가 거절한 비밀번호예요. 다른 비밀번호를 정해 주세요.')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
    expect(screen.getByText('다른 비밀번호를 정해 주세요.')).toBeInTheDocument();
    expect(hooks.registerMutateAsync).toHaveBeenCalledTimes(1);
  });
});

describe('SignupClient 단계 순서: 번호 인증 → 가입 정보 → 프로필', () => {
  beforeEach(resetSignupMocks);

  it('첫 화면은 번호 인증이고, 인증을 마쳐야 가입 정보 → 프로필 순서로 열린다', async () => {
    render(<SignupClient />);

    // 1/3 번호 인증 — 아무것도 적기 전에 이미 가입된 번호인지부터 확인한다.
    expect(screen.getByRole('progressbar', { name: '회원가입 진행 단계 1 / 3' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('휴대폰 번호를 인증해 주세요');
    expect(screen.getByLabelText(/^휴대폰 번호/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^닉네임/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^이름/)).not.toBeInTheDocument();

    // 2/3 가입 정보
    await advanceToAccount();
    expect(screen.getByRole('progressbar', { name: '회원가입 진행 단계 2 / 3' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('가입 정보를 확인해 주세요');
    expect(screen.queryByLabelText(/^휴대폰 번호/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^이름/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '본인인증 하기' })).not.toBeInTheDocument();

    // 3/3 프로필
    fillAccountStep();
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByLabelText(/^이름/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '회원가입 진행 단계 3 / 3' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('프로필을 완성해 주세요');
    expect(screen.getByRole('button', { name: '가입하고 계속' })).toBeDisabled();
  });

  it('가입 정보 단계는 맨 위에 인증한 번호를 보여 주고, 닉네임·이메일 확인과 비밀번호 일치가 끝나야 다음으로 열린다', async () => {
    render(<SignupClient />);
    await advanceToAccount();

    const inset = screen.getByText('010-1234-5678 휴대폰 본인인증이 완료됐어요');
    expect(inset.compareDocumentPosition(screen.getByLabelText(/^닉네임/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const next = screen.getByRole('button', { name: '다음' });
    expect(next).toBeDisabled();
    expect(screen.getByText('사용할 수 있는 닉네임을 입력해 주세요.')).toBeInTheDocument();

    fillAccountStep();
    await waitFor(() => expect(next).toBeEnabled());

    fireEvent.change(screen.getByPlaceholderText('비밀번호 다시 입력'), { target: { value: `${ACCOUNT_PASSWORD}x` } });
    expect(next).toBeDisabled();
    expect(screen.getByText('비밀번호 확인이 일치해야 해요.')).toBeInTheDocument();
  });

  it('가입 요청에는 계정 입력과 마지막으로 받은 증명이 실리고, 비밀번호는 요청 말고는 어디에도 저장되지 않는다', async () => {
    render(<SignupClient />);
    await advanceToProfile();
    fillProfileStep();
    // 뒤로 갔다 다시 와도 입력이 어딘가에 복사돼 남지 않는다.
    fireEvent.click(screen.getAllByRole('button', { name: '뒤로가기' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: '다음' }));
    expect(storedText()).not.toContain(ACCOUNT_PASSWORD);

    fireEvent.click(await screen.findByRole('button', { name: '가입하고 계속' }));

    await waitFor(() => expect(hooks.registerMutateAsync).toHaveBeenCalledTimes(1));
    expect(hooks.registerMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      nickname: '테스트닉',
      email: 'signup@example.com',
      password: ACCOUNT_PASSWORD,
      phone: PHONE,
      phoneProofToken: 'PROOF-TOKEN',
    }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/signup/complete'));
    expect(storedText()).not.toContain(ACCOUNT_PASSWORD);
  });
});

describe('SignupClient 본인인증 단계', () => {
  beforeEach(resetSignupMocks);

  it('제목은 인증할 일만 말하고, 하단 버튼 하나가 인증번호 받기에서 인증번호 확인으로 바뀐다', async () => {
    render(<SignupClient />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('휴대폰 번호를 인증해 주세요');
    expect(screen.getByText('인증이 끝나면 자동으로 다음 단계로 넘어가요. 이미 가입한 번호인지도 함께 확인해요.')).toBeInTheDocument();
    expect(screen.queryByText(/먼저/)).not.toBeInTheDocument();

    // 번호 전: 하단 버튼이 잠겨 있고 이유를 말한다.
    const cta = screen.getByRole('button', { name: '인증번호 받기' });
    expect(cta).toBeDisabled();
    expect(screen.getByText('휴대폰 번호를 숫자 11자리로 입력해 주세요.')).toBeInTheDocument();

    // 번호 뒤: 받기 버튼은 화면에 하나뿐이다(카드 안에 따로 없다).
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: PHONE } });
    expect(cta).toBeEnabled();
    expect(screen.getAllByRole('button', { name: /인증번호 (받기|확인)/ })).toHaveLength(1);
    fireEvent.click(cta);

    expect(hooks.phoneIssueMutateAsync).toHaveBeenCalledWith({ phone: PHONE });
    // 받은 뒤: 같은 자리의 버튼이 확인으로 바뀌고, 6자리를 채워야 열린다.
    const confirm = await screen.findByRole('button', { name: '인증번호 확인' });
    expect(confirm).toBeDisabled();
    expect(screen.queryByRole('button', { name: '인증번호 받기' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('인증번호 6자리'), { target: { value: '123456' } });
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);
    await waitFor(() => expect(hooks.phoneVerifyMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ phone: PHONE, code: '123456' }),
    ));
    expect(await screen.findByText('휴대폰 본인인증이 완료됐어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
  });

  it('인증번호 발송이 실패하면 알리고 받기 버튼은 그대로 남는다', async () => {
    hooks.phoneIssueMutateAsync.mockRejectedValue(new Error('sms down'));
    render(<SignupClient />);
    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: PHONE } });

    fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));

    expect(await screen.findByText('sms down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeEnabled();
    expect(screen.queryByLabelText('인증번호 6자리')).not.toBeInTheDocument();
  });

  it('인증번호가 만료되면 하단 버튼이 다시 받기로 바뀐다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      hooks.phoneIssueMutateAsync.mockResolvedValue({ expiresAt: new Date(Date.now() + 2000).toISOString() });
      render(<SignupClient />);
      fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: PHONE } });
      fireEvent.click(screen.getByRole('button', { name: '인증번호 받기' }));
      await screen.findByRole('button', { name: '인증번호 확인' });

      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });

      expect(screen.getByRole('button', { name: '인증번호 다시 받기' })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  // 목적지가 다른 뒤로가기 둘이 한 화면에 있으면 어느 쪽이 "바로 앞"인지 알 수 없다.
  it('뒤로가기는 상단 하나뿐이고 늘 바로 앞 단계로 가며, 되돌아가도 입력과 받아 둔 증명을 지킨다', async () => {
    render(<SignupClient />);
    await advanceToProfile();
    expect(screen.queryByRole('button', { name: '이전 단계' })).not.toBeInTheDocument();
    fillProfileStep();

    // 프로필 → 가입 정보: 계정 입력이 그대로이고 다음 단계도 바로 열려 있다.
    fireEvent.click(screen.getAllByRole('button', { name: '뒤로가기' })[0]);
    expect(await screen.findByLabelText(/^닉네임/)).toHaveValue('테스트닉');
    expect(screen.getByLabelText(/^이메일/)).toHaveValue('signup@example.com');
    expect(screen.getByPlaceholderText('8자 이상')).toHaveValue(ACCOUNT_PASSWORD);
    expect(screen.getByPlaceholderText('비밀번호 다시 입력')).toHaveValue(ACCOUNT_PASSWORD);
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
    expect(screen.queryByLabelText(/^이름/)).not.toBeInTheDocument();

    // 가입 정보 → 번호 인증: 받아 둔 증명은 유지되어 다시 인증하지 않는다(유료 SMS 를 한 번 더 쓰지 않는다).
    fireEvent.click(screen.getAllByRole('button', { name: '뒤로가기' })[0]);
    expect(await screen.findByText('휴대폰 본인인증이 완료됐어요')).toBeInTheDocument();
    expect(screen.getByLabelText(/^휴대폰 번호/)).toHaveValue('010-1234-5678');
    expect(screen.queryByLabelText(/^닉네임/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('인증번호 6자리')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '인증번호 받기' })).not.toBeInTheDocument();
    expect(hooks.phoneIssueMutateAsync).toHaveBeenCalledTimes(1);
    expect(hooks.phoneVerifyMutateAsync).toHaveBeenCalledTimes(1);

    // 번호 인증 → 약관(링크). 첫 단계에는 되돌아가는 버튼이 없다.
    expect(screen.getAllByRole('link', { name: '뒤로가기' })[0]).toHaveAttribute('href', '/terms?mode=signup');
    expect(screen.queryByRole('button', { name: '뒤로가기' })).not.toBeInTheDocument();

    // 다시 앞으로: 번호 인증 → 가입 정보 → 프로필, 입력은 모두 그대로.
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByLabelText(/^닉네임/)).toHaveValue('테스트닉');
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByLabelText(/^이름/)).toHaveValue('홍길동');
    expect(screen.getByLabelText(/^생년월일/)).toHaveValue('2000-02-29');
    expect(screen.getByRole('radio', { name: '남' })).toBeChecked();
  });
});

describe('SignupClient 이미 가입된 번호 안내', () => {
  const CARD_TITLE = '이 번호는 이미 가입돼 있어요';

  beforeEach(resetSignupMocks);

  /** 계정 단계에서 이메일까지 적고 번호 인증으로 되돌아온 뒤, 다른(이미 가입된) 번호를 인증해 안내 카드까지 간다. */
  async function reachCardWithEmailTyped(): Promise<void> {
    render(<SignupClient />);
    await advanceToAccount();
    fillAccountStep();
    fireEvent.click(screen.getAllByRole('button', { name: '뒤로가기' })[0]);
    hooks.phoneVerifyMutateAsync.mockResolvedValueOnce(registeredResponse());
    fireEvent.change(await screen.findByLabelText(/^휴대폰 번호/), { target: { value: OTHER_PHONE } });
    await completePhoneVerification();
    await screen.findByText(CARD_TITLE);
  }

  it('인증 응답이 registered:true 면 다음 단계로 가지 않고 그 자리에서 안내 카드와 세 갈래를 보여 준다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      hooks.phoneVerifyMutateAsync.mockResolvedValue(registeredResponse());
      render(<SignupClient />);
      await verifyPhone();

      expect(await screen.findByText(CARD_TITLE)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /이메일로 가입했어요/ })).toHaveAttribute('href', '/login/email');
      expect(screen.getByRole('link', { name: /비밀번호가 기억나지 않아요/ })).toHaveAttribute('href', '/auth/find-account');
      expect(screen.getByRole('button', { name: '다른 번호로 인증하기' })).toBeEnabled();
      // 입력칸이 카드로 바뀌므로 포커스가 body 로 빠지지 않고 카드 제목으로 옮겨 간다.
      await waitFor(() => expect(screen.getByText(CARD_TITLE)).toHaveFocus());

      // 완료 표시도, 인증번호 입력도, 자동 이동도 없다.
      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(screen.queryByText('휴대폰 본인인증이 완료됐어요')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('인증번호 6자리')).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^이름/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('registered:false 면 안내 카드 없이 가입 정보 단계로 넘어간다', async () => {
    render(<SignupClient />);
    await advanceToAccount();

    expect(screen.queryByText(CARD_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /이메일로 가입했어요/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '고객센터에 알려 주세요' })).not.toBeInTheDocument();
  });

  it('세 갈래 뒤에, 번호를 새로 받았다면 고객센터에 알려 달라는 한 줄이 붙는다', async () => {
    hooks.phoneVerifyMutateAsync.mockResolvedValue(registeredResponse());
    render(<SignupClient />);
    await verifyPhone();
    await screen.findByText(CARD_TITLE);

    expect(screen.getByText('번호를 최근에 새로 받았나요? 전에 이 번호를 쓰던 계정이 남아 있을 수 있어요.')).toBeInTheDocument();
    const help = screen.getByRole('link', { name: '고객센터에 알려 주세요' });
    expect(help).toHaveAttribute('href', '/contact');
    // 로그인·계정 찾기 길이 먼저다.
    const lastExit = screen.getByRole('link', { name: /비밀번호가 기억나지 않아요/ });
    expect(lastExit.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('로그인·계정 찾기 이동은 원래 가려던 곳(redirect)을 이어 준다', async () => {
    hooks.phoneVerifyMutateAsync.mockResolvedValue(registeredResponse());
    window.sessionStorage.setItem('teameet.v1.savedRedirect', '/matches/abc');
    render(<SignupClient />);
    await verifyPhone();
    await screen.findByText(CARD_TITLE);

    expect(screen.getByRole('link', { name: /이메일로 가입했어요/ })).toHaveAttribute('href', '/login/email?redirect=%2Fmatches%2Fabc');
    expect(screen.getByRole('link', { name: /비밀번호가 기억나지 않아요/ })).toHaveAttribute('href', '/auth/find-account?redirect=%2Fmatches%2Fabc');
    expect(screen.getByRole('link', { name: /카카오.*로 가입했어요/ })).toHaveAttribute('href', '/login?redirect=%2Fmatches%2Fabc');
  });

  it('소셜 로그인으로 가입했을 수 있는 사람에게 로그인 첫 화면 안내를 준다(웹에서는 카카오만)', async () => {
    hooks.phoneVerifyMutateAsync.mockResolvedValue(registeredResponse());
    render(<SignupClient />);
    await verifyPhone();
    await screen.findByText(CARD_TITLE);

    const row = screen.getByRole('link', { name: /카카오.*로 가입했어요/ });
    expect(row).toHaveAttribute('href', '/login');
    expect(row).toHaveTextContent('카카오로 가입했어요');
    expect(row).toHaveTextContent('로그인 첫 화면에서 그 버튼을 눌러요');
    // 웹에는 Apple 버튼이 없어 Apple 을 언급하지 않는다.
    expect(row).not.toHaveTextContent('Apple');
  });

  /** 링크 핸들러는 그대로 돌리되 jsdom 이 실제 이동을 시도하지 않게 막는다. */
  function clickLink(link: HTMLElement) {
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(link);
  }

  it('이메일을 적기 전(첫 인증)에는 소셜 줄이 이메일 연결을 약속하지 않고, 눌러도 아무것도 보관하지 않는다', async () => {
    hooks.phoneVerifyMutateAsync.mockResolvedValue(registeredResponse());
    render(<SignupClient />);
    await verifyPhone();
    await screen.findByText(CARD_TITLE);

    const row = screen.getByRole('link', { name: /카카오.*로 가입했어요/ });
    expect(row).toHaveTextContent('로그인 첫 화면에서 그 버튼을 눌러요.');
    expect(row).not.toHaveTextContent('이메일도 연결할 수 있어요');

    clickLink(row);

    expect(readPendingEmailLink()).toBeNull();
    expect(window.sessionStorage.getItem(PENDING_EMAIL_LINK_STORAGE_KEY)).toBeNull();
  });

  it('이메일을 적고 인증 단계로 되돌아온 경우에만, 소셜 줄이 로그인한 뒤 방금 입력한 이메일도 연결할 수 있다고 알린다', async () => {
    await reachCardWithEmailTyped();

    expect(screen.getByRole('link', { name: /카카오.*로 가입했어요/ })).toHaveTextContent('로그인한 뒤 방금 입력한 이메일도 연결할 수 있어요.');
    // 이 문장은 소셜 줄에만 있다 — 다른 두 줄은 그 약속을 하지 않는다.
    expect(screen.getByRole('link', { name: /이메일로 가입했어요/ })).not.toHaveTextContent('연결할 수 있어요');
    expect(screen.getByRole('link', { name: /비밀번호가 기억나지 않아요/ })).not.toHaveTextContent('연결할 수 있어요');
  });

  it('소셜 줄을 눌러 로그인 첫 화면으로 나가면 입력했던 이메일만 이 탭에 보관하고, 비밀번호는 어디에도 쓰지 않는다', async () => {
    await reachCardWithEmailTyped();
    expect(readPendingEmailLink()).toBeNull();

    clickLink(screen.getByRole('link', { name: /카카오.*로 가입했어요/ }));

    expect(readPendingEmailLink()).toEqual({ email: 'signup@example.com', returnTo: null });
    const stored = JSON.parse(window.sessionStorage.getItem(PENDING_EMAIL_LINK_STORAGE_KEY) as string) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(['email', 'expiresAt', 'returnTo']);
    expect(storedText()).not.toContain(ACCOUNT_PASSWORD);
  });

  it('원래 가려던 곳(redirect)이 있으면 이메일과 함께 보관해, 로그인 뒤 연결을 마치거나 미루고 돌아갈 수 있게 한다', async () => {
    window.sessionStorage.setItem('teameet.v1.savedRedirect', '/matches/abc');
    await reachCardWithEmailTyped();

    clickLink(screen.getByRole('link', { name: /카카오.*로 가입했어요/ }));

    expect(readPendingEmailLink()).toEqual({ email: 'signup@example.com', returnTo: '/matches/abc' });
  });

  it('이메일 로그인이나 계정 찾기로 나갈 때는 이메일을 적었어도 보관하지 않는다', async () => {
    await reachCardWithEmailTyped();

    clickLink(screen.getByRole('link', { name: /이메일로 가입했어요/ }));
    clickLink(screen.getByRole('link', { name: /비밀번호가 기억나지 않아요/ }));

    expect(readPendingEmailLink()).toBeNull();
  });

  it('iOS 앱에서는 같은 줄이 Apple 버튼도 안내한다', async () => {
    window.TeameetNative = { supports: ['sign-in-with-apple'], postMessage: vi.fn() };
    try {
      hooks.phoneVerifyMutateAsync.mockResolvedValue(registeredResponse());
      render(<SignupClient />);
      await verifyPhone();
      await screen.findByText(CARD_TITLE);

      const row = screen.getByRole('link', { name: /카카오·Apple로 가입했어요/ });
      expect(row).toHaveAttribute('href', '/login');
    } finally {
      delete window.TeameetNative;
    }
  });

  it('다른 번호로 인증하기는 번호 입력으로 되돌리고 인증 상태를 비운다', async () => {
    hooks.phoneVerifyMutateAsync.mockResolvedValueOnce(registeredResponse());
    render(<SignupClient />);
    await verifyPhone();
    await screen.findByText(CARD_TITLE);

    fireEvent.click(screen.getByRole('button', { name: '다른 번호로 인증하기' }));

    const phoneInput = screen.getByLabelText(/^휴대폰 번호/);
    expect(phoneInput).toHaveValue('');
    expect(phoneInput).toHaveFocus();
    expect(screen.queryByText(CARD_TITLE)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('인증번호 6자리')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeDisabled();
  });

  it('다른 번호로 인증하면 새 증명으로 가입 정보 단계를 거쳐 프로필 단계에 들어가고 그 증명으로 가입한다', async () => {
    hooks.phoneVerifyMutateAsync
      .mockResolvedValueOnce(registeredResponse())
      .mockResolvedValueOnce(verifiedResponse({ proofToken: 'OTHER-PROOF' }));
    render(<SignupClient />);
    await verifyPhone();
    await screen.findByText(CARD_TITLE);
    fireEvent.click(screen.getByRole('button', { name: '다른 번호로 인증하기' }));

    await advanceToProfile(OTHER_PHONE);
    fillProfileStep();
    fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

    await waitFor(() =>
      expect(hooks.registerMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ phone: OTHER_PHONE, phoneProofToken: 'OTHER-PROOF' }),
      ),
    );
    expect(hooks.registerMutateAsync).toHaveBeenCalledTimes(1);
  });

  it('번호 칸을 직접 고치면 안내 카드가 사라지고 다시 인증할 수 있다', async () => {
    hooks.phoneVerifyMutateAsync.mockResolvedValueOnce(registeredResponse());
    render(<SignupClient />);
    await verifyPhone();
    await screen.findByText(CARD_TITLE);

    fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: OTHER_PHONE } });

    expect(screen.queryByText(CARD_TITLE)).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '인증번호 받기' })).toBeEnabled();
  });

  describe('번호를 쥔 계정이 탈퇴 유예 중일 때', () => {
    // KST 로는 11월 7일 00:30. 카드가 유예 종료 시각이 지났는지도 보므로 시계를 고정한다.
    const UNTIL = '2026-11-06T15:30:00.000Z';
    const GUIDE_TITLE = '이 번호는 탈퇴를 신청한 계정이 쓰고 있어요';
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-31T00:00:00.000Z'));
    });
    afterEach(() => vi.useRealTimers());

    async function verifyPendingPhone(): Promise<void> {
      hooks.phoneVerifyMutateAsync.mockResolvedValue(registeredResponse({ withdrawalPendingUntil: UNTIL }));
      render(<SignupClient />);
      await verifyPhone();
      await screen.findByText(GUIDE_TITLE);
    }

    it('일반 "이미 가입돼 있어요" 카드 대신 두 가지 방법과 삭제일을 보여 주고 가입 단계로는 넘어가지 않는다', async () => {
      await verifyPendingPhone();

      expect(screen.queryByText(CARD_TITLE)).not.toBeInTheDocument();
      expect(screen.getByText('번호 인증은 잘 끝났어요. 이 번호를 다시 쓰는 방법은 두 가지예요.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '방법 1 지금 바로 쓰기' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '방법 2 기다리기' })).toBeInTheDocument();
      expect(screen.getByText('11월 7일')).toBeInTheDocument();
      expect(screen.getByText('이 번호로 새로 가입할 수 있어요')).toBeInTheDocument();
      // 이 안내는 가입 수단을 모른다 — 이메일·계정 찾기 갈래를 싣지 않는다.
      expect(screen.queryByRole('link', { name: /비밀번호가 기억나지 않아요/ })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^이름/)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '다른 번호로 인증하기' })).toBeEnabled();
      // The guide takes focus in an effect after it renders.
      await waitFor(() => expect(screen.getByRole('heading', { name: GUIDE_TITLE })).toHaveFocus());
    });

    it('탈퇴 취소 버튼은 이메일·소셜이 함께 있는 로그인 첫 화면으로 가고 원래 가려던 곳을 이어 준다', async () => {
      window.sessionStorage.setItem('teameet.v1.savedRedirect', '/matches/abc');
      await verifyPendingPhone();

      expect(screen.getByRole('link', { name: '로그인하고 탈퇴 취소하기' })).toHaveAttribute('href', '/login?redirect=%2Fmatches%2Fabc');
    });

    it('다른 번호로 인증하기를 누르면 안내가 사라지고, 번호를 직접 고쳐도 사라진다', async () => {
      await verifyPendingPhone();
      fireEvent.click(screen.getByRole('button', { name: '다른 번호로 인증하기' }));
      expect(screen.queryByText(GUIDE_TITLE)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/^휴대폰 번호/)).toHaveValue('');

      hooks.phoneVerifyMutateAsync.mockResolvedValue(registeredResponse({ withdrawalPendingUntil: UNTIL }));
      await verifyPhone();
      await screen.findByText(GUIDE_TITLE);
      fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: OTHER_PHONE } });
      expect(screen.queryByText(GUIDE_TITLE)).not.toBeInTheDocument();
    });

    it('방법 1 에 고객센터 링크가 있어 비밀번호를 잊은 사람도 막다른 길이 아니다', async () => {
      await verifyPendingPhone();
      expect(screen.getByRole('link', { name: '비밀번호가 기억나지 않으면 고객센터로 알려 주세요' })).toHaveAttribute('href', '/contact');
    });

    it('번호 재배정 안내는 싣지 않는다 — 이 안내에는 자기 문구의 고객센터 링크가 있다', async () => {
      await verifyPendingPhone();
      expect(screen.queryByText(/번호를 최근에 새로 받았나요/)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: '고객센터에 알려 주세요' })).not.toBeInTheDocument();
    });

    it('유예 종료 시각이 이미 지났으면 일반 "이미 가입돼 있어요" 카드가 나온다', async () => {
      // 시계(10월 31일)보다 하루 앞선 시각 — 시계를 옮기면 인증번호 입력 시간이 먼저 만료된다.
      hooks.phoneVerifyMutateAsync.mockResolvedValue(registeredResponse({ withdrawalPendingUntil: '2026-10-30T00:00:00.000Z' }));
      render(<SignupClient />);
      await verifyPhone();

      expect(await screen.findByText(CARD_TITLE)).toBeInTheDocument();
      expect(screen.queryByText(GUIDE_TITLE)).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /이메일로 가입했어요/ })).toHaveAttribute('href', '/login/email');
    });

    it('날짜 없이 registered 만 오면 일반 카드가 그대로 나온다', async () => {
      hooks.phoneVerifyMutateAsync.mockResolvedValue(registeredResponse());
      render(<SignupClient />);
      await verifyPhone();

      expect(await screen.findByText(CARD_TITLE)).toBeInTheDocument();
      expect(screen.queryByText(GUIDE_TITLE)).not.toBeInTheDocument();
    });

    it('이전 번호의 탈퇴 안내가 다음 번호의 일반 가입 카드에 새어 나오지 않는다', async () => {
      await verifyPendingPhone();
      fireEvent.click(screen.getByRole('button', { name: '다른 번호로 인증하기' }));

      hooks.phoneVerifyMutateAsync.mockResolvedValue(registeredResponse());
      await verifyPhone(OTHER_PHONE);

      expect(await screen.findByText(CARD_TITLE)).toBeInTheDocument();
      expect(screen.queryByText(GUIDE_TITLE)).not.toBeInTheDocument();
      expect(screen.queryByText('11월 7일')).not.toBeInTheDocument();
    });
  });

  describe('가입 제출의 409 PHONE_CONFLICT(최종 방어)', () => {
    const phoneConflict = () => apiError(409, 'PHONE_CONFLICT', '이미 사용 중인 번호예요.');

    function submitProfile(): void {
      fillProfileStep();
      fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));
    }

    it('같은 안내 카드로 인증 단계에 돌아가고, 같은 오류를 되풀이하는 가입 버튼은 사라진다', async () => {
      hooks.registerMutateAsync.mockRejectedValue(phoneConflict());
      render(<SignupClient />);
      await advanceToProfile();
      submitProfile();

      expect(await screen.findByText(CARD_TITLE)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /이메일로 가입했어요/ })).toHaveAttribute('href', '/login/email');
      expect(screen.getByRole('link', { name: /비밀번호가 기억나지 않아요/ })).toHaveAttribute('href', '/auth/find-account');
      expect(screen.queryByRole('button', { name: '가입하고 계속' })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^이름/)).not.toBeInTheDocument();
      expect(screen.queryByText('이미 사용 중인 번호예요.')).not.toBeInTheDocument();
    });

    it('이메일을 이미 적고 돌아온 길이므로 소셜 줄이 그 이메일도 연결할 수 있다고 알린다', async () => {
      hooks.registerMutateAsync.mockRejectedValue(phoneConflict());
      render(<SignupClient />);
      await advanceToProfile();
      submitProfile();
      await screen.findByText(CARD_TITLE);

      expect(screen.getByRole('link', { name: /카카오.*로 가입했어요/ })).toHaveTextContent('로그인한 뒤 방금 입력한 이메일도 연결할 수 있어요.');
    });

    it('다른 번호로 다시 인증하면 이미 적은 가입 정보와 프로필을 그대로 두고 새 번호·새 증명으로 가입한다', async () => {
      hooks.registerMutateAsync.mockRejectedValueOnce(phoneConflict());
      hooks.phoneVerifyMutateAsync
        .mockResolvedValueOnce(verifiedResponse())
        .mockResolvedValueOnce(verifiedResponse({ proofToken: 'OTHER-PROOF' }));
      render(<SignupClient />);
      await advanceToProfile();
      submitProfile();
      await screen.findByText(CARD_TITLE);

      fireEvent.click(screen.getByRole('button', { name: '다른 번호로 인증하기' }));
      await verifyPhone(OTHER_PHONE);

      // 번호만 새로 받고 나머지는 처음부터 다시 적지 않는다.
      expect(await screen.findByLabelText(/^닉네임/, {}, { timeout: 3000 })).toHaveValue('테스트닉');
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
      expect(await screen.findByLabelText(/^이름/)).toHaveValue('홍길동');
      fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));
      await waitFor(() => expect(hooks.registerMutateAsync).toHaveBeenCalledTimes(2));
      expect(hooks.registerMutateAsync).toHaveBeenLastCalledWith(
        expect.objectContaining({
          phone: OTHER_PHONE,
          phoneProofToken: 'OTHER-PROOF',
          nickname: '테스트닉',
          email: 'signup@example.com',
          displayName: '홍길동',
          birthDate: '20000229',
        }),
      );
    });
  });
});
