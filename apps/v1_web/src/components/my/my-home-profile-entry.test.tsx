import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyHomePageClient } from './my-api-clients';
import type { V1Profile } from '@/types/api';

/**
 * 공개 프로필(`/users/:id`) 진입점.
 *
 * 이 링크가 생기기 전까지 `/users/:id`(선수 카드·활동 기록이 있는 화면)로 가는 길이 앱
 * 어디에도 없었다 — 전수 조사 결과 그 화면들이 서로를 가리키는 뒤로가기뿐이었고, URL 을
 * 직접 아는 사람만 볼 수 있었다. 만들어 두고 도달할 수 없는 상태였다.
 */
const apiMocks = vi.hoisted(() => ({
  useV1Profile: vi.fn(),
  useV1MyActivitySummary: vi.fn(),
  useV1MyTeams: vi.fn(),
  useV1Notifications: vi.fn(),
  useV1Reviews: vi.fn(),
  useV1AuthMe: vi.fn(),
  useV1MyTournamentStaffAssignments: vi.fn(),
  useV1PublicProfile: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...apiMocks,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/my',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const profile: V1Profile = {
  userId: 'user-42',
  accountStatus: 'active',
  email: 'user@example.com',
  authProvider: 'email',
  regionName: '서울',
  profile: {
    displayName: '김도윤',
    realName: null,
    nickname: '도윤',
    profileImageUrl: null,
    gender: null,
  },
  reputation: { trustState: 'estimated', mannerScore: null, activityCount: 0, reviewCount: 0 },
};

const playerCard = {
  formulaVersion: 1, position: null, jerseyNumber: null, overall: null, tier: 'bronze', shape: 'rect',
  appearances: 0, stats: [], unlockedCount: 0, nextUnlock: null,
};

function mockBaseHooks(
  profileState: { data?: V1Profile; isError?: boolean },
  opts: { phoneVerified?: boolean; card?: 'present' | 'absent' } = {},
) {
  apiMocks.useV1Profile.mockReturnValue({ isError: false, ...profileState });
  apiMocks.useV1MyActivitySummary.mockReturnValue({ data: undefined });
  apiMocks.useV1MyTeams.mockReturnValue({ data: { items: [] } });
  apiMocks.useV1Notifications.mockReturnValue({ data: undefined });
  apiMocks.useV1Reviews.mockReturnValue({ data: undefined });
  apiMocks.useV1AuthMe.mockReturnValue({ data: { verification: { phoneVerified: opts.phoneVerified ?? true } } });
  apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({ data: { items: [] } });
  apiMocks.useV1PublicProfile.mockReturnValue(
    opts.card === 'absent'
      ? { data: { playerCard: null, teams: [] }, isPending: false }
      : { data: { playerCard, teams: [] }, isPending: false },
  );
}

function settingsRow(name: RegExp) {
  const section = screen.getByRole('heading', { name: '설정·문의' }).closest('section')!;
  return within(section as HTMLElement).getByRole('link', { name });
}

describe('MyHomePageClient — 공개 프로필 진입점 (2026-09-26 B안: 카드가 곧 프로필)', () => {
  it('카드가 있으면 카드 버튼 줄에서 내 공개 프로필로 간다', () => {
    mockBaseHooks({ data: profile });

    render(<MyHomePageClient />);

    // 뒤로가기가 마이페이지로 돌아오도록 `?from=`을 함께 실어 보낸다(MD-QA #15).
    expect(screen.getByRole('link', { name: '공개 프로필 보기' })).toHaveAttribute('href', '/users/user-42?from=%2Fmy');
    // 같은 사람을 두 번 소개하던 카드 아래 프로필 박스는 없다.
    expect(screen.queryByRole('heading', { name: '프로필' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '내 프로필' })).not.toBeInTheDocument();
  });

  it('카드가 없는 사용자(숨김·조회 실패)에게는 신원 블록이 유일한 신원이라 남는다', () => {
    mockBaseHooks({ data: profile }, { card: 'absent' });

    render(<MyHomePageClient />);

    expect(screen.getByRole('heading', { name: '프로필' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '내 프로필' })).toHaveAttribute('href', '/users/user-42?from=%2Fmy');
    expect(screen.queryByRole('link', { name: '공개 프로필 보기' })).not.toBeInTheDocument();
  });

  it('카드가 오는 중에는 신원 블록을 세우지 않는다 -- 섰다가 사라지면 아래가 들썩인다', () => {
    mockBaseHooks({ data: profile });
    apiMocks.useV1PublicProfile.mockReturnValue({ data: undefined, isPending: true });

    render(<MyHomePageClient />);

    expect(screen.queryByRole('heading', { name: '프로필' })).not.toBeInTheDocument();
  });

  it('프로필 수정은 설정·문의 첫 행이다', () => {
    mockBaseHooks({ data: profile });

    render(<MyHomePageClient />);

    const row = settingsRow(/^프로필 수정/);
    expect(row).toHaveAttribute('href', '/my/profile/edit');
    const section = row.closest('section')!;
    expect(section.querySelector('a.tm-my-menu-row')).toBe(row);
  });

  it('계정 설정 행이 로그인 방식과 본인인증 상태를 말한다', () => {
    mockBaseHooks({ data: profile });

    render(<MyHomePageClient />);

    const row = settingsRow(/^계정 설정/);
    expect(row).toHaveTextContent('이메일 로그인 · 계정 보안과 알림을 관리해요');
    expect(within(row).getByText('본인인증 완료')).toBeInTheDocument();
  });

  it('미인증이면 인증 완료 배지를 달지 않고 인증 유도 카드를 그대로 띄운다', () => {
    mockBaseHooks({ data: profile }, { phoneVerified: false });

    render(<MyHomePageClient />);

    expect(within(settingsRow(/^계정 설정/)).queryByText('본인인증 완료')).not.toBeInTheDocument();
    expect(screen.getByText('휴대폰 본인인증이 필요해요')).toBeInTheDocument();
  });

  it('프로필을 아직 못 불러왔으면 공개 프로필 링크를 그리지 않는다 (깨진 /users/null 로 보내지 않는다)', () => {
    mockBaseHooks({ data: undefined });

    render(<MyHomePageClient />);

    expect(screen.queryByRole('link', { name: '공개 프로필 보기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '내 프로필' })).not.toBeInTheDocument();
  });
});
