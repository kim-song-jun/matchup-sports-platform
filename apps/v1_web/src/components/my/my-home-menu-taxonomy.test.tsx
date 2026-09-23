import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, within } from '@testing-library/react';
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
  return rtlRender(ui, {
    wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });
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
  apiMocks.useV1TeamContactSummary.mockReturnValue({ data: { pendingInbound: 0, byTeam: [] } });
}

/**
 * 메뉴 분류 (사용자 선택 2안, 2026-09-20).
 *
 * 섹션을 "지금 나한테 온 것 / 내가 보러 가는 것"으로 다시 갈랐다. 항목은 그대로 두고
 * 서랍만 바꾼 변경이라 **하나라도 사라지면 그 목적지로 가는 길이 앱에서 끊긴다** --
 * 라벨을 읽는 테스트로는 안 잡히므로 여기서 도착지(href) 전수를 건다. 실제로 이 변경에서
 * 정적 모델과 중복이던 '문의' 섹션 추가 코드를 지웠고, 리뷰 항목은 배열 중간에 끼워 넣는다.
 */
const DESTINATIONS = [
  '/chat',
  '/my/invitations',
  '/my/reviews',
  '/my/join-applications',
  '/my/matches/joined',
  '/my/matches/created',
  // 뒤로가기가 마이페이지로 돌아오도록 `?from=`을 함께 실어 보낸다(MD-QA #15).
  '/users/user-1/records?from=%2Fmy',
  '/my/teams',
  '/my/leagues',
  '/my/schedule',
  '/my/settings/sports',
  '/my/settings',
  '/my/inquiries',
];

describe('마이 메뉴 분류 — 서랍을 바꿔도 목적지는 그대로', () => {
  it('13개 목적지가 하나도 빠지지 않는다', () => {
    mockBaseHooks();

    const { container } = render(<MyHomePageClient />);

    const hrefs = new Set(
      Array.from(container.querySelectorAll('a.tm-my-menu-row')).map((el) => el.getAttribute('href')),
    );
    for (const href of DESTINATIONS) {
      expect(hrefs, `메뉴에서 ${href} 로 가는 길이 사라졌다`).toContain(href);
    }
  });

  it('처리할 일(채팅·초대·리뷰·보낸 신청)이 "받은 소식" 한 섹션에 모인다', () => {
    mockBaseHooks();

    render(<MyHomePageClient />);

    // 배지가 붙을 수 있는 항목이 흩어져 있으면 "지금 처리할 게 있나"를 한 번에 볼 수 없다.
    const inbox = screen.getByRole('heading', { name: '받은 소식' }).closest('section');
    expect(inbox).not.toBeNull();
    const inboxHrefs = Array.from(inbox!.querySelectorAll('a.tm-my-menu-row')).map((el) => el.getAttribute('href'));
    expect(inboxHrefs).toEqual(['/chat', '/my/invitations', '/my/reviews', '/my/join-applications']);
  });

  it('"받은 소식"이 모바일에서 카드 바로 아래로 올라갈 섹션으로 표시된다', () => {
    mockBaseHooks();

    render(<MyHomePageClient />);

    // CSS order 의 타깃(globals.css). 이 표식이 빠지면 첫 화면에 작업 입구가 다시 0개가 된다.
    const inbox = screen.getByRole('heading', { name: '받은 소식' }).closest('section');
    expect(inbox).toHaveAttribute('data-primary', 'true');
    // 한 화면에 하나만 -- 여럿이면 DOM 순서대로 붙어 아무것도 앞당겨지지 않는다.
    expect(document.querySelectorAll('[data-primary="true"]')).toHaveLength(1);
  });

  it('스태프에게는 "대회 운영"이 받은 소식 바로 다음에 선다', () => {
    mockBaseHooks();
    apiMocks.useV1MyTournamentStaffAssignments.mockReturnValue({
      data: { items: [{ tournamentId: 't-1', tournamentName: '주말 리그', role: 'staff' }] },
    });

    const { container } = render(<MyHomePageClient />);

    const headings = Array.from(container.querySelectorAll('.tm-my-section-label')).map((el) => el.textContent);
    expect(headings.slice(0, 2)).toEqual(['받은 소식', '대회 운영']);
  });

  it('문의하기는 설정과 한 서랍에 있다 — 1행짜리 자투리 섹션을 만들지 않는다', () => {
    mockBaseHooks();

    const { container } = render(<MyHomePageClient />);

    const settings = screen.getByRole('heading', { name: '설정·문의' }).closest('section');
    const settingsHrefs = Array.from(settings!.querySelectorAll('a.tm-my-menu-row')).map((el) => el.getAttribute('href'));
    expect(settingsHrefs).toContain('/my/inquiries');
    // 옛 '문의' 섹션이 되살아나면(중복 추가 코드 복귀) 라벨이 하나 더 생긴다.
    const headings = Array.from(container.querySelectorAll('.tm-my-section-label')).map((el) => el.textContent);
    expect(headings).not.toContain('문의');
  });
});

describe('중복 표기 정리 — 같은 사실을 두 번 세지 않는다', () => {
  it('활동 요약의 첫 라벨이 카드 제목("활동")과 겹치지 않는다', () => {
    mockBaseHooks();
    apiMocks.useV1MyActivitySummary.mockReturnValue({
      data: { totals: { activityCount: 4, teamCount: 2, mannerScore: 4.7 }, monthly: { matchCount: 1, winRate: 50 } },
    });

    render(<MyHomePageClient />);

    expect(screen.getByText('전체 활동')).toBeInTheDocument();
    // 제목과 첫 KPI 라벨이 같은 단어면 "활동 / 활동 / 4회"로 겹쳐 읽힌다.
    expect(screen.getAllByText('활동')).toHaveLength(1);
  });

  it('매너 점수에 만점을 함께 적는다 — 카드의 100점 환산과 다른 사실로 읽히지 않게', () => {
    mockBaseHooks();
    apiMocks.useV1MyActivitySummary.mockReturnValue({
      data: { totals: { activityCount: 4, teamCount: 2, mannerScore: 4.7 }, monthly: { matchCount: 1, winRate: 50 } },
    });

    render(<MyHomePageClient />);

    expect(screen.getByText('/5')).toBeInTheDocument();
  });

  it('활동 요약이 아직 없으면 만점 표기도 붙이지 않는다', () => {
    mockBaseHooks();

    render(<MyHomePageClient />);

    expect(screen.queryByText('/5')).not.toBeInTheDocument();
  });
});
