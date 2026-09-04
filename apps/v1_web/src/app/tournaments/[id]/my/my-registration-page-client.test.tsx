import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShellOverrideForRoute } from '@/components/v1-ui/shell-override';
import type { V1MyTeam, V1TournamentDetail, V1TournamentRegistration } from '@/types/api';
import { MyRegistrationPageClient } from './my-registration-client';

const myRegistrationApiMocks = vi.hoisted(() => ({
  useV1Tournament: vi.fn(),
  useV1MyRegistrations: vi.fn(),
  useV1TournamentPlayers: vi.fn(),
  useV1CancelRegistrationRequest: vi.fn(),
  useV1WithdrawCancelRegistrationRequest: vi.fn(),
  useV1Team: vi.fn(),
  useV1MyTeams: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...myRegistrationApiMocks,
}));

// `?reg=` 유무로 셸 backHref가 갈리는 테스트를 위해 가변 변수로 뺀다 —
// admin/content/page.test.tsx / apply 쪽 테스트와 동일 관례.
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/tournament-1/my',
  useSearchParams: () => searchParams,
}));

// useShellOverride가 렌더 단계에서 모듈 스코프 store에 밀어넣은 값을 읽어 화면에 텍스트로
// 노출한다 — app-shell-frame.test.tsx가 이미 검증한 AppShellFrame 배선은 다시 세우지 않고,
// 이 컴포넌트가 실제로 어떤 backHref 값을 미는지만 검증한다.
function BackHrefProbe() {
  const { backHref } = useShellOverrideForRoute('/tournaments/tournament-1/my');
  return <div data-testid="probe-backhref">{backHref ?? '(table-default)'}</div>;
}

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function makeTournament(overrides: Partial<V1TournamentDetail> = {}): V1TournamentDetail {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    status: 'open',
    format: 'knockout',
    kind: 'regular_tournament',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: null,
    bracketPublishScheduledAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    latitude: null,
    longitude: null,
    coverImageUrl: null,
    teamCount: 8,
    minPlayers: 5,
    maxPlayers: 10,
    genderCategory: null,
    genderMinMale: null,
    genderMaxMale: null,
    genderMinFemale: null,
    genderMaxFemale: null,
    entryFee: 0,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    campaignSlug: null,
    rulesText: null,
    yellowAccumulationLimit: null,
    redCardSuspensionMatches: null,
    refundPolicyText: null,
    confirmedCount: 0,
    participantTeams: [],
    pendingPaymentCount: 0,
    groups: [],
    fixtures: [],
    leagueFixtures: [],
    announcements: [],
    sponsors: [],
    reviews: [],
    reviewsTotalCount: 0,
    awards: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTeam(overrides: Partial<V1MyTeam> = {}): V1MyTeam {
  return {
    teamId: 'team-1',
    membershipId: 'membership-1',
    name: '성수 풋살 크루',
    role: 'owner',
    status: 'active',
    logoUrl: null,
    sport: { sportId: 'sport-futsal', name: '풋살' },
    region: { regionId: 'region-seoul', name: '서울', parentName: null },
    memberCount: 12,
    canManage: true,
    canCreateTeamMatch: true,
    detailRoute: '/teams/team-1',
    manageRoute: '/teams/team-1/members',
    ...overrides,
  };
}

function makeRegistration(overrides: Partial<V1TournamentRegistration> = {}): V1TournamentRegistration {
  return {
    id: 'registration-1',
    tournamentId: 'tournament-1',
    teamId: 'team-1',
    teamName: '성수 풋살 크루',
    appliedByUserId: 'user-1',
    status: 'confirmed',
    depositorName: '홍길동',
    agreedRules: true,
    agreedPrivacy: true,
    agreedRefund: true,
    agreedMediaConsent: false,
    confirmedAt: '2026-07-01T00:00:00.000Z',
    rosterLockedAt: null,
    rosterDeadlineOverrideAt: null,
    cancelRequestedAt: null,
    cancelReason: null,
    playerCount: 0,
    payment: null,
    paymentInstructions: null,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

// route-chrome 테이블(fragments/tournaments-extra.ts)의 backHref는 이 라우트에서 항상
// '/tournaments/tournament-1'(대회 상세) 고정값이다 — `?reg=`로 특정 신청 상세
// (RegistrationDetailView)를 보는 중일 때는 셸 topbar 뒤로가기가 같은 라우트의 목록
// (쿼리 없는 /tournaments/tournament-1/my)으로 가야 한다. 이 분기가 깨지면(예: reg 유무를
// 읽지 않게 되면) 아래 두 단언 중 하나가 red가 된다.
describe('MyRegistrationPageClient — 셸 backHref override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();

    myRegistrationApiMocks.useV1Tournament.mockReturnValue({ data: makeTournament(), isLoading: false });
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({ data: { items: [makeTeam()] }, isLoading: false });
    myRegistrationApiMocks.useV1TournamentPlayers.mockReturnValue({ data: { players: [], belowMinimum: false } });
    myRegistrationApiMocks.useV1CancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1WithdrawCancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1Team.mockReturnValue({ data: undefined });
  });

  // Probe를 페이지와 형제로 한 트리에 같이 렌더하면 useSyncExternalStore가 마운트 직후
  // 자체 재확인 과정에서 "다른 컴포넌트 렌더 중 setState" 경고를 낼 수 있다(프로덕션
  // 배선인 app-shell-frame.tsx는 AppShellFrame이 항상 페이지의 조상이라 이 문제가 없다).
  // 페이지를 먼저 완전히 커밋시킨 뒤(store가 이미 갱신된 상태) Probe를 별도 act로 마운트해
  // 첫 렌더에서 바로 최신 값을 읽게 한다.
  it('참가비가 없는 대회의 목록 카드에는 결제 문구가 하나도 없다', () => {
    // 무료 대회인데 카드 메타가 "무료 · 결제 완료" 로 나왔다 — 내지도 않은 돈이 "완료" 됐다는
    // 말이라 참가자에게 의미가 없다(2026-09-04, 결함 #6 후속). 참가 확정 여부는 상태 배지가 말한다.
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration({
        payment: { method: 'bank_transfer', status: 'paid', amount: 0, paidAt: '2026-09-04T00:00:00.000Z' },
      })],
      isLoading: false,
      isError: false,
      error: null,
    });

    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    const text = container.textContent ?? '';
    for (const word of ['결제', '계좌이체', '카드 · 간편결제', '입금']) {
      expect(text).not.toContain(word);
    }
  });

  it('참가비가 있는 대회의 목록 카드에는 결제 수단·상태가 그대로 나온다 (위 부재 단언이 공허하지 않음을 증명)', () => {
    // 부재 단언만 있으면 "카드가 아예 안 그려져도" 통과한다. 같은 렌더 경로에서 유료일 때는
    // 그 문자열들이 **실제로 나타나는지**를 함께 못 박는다.
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ entryFee: 20000 }),
      isLoading: false,
    });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration({
        payment: { method: 'bank_transfer', status: 'paid', amount: 20000, paidAt: '2026-09-04T00:00:00.000Z' },
      })],
      isLoading: false,
      isError: false,
      error: null,
    });

    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    const text = container.textContent ?? '';
    expect(text).toContain('계좌이체');
    expect(text).toContain('결제 완료');
  });

  it('`?reg=` 없이 진입하면(목록 뷰) override를 밀어넣지 않아 테이블 기본값(대회 상세)이 유지된다', () => {
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration()],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    const probe = render(<BackHrefProbe />);

    expect(probe.getByTestId('probe-backhref')).toHaveTextContent('(table-default)');
  });

  it('`?reg=X`로 진입하면(신청 상세 뷰) backHref override가 쿼리 없는 목록 뷰를 가리킨다', () => {
    searchParams = new URLSearchParams('reg=registration-1');
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration()],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    const probe = render(<BackHrefProbe />);

    expect(probe.getByTestId('probe-backhref')).toHaveTextContent('/tournaments/tournament-1/my');
  });

  it('`?reg=`가 존재하지 않는 신청을 가리키면(만료/오타) 목록 뷰로 폴백하고 backHref도 테이블 기본값으로 유지된다', () => {
    searchParams = new URLSearchParams('reg=does-not-exist');
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration()],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    const probe = render(<BackHrefProbe />);

    expect(probe.getByTestId('probe-backhref')).toHaveTextContent('(table-default)');
  });
});
