import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
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

function mockBaseHooks(profileState: { data?: V1Profile; isError?: boolean }) {
  apiMocks.useV1Profile.mockReturnValue({ isError: false, ...profileState });
  apiMocks.useV1MyActivitySummary.mockReturnValue({ data: undefined });
  apiMocks.useV1MyTeams.mockReturnValue({ data: { items: [] } });
  apiMocks.useV1Notifications.mockReturnValue({ data: undefined });
  apiMocks.useV1Reviews.mockReturnValue({ data: undefined });
  apiMocks.useV1AuthMe.mockReturnValue({ data: { verification: { phoneVerified: true } } });
  apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({ data: { items: [] } });
}

describe('MyHomePageClient — 공개 프로필 진입점', () => {
  it('내 공개 프로필로 가는 링크를 보여준다', () => {
    mockBaseHooks({ data: profile });

    render(<MyHomePageClient />);

    expect(screen.getByRole('link', { name: '내 프로필' })).toHaveAttribute('href', '/users/user-42');
  });

  it('프로필 수정 진입은 그대로 남는다 (기존 경로를 대체하지 않는다)', () => {
    mockBaseHooks({ data: profile });

    render(<MyHomePageClient />);

    expect(screen.getByRole('link', { name: '프로필 수정' })).toHaveAttribute('href', '/my/profile/edit');
  });

  it('프로필을 아직 못 불러왔으면 링크를 그리지 않는다 (깨진 /users/null 로 보내지 않는다)', () => {
    mockBaseHooks({ data: undefined });

    render(<MyHomePageClient />);

    expect(screen.queryByRole('link', { name: '내 프로필' })).not.toBeInTheDocument();
  });
});
