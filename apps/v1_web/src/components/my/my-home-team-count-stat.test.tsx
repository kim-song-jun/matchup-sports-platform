import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyHomePageClient } from './my-api-clients';
import type { V1Profile } from '@/types/api';

/**
 * "소속 팀" KPI가 activitySummary 로딩 중에는 진짜 0인 것처럼 "0팀"을 보여주고 있었다 —
 * activitySummary가 아직 도착하지 않았을 때 teams(초기값 [])의 length로 폴백했기 때문이다.
 * teamCount는 activitySummary 응답의 필수 필드라 activitySummary가 있으면 항상 채워져
 * 있으므로, teams.length 폴백은 실제로 로딩 상태만 가리키는데 값은 0으로 보였다.
 */
const apiMocks = vi.hoisted(() => ({
  useV1Profile: vi.fn(),
  useV1MyActivitySummary: vi.fn(),
  useV1MyTeams: vi.fn(),
  useV1Notifications: vi.fn(),
  useV1Reviews: vi.fn(),
  useV1AuthMe: vi.fn(),
  useV1MyTournamentStaffAssignments: vi.fn(),
  // 이 테스트는 owner 역할 팀을 채워 useV1TeamContactSummary 의 enabled 조건을 참으로
  // 만든다 — 명시적으로 mock 하지 않으면 실제 훅이 실행돼 네트워크 의존적인
  // flaky 테스트가 된다(Copilot 리뷰 지적, 2026-09-17).
  useV1TeamContactSummary: vi.fn(),
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

function teamStatContainer() {
  return screen.getByText('소속 팀').parentElement as HTMLElement;
}

describe('MyHomePageClient — 소속 팀 KPI', () => {
  it('activitySummary가 아직 도착하지 않았으면 0이 아니라 로딩 placeholder를 보여준다', () => {
    apiMocks.useV1Profile.mockReturnValue({ isError: false, data: profile });
    // activitySummary는 아직 로딩 중(undefined) — 그런데 teams 쿼리 캐시엔 이미 13개 팀이
    // 들어와 있는 상태(실제 alpha 재현: 쿼리 두 개가 서로 다른 속도로 도착)를 흉내낸다.
    apiMocks.useV1MyActivitySummary.mockReturnValue({ data: undefined });
    apiMocks.useV1MyTeams.mockReturnValue({
      data: { items: Array.from({ length: 13 }, (_, i) => ({ teamId: `team-${i}`, role: 'owner' })) },
    });
    apiMocks.useV1Notifications.mockReturnValue({ data: undefined });
    apiMocks.useV1Reviews.mockReturnValue({ data: undefined });
    apiMocks.useV1AuthMe.mockReturnValue({ data: { verification: { phoneVerified: true } } });
    apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({ data: { items: [] } });
    apiMocks.useV1TeamContactSummary.mockReturnValue({ data: undefined });

    render(<MyHomePageClient />);

    const stat = teamStatContainer();
    expect(stat).toHaveTextContent('—');
    expect(stat).not.toHaveTextContent('0');
  });

  it('activitySummary가 도착하면 실제 teamCount를 보여준다', () => {
    apiMocks.useV1Profile.mockReturnValue({ isError: false, data: profile });
    apiMocks.useV1MyActivitySummary.mockReturnValue({
      data: { totals: { activityCount: 5, teamCount: 13, mannerScore: 90 }, monthly: { matchCount: 2, mannerScore: 90, winRate: 0.5 } },
    });
    apiMocks.useV1MyTeams.mockReturnValue({
      data: { items: Array.from({ length: 13 }, (_, i) => ({ teamId: `team-${i}`, role: 'owner' })) },
    });
    apiMocks.useV1Notifications.mockReturnValue({ data: undefined });
    apiMocks.useV1Reviews.mockReturnValue({ data: undefined });
    apiMocks.useV1AuthMe.mockReturnValue({ data: { verification: { phoneVerified: true } } });
    apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({ data: { items: [] } });
    apiMocks.useV1TeamContactSummary.mockReturnValue({ data: undefined });

    render(<MyHomePageClient />);

    const stat = teamStatContainer();
    expect(stat).toHaveTextContent('13');
    expect(stat).toHaveTextContent('팀');
  });
});
