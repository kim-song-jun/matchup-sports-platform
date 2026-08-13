import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MyHomePageClient } from './my-api-clients';
import type { V1Profile } from '@/types/api';

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
  userId: 'user-1',
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
  reputation: { trustState: 'none', mannerScore: null, activityCount: 0, reviewCount: 0 },
};

function mockBaseHooks() {
  apiMocks.useV1Profile.mockReturnValue({ data: profile, isError: false });
  apiMocks.useV1MyActivitySummary.mockReturnValue({ data: undefined });
  apiMocks.useV1MyTeams.mockReturnValue({ data: { items: [] } });
  apiMocks.useV1Notifications.mockReturnValue({ data: undefined });
  apiMocks.useV1Reviews.mockReturnValue({ data: undefined });
  apiMocks.useV1AuthMe.mockReturnValue({ data: { verification: { phoneVerified: true } } });
}

describe('MyHomePageClient — 대회 운영 진입점 노출 조건', () => {
  it('유효한 스태프 배정이 없으면 "대회 운영" 메뉴가 보이지 않는다', () => {
    mockBaseHooks();
    apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({ data: { items: [] } });

    render(<MyHomePageClient />);

    expect(screen.queryByText('담당 대회 운영')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /담당 대회 운영/ })).not.toBeInTheDocument();
  });

  it('유효한 스태프 배정이 있으면 "대회 운영" 메뉴가 /my/tournament-staff로 연결된다', () => {
    mockBaseHooks();
    apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({
      data: {
        items: [
          {
            tournamentId: 't-1',
            tournamentTitle: '성수 5인제 컵',
            tournamentStatus: 'in_progress',
            assignments: [{ id: 'a-1', role: 'FIELD_OPERATOR', fieldId: 'f-1', fieldName: 'A구장', version: 0, expiresAt: null }],
          },
        ],
      },
    });

    render(<MyHomePageClient />);

    const link = screen.getByRole('link', { name: /담당 대회 운영/ });
    expect(link).toHaveAttribute('href', '/my/tournament-staff');
    expect(screen.getByText('담당 중인 대회 1개')).toBeInTheDocument();
  });
});
