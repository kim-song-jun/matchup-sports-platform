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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const profile: V1Profile = {
  userId: 'user-1',
  accountStatus: 'active',
  email: 'user@example.com',
  authProvider: 'email',
  regionName: '서울',
  profile: { displayName: '김도윤', realName: null, nickname: '도윤', profileImageUrl: null, gender: null },
  reputation: { trustState: 'estimated', mannerScore: null, activityCount: 0, reviewCount: 0 },
};

function mockBaseHooks() {
  apiMocks.useV1Profile.mockReturnValue({ data: profile, isError: false });
  apiMocks.useV1MyActivitySummary.mockReturnValue({ data: undefined });
  apiMocks.useV1MyTeams.mockReturnValue({ data: { items: [] } });
  apiMocks.useV1Notifications.mockReturnValue({ data: undefined });
  apiMocks.useV1Reviews.mockReturnValue({ data: undefined });
  apiMocks.useV1AuthMe.mockReturnValue({ data: { verification: { phoneVerified: true } } });
  apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({ data: { items: [] } });
}

// "팀 컨택의 채팅 흡수": 채팅으로 가는 상시 입구가 마이 메뉴에 없었다 — 홈 위젯이 유일했다.
describe('MyHomePageClient — 채팅 진입점', () => {
  it('커뮤니티 섹션에 "채팅" 행이 /chat 으로 연결되고, 대기 컨택이 없으면 배지가 없다', () => {
    mockBaseHooks();
    apiMocks.useV1TeamContactSummary.mockReturnValue({ data: { pendingInbound: 0, byTeam: [] } });

    render(<MyHomePageClient />);

    expect(screen.getByRole('link', { name: /^채팅/ })).toHaveAttribute('href', '/chat');
    expect(screen.queryByLabelText(/답장을 기다리는 컨택/)).not.toBeInTheDocument();
  });

  it('답장을 기다리는 컨택이 있으면 "채팅" 행에 건수 배지가 붙는다', () => {
    mockBaseHooks();
    apiMocks.useV1TeamContactSummary.mockReturnValue({ data: { pendingInbound: 3, byTeam: [{ teamId: 't1', pendingInbound: 3 }] } });

    render(<MyHomePageClient />);

    const link = screen.getByRole('link', { name: /^채팅/ });
    expect(link).toHaveAttribute('href', '/chat');
    expect(screen.getByLabelText('답장을 기다리는 컨택 3건')).toHaveTextContent('3');
  });
});
