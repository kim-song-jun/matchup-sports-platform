import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// useShellOverride가 레이아웃 이펙트에서 모듈 스코프 store에 게시한 값을 읽어 화면에 텍스트로
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

  // 페이지를 먼저 완전히 커밋시켜 레이아웃 이펙트가 store에 게시하게 한 뒤 Probe를 별도로
  // 마운트한다 — Probe가 첫 렌더에서 바로 최신 값을 읽는다.
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

  it('정규 리그 신청 허브에는 거울 teamCount 정원 요약을 표시하지 않는다', () => {
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ kind: 'regular_league', status: 'in_progress', registrationDeadlineAt: '2099-08-10T14:59:00.000Z', teamCount: 8, confirmedCount: 2, pendingPaymentCount: 1 }),
      isLoading: false,
    });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({ data: [], isLoading: false, isError: false, error: null });
    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    expect(container.textContent).not.toContain('정원');
    expect(container.textContent).not.toContain('더 신청할 수 있어요');
  });

  it('신청 허브 제목은 리그면 "팀별 리그 참가", 대회면 "팀별 대회 신청"이다', () => {
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({ data: [], isLoading: false, isError: false, error: null });
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ kind: 'regular_league', status: 'in_progress' }),
      isLoading: false,
    });
    const league = render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    expect(league.getByText('팀별 리그 참가')).toBeInTheDocument();
    expect(league.queryByText('팀별 대회 신청')).toBeNull();
    league.unmount();

    myRegistrationApiMocks.useV1Tournament.mockReturnValue({ data: makeTournament(), isLoading: false });
    const tournament = render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    expect(tournament.getByText('팀별 대회 신청')).toBeInTheDocument();
    expect(tournament.queryByText('팀별 리그 참가')).toBeNull();
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

/**
 * **#4 후속 — "수정 가능" 배지 오표시.**
 *
 * 이 카드는 잠금·신청상태만 보고 배지를 정했는데, 실제 명단 화면은 **대회 상태(완료·취소)와
 * 명단 제출 마감**도 본다. 그래서 마감이 지난 명단에 카드가 **초록 "수정 가능"** 을 달아
 * 두고, 눌러 들어가면 "제출 마감" 이라 아무것도 못 고치는 상태가 났다.
 * 두 화면이 **같은 헬퍼**(`isTournamentRosterMutable` · `getRosterDeadlineState`)를 쓰게 했다.
 */
describe('MyRegistrationPageClient — 명단 수정 가능 배지', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams('reg=registration-1');
  });

  function arrange(tournament: Partial<V1TournamentDetail>, registration: Partial<V1TournamentRegistration> = {}) {
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament(tournament),
      isLoading: false,
    });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration({ status: 'confirmed', ...registration })],
      isLoading: false,
      isError: false,
      error: null,
    });
  }

  it('명단 제출 마감이 지났으면 "수정 가능" 이라고 하지 않는다', () => {
    arrange({ rosterDeadlineAt: '2020-01-01T00:00:00.000Z' });

    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(container.textContent).toContain('제출 마감');
    expect(container.textContent).not.toContain('수정 가능');
    // **한 줄 안에서 두 말이 갈리지 않게** 표시 텍스트도 같은 조건을 쓴다 — 예전엔 이
    // 문구만 잠금 여부를 봐서, 마감이 지났는데 "등록 완료" 라고 적혀 있었다(Copilot 지적).
    expect(container.textContent).toContain('· 마감');
    expect(container.textContent).not.toContain('등록 완료');
    // **배지만 고치면 반쪽이다.** 편집 링크가 남아 있으면 눌러 들어가서 서버 409 를 만난다 —
    // 배지가 "못 고친다" 고 말하는데 버튼은 열려 있는 상태가 그 자체로 결함이다.
    expect(screen.queryByRole('link', { name: '선수 명단 수정하기' })).not.toBeInTheDocument();
  });

  it('어드민이 마감 예외를 줬으면 다시 "수정 가능" 이다 — 예외를 무시하면 안 된다', () => {
    arrange(
      { rosterDeadlineAt: '2020-01-01T00:00:00.000Z' },
      { rosterDeadlineOverrideAt: '2020-01-02T00:00:00.000Z' },
    );

    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(container.textContent).toContain('수정 가능');
    // 예외를 줬으면 **링크도 열려 있어야** 한다 — 배지만 되살리면 고칠 방법이 없다.
    expect(screen.getAllByRole('link', { name: '선수 명단 수정하기' }).length).toBeGreaterThan(0);
  });

  it('대회가 끝났으면 "수정 불가" 다', () => {
    arrange({ status: 'completed', rosterDeadlineAt: null });

    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(container.textContent).toContain('수정 불가');
    expect(container.textContent).not.toContain('수정 가능');
    expect(screen.queryByRole('link', { name: '선수 명단 수정하기' })).not.toBeInTheDocument();
  });

  it('마감 전이고 대회도 진행 중이면 그대로 "수정 가능" 이다 (회귀 방지)', () => {
    arrange({ rosterDeadlineAt: '2099-01-01T00:00:00.000Z' });

    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(container.textContent).toContain('수정 가능');
  });

  // 서버는 초안 정규 리그의 명단 수정을 허용한다. 이 카드가 판정에 `kind` 를 안 넘겨
  // 초안 리그를 "마감 · 수정 불가" 로 보여 줬다(사용자 제보 "참가 확정 뒤 명단 수정이 안 된다").
  it('초안 정규 리그는 "수정 가능" 이고 수정 링크가 열려 있다', () => {
    arrange({ kind: 'regular_league', status: 'draft' });

    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(container.textContent).toContain('수정 가능');
    expect(container.textContent).not.toContain('수정 불가');
    expect(container.textContent).not.toContain('· 마감');
    expect(screen.getAllByRole('link', { name: '선수 명단 수정하기' }).length).toBeGreaterThan(0);
  });

  it.each([
    ['초안 대회', { kind: 'regular_tournament', status: 'draft' }],
    ['종료 리그', { kind: 'regular_league', status: 'completed' }],
  ] as const)('대조군: %s는 "수정 불가" 다', (_label, tournament) => {
    arrange(tournament);

    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(container.textContent).toContain('수정 불가');
    expect(screen.queryByRole('link', { name: '선수 명단 수정하기' })).not.toBeInTheDocument();
  });

  // 링크 글자가 잠금만 봐서, 마감이 지났거나 대회가 끝나 못 고치는데도 "선수 수정" 이라고 썼다.
  it.each([
    ['명단 제출 마감 경과', { rosterDeadlineAt: '2020-01-01T00:00:00.000Z' }],
    ['종료 리그', { kind: 'regular_league', status: 'completed' }],
  ] as const)('못 고치는 명단(%s)의 링크는 읽기 전용 글자를 쓴다', (_label, tournament) => {
    arrange(tournament);

    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    const link = screen.getByRole('link', { name: '선수 명단 확인하기' });
    expect(link).toHaveTextContent('명단 확인');
    expect(container.textContent).not.toContain('선수 수정');
  });

  it('대조군: 고칠 수 있는 명단의 링크는 그대로 "선수 수정" 이다', () => {
    arrange({ kind: 'regular_league', status: 'draft' });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    for (const link of screen.getAllByRole('link', { name: '선수 명단 수정하기' })) {
      expect(link).toHaveTextContent('선수 수정');
    }
  });
});

/** W8-V2 — 종료된 리그의 "내 신청"에 [참가 취소 요청]이 남아 있었다. 서버도 409 `TOURNAMENT_ENDED` 로 막는다. */
describe('MyRegistrationPageClient — 참가 취소 요청 버튼', () => {
  beforeEach(() => {
    searchParams = new URLSearchParams('reg=registration-1');
  });

  function arrange(tournament: Partial<V1TournamentDetail>) {
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({ data: makeTournament(tournament), isLoading: false });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration({ status: 'confirmed' })],
      isLoading: false,
      isError: false,
      error: null,
    });
  }

  it.each([
    ['진행 중 대회', { status: 'in_progress' }],
    ['진행 중 리그', { kind: 'regular_league', status: 'in_progress' }],
  ] as const)('대조군: %s에서는 보인다', (_label, tournament) => {
    arrange(tournament);
    render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    expect(screen.getAllByRole('button', { name: '참가 취소 요청' }).length).toBeGreaterThan(0);
  });

  it.each([
    ['종료 대회', { status: 'completed' }],
    ['취소된 대회', { status: 'cancelled' }],
    ['종료 리그', { kind: 'regular_league', status: 'completed' }],
  ] as const)('%s에서는 숨긴다', (_label, tournament) => {
    arrange(tournament);
    render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    expect(screen.queryByRole('button', { name: '참가 취소 요청' })).not.toBeInTheDocument();
  });
});

/**
 * W7-V1 — 멤버가 연 "내 신청" 패스 카드는 열린 명단을 "10명 · 마감" 이라 했고, 같은 화면 레일은 "수정 가능" 이었다.
 * 못 고치는 이유가 마감(누구나)인지 권한(멤버만)인지 갈라, 패스 카드와 레일이 한 판정을 본다.
 */
describe('MyRegistrationPageClient — 멤버가 보는 명단 상태', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams('reg=registration-1');
    myRegistrationApiMocks.useV1TournamentPlayers.mockReturnValue({
      data: { players: Array.from({ length: 10 }, (_, index) => ({ id: `player-${index}` })), belowMinimum: false },
    });
    myRegistrationApiMocks.useV1CancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1WithdrawCancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1Team.mockReturnValue({ data: undefined });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration({ status: 'confirmed' })],
      isLoading: false,
      isError: false,
      error: null,
    });
  });

  function arrange(role: V1MyTeam['role'], tournament: Partial<V1TournamentDetail>) {
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({
      data: { items: [makeTeam({ role, canManage: role !== 'member' })] },
      isLoading: false,
    });
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({ data: makeTournament(tournament), isLoading: false });
    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    const rail = screen.getByRole('complementary', { name: '신청 요약' });
    return { text: container.textContent ?? '', railText: rail.textContent ?? '' };
  }

  const OPEN_DRAFT_LEAGUE = { kind: 'regular_league', status: 'draft' } as const;

  it('열린 명단을 멤버가 보면 "마감" 이 아니라 등록 수와 [명단 보기] 다', () => {
    const { text, railText } = arrange('member', OPEN_DRAFT_LEAGUE);

    expect(text).toContain('10명 등록 완료');
    expect(text).not.toContain('· 마감');
    expect(screen.getByRole('link', { name: '선수 명단 보기' })).toHaveTextContent('명단 보기');
    expect(screen.queryByRole('link', { name: '선수 명단 수정하기' })).not.toBeInTheDocument();
    // 레일도 같은 판정 — 멤버에게 "수정 가능" 은 고칠 수 없는 사람에게 고칠 수 있다고 하는 말이다.
    expect(railText).toContain('팀장에게 요청');
    expect(railText).not.toContain('수정 가능');
  });

  it('대조군: 팀장은 같은 명단에서 "수정 가능" 과 [선수 수정] 이다', () => {
    const { text, railText } = arrange('owner', OPEN_DRAFT_LEAGUE);

    expect(text).toContain('10명 등록 완료');
    expect(screen.getAllByRole('link', { name: '선수 명단 수정하기' }).length).toBeGreaterThan(0);
    expect(railText).toContain('수정 가능');
    expect(railText).not.toContain('팀장에게 요청');
  });

  it('대조군: 실제로 마감된 명단은 멤버에게도 "마감" 이고 레일은 마감 사유를 말한다', () => {
    const { text, railText } = arrange('member', { rosterDeadlineAt: '2020-01-01T00:00:00.000Z' });

    expect(text).toContain('10명 · 마감');
    expect(text).not.toContain('등록 완료');
    expect(screen.getByRole('link', { name: '선수 명단 확인하기' })).toHaveTextContent('명단 확인');
    expect(railText).toContain('제출 마감');
    expect(railText).not.toContain('팀장에게 요청');
  });
});

// 대회 상세·재신청으로 이동하는 CTA 들이 from 을 어떻게 잇는지.
describe('MyRegistrationPageClient — 대회 상세·재신청 CTA 는 from 을 잇는다', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({ data: { items: [makeTeam()] }, isLoading: false });
    myRegistrationApiMocks.useV1TournamentPlayers.mockReturnValue({ data: { players: [], belowMinimum: false } });
    myRegistrationApiMocks.useV1CancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1WithdrawCancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1Team.mockReturnValue({ data: undefined });
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({ data: makeTournament(), isLoading: false });
  });

  it('신청 상세의 "대회 상세 보기" 는 받은 from 을 상세 URL 에 그대로 싣는다', () => {
    searchParams = new URLSearchParams({ reg: 'registration-1', from: '/home' });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration()],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    const expectedHref = `/tournaments/tournament-1?from=${encodeURIComponent('/home')}`;
    for (const link of screen.getAllByRole('link', { name: '대회 상세 보기' })) {
      expect(link).toHaveAttribute('href', expectedHref);
    }
  });

  // 명단에서 돌아올 때 받은 출처까지 담은 이 화면으로 오도록, 명단 링크가 현재 URL 을 출처로 싣는다.
  it('명단 링크는 받은 출처까지 담은 이 화면을 출처로 싣는다', () => {
    searchParams = new URLSearchParams({ reg: 'registration-1', from: '/home' });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration()],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    const rosterLinks = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.includes('/roster'));
    expect(rosterLinks.length).toBeGreaterThan(0);
    const expectedFrom = encodeURIComponent(`/tournaments/tournament-1/my?${new URLSearchParams({ reg: 'registration-1', from: '/home' }).toString()}`);
    for (const href of rosterLinks) expect(href.endsWith(`?from=${expectedFrom}`)).toBe(true);
  });

  it('대조군: from 이 없으면 "대회 상세 보기" 는 상세 경로만 쓴다', () => {
    searchParams = new URLSearchParams({ reg: 'registration-1' });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration()],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    for (const link of screen.getAllByRole('link', { name: '대회 상세 보기' })) {
      expect(link).toHaveAttribute('href', '/tournaments/tournament-1');
    }
  });

  it('"다시 신청하기" 는 이 화면 자신(쿼리 포함)을 apply 의 from 으로 싣는다', () => {
    searchParams = new URLSearchParams({ reg: 'registration-1' });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration({ status: 'draft' })],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    const expectedHref = `/tournaments/tournament-1/apply?from=${encodeURIComponent('/tournaments/tournament-1/my?reg=registration-1')}`;
    for (const link of screen.getAllByRole('link', { name: '다시 신청하기' })) {
      expect(link).toHaveAttribute('href', expectedHref);
    }
  });

  it('신청 목록을 못 불러왔을 때의 "대회 상세로 돌아가기" 도 받은 from 을 싣는다', () => {
    searchParams = new URLSearchParams({ from: '/home' });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('network'),
      refetch: vi.fn(),
    });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(screen.getByRole('link', { name: '대회 상세로 돌아가기' })).toHaveAttribute(
      'href',
      `/tournaments/tournament-1?from=${encodeURIComponent('/home')}`,
    );
  });
});

// W7-V4 — 리그 신청의 "내 신청" 레일 버튼이 "대회 상세 보기" 였다. 대회 쪽 "대회 상세 보기" 는 위 describe 가 지킨다.
describe('MyRegistrationPageClient — 리그는 "리그"라고 부른다', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    myRegistrationApiMocks.useV1TournamentPlayers.mockReturnValue({ data: { players: [], belowMinimum: false } });
    myRegistrationApiMocks.useV1CancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1WithdrawCancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1Team.mockReturnValue({ data: undefined });
  });

  it('리그 신청 상세의 상세 버튼은 레일·모바일 모두 "리그 상세 보기" 이고, 화면에 "대회" 가 없다', () => {
    searchParams = new URLSearchParams({ reg: 'registration-1' });
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({ data: { items: [makeTeam()] }, isLoading: false });
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ kind: 'regular_league', status: 'draft', title: 'QA 0930 test' }),
      isLoading: false,
    });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration()],
      isLoading: false,
      isError: false,
      error: null,
    });

    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    const links = screen.getAllByRole('link', { name: '리그 상세 보기' });
    expect(links).toHaveLength(2);
    // 리그 상세는 다른 화면과 같은 `/league-matches/:id` 다(대회 상세 경로는 리그 거울 화면).
    for (const link of links) expect(link).toHaveAttribute('href', '/league-matches/tournament-1');
    expect(container.textContent).not.toContain('대회');
  });

  it('리그 목록 뷰의 셸 뒤로가기도 리그 상세로 간다 — 테이블 기본값은 대회 상세라 리그만 덮는다', () => {
    searchParams = new URLSearchParams();
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({ data: { items: [makeTeam()] }, isLoading: false });
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ kind: 'regular_league', status: 'draft' }),
      isLoading: false,
    });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration()],
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    const probe = render(<BackHrefProbe />);

    expect(probe.getByTestId('probe-backhref')).toHaveTextContent('/league-matches/tournament-1');
  });

  it('신청을 받지 않는 리그의 팀 없음 안내도 "이 리그는" 이다', () => {
    searchParams = new URLSearchParams();
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({ data: { items: [] }, isLoading: false });
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ kind: 'regular_league', status: 'completed' }),
      isLoading: false,
    });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({ data: [], isLoading: false, isError: false, error: null });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(screen.getByText('이 리그는 지금 참가 신청을 받지 않아요.')).toBeInTheDocument();
  });

  it('리그 종목에 맞는 팀이 없으면 "이 리그에 신청할 수 있는 팀이 없어요" — 신청 화면과 같은 문구다', () => {
    searchParams = new URLSearchParams();
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({
      data: { items: [makeTeam({ sport: { sportId: 'sport-running', name: '러닝' } })] },
      isLoading: false,
    });
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ kind: 'regular_league', status: 'draft' }),
      isLoading: false,
    });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({ data: [], isLoading: false, isError: false, error: null });

    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(screen.getByText('이 리그에 신청할 수 있는 팀이 없어요')).toBeInTheDocument();
    expect(container.textContent).not.toContain('대회');
  });
});

/** 팀 권한 조회(`/me/teams`)의 실패·로딩을 "권한 없음" 과 구분한다 (#1442). */
describe('MyRegistrationPageClient — 팀 권한 조회 상태 구분', () => {
  const refetchTeams = vi.fn();
  const refetchRegistrations = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams('reg=registration-1');
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ rosterDeadlineAt: '2099-01-01T00:00:00.000Z' }),
      isLoading: false,
    });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration()],
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchRegistrations,
    });
    myRegistrationApiMocks.useV1TournamentPlayers.mockReturnValue({ data: { players: [], belowMinimum: false } });
    myRegistrationApiMocks.useV1CancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1WithdrawCancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1Team.mockReturnValue({ data: undefined });
  });

  it('팀 조회가 실패하면 권한 없음 대신 오류 안내와 다시 시도 버튼을 보여 준다', async () => {
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network'),
      refetch: refetchTeams,
    });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent('팀 정보를 불러오지 못했어요');
    expect(screen.queryByText('권한 필요')).toBeNull();
    expect(screen.queryByRole('link', { name: '선수 명단 수정하기' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(refetchTeams).toHaveBeenCalledTimes(1);
  });

  it('다시 시도가 성공하면 전체 새로고침 없이 수정 링크가 나타난다', () => {
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network'),
      refetch: refetchTeams,
    });
    const view = render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    expect(screen.queryByRole('link', { name: '선수 명단 수정하기' })).toBeNull();

    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({
      data: { items: [makeTeam({ role: 'owner' })] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchTeams,
    });
    view.rerender(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getAllByRole('link', { name: '선수 명단 수정하기' }).length).toBeGreaterThan(0);
  });

  it('조회에 성공했지만 멤버 권한이면 오류가 아니라 수정 링크만 숨는다 (대조군)', () => {
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({
      data: { items: [makeTeam({ role: 'member', canManage: false })] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: refetchTeams,
    });

    render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('link', { name: '선수 명단 수정하기' })).toBeNull();
  });

  it('조회 중에는 권한 판정 없이 로딩 상태만 보인다', () => {
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: refetchTeams,
    });

    const { container } = render(<MyRegistrationPageClient tournamentId="tournament-1" />);

    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(container.textContent).not.toContain('권한');
  });
});

describe('MyRegistrationPageClient — payment_checking 안내는 참가비 유무를 따른다 (#1428)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams({ reg: 'registration-1' });
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({ data: { items: [makeTeam()] }, isLoading: false });
    myRegistrationApiMocks.useV1TournamentPlayers.mockReturnValue({ data: { players: [], belowMinimum: false } });
    myRegistrationApiMocks.useV1CancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1WithdrawCancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1Team.mockReturnValue({ data: undefined });
  });

  function renderPaymentChecking(entryFee: number) {
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({ data: makeTournament({ entryFee }), isLoading: false });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration({
        status: 'payment_checking',
        payment: { method: 'bank_transfer', status: 'paid', amount: entryFee, paidAt: '2026-09-04T00:00:00.000Z' },
      })],
      isLoading: false,
      isError: false,
      error: null,
    });
    return render(<MyRegistrationPageClient tournamentId="tournament-1" />);
  }

  it('무료 대회는 입금이 있었다고 말하지 않고 신청 접수 후 운영진 확인 대기를 말한다', () => {
    const { container } = renderPaymentChecking(0);
    const text = container.textContent ?? '';
    expect(text).not.toContain('입금이 확인됐어요');
    expect(text).toContain('신청이 접수됐어요. 운영자가 선수 명단과 참가 조건을 확인하고 있어요.');
  });

  it('대조군: 유료 대회는 기존대로 입금이 확인됐다고 말한다', () => {
    const { container } = renderPaymentChecking(20000);
    const text = container.textContent ?? '';
    expect(text).toContain('입금이 확인됐어요. 운영자가 선수 명단과 참가 조건을 확인하고 있어요.');
    expect(text).not.toContain('신청이 접수됐어요. 운영자가');
  });
});

describe('#1535 실제 선택 신청 카드의 대회 KST 일정', () => {
  const originalTimezone = process.env.TZ;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TZ = 'UTC';
    searchParams = new URLSearchParams('reg=registration-1&from=%2Ftournaments%2Ftournament-1');
    myRegistrationApiMocks.useV1MyTeams.mockReturnValue({ data: { items: [makeTeam()] }, isLoading: false });
    myRegistrationApiMocks.useV1TournamentPlayers.mockReturnValue({ data: { players: [], belowMinimum: false } });
    myRegistrationApiMocks.useV1CancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1WithdrawCancelRegistrationRequest.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    myRegistrationApiMocks.useV1Team.mockReturnValue({ data: undefined });
  });
  afterEach(() => {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  });

  function arrangeSchedule(start: string | null, end: string | null, status: V1TournamentRegistration['status'] = 'confirmed') {
    myRegistrationApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ scheduledAt: start, scheduledEndAt: end }), isLoading: false,
    });
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration({ status })], isLoading: false, isError: false, error: null,
    });
    return render(<MyRegistrationPageClient tournamentId="tournament-1" />);
  }
  function scheduleRow() {
    // 실제 카드의 ‘일정’ 행을 검증한다. 다른 신청일/확정일 텍스트로 성공할 수 없다.
    return screen.getByText('일정', { exact: true }).parentElement!;
  }

  it.each(['awaiting_payment', 'confirmed', 'paid', 'waitlisted'] as const)('UTC 날짜 경계에서도 %s의 실제 카드 일정은 KST다', (status) => {
    arrangeSchedule('2026-10-02T15:30:00.000Z', null, status);
    expect(scheduleRow()).toHaveTextContent('10월 3일');
    expect(scheduleRow()).not.toHaveTextContent('10월 2일');
    expect(screen.getAllByText('테스트 대회', { exact: true }).length).toBeGreaterThan(0);
  });

  it.each(['UTC', 'America/Los_Angeles', 'Asia/Seoul'])('원 이슈의 현재 API ISO는 %s에서도 10/3으로 표시한다', (timezone) => {
    process.env.TZ = timezone;
    arrangeSchedule('2026-10-03T02:00:00.000Z', null);
    expect(scheduleRow()).toHaveTextContent('10월 3일');
    expect(scheduleRow()).not.toHaveTextContent('10월 2일');
  });

  it.each([
    ['2026-10-02T15:30:00Z', '2026-10-03T14:59:00Z', '10월 3일 (토)'],
    ['2026-10-02T15:30:00Z', '2026-10-03T15:30:00Z', '10월 3일 (토)~10월 4일 (일)'],
    ['2026-12-31T15:00:00Z', null, '1월 1일 (금)'],
    ['2026-10-03T11:00:00+09:00', null, '10월 3일 (토)'],
    ['2026-10-03T00:30', null, '10월 3일 (토)'],
    [null, '2026-10-04T02:00:00Z', '일정 미정'],
    ['invalid', null, '일정 미정'],
  ])('같은날/다른날/연말/offset/naive/미정 계약 (%s, %s)', (start, end, expected) => {
    const view = arrangeSchedule(start, end);
    expect(scheduleRow().textContent).toBe(`일정${expected}`);
    view.unmount();
    render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    expect(scheduleRow().textContent).toBe(`일정${expected}`);
  });

  it('일정 변경과 구별하여 신청일·확정일·결제일과 실제 상세 링크를 보존한다', () => {
    const view = arrangeSchedule('2026-10-02T15:30:00Z', null);
    myRegistrationApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [makeRegistration({
        createdAt: '2026-09-28T12:00:00Z', confirmedAt: '2026-09-29T12:00:00Z',
        payment: { method: 'bank_transfer', status: 'paid', amount: 0, paidAt: '2026-09-30T12:00:00Z' },
      })], isLoading: false, isError: false, error: null,
    });
    view.unmount();
    render(<MyRegistrationPageClient tournamentId="tournament-1" />);
    expect(scheduleRow()).toHaveTextContent('10월 3일');
    expect(screen.getByText('신청일', { exact: true }).parentElement).toHaveTextContent('2026.09.28');
    expect(screen.getByText('확정일', { exact: true }).parentElement).toHaveTextContent('2026.09.29');
    expect(screen.getByText('결제일', { exact: true }).parentElement).toHaveTextContent('2026.09.30');
    for (const link of screen.getAllByRole('link', { name: '대회 상세 보기' })) {
      expect(link).toHaveAttribute('href', expect.stringContaining('/tournaments/tournament-1'));
    }
  });
});
