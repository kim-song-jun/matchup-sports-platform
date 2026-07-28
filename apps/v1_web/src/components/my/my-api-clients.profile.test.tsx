import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileEditPageClient } from './my-api-clients';

const router = vi.hoisted(() => ({
  replace: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  profile: vi.fn(),
  authMe: vi.fn(),
  updateProfile: vi.fn(),
  uploadImages: vi.fn(),
  checkEmail: vi.fn(),
  checkNickname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
}));

// 실제 인증 카드는 발급/검증 API를 호출한다. 여기서 검증할 계약은 "번호를 바꾸면 증명 없이는
// 저장되지 않는다"이므로, 카드는 onVerified만 직접 트리거하는 stub으로 대체한다.
vi.mock('@/components/auth/phone-verification/phone-verification-card', () => ({
  // authed 모드는 서버가 인증 상태를 직접 바꾸므로 proofToken 없이 onVerified() 를 부른다.
  PhoneVerificationCard: ({ mode, onVerified }: { mode: 'public' | 'authed'; onVerified: (proofToken?: string) => void }) => (
    <button type="button" onClick={() => onVerified(mode === 'public' ? 'proof-token-abc' : undefined)}>
      {`stub-인증완료(${mode})`}
    </button>
  ),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-v1-api')>();
  return {
    ...actual,
    useV1Profile: hooks.profile,
    useV1AuthMe: hooks.authMe,
    useV1UpdateProfile: hooks.updateProfile,
    useV1UploadImages: hooks.uploadImages,
    useV1CheckEmail: hooks.checkEmail,
    useV1CheckNickname: hooks.checkNickname,
  };
});

function renderWithClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('ProfileEditPageClient query states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.updateProfile.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.uploadImages.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.checkEmail.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.checkNickname.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.authMe.mockReturnValue({ data: { verification: { phoneVerified: true } } });
  });

  it('shows a loading skeleton instead of a blank editable form', () => {
    hooks.profile.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    });

    renderWithClient(<ProfileEditPageClient />);

    expect(document.querySelector('.tm-skeleton-page')).toBeInTheDocument();
    expect(document.querySelector('#v1-profile-edit-form')).not.toBeInTheDocument();
  });

  it('shows a retryable error instead of a blocked blank form', () => {
    const refetch = vi.fn();
    hooks.profile.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });

    renderWithClient(<ProfileEditPageClient />);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));

    expect(refetch).toHaveBeenCalledOnce();
    expect(document.querySelector('#v1-profile-edit-form')).not.toBeInTheDocument();
  });
});

describe('ProfileEditPageClient 번호 변경 본인인증 게이트', () => {
  const mutateAsync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({});
    hooks.updateProfile.mockReturnValue({ mutateAsync, isPending: false });
    hooks.uploadImages.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.checkEmail.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.checkNickname.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.authMe.mockReturnValue({ data: { verification: { phoneVerified: true } } });
    hooks.profile.mockReturnValue({
      data: {
        email: 'me@teameet.test',
        phone: '01011112222',
        hasPassword: true,
        profile: {
          realName: '기존이름',
          nickname: '기존닉',
          profileImageUrl: null,
          birthDate: '19950115',
          gender: 'male',
        },
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  function changePhoneTo(value: string) {
    fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value } });
  }

  it('번호를 바꾸면 인증 카드가 나타나고, 인증 없이 저장하면 서버로 보내지 않는다', () => {
    renderWithClient(<ProfileEditPageClient />);

    expect(screen.queryByRole('button', { name: 'stub-인증완료(public)' })).not.toBeInTheDocument();

    changePhoneTo('010-3333-4444');
    expect(screen.getByRole('button', { name: 'stub-인증완료(public)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('변경한 번호로 본인인증을 완료해 주세요.')).toBeInTheDocument();
  });

  it('인증을 마치면 저장되고 증명 토큰이 함께 전송된다', () => {
    renderWithClient(<ProfileEditPageClient />);

    changePhoneTo('010-3333-4444');
    fireEvent.click(screen.getByRole('button', { name: 'stub-인증완료(public)' }));
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      phone: '01033334444',
      phoneProofToken: 'proof-token-abc',
    });
  });

  it('인증을 마친 뒤 번호를 다시 고치면 증명이 무효화돼 저장이 다시 막힌다', () => {
    renderWithClient(<ProfileEditPageClient />);

    changePhoneTo('010-3333-4444');
    fireEvent.click(screen.getByRole('button', { name: 'stub-인증완료(public)' }));
    changePhoneTo('010-5555-6666');
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('미인증 계정은 번호를 안 바꿔도 authed 인증 카드가 뜨고, 인증 전에는 저장하지 않는다', () => {
    // 미인증 계정은 PATCH /me/profile 자체가 서버 게이트(PHONE_VERIFICATION_REQUIRED)에 막힌다.
    // proofToken 만 받는 public 흐름으로는 저장이 끝나지 않으므로 authed 카드를 띄워야 한다.
    hooks.authMe.mockReturnValue({ data: { verification: { phoneVerified: false } } });

    renderWithClient(<ProfileEditPageClient />);

    expect(screen.getByRole('button', { name: 'stub-인증완료(authed)' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('휴대폰 본인인증을 먼저 완료해 주세요.')).toBeInTheDocument();
  });

  it('미인증 계정이 이 화면에서 인증을 끝내면 증명 토큰 없이 저장된다', () => {
    hooks.authMe.mockReturnValue({ data: { verification: { phoneVerified: false } } });

    renderWithClient(<ProfileEditPageClient />);

    fireEvent.click(screen.getByRole('button', { name: 'stub-인증완료(authed)' }));
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));

    // authed 인증은 서버가 phone·phoneVerifiedAt 을 이미 갱신했으므로 proofToken 이 필요 없다.
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ phone: '01011112222', phoneProofToken: null });
  });

  it('번호를 그대로 두면 인증 카드 없이 저장된다 (기존 흐름 회귀 방지)', () => {
    renderWithClient(<ProfileEditPageClient />);

    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));

    expect(screen.queryByRole('button', { name: 'stub-인증완료(public)' })).not.toBeInTheDocument();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ phone: '01011112222', phoneProofToken: null });
  });
});
