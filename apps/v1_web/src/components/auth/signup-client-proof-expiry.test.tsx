import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignupClient } from './signup-client';
import {
  ACCOUNT_PASSWORD,
  OTHER_PHONE,
  PHONE,
  PROOF_TTL_SECONDS,
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
  trackEvent: vi.fn(),
}));

const EXPIRED_BANNER = '휴대폰 인증이 만료됐어요. 입력한 내용은 그대로 있어요. 다시 인증하면 이어서 가입할 수 있어요.';
const EXPIRED_ON_VERIFY_BANNER = '휴대폰 인증이 만료됐어요. 인증번호를 다시 받아 인증해 주세요.';
const CARD_TITLE = '이 번호는 이미 가입돼 있어요';
const PAST_TTL_MS = (PROOF_TTL_SECONDS + 5) * 1000;

/** 가짜 시계를 앞으로 보낸다. 예약된 타이머가 순서대로 돌고 React 갱신까지 반영된다. */
async function advanceClock(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

/** 만료 안내 자리에서 '다시 인증하기' → 새 코드 입력 → 확인까지 그 자리에서 마친다. */
async function reverifyInPlace(): Promise<void> {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '다시 인증하기' })); });
  fireEvent.change(await screen.findByLabelText('인증번호 6자리'), { target: { value: '654321' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '인증번호 확인' })); });
}

function expectAccountInputsKept(): void {
  expect(screen.getByLabelText(/^닉네임/)).toHaveValue('테스트닉');
  expect(screen.getByLabelText(/^이메일/)).toHaveValue('signup@example.com');
  expect(screen.getByPlaceholderText('8자 이상')).toHaveValue(ACCOUNT_PASSWORD);
  expect(screen.getByPlaceholderText('비밀번호 다시 입력')).toHaveValue(ACCOUNT_PASSWORD);
}

function expectProfileInputsKept(): void {
  expect(screen.getByLabelText(/^이름/)).toHaveValue('홍길동');
  expect(screen.getByLabelText(/^생년월일/)).toHaveValue('2000-02-29');
  expect(screen.getByRole('radio', { name: '남' })).toBeChecked();
}

/** 만료 안내는 비긴급 알림(role=status)으로 나가고, 오류 카드로는 나가지 않는다. */
function expectExpiredBanner(message: string): void {
  expect(screen.getByText(message)).toHaveAttribute('role', 'status');
  expect(screen.queryByText('다시 시도해 주세요')).not.toBeInTheDocument();
  expect(screen.queryByText('프로필 정보를 확인해 주세요')).not.toBeInTheDocument();
}

describe('SignupClient 휴대폰 인증 만료', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // 폴링하는 findBy·waitFor 가 가짜 시계에서도 돌도록 실제 시간에 맞춰 조금씩 흘려 보낸다.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.sessionStorage.setItem(TERMS_STORAGE_KEY, JSON.stringify([TERMS_DOCUMENT_ID]));
    hooks.checkNicknameMutateAsync.mockResolvedValue({ available: true });
    hooks.checkEmailMutateAsync.mockResolvedValue({ available: true });
    hooks.registerMutateAsync.mockResolvedValue({ session: { userId: 'user-email', userEmail: 'signup@example.com' } });
    hooks.phoneIssueMutateAsync.mockImplementation(async () => issueResponse());
    hooks.phoneVerifyMutateAsync.mockResolvedValue(verifiedResponse());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('가입 정보 단계', () => {
    it('인증이 만료되면 안내와 버튼만 바뀌고 입력은 그대로이며, 그 자리에서 다시 인증하면 이어서 쓴다', async () => {
      hooks.phoneVerifyMutateAsync
        .mockResolvedValueOnce(verifiedResponse())
        .mockResolvedValueOnce(verifiedResponse({ proofToken: 'PROOF-2' }));
      render(<SignupClient />);
      await advanceToAccount();
      fillAccountStep();
      await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeEnabled());

      // 유효 시간 안에서는 아무 일도 없다.
      await advanceClock((PROOF_TTL_SECONDS - 10) * 1000);
      expect(screen.queryByText(EXPIRED_BANNER)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();

      await advanceClock(20_000);

      expectExpiredBanner(EXPIRED_BANNER);
      expect(screen.getByRole('button', { name: '다시 인증하기' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
      expect(screen.queryByText(/휴대폰 본인인증이 완료됐어요/)).not.toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: '회원가입 진행 단계 2 / 3' })).toBeInTheDocument();
      expectAccountInputsKept();

      // 같은 번호로 새 코드를 받는다.
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '다시 인증하기' })); });
      expect(hooks.phoneIssueMutateAsync).toHaveBeenCalledTimes(2);
      expect(hooks.phoneIssueMutateAsync).toHaveBeenLastCalledWith({ phone: PHONE });
      expect(screen.getByText('010-1234-5678 번호로 다시 인증해요.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '인증번호 확인' })).toBeDisabled();
      fireEvent.change(await screen.findByLabelText('인증번호 6자리'), { target: { value: '654321' } });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '인증번호 확인' })); });

      expect(hooks.phoneVerifyMutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ phone: PHONE, code: '654321' }));
      expect(screen.queryByText(EXPIRED_BANNER)).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
      expectAccountInputsKept();
      // 새 증명으로 끝났으니 자동 이동 시간이 지나도 단계가 바뀌지 않는다.
      await advanceClock(3000);
      expect(screen.getByRole('progressbar', { name: '회원가입 진행 단계 2 / 3' })).toBeInTheDocument();
      expect(screen.queryByLabelText(/^이름/)).not.toBeInTheDocument();

      // 이어서 가입하면 새 증명이 실린다.
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
      await screen.findByLabelText(/^이름/);
      fillProfileStep();
      fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));
      await waitFor(() => expect(hooks.registerMutateAsync).toHaveBeenCalledTimes(1));
      expect(hooks.registerMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        phoneProofToken: 'PROOF-2',
        nickname: '테스트닉',
        email: 'signup@example.com',
        password: ACCOUNT_PASSWORD,
      }));
      expect(storedText()).not.toContain(ACCOUNT_PASSWORD);
    });

    it('증명이 쓸 수 있는 시간은 서버가 알려 준 초 단위 수명이다(받은 시각 기준)', async () => {
      hooks.phoneVerifyMutateAsync.mockResolvedValue(verifiedResponse({ proofExpiresInSeconds: 120 }));
      render(<SignupClient />);
      await advanceToAccount();

      await advanceClock(100_000);
      expect(screen.queryByText(EXPIRED_BANNER)).not.toBeInTheDocument();
      await advanceClock(30_000);

      expectExpiredBanner(EXPIRED_BANNER);
    });

    it.each([
      ['focus', () => window.dispatchEvent(new Event('focus'))],
      ['visibilitychange', () => document.dispatchEvent(new Event('visibilitychange'))],
    ] as const)('다른 앱에 다녀오느라 타이머가 못 울렸어도 %s 로 돌아오는 순간 만료를 알아챈다', async (_name, comeBack) => {
      render(<SignupClient />);
      await advanceToAccount();
      expect(screen.getByText('010-1234-5678 휴대폰 본인인증이 완료됐어요')).toBeInTheDocument();

      // 시계만 건너뛴다. 예약된 타이머는 그대로라 아직 울리지 않았다.
      vi.setSystemTime(Date.now() + PAST_TTL_MS);
      expect(screen.queryByText(EXPIRED_BANNER)).not.toBeInTheDocument();
      act(() => { comeBack(); });

      expectExpiredBanner(EXPIRED_BANNER);
      expect(screen.getByRole('button', { name: '다시 인증하기' })).toBeEnabled();
    });

    it('서버가 수명을 알려 주지 않은 증명은 시간이 지나도 만료로 보지 않는다', async () => {
      hooks.phoneVerifyMutateAsync.mockResolvedValue(verifiedResponse({ proofExpiresInSeconds: undefined }));
      render(<SignupClient />);
      await advanceToAccount();

      await advanceClock(60 * 60 * 1000);

      expect(screen.queryByText(EXPIRED_BANNER)).not.toBeInTheDocument();
      expect(screen.getByText('010-1234-5678 휴대폰 본인인증이 완료됐어요')).toBeInTheDocument();
    });

    it('다시 인증하는 코드가 이미 가입된 번호로 확인되면 번호 인증 단계의 안내 카드로 보내고 입력은 그대로 둔다', async () => {
      hooks.phoneVerifyMutateAsync
        .mockResolvedValueOnce(verifiedResponse())
        .mockResolvedValueOnce(registeredResponse());
      render(<SignupClient />);
      await advanceToAccount();
      fillAccountStep();
      await advanceClock(PAST_TTL_MS);
      expect(screen.getByRole('button', { name: '다시 인증하기' })).toBeEnabled();

      await reverifyInPlace();

      expect(await screen.findByText(CARD_TITLE)).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: '회원가입 진행 단계 1 / 3' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '다른 번호로 인증하기' })).toBeEnabled();
      expect(screen.queryByText(EXPIRED_BANNER)).not.toBeInTheDocument();
      expect(screen.queryByText(EXPIRED_ON_VERIFY_BANNER)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/^닉네임/)).not.toBeInTheDocument();
      // 계정 입력에서 이메일을 이미 적었으니 소셜 줄이 그 이메일 연결을 안내한다.
      expect(screen.getByRole('link', { name: /카카오.*로 가입했어요/ })).toHaveTextContent('로그인한 뒤 방금 입력한 이메일도 연결할 수 있어요.');

      // 다른 번호로 인증하면 가입 정보 단계에 적어 둔 값이 그대로 있다.
      fireEvent.click(screen.getByRole('button', { name: '다른 번호로 인증하기' }));
      await advanceToAccount(OTHER_PHONE);
      expectAccountInputsKept();
      expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
      expect(hooks.registerMutateAsync).not.toHaveBeenCalled();
    });
  });

  describe('프로필 단계', () => {
    it('인증이 만료돼도 고른 사진과 적은 값이 그대로이고, 그 자리에서 다시 인증한 뒤 새 증명으로 가입한다', async () => {
      hooks.phoneVerifyMutateAsync
        .mockResolvedValueOnce(verifiedResponse())
        .mockResolvedValueOnce(verifiedResponse({ proofToken: 'PROOF-2' }));
      hooks.uploadImagesMutateAsync.mockResolvedValue({ urls: ['/uploads/me.png'] });
      hooks.updateProfileMutateAsync.mockResolvedValue({});
      render(<SignupClient />);
      await advanceToProfile();
      fillProfileStep();
      const photo = new File(['x'], 'me.png', { type: 'image/png' });
      fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [photo] } });
      await screen.findByRole('button', { name: '제거' });

      await advanceClock(PAST_TTL_MS);

      expectExpiredBanner(EXPIRED_BANNER);
      // 가입 버튼이 사라지고 다시 인증하기만 남는다 — 만료된 증명으로는 가입을 시도하지 않는다.
      expect(screen.getByRole('button', { name: '다시 인증하기' })).toBeEnabled();
      expect(screen.queryByRole('button', { name: '가입하고 계속' })).not.toBeInTheDocument();
      expect(hooks.registerMutateAsync).not.toHaveBeenCalled();
      expect(screen.getByRole('progressbar', { name: '회원가입 진행 단계 3 / 3' })).toBeInTheDocument();
      expectProfileInputsKept();
      expect(screen.getByRole('button', { name: '제거' })).toBeInTheDocument();

      await reverifyInPlace();

      // 같은 단계에서 일반 가입 버튼이 돌아오고, 값도 사진도 그대로다.
      expect(screen.queryByText(EXPIRED_BANNER)).not.toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: '회원가입 진행 단계 3 / 3' })).toBeInTheDocument();
      expectProfileInputsKept();
      expect(screen.getByRole('button', { name: '제거' })).toBeInTheDocument();
      await advanceClock(3000);
      expect(screen.getByRole('progressbar', { name: '회원가입 진행 단계 3 / 3' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));
      await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/signup/complete'));
      expect(hooks.registerMutateAsync).toHaveBeenCalledTimes(1);
      expect(hooks.registerMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        phoneProofToken: 'PROOF-2',
        displayName: '홍길동',
        birthDate: '20000229',
        gender: 'male',
      }));
      expect(hooks.uploadImagesMutateAsync).toHaveBeenCalledWith([photo]);
    });
  });

  describe('가입 요청이 PHONE_NOT_VERIFIED 로 거절된 경우', () => {
    const notVerified = () => apiError(400, 'PHONE_NOT_VERIFIED', '휴대폰 본인인증을 다시 진행해 주세요.');

    it('시계가 아직 유효해도 만료와 똑같이 안내하고, 오류 카드나 단계 이동 없이 입력을 지킨 채 다시 인증해 가입한다', async () => {
      hooks.registerMutateAsync.mockRejectedValueOnce(notVerified());
      hooks.phoneVerifyMutateAsync
        .mockResolvedValueOnce(verifiedResponse())
        .mockResolvedValueOnce(verifiedResponse({ proofToken: 'PROOF-2' }));
      render(<SignupClient />);
      await advanceToProfile();
      fillProfileStep();

      fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

      await screen.findByText(EXPIRED_BANNER);
      expectExpiredBanner(EXPIRED_BANNER);
      expect(screen.queryByText('휴대폰 본인인증을 다시 진행해 주세요.')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '다시 인증하기' })).toBeEnabled();
      expect(screen.getByRole('progressbar', { name: '회원가입 진행 단계 3 / 3' })).toBeInTheDocument();
      expectProfileInputsKept();
      expect(hooks.registerMutateAsync).toHaveBeenCalledTimes(1);
      expect(hooks.registerMutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({ phoneProofToken: 'PROOF-TOKEN' }));

      await reverifyInPlace();

      expect(screen.queryByText(EXPIRED_BANNER)).not.toBeInTheDocument();
      expectProfileInputsKept();
      fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));
      await waitFor(() => expect(hooks.registerMutateAsync).toHaveBeenCalledTimes(2));
      expect(hooks.registerMutateAsync).toHaveBeenLastCalledWith(expect.objectContaining({
        phoneProofToken: 'PROOF-2',
        nickname: '테스트닉',
        displayName: '홍길동',
      }));
      expect(storedText()).not.toContain(ACCOUNT_PASSWORD);
    });

    it('수명을 모르는 증명도 서버 거절로 만료를 알게 되고, 같은 복구 화면을 쓴다', async () => {
      hooks.phoneVerifyMutateAsync.mockResolvedValue(verifiedResponse({ proofExpiresInSeconds: undefined }));
      hooks.registerMutateAsync.mockRejectedValueOnce(notVerified());
      render(<SignupClient />);
      await advanceToProfile();
      fillProfileStep();
      await advanceClock(60 * 60 * 1000);
      expect(screen.queryByText(EXPIRED_BANNER)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

      await screen.findByText(EXPIRED_BANNER);
      expect(screen.getByRole('button', { name: '다시 인증하기' })).toBeEnabled();
      expectProfileInputsKept();
    });
  });

  describe('번호 인증 단계로 돌아온 경우', () => {
    /** 가입 정보를 적은 뒤 상단 뒤로가기로 번호 인증 단계에 돌아온다 — 받아 둔 증명은 아직 유효하다. */
    async function backToVerifyStep(): Promise<void> {
      render(<SignupClient />);
      await advanceToAccount();
      fillAccountStep();
      await waitFor(() => expect(screen.getByRole('button', { name: '다음' })).toBeEnabled());
      fireEvent.click(screen.getAllByRole('button', { name: '뒤로가기' })[0]);
      expect(await screen.findByLabelText(/^휴대폰 번호/)).toHaveValue('010-1234-5678');
    }

    it('아직 유효한 증명은 그대로 쓴다: 문자를 다시 보내지 않고, 다음으로 가입까지 처음 증명을 싣는다', async () => {
      await backToVerifyStep();
      await advanceClock(100_000);

      expect(screen.getByText('휴대폰 본인인증이 완료됐어요')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '인증번호 받기' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
      await screen.findByLabelText(/^닉네임/);
      expectAccountInputsKept();
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
      await screen.findByLabelText(/^이름/);
      fillProfileStep();
      fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

      await waitFor(() => expect(hooks.registerMutateAsync).toHaveBeenCalledTimes(1));
      expect(hooks.registerMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ phoneProofToken: 'PROOF-TOKEN', phone: PHONE }));
      expect(hooks.phoneIssueMutateAsync).toHaveBeenCalledTimes(1);
      expect(hooks.phoneVerifyMutateAsync).toHaveBeenCalledTimes(1);
    });

    it('번호를 한 자리라도 고치면 받아 둔 증명이 무효가 되어 다시 인증하기 전에는 다음으로 갈 수 없고, 새 번호·새 증명으로 가입한다', async () => {
      hooks.phoneVerifyMutateAsync
        .mockResolvedValueOnce(verifiedResponse())
        .mockResolvedValueOnce(verifiedResponse({ proofToken: 'OTHER-PROOF' }));
      await backToVerifyStep();

      fireEvent.change(screen.getByLabelText(/^휴대폰 번호/), { target: { value: OTHER_PHONE } });

      expect(screen.queryByText('휴대폰 본인인증이 완료됐어요')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeEnabled();
      // 번호를 바꾼 것이지 만료된 것이 아니다.
      expect(screen.queryByText(EXPIRED_ON_VERIFY_BANNER)).not.toBeInTheDocument();

      await completePhoneVerification();
      await screen.findByLabelText(/^닉네임/, {}, { timeout: 3000 });
      expectAccountInputsKept();
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
      await screen.findByLabelText(/^이름/);
      fillProfileStep();
      fireEvent.click(screen.getByRole('button', { name: '가입하고 계속' }));

      await waitFor(() => expect(hooks.registerMutateAsync).toHaveBeenCalledTimes(1));
      expect(hooks.registerMutateAsync).toHaveBeenCalledWith(expect.objectContaining({ phone: OTHER_PHONE, phoneProofToken: 'OTHER-PROOF' }));
    });

    it('이 단계에서 증명이 만료되면 번호 인증용 안내와 인증번호 받기로 바뀌고, 다시 인증하면 가입 정보로 넘어가며 입력이 남아 있다', async () => {
      hooks.phoneVerifyMutateAsync
        .mockResolvedValueOnce(verifiedResponse())
        .mockResolvedValueOnce(verifiedResponse({ proofToken: 'PROOF-2' }));
      await backToVerifyStep();

      await advanceClock(PAST_TTL_MS);

      expectExpiredBanner(EXPIRED_ON_VERIFY_BANNER);
      expect(screen.queryByText(EXPIRED_BANNER)).not.toBeInTheDocument();
      expect(screen.queryByText('휴대폰 본인인증이 완료됐어요')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '인증번호 받기' })).toBeEnabled();
      expect(screen.getByLabelText(/^휴대폰 번호/)).toHaveValue('010-1234-5678');

      await completePhoneVerification();

      await screen.findByLabelText(/^닉네임/, {}, { timeout: 3000 });
      expect(screen.queryByText(EXPIRED_ON_VERIFY_BANNER)).not.toBeInTheDocument();
      expectAccountInputsKept();
      expect(screen.getByRole('button', { name: '다음' })).toBeEnabled();
      expect(hooks.phoneIssueMutateAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('다시 인증한 직후', () => {
    it('900ms 안에 뒤로가기를 누르면 예약된 자동 이동이 취소되어 번호 인증 단계에 머문다', async () => {
      render(<SignupClient />);
      await advanceToAccount();
      fillAccountStep();
      await advanceClock(PAST_TTL_MS);
      await reverifyInPlace();

      // 새 증명을 받은 시점에서 자동 이동 타이머가 예약돼 있다. 발동 전에 되돌아간다.
      fireEvent.click(screen.getAllByRole('button', { name: '뒤로가기' })[0]);
      expect(await screen.findByLabelText(/^휴대폰 번호/)).toBeInTheDocument();
      await advanceClock(3000);

      expect(screen.getByRole('progressbar', { name: '회원가입 진행 단계 1 / 3' })).toBeInTheDocument();
      expect(screen.queryByLabelText(/^닉네임/)).not.toBeInTheDocument();
      expect(screen.getByText('휴대폰 본인인증이 완료됐어요')).toBeInTheDocument();
    });
  });
});
