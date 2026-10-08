import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { V1TournamentDetail } from '@/types/api';
import { TournamentDetailPageClient } from './tournament-detail-client';

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const tournamentApiMocks = vi.hoisted(() => ({
  useV1Tournament: vi.fn(),
  useV1MyRegistrations: vi.fn(),
  useV1Reviews: vi.fn(),
  useV1MyTeams: vi.fn(() => ({ data: undefined, isPending: true })),
}));

// 기본값은 빈 파라미터라 기존 테스트 동작은 그대로다 — `?from=` 테스트만 갈아끼운다.
const searchParamsRef = vi.hoisted(() => ({ current: new URLSearchParams() }));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...tournamentApiMocks,
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/tournament-1',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => searchParamsRef.current,
}));

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
    entryFeeConfigured: true,
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

describe('TournamentDetailPageClient GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tournamentApiMocks.useV1MyRegistrations.mockReturnValue({ data: [] });
    tournamentApiMocks.useV1Reviews.mockReturnValue({
      data: undefined,
      isError: false,
      isPending: false,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it('tracks tournament_view once the tournament detail loads', async () => {
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith('tournament_view', { tournamentId: 'tournament-1' });
    });
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it('does not track tournament_view while the tournament is still loading', () => {
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('keeps the shared application contract in a regular-league rail without tournament capacity facts', async () => {
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({
        status: 'in_progress',
        kind: 'regular_league',
        entryFeeConfigured: false,
        registrationDeadlineAt: '2099-08-10T14:59:00.000Z',
        confirmedCount: 8,
        teamCount: 8,
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    const rail = screen.getByRole('complementary', { name: '리그 참가 신청' });
    expect(within(rail).getByRole('link', { name: '참가 신청하기' })).toHaveAttribute(
      'href', '/tournaments/tournament-1/my',
    );
    expect(within(rail).queryByText('정원')).not.toBeInTheDocument();
    expect(within(rail).queryByText('참가비')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '참가 신청' })).not.toBeInTheDocument();
  });

  describe('참가비 표시 — 설정된 리그만 그린다', () => {
    function renderTournament(overrides: Partial<V1TournamentDetail>) {
      tournamentApiMocks.useV1Tournament.mockReturnValue({
        data: makeTournament(overrides),
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<TournamentDetailPageClient tournamentId="tournament-1" />);
    }

    it.each([
      ['신청 접수 중', 'open'],
      ['진행 중', 'in_progress'],
    ] as const)('미설정 리그(%s)는 화면 어디에도 참가비와 "무료"를 그리지 않는다', async (_label, status) => {
      renderTournament({ kind: 'regular_league', status, entryFee: 0, entryFeeConfigured: false });

      await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
      expect(screen.queryByText('참가비')).not.toBeInTheDocument();
      expect(screen.queryByText('무료')).not.toBeInTheDocument();
    });

    it('설정된 리그는 0원이면 "무료", 금액이 있으면 금액을 그린다', async () => {
      renderTournament({ kind: 'regular_league', status: 'open', entryFee: 0, entryFeeConfigured: true });
      await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
      expect(screen.getAllByText('참가비').length).toBeGreaterThan(0);
      expect(screen.getAllByText('무료').length).toBeGreaterThan(0);
    });

    it('설정된 유료 리그는 금액을 그린다', async () => {
      renderTournament({ kind: 'regular_league', status: 'open', entryFee: 50000, entryFeeConfigured: true });
      await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
      expect(screen.getAllByText('50,000원').length).toBeGreaterThan(0);
      expect(screen.queryByText('무료')).not.toBeInTheDocument();
    });

    it('대조군: 대회는 참가비를 그대로 그린다 (무료·유료)', async () => {
      renderTournament({ kind: 'regular_tournament', status: 'open', entryFee: 20000, entryFeeConfigured: true });
      await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
      expect(screen.getAllByText('20,000원').length).toBeGreaterThan(0);
    });
  });
});

// 벤치마크 감사(P0 ①): "참가 전 꼭 확인해 주세요" 체크리스트의 고정 문구("환불 불가" 등)와
// 운영자가 대회별로 쓰는 refundPolicyText가 같은 화면에서 서로 다른 말을 했다 — 운영자
// 정책이 있으면 그 항목들을 빼고, 없으면 고정문구가 fallback으로 남는다(2026-09-15 사용자 결정).
describe('TournamentDetailPageClient — 참가 전 유의사항과 환불 정책의 모순 해소', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tournamentApiMocks.useV1MyRegistrations.mockReturnValue({ data: [] });
    tournamentApiMocks.useV1Reviews.mockReturnValue({
      data: undefined,
      isError: false,
      isPending: false,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it('운영자가 환불 정책을 직접 썼으면 고정 환불 문구(환불 불가·주최 취소·대회 연기)는 빠지고 운영자 문구만 보인다', async () => {
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ refundPolicyText: '경기 시작 48시간 전까지 100% 환불, 24시간 전까지 50% 환불됩니다.' }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    expect(screen.getByText(/경기 시작 48시간 전까지 100% 환불/)).toBeInTheDocument();
    expect(screen.queryByText('환불 불가')).not.toBeInTheDocument();
    expect(screen.queryByText('주최 취소')).not.toBeInTheDocument();
    expect(screen.queryByText('대회 연기')).not.toBeInTheDocument();
    // 환불이 아니라 자격 문제인 항목은 운영자 정책과 무관하게 그대로 남는다(모바일+데스크톱 두 사본).
    expect(screen.getAllByText('노쇼 실격').length).toBeGreaterThan(0);
  });

  it('운영자가 환불 정책을 안 썼으면 기존 고정 문구가 그대로 fallback으로 남는다', async () => {
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ refundPolicyText: null }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    // 모바일 하단 카드가 데스크톱 클래스 은닉과 무관하게 jsdom에는 항상 그려지므로,
    // 존재 자체(개수 ≥1)만 본다 — 이 테스트의 관심사는 fallback이 여전히 나오는가다.
    expect(screen.getAllByText('환불 불가').length).toBeGreaterThan(0);
    expect(screen.getAllByText('주최 취소').length).toBeGreaterThan(0);
    expect(screen.getAllByText('대회 연기').length).toBeGreaterThan(0);
  });
});

// alpha 실측(2026-09-24): 데스크톱 "대회 목록으로" 헤더 링크가 항상 href="/tournaments"로
// 고정돼 있었다 — 홈/활동기록 등 어디서 들어왔든 뒤로가기가 전체 대회 목록으로만
// 나갔다(MD-QA #15 후속).
describe('TournamentDetailPageClient — 뒤로가기 출처(?from=)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tournamentApiMocks.useV1MyRegistrations.mockReturnValue({ data: [] });
    tournamentApiMocks.useV1Reviews.mockReturnValue({
      data: undefined,
      isError: false,
      isPending: false,
      isFetching: false,
      refetch: vi.fn(),
    });
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    searchParamsRef.current = new URLSearchParams();
  });

  it('?from=이 있으면 그 화면으로 돌아간다', async () => {
    searchParamsRef.current = new URLSearchParams('from=%2Fhome');

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/home');
  });

  it('?from=이 없으면 전체 대회 목록으로 돌아간다', async () => {
    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    expect(screen.getByRole('link', { name: '뒤로가기' })).toHaveAttribute('href', '/tournaments');
  });

  // 상세 → 대진·결과 → 뒤로 → 상세 → 뒤로가 처음 출처(홈)까지 이어져야 한다.
  it('받은 출처가 있으면 대진·결과 링크에 그 출처까지 담은 상세 URL 을 싣는다', async () => {
    searchParamsRef.current = new URLSearchParams('from=%2Fhome');

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    const childLinks = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => /^\/tournaments\/tournament-1\/(bracket|results|my)/.test(href));
    expect(childLinks.length).toBeGreaterThan(0);
    childLinks.forEach((href) => expect(href).toContain(`?from=${encodeURIComponent('/tournaments/tournament-1?from=%2Fhome')}`));
  });

  it('출처 없이 들어오면 대진·결과 링크는 기존 그대로다', async () => {
    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    const childLinks = screen
      .getAllByRole('link')
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => /^\/tournaments\/tournament-1\/(bracket|results|my)/.test(href));
    expect(childLinks.length).toBeGreaterThan(0);
    childLinks.forEach((href) => expect(href).not.toContain('from='));
  });
});

describe('TournamentDetailPageClient — 우리 팀 참가 카드(Task 180 R-1 A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.current = new URLSearchParams();
    window.localStorage.setItem('teameet.v1.userId', 'captain');
    tournamentApiMocks.useV1Tournament.mockReturnValue({ data: makeTournament(), isPending: false, isError: false, error: null, refetch: vi.fn() });
    tournamentApiMocks.useV1Reviews.mockReturnValue({ data: undefined, isError: false, isPending: false, isFetching: false, refetch: vi.fn() });
    tournamentApiMocks.useV1MyTeams.mockReturnValue({ data: { items: [{ teamId: 'team-a', role: 'owner', name: '마포 FC', logoUrl: null }] }, isPending: false } as never);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('신청이 있으면 제목 아래에서 참가 명단 화면으로 바로 보낸다', async () => {
    tournamentApiMocks.useV1MyRegistrations.mockReturnValue({
      data: [{ id: 'reg-1', teamId: 'team-a', teamName: '마포 FC', status: 'confirmed', rosterLockedAt: null, rosterDeadlineOverrideAt: null, playerCount: 7 }],
    });
    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    const title = await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    const heading = await screen.findByRole('heading', { level: 2, name: '우리 팀 참가' });
    expect(title.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('link', { name: '마포 FC 참가 명단 수정하기' })).toHaveAttribute(
      'href',
      `/tournaments/tournament-1/registrations/reg-1/roster?from=${encodeURIComponent('/tournaments/tournament-1')}`,
    );
  });

  it('신청이 없으면 카드가 없다', async () => {
    tournamentApiMocks.useV1MyRegistrations.mockReturnValue({ data: [] });
    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    expect(screen.queryByRole('heading', { name: '우리 팀 참가' })).not.toBeInTheDocument();
  });
});

describe('TournamentDetailPageClient — 리그 방식 일정', () => {
  function renderLeagueFormat(overrides: Partial<V1TournamentDetail>) {
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ status: 'in_progress', format: 'league', ...overrides }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<TournamentDetailPageClient tournamentId="tournament-1" />);
  }

  const tournamentFixture = {
    id: 'fx-1',
    groupId: 'group-1',
    round: '리그 1라운드',
    fixtureNumber: 1,
    legNumber: 1,
    status: 'scheduled',
    scheduledAt: '2099-10-09T01:00:00.000Z',
    venue: null,
    liveStatus: 'scheduled',
    homeRegistrationId: 'reg-1',
    homeTeamId: 'team-1',
    homeTeamName: '성수 FC',
    homeTeamLogoUrl: null,
    awayRegistrationId: 'reg-2',
    awayTeamId: 'team-2',
    awayTeamName: '마포 FC',
    awayTeamLogoUrl: null,
    result: null,
    videos: [],
  } as unknown as V1TournamentDetail['fixtures'][number];

  it('리그 방식 일반 대회는 대회 축 경기를 일정으로 그린다 (leagueFixtures 는 비어 있다)', async () => {
    renderLeagueFormat({
      kind: 'regular_tournament',
      groups: [{ id: 'group-1', name: 'BUFF 리그', phase: 'group', sortOrder: 0, advanceCount: null, groupTeams: [], standings: [] }],
      fixtures: [tournamentFixture],
      leagueFixtures: [],
    });

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    expect(screen.getByText('성수 FC')).toBeInTheDocument();
    expect(screen.getByText('마포 FC')).toBeInTheDocument();
    expect(screen.queryByText('아직 등록된 경기가 없어요')).not.toBeInTheDocument();
  });

  it('대조군: 경기가 없는 리그 방식 대회는 빈 상태 안내를 그린다', async () => {
    renderLeagueFormat({ kind: 'regular_tournament', fixtures: [], leagueFixtures: [] });

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    expect(screen.getByText('아직 등록된 경기가 없어요')).toBeInTheDocument();
  });

  it('대조군: 정규 리그는 리그 축 경기(leagueFixtures)로 일정을 그린다', async () => {
    renderLeagueFormat({
      kind: 'regular_league',
      fixtures: [],
      leagueFixtures: [
        {
          teamMatchId: 'tm-1',
          title: '리그 1라운드',
          homeTeamId: 'team-1',
          awayTeamId: 'team-2',
          startAt: '2099-10-09T01:00:00.000Z',
          placeName: '서울 풋살장',
          status: 'matched',
        },
      ],
    });

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    expect(screen.getByText('서울 풋살장')).toBeInTheDocument();
    expect(screen.queryByText('아직 등록된 경기가 없어요')).not.toBeInTheDocument();
  });
});

describe('TournamentDetailPageClient — 대회 종류별 진행 안내', () => {
  const tournamentLeagueSteps = [
    ['풀리그', '참가한 모든 팀이 서로 맞붙어요. 몇 번씩 맞붙는지는 대진표에서 확인할 수 있어요.'],
    ['순위 집계', '승점과 득실차로 최종 순위를 가려요.'],
    ['시상', '최종 순위에 따라 상금과 순위를 시상해요.'],
  ] as const;
  const seasonLeagueSteps = [
    ['풀리그', '참가한 모든 팀이 서로 맞붙어요. 맞붙는 횟수는 시즌 주차 수에 따라 달라져요.'],
    ['순위 집계', '승점과 득실차로 최종 순위를 가려요.'],
    ['시상', '최종 순위에 따라 상금과 순위를 시상해요.'],
  ] as const;
  const groupSteps = [
    ['조별 리그', '같은 조 팀끼리 돌아가며 맞붙어 조 안에서 순위를 가려요.'],
    ['결선 진출', '각 조 상위 팀이 결선 토너먼트에 올라가요.'],
    ['결선 토너먼트', '편성된 12강·8강·4강을 거쳐 결승에서 우승팀을 가려요. 부전승 팀은 경기 없이 다음 단계로 올라가요.'],
  ] as const;
  const knockoutSteps = [
    ['대진 편성', '참가 팀을 토너먼트 대진표에 배치해요.'],
    ['토너먼트', '단판 승부로 이긴 팀만 다음 라운드에 올라가요.'],
    ['결승 · 시상', '마지막까지 이긴 팀이 우승해요. 3·4위전도 함께 진행돼요.'],
  ] as const;

  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsRef.current = new URLSearchParams();
    window.localStorage.clear();
    tournamentApiMocks.useV1MyRegistrations.mockReturnValue({ data: [] });
    tournamentApiMocks.useV1MyTeams.mockReturnValue({ data: undefined, isPending: true });
    tournamentApiMocks.useV1Reviews.mockReturnValue({
      data: undefined, isError: false, isPending: false, isFetching: false, refetch: vi.fn(),
    });
  });

  it.each([
    { condition: '리그 방식 단발 대회', kind: 'regular_tournament', format: 'league', steps: tournamentLeagueSteps, formatLabel: '리그 방식 (풀리그)' },
    { condition: '종류가 비어 있는 리그 방식 단발 대회', kind: null, format: 'league', steps: tournamentLeagueSteps, formatLabel: '리그 방식 (풀리그)' },
    { condition: '리그 형식 정규 시즌', kind: 'regular_league', format: 'league', steps: seasonLeagueSteps, formatLabel: '리그 방식 (풀리그)' },
    { condition: '조별 형식 거울 행인 정규 시즌', kind: 'regular_league', format: 'group_knockout', steps: seasonLeagueSteps, formatLabel: '리그 방식 (풀리그)' },
    { condition: '토너먼트 형식 거울 행인 정규 시즌', kind: 'regular_league', format: 'knockout', steps: seasonLeagueSteps, formatLabel: '리그 방식 (풀리그)' },
    { condition: '조별 리그 후 토너먼트 단발 대회', kind: 'regular_tournament', format: 'group_knockout', steps: groupSteps, formatLabel: '조별 리그 후 토너먼트' },
    { condition: '종류가 비어 있는 조별 리그 후 토너먼트', kind: null, format: 'group_knockout', steps: groupSteps, formatLabel: '조별 리그 후 토너먼트' },
    { condition: '토너먼트 단발 대회', kind: 'regular_tournament', format: 'knockout', steps: knockoutSteps, formatLabel: '토너먼트 (단판 승부)' },
    { condition: '종류가 비어 있는 토너먼트', kind: null, format: 'knockout', steps: knockoutSteps, formatLabel: '토너먼트 (단판 승부)' },
  ] as const)('$condition의 실제 상세 안내를 선택해요', async ({ kind, format, steps, formatLabel }) => {
    // Given: API가 구분하는 대회 종류와 진행 방식을 실제 상세에 전달해요.
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ kind, format }),
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });

    // When: 참가자가 읽는 상세 페이지를 렌더해요.
    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    // Then: 형식 라벨과 기존 세 단계는 유지하고 시즌 주차 안내는 실제 정규 리그에만 보여요.
    const flow = within(await screen.findByRole('region', { name: '대회 진행 방식' }));
    expect(flow.getByText(formatLabel, { exact: true })).toBeInTheDocument();
    expect(flow.getAllByRole('listitem')).toHaveLength(3);
    steps.forEach(([title, body]) => {
      expect(flow.getByText(title, { exact: true })).toBeInTheDocument();
      expect(flow.getByText(body, { exact: true })).toBeInTheDocument();
    });
    if (kind !== 'regular_league') {
      expect(flow.queryByText(/시즌 주차 수/)).not.toBeInTheDocument();
    }
  });
});
