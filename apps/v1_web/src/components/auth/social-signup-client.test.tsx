import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SocialSignupClient } from './social-signup-client';
import { V1ApiError } from '@/lib/api-client';
import { readPendingEmailLink, savePendingEmailLink } from '@/lib/pending-email-link';

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  completeProfileMutate: vi.fn(),
  deferMutate: vi.fn(),
  phoneIssueMutateAsync: vi.fn(),
  phoneVerifyMutateAsync: vi.fn(),
  authedPhoneRequestMutateAsync: vi.fn(),
  authedPhoneConfirmMutateAsync: vi.fn(),
  logoutMutateAsync: vi.fn(),
  authMeFailed: false,
  authMePending: false,
  // 카카오 동의항목 미승인이 기본값 — 프리필 없이 직접 입력하는 기존 흐름.
  authMe: {
    socialSignupPrefill: null as null | { name: string | null; phone: string | null; gender: 'male' | 'female' | null; birthDate?: string | null },
    user: { authProvider: 'kakao' as string | null, onboardingStatus: 'social_profile_required', phone: null as string | null, canLinkAfterSignup: true as boolean | undefined },
    socialSignupNickname: null as string | null,
    profile: { nickname: null as string | null },
    verification: { phoneVerified: false },
  },
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
  useV1AuthMe: () => {
    if (hooks.authMePending) return { data: undefined, isPending: true, isError: false };
    return hooks.authMeFailed
      ? { data: undefined, isPending: false, isError: true }
      : { data: hooks.authMe };
  },
  useV1Logout: () => ({ mutateAsync: hooks.logoutMutateAsync, isPending: false }),
  useV1CompleteSocialProfile: () => ({ mutate: hooks.completeProfileMutate, isPending: false }),
  useV1DeferSocialProfile: () => ({ mutate: hooks.deferMutate, isPending: false }),
  useV1PhoneIssue: () => ({ mutateAsync: hooks.phoneIssueMutateAsync, isPending: false }),
  useV1PhoneVerify: () => ({ mutateAsync: hooks.phoneVerifyMutateAsync, isPending: false }),
  useV1AuthedPhoneRequest: () => ({ mutateAsync: hooks.authedPhoneRequestMutateAsync, isPending: false }),
  useV1AuthedPhoneConfirm: () => ({ mutateAsync: hooks.authedPhoneConfirmMutateAsync, isPending: false }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: analytics.trackEvent,
}));

type CompleteProfileCallbacks = {
  readonly onSuccess: (result: {
    readonly session: { readonly userId: string; readonly userEmail: string | null };
    readonly user?: { readonly canLinkLoginMethods: boolean };
    readonly next?: { readonly route: string };
  }) => void;
  readonly onError?: (error: unknown) => void;
};

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

const currentHeading = () => screen.getByRole('heading', { level: 1 }).textContent;
const phoneInput = () => screen.getByLabelText(/^휴대폰 번호/);
const nextButton = () => screen.getByRole('button', { name: '다음' });

/** 번호 단계: 번호를 입력하고 stub 인증을 마친 뒤 다음으로 넘어간다. */
async function passPhoneStep(phone = '01087654321'): Promise<void> {
  fireEvent.change(await screen.findByLabelText(/^휴대폰 번호/), { target: { value: phone } });
  await completePhoneVerification();
  fireEvent.click(nextButton());
}

/** 카카오 값이 없는 가입을 번호 → 성별 → 이름 순으로 채워 생년월일 단계 앞까지 간다. */
async function reachBirthDateStep(phone = '01087654321'): Promise<void> {
  await passPhoneStep(phone);
  fireEvent.click(screen.getByRole('radio', { name: '여' }));
  fireEvent.click(nextButton());
  fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
  fireEvent.click(nextButton());
}

/** 카카오 값이 없는 가입을 확인 화면까지 채운다. */
async function reachReview(phone = '01087654321'): Promise<void> {
  await reachBirthDateStep(phone);
  fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
  fireEvent.click(nextButton());
  expect(currentHeading()).toBe('입력한 정보를 확인해 주세요');
}

describe('SocialSignupClient required profile contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.authMe.socialSignupPrefill = null;
    hooks.authMe.user.canLinkAfterSignup = true;
    hooks.authMe.user.authProvider = 'kakao';
    hooks.authMe.user.onboardingStatus = 'social_profile_required';
    hooks.authMe.user.phone = null;
    hooks.authMe.profile.nickname = null;
    hooks.authMe.socialSignupNickname = null;
    hooks.authMe.verification.phoneVerified = false;
    hooks.authMeFailed = false;
    hooks.authMePending = false;
    hooks.authedPhoneRequestMutateAsync.mockResolvedValue({
      sent: true,
      channel: 'phone',
    });
    hooks.authedPhoneConfirmMutateAsync.mockResolvedValue({
      verified: true,
      verification: { emailVerified: false, phoneVerified: true },
    });
  });

  it('카카오 제공 정보는 닉네임 입력 없이 곧바로 확인 화면에 모이고, 자동 닉네임이 한 줄로 보인다', async () => {
    hooks.authMe.socialSignupPrefill = { name: '김러너', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    hooks.authMe.socialSignupNickname = '씩씩한오리너구리4';
    render(<SocialSignupClient />);
    expect(screen.queryByLabelText(/^닉네임/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '중복 확인' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^휴대폰 번호/)).not.toBeInTheDocument();
    expect(screen.getByText('씩씩한오리너구리4')).toBeVisible();
    expect(screen.getByText('자동으로 만들었어요 · 프로필에서 바꿀 수 있어요')).toBeVisible();
    expect(await screen.findByText('입력한 정보를 확인해 주세요')).toBeVisible();
    expect(screen.getByText('김러너')).toBeVisible();
    expect(screen.getByText('010-1234-5678')).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: /이메일.*로그인/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/이메일을 인증하고 비밀번호를 설정/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '나중에 입력할게요' })).not.toBeInTheDocument();
  });

  it('소셜 프로필 저장 후 이메일 설정 없이 온보딩으로 이어진다', async () => {
    hooks.authMe.socialSignupPrefill = { name: '김러너', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    hooks.completeProfileMutate.mockImplementation((_body: unknown, callbacks: CompleteProfileCallbacks) => callbacks.onSuccess({ session: { userId: 'social-user', userEmail: null }, user: { canLinkLoginMethods: true }, next: { route: '/onboarding/sport' } }));
    render(<SocialSignupClient />);
    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/sport'));
  });

  it('이메일 연결 권한이 없어도 가입 후 온보딩으로 계속한다', async () => {
    hooks.authMe.socialSignupPrefill = { name: '김러너', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    hooks.completeProfileMutate.mockImplementation((_body: unknown, callbacks: CompleteProfileCallbacks) => callbacks.onSuccess({ session: { userId: 'social-user', userEmail: null }, user: { canLinkLoginMethods: false }, next: { route: '/onboarding/sport' } }));
    render(<SocialSignupClient />);
    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/sport'));
    expect(screen.queryByRole('heading', { name: '이메일 로그인을 연결하지 못했어요' })).not.toBeInTheDocument();
  });

  it('가입 후에도 연결할 수 없는 계정에는 이메일 연결 선택을 보이지 않는다', () => {
    hooks.authMe.socialSignupPrefill = { name: '김러너', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    hooks.authMe.user.canLinkAfterSignup = false;
    render(<SocialSignupClient />);
    expect(screen.queryByRole('checkbox', { name: /이메일.*로그인/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/이메일 로그인/)).not.toBeInTheDocument();
  });

  it('연결 가능 여부와 상관없이 가입에서 이메일 연결을 요구하지 않는다', () => {
    hooks.authMe.socialSignupPrefill = { name: '김러너', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    hooks.authMe.user.canLinkAfterSignup = undefined;
    render(<SocialSignupClient />);
    expect(screen.queryByText(/이메일 로그인/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /이메일.*로그인/ })).not.toBeInTheDocument();
  });

  it('필수 약관이 남으면 이메일 설정 없이 약관 복구 경로를 따른다', async () => {
    hooks.authMe.socialSignupPrefill = { name: '김러너', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    hooks.completeProfileMutate.mockImplementation((_body: unknown, callbacks: CompleteProfileCallbacks) => callbacks.onSuccess({ session: { userId: 'social-user', userEmail: null }, user: { canLinkLoginMethods: true }, next: { route: '/terms?mode=renewal' } }));
    render(<SocialSignupClient />);
    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/terms?mode=renewal&redirect=%2Fonboarding%2Fsport'));
  });

  it('연결이 금지된 관리자 계정은 가입 후 온보딩으로 진행한다', async () => {
    hooks.authMe.user.canLinkAfterSignup = false;
    hooks.authMe.socialSignupPrefill = { name: '김러너', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    hooks.completeProfileMutate.mockImplementation((_body: unknown, callbacks: CompleteProfileCallbacks) => callbacks.onSuccess({ session: { userId: 'social-user', userEmail: null }, next: { route: '/onboarding/sport' } }));
    render(<SocialSignupClient />);
    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/sport'));
  });

  it('이전 단계로 돌아가도 번호 인증 결과를 유지한다', async () => {
    render(<SocialSignupClient />);
    await passPhoneStep();
    expect(currentHeading()).toBe('성별을 선택해 주세요');

    fireEvent.click(screen.getAllByRole('button', { name: '이전 단계' })[0]);
    expect(currentHeading()).toBe('휴대폰 번호를 확인해 주세요');
    expect(phoneInput()).toHaveValue('010-8765-4321');
    expect(screen.getByText('휴대폰 본인인증이 완료됐어요')).toBeVisible();
    expect(nextButton()).toBeEnabled();
  });

  it('번호를 먼저 인증한 뒤 성별·이름·생년월일 순으로(닉네임 단계 없이) 받고 실제 프로필을 제출한다', async () => {
    render(<SocialSignupClient />);
    const visited = [currentHeading()];
    fireEvent.change(await screen.findByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    expect(nextButton()).toBeDisabled();
    await completePhoneVerification();
    fireEvent.click(nextButton());
    visited.push(currentHeading());
    fireEvent.click(screen.getByRole('radio', { name: '여' }));
    fireEvent.click(nextButton());
    visited.push(currentHeading());
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.click(nextButton());
    visited.push(currentHeading());
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.click(nextButton());
    visited.push(currentHeading());

    expect(visited).toEqual([
      '휴대폰 번호를 확인해 주세요',
      '성별을 선택해 주세요',
      '이름을 입력해 주세요',
      '생년월일을 입력해 주세요',
      '입력한 정보를 확인해 주세요',
    ]);
    expect(screen.getByText('010-8765-4321')).toBeVisible();
    expect(screen.getByText('인증 완료')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));
    expect(hooks.completeProfileMutate).toHaveBeenCalledWith(
      { displayName: '김러너', phone: '01087654321', birthDate: '20000229', gender: 'female' },
      expect.any(Object),
    );
    // 닉네임은 서버가 정한다 — 요청 본문에 실리지 않는다.
    expect(hooks.completeProfileMutate.mock.calls[0][0]).not.toHaveProperty('nickname');
  });

  it('각 단계에서 번호·이름·생년월일을 필수로 받는다', async () => {
    render(<SocialSignupClient />);
    expect(await screen.findByLabelText(/^휴대폰 번호/)).toBeRequired();
    await passPhoneStep();
      fireEvent.click(screen.getByRole('radio', { name: '여' }));
    fireEvent.click(nextButton());
    expect(screen.getByLabelText(/^이름/)).toBeRequired();
    expect(nextButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.click(nextButton());
    expect(screen.getByLabelText(/^생년월일/)).toBeRequired();
  });

  it('가입 폼은 공개 선택을 덮어쓰지 않고 서버 기본값을 사용한다', async () => {
    render(<SocialSignupClient />);
    await reachReview();
    expect(screen.queryByRole('switch', { name: '경기 기록 공개' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));
    await waitFor(() => expect(hooks.completeProfileMutate).toHaveBeenCalled());
    expect(hooks.completeProfileMutate.mock.calls[0][0]).not.toHaveProperty('recordConsent');
  });

  it('tracks a sign_up_complete event with method=kakao once the social profile is saved', async () => {
    hooks.completeProfileMutate.mockImplementation((_body: unknown, callbacks: CompleteProfileCallbacks) =>
      callbacks.onSuccess({ session: { userId: 'social-user', userEmail: null }, next: { route: '/onboarding/region' } }),
    );
    render(<SocialSignupClient />);
    await reachReview();

    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));

    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('sign_up_complete', { method: 'kakao' }));
  });

  // 이메일 가입에서 입력해 둔 이메일은 원래 계정에 연결하자는 제안용이다 — 방금 만든 새 계정에는 제안되지 않아야 한다.
  it('가입을 마치면 이메일 가입 화면에서 보관해 둔 이메일을 지운다', async () => {
    savePendingEmailLink({ email: 'left-from-email-signup@example.com' });
    hooks.completeProfileMutate.mockImplementation((_body: unknown, callbacks: CompleteProfileCallbacks) =>
      callbacks.onSuccess({ session: { userId: 'social-user', userEmail: null }, next: { route: '/onboarding/region' } }),
    );
    render(<SocialSignupClient />);
    await reachReview();
    expect(readPendingEmailLink()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));

    await waitFor(() => expect(hooks.completeProfileMutate).toHaveBeenCalled());
    expect(readPendingEmailLink()).toBeNull();
  });

  it('Apple 가입 완료는 method=apple 로 기록한다', async () => {
    hooks.authMe.user.authProvider = 'apple';
    hooks.completeProfileMutate.mockImplementation((_body: unknown, callbacks: CompleteProfileCallbacks) =>
      callbacks.onSuccess({ session: { userId: 'social-user', userEmail: null }, next: { route: '/onboarding/region' } }),
    );
    render(<SocialSignupClient />);
    await reachReview();

    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));

    await waitFor(() => expect(analytics.trackEvent).toHaveBeenCalledWith('sign_up_complete', { method: 'apple' }));
  });

  it.each([
    ['apple', 'Apple 로그인부터 다시 시작해 주세요.'],
    ['kakao', '카카오 로그인부터 다시 시작해 주세요.'],
    [null, '로그인 화면에서 처음부터 다시 시작해 주세요.'],
  ])('가입 시간이 만료되면 가입 방식(%s)에 맞는 재시작 안내를 보여 준다', async (provider, expected) => {
    hooks.authMe.user.authProvider = provider;
    hooks.completeProfileMutate.mockImplementation((_body: unknown, callbacks: CompleteProfileCallbacks) =>
      callbacks.onError?.(
        new V1ApiError({
          status: 'error',
          statusCode: 401,
          code: 'SOCIAL_SIGNUP_EXPIRED',
          message: 'expired',
          timestamp: new Date().toISOString(),
        }),
      ),
    );
    render(<SocialSignupClient />);
    await reachReview();

    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));

    await waitFor(() => expect(screen.getByText(`가입 가능 시간이 지났어요. ${expected}`)).toBeInTheDocument());
  });

  it('follows the exact API next route after social profile completion', async () => {
    hooks.completeProfileMutate.mockImplementation(
      (_body: unknown, callbacks: CompleteProfileCallbacks) => callbacks.onSuccess({
        session: { userId: 'social-user', userEmail: null },
        next: { route: '/onboarding/region' },
      }),
    );
    render(<SocialSignupClient />);
    await reachReview();

    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/onboarding/region'));
  });

  it('가입 화면에서 제출했는데 다른 탭에서 이미 건너뛴 계정이면(next 없음) 하던 곳·홈으로 간다', async () => {
    hooks.completeProfileMutate.mockImplementation(
      (_body: unknown, callbacks: CompleteProfileCallbacks) => callbacks.onSuccess({
        session: { userId: 'social-user', userEmail: null },
      }),
    );
    render(<SocialSignupClient />);
    await reachReview();

    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/home'));
    expect(analytics.trackEvent).toHaveBeenCalledWith('activity_profile_complete', { method: 'kakao' });
    expect(analytics.trackEvent).not.toHaveBeenCalledWith('sign_up_complete', expect.anything());
  });

  it('휴대폰 인증을 마치기 전에는 다음 단계와 가입을 막는다', async () => {
    render(<SocialSignupClient />);
    fireEvent.change(await screen.findByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    expect(screen.getByRole('button', { name: '__stub_verify__' })).toBeInTheDocument();
    expect(nextButton()).toBeDisabled();

    // 버튼이 막혀 있어도 Enter 같은 폼 제출 경로로 다음 단계가 열리면 안 된다.
    fireEvent.submit(document.getElementById('v1-social-signup-form')!);

    expect(currentHeading()).toBe('휴대폰 번호를 확인해 주세요');
    expect(hooks.completeProfileMutate).not.toHaveBeenCalled();
  });

  it.each([
    ['phone', '010876543210'], ['phone', '0108765abcd'],
    ['birth', '200002290'], ['birth', '2000ab29'],
  ] as const)('잘못된 %s 입력 %s는 다음 단계로 넘어가지 않는다', async (field, value) => {
    render(<SocialSignupClient />);
    if (field === 'phone') {
      fireEvent.change(await screen.findByLabelText(/^휴대폰 번호/), { target: { value } });
    } else {
      await reachBirthDateStep();
      fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value } });
    }
    expect(nextButton()).toBeDisabled();
    expect(hooks.completeProfileMutate).not.toHaveBeenCalled();
  });

  it.each([
    ['phone', '01087654321', '010-8765-43210'], ['birth', '20000229', '2000-02-290'],
  ] as const)('추가로 입력한 %s 숫자를 유지하고 다음 단계를 막는다', async (field, valid, expected) => {
    const user = userEvent.setup();
    render(<SocialSignupClient />);
    if (field === 'phone') {
      // 인증까지 마친 올바른 번호에서도 자릿수가 넘치면 막혀야 한다 — 인증 여부가 아니라 형식이 막는 것이다.
      fireEvent.change(await screen.findByLabelText(/^휴대폰 번호/), { target: { value: valid } });
      await completePhoneVerification();
      expect(nextButton()).toBeEnabled();
    } else {
      await reachBirthDateStep();
      fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: valid } });
      expect(nextButton()).toBeEnabled();
    }
    const input = screen.getByLabelText(field === 'phone' ? /^휴대폰 번호/ : /^생년월일/);
    await user.type(input, '0');
    expect(input).toHaveValue(expected);
    expect(nextButton()).toBeDisabled();
  });

});

// PendingSocialSignupGate 가 이 단계에서 다른 경로를 전부 되돌리므로, 이 버튼이 없으면
// 사용자는 가입을 끝내기 전까지 화면을 빠져나갈 방법이 아예 없다(원래 증상).
describe('SocialSignupClient 가입 중 탈출구', () => {
  // 출구는 하드 내비게이션으로 /login 에 도달하는 것까지가 계약이다. jsdom 은 실제
  // 이동을 구현하지 않아 경고만 내고 지나가므로, replace 를 가로채 목적지를 단언한다.
  const locationReplace = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    hooks.authMe.socialSignupPrefill = null;
    hooks.authMe.user.authProvider = 'kakao';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, replace: locationReplace },
    });
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

  it('그만두기를 고르면 로그아웃하고 로그인 화면으로 보낸다', async () => {
    const user = userEvent.setup();
    hooks.logoutMutateAsync.mockResolvedValue({ ok: true });
    render(<SocialSignupClient />);

    await user.click(exitButtons()[0]);
    await user.click(await screen.findByRole('button', { name: '그만두기' }));

    await waitFor(() => expect(hooks.logoutMutateAsync).toHaveBeenCalledTimes(1));
    // 로그아웃만 하고 머무르면 화면을 빠져나오지 못한 채 그대로다 — 도달지까지가 계약.
    await waitFor(() => expect(locationReplace).toHaveBeenCalledWith('/login'));
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
    // 서버 세션이 남은 채 로그인 화면으로 보내면 게이트가 다시 끌어와 원래 증상이 된다.
    expect(locationReplace).not.toHaveBeenCalled();
  });
});

describe('SocialSignupClient 카카오 자동 채움', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.authMe.socialSignupPrefill = null;
    hooks.authMe.user.authProvider = 'kakao';
    hooks.authMe.user.onboardingStatus = 'social_profile_required';
    hooks.authMeFailed = false;
    hooks.authMePending = false;
  });

  afterEach(() => {
    hooks.authMe.user.onboardingStatus = 'social_profile_required';
  });

  it('카카오 값이 없으면 번호 인증 뒤에 성별과 이름을 직접 입력한다', async () => {
    render(<SocialSignupClient />);
    await passPhoneStep();
    expect(screen.getByRole('radio', { name: '남' })).toBeEnabled();
    fireEvent.click(screen.getByRole('radio', { name: '남' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByLabelText(/^이름/)).toHaveValue('');
    expect(screen.getByLabelText(/^이름/)).not.toHaveAttribute('readonly');
  });

  it('카카오 제공 이름·성별은 확인 화면에 출처와 함께 보이고 편집 입력은 없다', () => {
    hooks.authMe.socialSignupPrefill = { name: '홍길동', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    render(<SocialSignupClient />);
    expect(screen.getByText('홍길동')).toBeVisible();
    expect(screen.getAllByText('카카오 제공')[0]).toBeVisible();
    expect(screen.getAllByText('카카오 제공')[1]).toBeVisible();
    expect(screen.queryByLabelText(/^이름/)).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '여' })).not.toBeInTheDocument();
  });

  it('카카오 번호가 늦게 도착하면 번호 단계에서 직접 입력한 번호 대신 제공 번호로 잠근다', async () => {
    const { rerender } = render(<SocialSignupClient />);
    fireEvent.change(await screen.findByLabelText(/^휴대폰 번호/), { target: { value: '01087654321' } });
    expect(screen.getByRole('button', { name: '__stub_verify__' })).toBeInTheDocument();

    hooks.authMe.socialSignupPrefill = { name: null, phone: '01012345678', gender: null };
    rerender(<SocialSignupClient />);

    await waitFor(() => expect(screen.getByLabelText(/^휴대폰 번호/)).toHaveValue('010-1234-5678'));
    expect(screen.getByLabelText(/^휴대폰 번호/)).toHaveAttribute('readonly');
    expect(screen.getByText('카카오에서 받은 전화번호예요. 추가 인증 없이 사용할 수 있어요.')).toBeVisible();
    expect(screen.queryByRole('button', { name: '__stub_verify__' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
  });

  it('카카오 제공 전화번호는 가입 확인 화면에서 수정할 수 없다', () => {
    hooks.authMe.socialSignupPrefill = { name: '회원', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    render(<SocialSignupClient />);
    expect(screen.getByText('010-1234-5678')).toBeVisible();
    expect(screen.queryByRole('button', { name: '번호 변경' })).not.toBeInTheDocument();
  });

  it('카카오 번호와 생년월일은 자동 입력하고 인증 요청 없이 가입을 제출한다', () => {
    hooks.authMe.socialSignupPrefill = { name: '회원', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    render(<SocialSignupClient />);
    expect(screen.getByText('010-1234-5678')).toBeVisible();
    expect(screen.getByText('2000-02-29')).toBeVisible();
    expect(screen.queryByRole('button', { name: '__stub_verify__' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));
    expect(hooks.completeProfileMutate).toHaveBeenCalledWith(expect.objectContaining({ phone: '01012345678', birthDate: '20000229' }), expect.any(Object));
    expect(hooks.authedPhoneRequestMutateAsync).not.toHaveBeenCalled();
  });

  it('정보 입력을 미룬 뒤 돌아온 경우에는 번호 변경 시 문자 인증이 필요하다', () => {
    hooks.authMe.user.onboardingStatus = 'social_profile_deferred';
    hooks.authMe.socialSignupPrefill = { name: '회원', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    render(<SocialSignupClient />);
    // 인증을 마친 번호가 없으면 번호 단계부터다. 카카오가 준 번호는 그대로 채워지고 잠기지 않는다.
    expect(phoneInput()).toHaveValue('010-1234-5678');
    expect(phoneInput()).not.toHaveAttribute('readonly');
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByRole('button', { name: '번호 변경' }));
    fireEvent.change(phoneInput(), { target: { value: '01087654321' } });
    expect(screen.getByRole('button', { name: '__stub_verify__' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled();
  });
});

describe('SocialSignupClient 가입 방식 문구', () => {
  afterEach(() => {
    hooks.authMe.user.authProvider = 'kakao';
    hooks.authMe.socialSignupPrefill = null;
  });

  it('Apple 로 들어온 가입은 카카오가 아니라 Apple 로 안내한다', () => {
    hooks.authMe.user.authProvider = 'apple';
    hooks.authMe.socialSignupPrefill = { name: '홍길동', phone: null, gender: null };
    render(<SocialSignupClient />);

    expect(screen.getAllByText('Apple 가입').length).toBeGreaterThan(0);
    expect(screen.queryByText(/카카오/)).not.toBeInTheDocument();
  });

  it('카카오 가입은 기존처럼 카카오로 안내한다', () => {
    hooks.authMe.user.authProvider = 'kakao';
    render(<SocialSignupClient />);

    expect(screen.getAllByText('카카오 가입').length).toBeGreaterThan(0);
  });

  it('가입 방식을 아직 모르면 특정 서비스를 단정하지 않는다', () => {
    hooks.authMe.user.authProvider = null;
    render(<SocialSignupClient />);

    expect(screen.getAllByText('간편 가입').length).toBeGreaterThan(0);
    expect(screen.queryByText(/카카오 계정 확인/)).not.toBeInTheDocument();
  });
});

// 앞선 describe 가 window.location 을 스냅샷 객체로 바꿔 두므로 search 를 직접 지정한다.
const setSearch = (search: string) => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, search },
  });
};

describe('SocialSignupClient 나중에 입력할게요', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.authMe.user.authProvider = 'kakao';
    hooks.authMe.user.onboardingStatus = 'social_profile_required';
    hooks.authMe.user.phone = null;
    hooks.authMe.profile.nickname = null;
    hooks.authMe.socialSignupNickname = null;
    hooks.authMe.verification.phoneVerified = false;
    hooks.authMeFailed = false;
    hooks.authMePending = false;
    setSearch('');
    window.sessionStorage.clear();
  });

  const deferResult = {
    session: { userId: 'u-1', userEmail: null },
  };

  it('나중에 입력하기로 가입을 마쳐도 이메일 가입 화면에서 보관해 둔 이메일은 지운다', () => {
    savePendingEmailLink({ email: 'left-from-email-signup@example.com' });
    hooks.deferMutate.mockImplementation((_v: undefined, cb: CompleteProfileCallbacks) => cb.onSuccess(deferResult));
    render(<SocialSignupClient />);

    fireEvent.click(screen.getByRole('button', { name: '나중에 입력할게요' }));

    expect(readPendingEmailLink()).toBeNull();
  });

  it('입력 없이 건너뛰면 defer 를 호출하고 홈으로 가며 sign_up_complete(profile=deferred)를 남긴다', () => {
    hooks.deferMutate.mockImplementation((_v: undefined, cb: CompleteProfileCallbacks) => cb.onSuccess(deferResult));
    render(<SocialSignupClient />);

    expect(screen.getByText('팀 만들기·참가 신청처럼 활동을 시작할 때 다시 물어볼게요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '나중에 입력할게요' }));

    expect(hooks.deferMutate).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(analytics.trackEvent).toHaveBeenCalledWith('sign_up_complete', { method: 'kakao', profile: 'deferred' });
  });

  it('가입 상태를 읽지 못했거나 이미 미룬 계정에는 건너뛰기를 보이지 않는다', () => {
    hooks.authMeFailed = true;
    const { unmount } = render(<SocialSignupClient />);
    expect(screen.queryByRole('button', { name: '나중에 입력할게요' })).not.toBeInTheDocument();
    expect(screen.queryByText('프로필을 완성해 주세요')).not.toBeInTheDocument();
    unmount();

    hooks.authMeFailed = false;
    hooks.authMe.user.onboardingStatus = 'social_profile_deferred';
    render(<SocialSignupClient />);
    expect(screen.queryByRole('button', { name: '나중에 입력할게요' })).not.toBeInTheDocument();
  });

  it('저장된 redirect 가 같은 origin 의 경로면 홈 대신 거기로 간다, 외부 주소는 무시한다', () => {
    hooks.deferMutate.mockImplementation((_v: undefined, cb: CompleteProfileCallbacks) => cb.onSuccess(deferResult));
    setSearch('?redirect=%2Fteams%2Fnew');
    const { unmount } = render(<SocialSignupClient />);
    fireEvent.click(screen.getByRole('button', { name: '나중에 입력할게요' }));
    expect(router.replace).toHaveBeenLastCalledWith('/teams/new');
    unmount();

    setSearch('?redirect=https%3A%2F%2Fevil.example');
    render(<SocialSignupClient />);
    fireEvent.click(screen.getByRole('button', { name: '나중에 입력할게요' }));
    expect(router.replace).toHaveBeenLastCalledWith('/home');
  });

  it('주소에 redirect 가 없으면 로그인 때 저장한 값으로 가고 쓴 뒤에는 비운다, 저장값이 없으면 홈', () => {
    hooks.deferMutate.mockImplementation((_v: undefined, cb: CompleteProfileCallbacks) => cb.onSuccess(deferResult));
    window.sessionStorage.setItem('teameet.v1.savedRedirect', '/teams/new');
    const { unmount } = render(<SocialSignupClient />);
    fireEvent.click(screen.getByRole('button', { name: '나중에 입력할게요' }));
    expect(router.replace).toHaveBeenLastCalledWith('/teams/new');
    expect(window.sessionStorage.getItem('teameet.v1.savedRedirect')).toBeNull();
    unmount();

    render(<SocialSignupClient />);
    fireEvent.click(screen.getByRole('button', { name: '나중에 입력할게요' }));
    expect(router.replace).toHaveBeenLastCalledWith('/home');
  });

  it('저장소의 외부 주소 redirect 는 건너뛰기에서도 무시한다', () => {
    hooks.deferMutate.mockImplementation((_v: undefined, cb: CompleteProfileCallbacks) => cb.onSuccess(deferResult));
    window.sessionStorage.setItem('teameet.v1.savedRedirect', 'https://evil.example');
    render(<SocialSignupClient />);
    fireEvent.click(screen.getByRole('button', { name: '나중에 입력할게요' }));
    expect(router.replace).toHaveBeenLastCalledWith('/home');
  });

  it('defer 가 실패하면 서버 메시지를 화면에 보여 주고 이동하지 않는다', () => {
    hooks.deferMutate.mockImplementation((_v: undefined, cb: CompleteProfileCallbacks) =>
      cb.onError?.(new V1ApiError({
        status: 'error', statusCode: 400, code: 'VALIDATION_ERROR', message: '지금은 건너뛸 수 없어요.', timestamp: '2026-10-11T00:00:00.000Z',
      })));
    render(<SocialSignupClient />);
    fireEvent.click(screen.getByRole('button', { name: '나중에 입력할게요' }));

    expect(screen.getByText('지금은 건너뛸 수 없어요.')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('이어 입력 모드는 건너뛰기 없이 제목·버튼이 바뀌고, 인증된 번호가 없으면 번호 단계부터 시작한다', () => {
    hooks.authMe.user.onboardingStatus = 'social_profile_deferred';
    hooks.authMe.profile.nickname = '카카오러너';
    render(<SocialSignupClient />);

    expect(screen.getAllByText('활동 정보 입력').length).toBeGreaterThan(0);
    expect(currentHeading()).toBe('휴대폰 번호를 확인해 주세요');
    expect(screen.queryByRole('button', { name: '나중에 입력할게요' })).not.toBeInTheDocument();
    // 첫 단계의 뒤로가기는 이전 단계가 아니라 원래 화면으로 돌아가는 버튼이다.
    expect(screen.getAllByRole('button', { name: '돌아가기' })).toHaveLength(2);
    expect(screen.queryByLabelText(/^닉네임/)).not.toBeInTheDocument();
  });

  it('이어 입력 모드 완료는 activity_profile_complete 를 남기고 redirect 로 돌아간다', async () => {
    hooks.authMe.user.onboardingStatus = 'social_profile_deferred';
    hooks.authMe.profile.nickname = '카카오러너';
    setSearch('?redirect=%2Fteams%2Fnew');
    hooks.completeProfileMutate.mockImplementation((_b: unknown, cb: CompleteProfileCallbacks) =>
      cb.onSuccess({ session: { userId: 'u-1', userEmail: null } }));
    render(<SocialSignupClient />);

    await passPhoneStep('01012345678');
    // 이어 입력 모드에는 닉네임 입력이 없다 — 이미 가진 닉네임을 그대로 둔다.
    expect(screen.queryByLabelText(/^닉네임/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '여' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김팀밋' } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '1995-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    fireEvent.click(await screen.findByRole('button', { name: '입력 완료하고 계속하기' }));

    expect(analytics.trackEvent).toHaveBeenCalledWith('activity_profile_complete', { method: 'kakao' });
    expect(analytics.trackEvent).not.toHaveBeenCalledWith('sign_up_complete', expect.anything());
    expect(router.replace).toHaveBeenCalledWith('/teams/new');
  });
});

describe('SocialSignupClient 번호를 가장 먼저 받는 순서', () => {
  const conflict = (code: string) => new V1ApiError({
    status: 'error', statusCode: 409, code, message: 'x', timestamp: '2026-11-08T00:00:00.000Z',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    hooks.completeProfileMutate.mockReset();
    hooks.deferMutate.mockReset();
    hooks.authMe.socialSignupPrefill = null;
    hooks.authMe.user.authProvider = 'kakao';
    hooks.authMe.user.onboardingStatus = 'social_profile_required';
    hooks.authMe.user.phone = null;
    hooks.authMe.profile.nickname = null;
    hooks.authMe.socialSignupNickname = null;
    hooks.authMe.verification.phoneVerified = false;
    hooks.authMeFailed = false;
    hooks.authMePending = false;
    setSearch('');
    window.sessionStorage.clear();
  });

  it('가입 상태를 읽기 전에는 입력 칸을 그리지 않고, 읽은 뒤 번호 단계로 시작한다', () => {
    hooks.authMePending = true;
    const { rerender } = render(<SocialSignupClient />);
    expect(screen.queryByLabelText(/^휴대폰 번호/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();

    hooks.authMePending = false;
    rerender(<SocialSignupClient />);

    expect(currentHeading()).toBe('휴대폰 번호를 확인해 주세요');
    expect(screen.getByRole('progressbar', { name: '가입 진행 단계 1 / 5' })).toBeInTheDocument();
  });

  it('첫 단계는 가입 상태를 읽은 값으로 정한다 — 카카오 번호가 있으면 번호 단계가 잠깐도 보이지 않는다', () => {
    hooks.authMePending = true;
    const { rerender } = render(<SocialSignupClient />);
    hooks.authMePending = false;
    hooks.authMe.socialSignupPrefill = { name: null, phone: '01012345678', gender: null };

    rerender(<SocialSignupClient />);

    expect(currentHeading()).toBe('성별을 선택해 주세요');
    expect(screen.queryByLabelText(/^휴대폰 번호/)).not.toBeInTheDocument();
  });

  it('가입 상태를 읽지 못하면 번호 단계가 첫 단계다', () => {
    hooks.authMeFailed = true;
    render(<SocialSignupClient />);
    expect(currentHeading()).toBe('휴대폰 번호를 확인해 주세요');
    expect(screen.getByLabelText(/^휴대폰 번호/)).toHaveValue('');
  });

  it('카카오가 번호를 준 가입은 번호 단계 없이 성별부터 시작한다', () => {
    hooks.authMe.socialSignupPrefill = { name: null, phone: '01012345678', gender: null };
    render(<SocialSignupClient />);
    expect(currentHeading()).toBe('성별을 선택해 주세요');
    // 성별·이름·생년월일·확인 — 번호 단계가 빠진 4단계
    expect(screen.getByRole('progressbar', { name: '가입 진행 단계 1 / 4' })).toBeInTheDocument();
  });

  it.each(['apple', 'kakao'])('%s 가입에서 인증을 마친 번호가 이미 있으면 번호 단계를 건너뛰고 그 번호로 가입한다', async (provider) => {
    hooks.authMe.user.authProvider = provider;
    hooks.authMe.user.phone = '01011112222';
    hooks.authMe.verification.phoneVerified = true;
    render(<SocialSignupClient />);

    expect(currentHeading()).toBe('성별을 선택해 주세요');
    expect(screen.getByRole('progressbar', { name: '가입 진행 단계 1 / 4' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('radio', { name: '여' }));
    fireEvent.click(nextButton());
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.click(nextButton());
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.click(nextButton());

    expect(screen.getByText('010-1111-2222')).toBeVisible();
    expect(screen.getByText('인증 완료')).toBeVisible();
    expect(screen.getByRole('button', { name: '번호 변경' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));
    expect(hooks.completeProfileMutate).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '01011112222' }),
      expect.any(Object),
    );
    expect(screen.queryByRole('button', { name: '__stub_verify__' })).not.toBeInTheDocument();
    expect(hooks.authedPhoneRequestMutateAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['계정에 번호가 있어도 인증 전이면', { phone: '01011112222', verified: false }],
    ['인증 표시만 있고 번호가 없으면', { phone: null, verified: true }],
  ])('%s 번호 단계를 건너뛰지 않고 빈 칸으로 시작한다', (_label, { phone, verified }) => {
    hooks.authMe.user.phone = phone;
    hooks.authMe.verification.phoneVerified = verified;
    render(<SocialSignupClient />);

    expect(currentHeading()).toBe('휴대폰 번호를 확인해 주세요');
    expect(screen.getByLabelText(/^휴대폰 번호/)).toHaveValue('');
    expect(nextButton()).toBeDisabled();
  });

  it('이어 입력 모드에 인증된 번호가 있으면 번호 단계를 건너뛰고 성별부터 시작해 그 번호로 제출한다', () => {
    hooks.authMe.user.onboardingStatus = 'social_profile_deferred';
    hooks.authMe.profile.nickname = '카카오러너';
    hooks.authMe.user.phone = '01011112222';
    hooks.authMe.verification.phoneVerified = true;
    render(<SocialSignupClient />);

    expect(currentHeading()).toBe('성별을 선택해 주세요');
    fireEvent.click(screen.getByRole('radio', { name: '여' }));
    fireEvent.click(nextButton());
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김팀밋' } });
    fireEvent.click(nextButton());
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '1995-01-15' } });
    fireEvent.click(nextButton());
    fireEvent.click(screen.getByRole('button', { name: '입력 완료하고 계속하기' }));

    expect(hooks.completeProfileMutate).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '01011112222', displayName: '김팀밋' }),
      expect.any(Object),
    );
    expect(screen.queryByRole('button', { name: '__stub_verify__' })).not.toBeInTheDocument();
  });

  it('확인 화면의 번호 변경은 번호만 다시 인증하고 곧바로 확인 화면으로 돌아온다', async () => {
    render(<SocialSignupClient />);
    await reachReview();

    fireEvent.click(screen.getByRole('button', { name: '번호 변경' }));
    expect(currentHeading()).toBe('휴대폰 번호를 확인해 주세요');
    fireEvent.change(phoneInput(), { target: { value: '01022223333' } });
    // 바꾼 번호는 다시 인증해야 한다.
    expect(nextButton()).toBeDisabled();
    await completePhoneVerification();
    fireEvent.click(nextButton());

    // 성별·이름·생년월일 단계를 다시 거치지 않는다.
    expect(currentHeading()).toBe('입력한 정보를 확인해 주세요');
    expect(screen.getByText('010-2222-3333')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));
    expect(hooks.completeProfileMutate).toHaveBeenCalledWith(
      { displayName: '김러너', phone: '01022223333', birthDate: '20000229', gender: 'female' },
      expect.any(Object),
    );
  });

  it('번호 변경 중 위쪽 뒤로가기는 가입을 그만두는 대신 확인 화면으로 돌아간다', async () => {
    render(<SocialSignupClient />);
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: '번호 변경' }));

    fireEvent.click(screen.getAllByRole('button', { name: '이전 단계' })[0]);

    expect(currentHeading()).toBe('입력한 정보를 확인해 주세요');
    expect(screen.getByText('010-8765-4321')).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(hooks.logoutMutateAsync).not.toHaveBeenCalled();
  });

  it('번호를 바꾸고 인증 없이 확인 화면으로 돌아오면 인증 완료라고 하지 않고 가입을 막는다', async () => {
    render(<SocialSignupClient />);
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: '번호 변경' }));
    fireEvent.change(phoneInput(), { target: { value: '01022223333' } });

    fireEvent.click(screen.getAllByRole('button', { name: '이전 단계' })[0]);

    expect(currentHeading()).toBe('입력한 정보를 확인해 주세요');
    expect(screen.getByText('010-2222-3333')).toBeVisible();
    expect(screen.getByText('인증 필요')).toBeVisible();
    expect(screen.queryByText('인증 완료')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인하고 계속' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));
    expect(hooks.completeProfileMutate).not.toHaveBeenCalled();
  });

  it('인증된 번호를 가진 가입도 번호 변경 뒤 확인 화면으로 돌아온다', async () => {
    hooks.authMe.user.authProvider = 'apple';
    hooks.authMe.user.phone = '01011112222';
    hooks.authMe.verification.phoneVerified = true;
    render(<SocialSignupClient />);
      fireEvent.click(screen.getByRole('radio', { name: '여' }));
    fireEvent.click(nextButton());
    fireEvent.change(screen.getByLabelText(/^이름/), { target: { value: '김러너' } });
    fireEvent.click(nextButton());
    fireEvent.change(screen.getByLabelText(/^생년월일/), { target: { value: '20000229' } });
    fireEvent.click(nextButton());

    fireEvent.click(screen.getByRole('button', { name: '번호 변경' }));
    expect(currentHeading()).toBe('휴대폰 번호를 확인해 주세요');
    fireEvent.change(phoneInput(), { target: { value: '01022223333' } });
    await completePhoneVerification();
    fireEvent.click(nextButton());

    expect(currentHeading()).toBe('입력한 정보를 확인해 주세요');
    expect(screen.getByText('010-2222-3333')).toBeVisible();
  });

  it('제출이 번호 중복(PHONE_CONFLICT)으로 거절되면 번호 단계에 안내를 보이고, 새 번호를 인증하면 확인 화면으로 돌아온다', async () => {
    hooks.completeProfileMutate.mockImplementationOnce((_b: unknown, cb: CompleteProfileCallbacks) => cb.onError?.(conflict('PHONE_CONFLICT')));
    render(<SocialSignupClient />);
    await reachReview();

    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));

    expect(currentHeading()).toBe('휴대폰 번호를 확인해 주세요');
    expect(screen.getByText(/이 번호로 이미 가입한 계정이 있어요/)).toBeVisible();
    fireEvent.change(phoneInput(), { target: { value: '01022223333' } });
    expect(screen.queryByText(/이 번호로 이미 가입한 계정이 있어요/)).not.toBeInTheDocument();
    await completePhoneVerification();
    fireEvent.click(nextButton());

    expect(currentHeading()).toBe('입력한 정보를 확인해 주세요');
    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));
    expect(hooks.completeProfileMutate).toHaveBeenLastCalledWith(
      expect.objectContaining({ phone: '01022223333' }),
      expect.any(Object),
    );
  });

  it('제출이 번호 인증 미완료(PHONE_NOT_VERIFIED)로 거절되면 번호 단계에서 다시 인증하고 확인 화면으로 돌아온다', async () => {
    hooks.completeProfileMutate.mockImplementationOnce((_b: unknown, cb: CompleteProfileCallbacks) => cb.onError?.(conflict('PHONE_NOT_VERIFIED')));
    render(<SocialSignupClient />);
    await reachReview();

    fireEvent.click(screen.getByRole('button', { name: '확인하고 계속' }));

    expect(currentHeading()).toBe('휴대폰 번호를 확인해 주세요');
    expect(screen.getByText('휴대폰 본인인증을 완료해 주세요.')).toBeVisible();
    expect(nextButton()).toBeDisabled();
    await completePhoneVerification();
    fireEvent.click(nextButton());

    expect(currentHeading()).toBe('입력한 정보를 확인해 주세요');
  });

  it('첫 단계인 번호 단계의 뒤로가기는 가입 그만두기이고, 확인 모달을 거쳐야 나간다', async () => {
    const user = userEvent.setup();
    render(<SocialSignupClient />);
    expect(screen.queryByRole('button', { name: '이전 단계' })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: '가입 그만두기' })[0]);
    await user.click(await screen.findByRole('button', { name: '계속 쓰기' }));

    expect(hooks.logoutMutateAsync).not.toHaveBeenCalled();
    expect(currentHeading()).toBe('휴대폰 번호를 확인해 주세요');
  });

  it('번호 단계가 없는 가입은 확인 화면이 첫 단계라 뒤로가기도 가입 그만두기다', async () => {
    const user = userEvent.setup();
    hooks.authMe.socialSignupPrefill = { name: '김러너', phone: '01012345678', gender: 'female', birthDate: '20000229' };
    render(<SocialSignupClient />);
    expect(currentHeading()).toBe('입력한 정보를 확인해 주세요');
    expect(screen.queryByRole('button', { name: '이전 단계' })).not.toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: '가입 그만두기' })[0]);

    expect(await screen.findByText('가입을 그만둘까요?')).toBeVisible();
  });

  it('이어 입력 모드의 첫 단계 뒤로가기는 로그아웃 없이 원래 화면으로 돌아간다', () => {
    hooks.authMe.user.onboardingStatus = 'social_profile_deferred';
    render(<SocialSignupClient />);
    expect(currentHeading()).toBe('휴대폰 번호를 확인해 주세요');

    fireEvent.click(screen.getAllByRole('button', { name: '돌아가기' })[0]);

    expect(router.replace).toHaveBeenCalledWith('/home');
    expect(hooks.logoutMutateAsync).not.toHaveBeenCalled();
  });

  // 번호 소유 여부는 인증번호를 맞춘 뒤에야 서버가 알려 준다. 페이지가 입력만으로 존재 여부를 묻거나
  // 인증 카드 밖에서 요청을 보내면 가입 전 번호 조회 통로가 된다.
  it('이미 가입된 번호도 인증 전에는 중복 안내를 보이지 않고 인증 카드 밖으로 요청을 보내지 않는다', async () => {
    const held = conflict('PHONE_CONFLICT');
    for (const mutate of [hooks.authedPhoneRequestMutateAsync, hooks.authedPhoneConfirmMutateAsync, hooks.phoneIssueMutateAsync, hooks.phoneVerifyMutateAsync]) {
      mutate.mockRejectedValue(held);
    }
    render(<SocialSignupClient />);

    fireEvent.change(await screen.findByLabelText(/^휴대폰 번호/), { target: { value: '01012345678' } });

    expect(screen.getByRole('button', { name: '__stub_verify__' })).toBeInTheDocument();
    expect(screen.queryByText(/이 번호로 이미 가입한 계정이 있어요/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /기존 계정으로 로그인|원래 방법으로 로그인하기|계정 찾기/ })).not.toBeInTheDocument();
    expect(screen.queryByText('가입을 완료하지 못했어요')).not.toBeInTheDocument();
    expect(nextButton()).toBeDisabled();
    for (const calls of [hooks.authedPhoneRequestMutateAsync, hooks.authedPhoneConfirmMutateAsync, hooks.phoneIssueMutateAsync, hooks.phoneVerifyMutateAsync,
      hooks.completeProfileMutate, hooks.deferMutate]) {
      expect(calls).not.toHaveBeenCalled();
    }
  });
});
