import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileEditPageClient } from './my-api-clients';

const router = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  search: '',
}));

const hooks = vi.hoisted(() => ({
  profile: vi.fn(),
  authMe: vi.fn(),
  updateProfile: vi.fn(),
  uploadImages: vi.fn(),
  checkNickname: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(router.search),
  // U37: useShellOverride(shell-override.ts)가 usePathname을 쓴다 — 셸 승격 전엔 이 화면이
  // 직접 AppChrome을 렌더해 필요 없었지만, 이제 desktopHead override 배관에 필요하다.
  usePathname: () => '/my/profile/edit',
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
    router.search = '';
    hooks.updateProfile.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.uploadImages.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
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
    router.search = '';
    mutateAsync.mockResolvedValue({});
    hooks.updateProfile.mockReturnValue({ mutateAsync, isPending: false });
    hooks.uploadImages.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
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

  it('구분자가 있는 기존 생년월일을 정상 표시하고 숫자 8자리로 저장한다', async () => {
    const current = hooks.profile();
    hooks.profile.mockReturnValue({ ...current, data: {
      ...current.data, profile: { ...current.data.profile, birthDate: '1995-01-15' },
    } });
    renderWithClient(<ProfileEditPageClient />);
    expect(screen.getByRole('textbox', { name: '생년월일' })).toHaveValue('1995-01-15');
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ birthDate: '19950115' })));
    expect(router.replace).toHaveBeenCalledWith('/my');
  });

  it('구분자를 제거한 뒤에도 존재하지 않는 날짜는 서버로 보내지 않는다', () => {
    const current = hooks.profile();
    hooks.profile.mockReturnValue({ ...current, data: {
      ...current.data, profile: { ...current.data.profile, birthDate: '1995-02-30' },
    } });
    renderWithClient(<ProfileEditPageClient />);
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    expect(screen.getByText(/올바른 생년월일/)).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it.each([
    ['from=%2Fmy%2Fsettings%2Fplayer-card%3Ffrom%3D%252Fmy', '/my/settings/player-card?from=%2Fmy'],
    ['returnTo=%2Fmy%2Fsettings%2Fplayer-card', '/my/settings/player-card'],
    ['from=%2F%5Cevil.example&returnTo=%2F%5Cevil.example', '/my'],
  ])('저장과 뒤로가기의 안전한 복귀 경로를 통일한다 (%s)', async (search, destination) => {
    router.search = search;
    renderWithClient(<ProfileEditPageClient />);
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', destination);
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(destination));
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

  it('미인증 계정도 번호를 안 바꾸면 인증 없이 프로필을 저장한다', () => {
    // 인증 도입 이전에 가입한 레거시 계정이 프로필조차 못 고치면, 로그인은 되는데 아무것도
    // 못 하는 상태로 갇힌다. 서버의 쓰기 게이트도 /me 를 열어 두므로 여기서 막지 않는다.
    hooks.authMe.mockReturnValue({ data: { verification: { phoneVerified: false } } });

    renderWithClient(<ProfileEditPageClient />);

    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('phoneProofToken', expect.anything());
  });

  it('미인증 계정에는 이 자리에서 인증을 끝낼 수 있는 authed 카드를 띄운다', () => {
    // 저장을 막는 장치가 아니라, 팀·대회·채팅을 쓰려면 필요한 인증을 여기서 끝내라는 안내다.
    hooks.authMe.mockReturnValue({ data: { verification: { phoneVerified: false } } });

    renderWithClient(<ProfileEditPageClient />);

    expect(screen.getByRole('button', { name: 'stub-인증완료(authed)' })).toBeInTheDocument();
  });

  it('미인증 계정이라도 번호를 바꾸면 증명 없이는 저장하지 않는다', () => {
    // 자기 계정 범위를 열어 준 것이 번호까지 열어 준 것은 아니다 — 증명 없이 번호를 붙일 수
    // 있으면 "프로필에서 번호만 교체"로 인증 자체가 우회된다. 서버도 400 으로 다시 막는다.
    hooks.authMe.mockReturnValue({ data: { verification: { phoneVerified: false } } });

    renderWithClient(<ProfileEditPageClient />);

    changePhoneTo('010-7777-6666');
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('변경한 번호로 본인인증을 완료해 주세요.')).toBeInTheDocument();
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

describe('ProfileEditPageClient 이메일은 직접 고치지 않고 변경 화면으로 보낸다', () => {
  const mutateAsync = vi.fn();
  const profileData = (overrides: Record<string, unknown> = {}) => ({
    data: {
      email: 'me@teameet.test',
      phone: '01011112222',
      hasPassword: true,
      profile: {
        realName: '기존이름',
        nickname: '기존닉',
        bio: '기존 소개',
        profileImageUrl: null,
        birthDate: '19950115',
        gender: 'male',
      },
      ...overrides,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    router.search = '';
    mutateAsync.mockResolvedValue({});
    hooks.updateProfile.mockReturnValue({ mutateAsync, isPending: false });
    hooks.uploadImages.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.checkNickname.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    hooks.authMe.mockReturnValue({ data: { verification: { phoneVerified: true } } });
    hooks.profile.mockReturnValue(profileData());
  });

  it('이메일 칸은 읽기 전용이고, 중복 확인 대신 새 주소 인증이 필요하다고 알리며 "변경"으로 이어진다', () => {
    renderWithClient(<ProfileEditPageClient />);

    const emailField = screen.getByLabelText('이메일');
    expect(emailField).toHaveValue('me@teameet.test');
    expect(emailField).toHaveAttribute('readonly');
    expect(emailField).toHaveAccessibleDescription('이메일을 바꾸려면 새 주소로 인증이 필요해요.');
    expect(screen.getByRole('button', { name: '이메일 변경' })).toHaveTextContent('변경');
    expect(screen.queryByRole('button', { name: '이메일 중복 확인' })).not.toBeInTheDocument();
  });

  it('저장 요청에는 이메일도 증명 토큰도 싣지 않는다 — 서버가 지금 이메일을 그대로 둔다', async () => {
    renderWithClient(<ProfileEditPageClient />);

    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('emailChangeToken');
    expect(payload).toMatchObject({ nickname: '기존닉', phone: '01011112222', gender: 'male' });
  });

  it('폼에 고친 것이 없으면 묻지 않고 바로 이메일 변경 화면으로 간다', async () => {
    renderWithClient(<ProfileEditPageClient />);

    fireEvent.click(screen.getByRole('button', { name: '이메일 변경' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledExactlyOnceWith('/my/profile/edit/email'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('이 화면의 from 쿼리를 싣고 가서, 돌아올 때 같은 화면으로 되살린다', async () => {
    router.search = 'from=%2Fmy%2Fsettings';
    renderWithClient(<ProfileEditPageClient />);

    fireEvent.click(screen.getByRole('button', { name: '이메일 변경' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledExactlyOnceWith(
      '/my/profile/edit/email?redirect=%2Fmy%2Fprofile%2Fedit%3Ffrom%3D%252Fmy%252Fsettings',
    ));
  });

  it('저장하지 않은 변경이 있으면 사라진다고 먼저 묻고, 취소하면 가지 않으며 계속하면 간다', async () => {
    renderWithClient(<ProfileEditPageClient />);
    fireEvent.change(screen.getByLabelText('한 줄 소개'), { target: { value: '새 소개로 바꿨어요' } });

    fireEvent.click(screen.getByRole('button', { name: '이메일 변경' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('저장하지 않은 변경이 있어요');
    expect(dialog).toHaveTextContent('이메일을 바꾸러 가면 지금 고친 내용은 저장되지 않고 사라져요.');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(router.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '이메일 변경' }));
    fireEvent.click(await screen.findByRole('button', { name: '계속하기' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledExactlyOnceWith('/my/profile/edit/email'));
  });

  it('고쳤던 칸을 저장된 값으로 되돌리면 더는 묻지 않는다', async () => {
    renderWithClient(<ProfileEditPageClient />);
    const bio = screen.getByLabelText('한 줄 소개');
    fireEvent.change(bio, { target: { value: '잠깐 바꿨어요' } });
    fireEvent.change(bio, { target: { value: '기존 소개' } });

    fireEvent.click(screen.getByRole('button', { name: '이메일 변경' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('이메일이 없는 계정은 비어 있는 칸에 "등록"으로 같은 인증 화면에 들어간다', async () => {
    hooks.profile.mockReturnValue(profileData({ email: null, hasPassword: false }));
    renderWithClient(<ProfileEditPageClient />);

    expect(screen.getByLabelText('이메일')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '이메일 등록' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledExactlyOnceWith('/my/profile/edit/email'));
  });

  it('이름은 필수라 라벨에 선택 표시가 없고, 비우면 저장 버튼이 막히며 이유를 알린다', () => {
    renderWithClient(<ProfileEditPageClient />);
    expect(screen.queryByText('(선택)')).not.toBeInTheDocument();

    const nameInput = screen.getByRole('textbox', { name: '이름' });
    expect(nameInput).toBeRequired();
    fireEvent.change(nameInput, { target: { value: ' ​ ' } });

    expect(screen.getByRole('button', { name: '프로필 저장' })).toBeDisabled();
    expect(screen.getByText('이름을 입력해 주세요.')).toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('바꾼 이름은 앞뒤 공백을 정리해 저장한다', async () => {
    renderWithClient(<ProfileEditPageClient />);
    fireEvent.change(screen.getByRole('textbox', { name: '이름' }), { target: { value: '  새이름 ' } });
    fireEvent.click(screen.getByRole('button', { name: '프로필 저장' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ realName: '새이름' })));
  });

  it('바꾼 닉네임은 중복 확인 전에는 저장할 수 없다고 닉네임만 짚어 알린다', () => {
    renderWithClient(<ProfileEditPageClient />);
    fireEvent.change(screen.getByLabelText('닉네임'), { target: { value: '새닉네임' } });

    expect(screen.getByRole('button', { name: '프로필 저장' })).toBeDisabled();
    expect(screen.getByText('변경한 닉네임은 중복 확인 후 저장할 수 있어요.')).toBeInTheDocument();
  });
});
