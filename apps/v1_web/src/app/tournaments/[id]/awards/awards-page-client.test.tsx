import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { V1LeagueOverallStandingsResponse, V1TournamentDetail } from '@/types/api';
import type { V1LeaguePlayerRecordRow } from '@/types/league-match';
import type { PublicTournamentPlayerRecordRow } from '@/components/public-game-records/types';
import { AwardsPageClient, ReviewFormModal } from './awards-page-client';

const { v1GetMock } = vi.hoisted(() => ({ v1GetMock: vi.fn() }));
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  v1Get: v1GetMock,
}));
// 다조·거울 리그가 아닌 기존 테스트들은 이 API를 호출하는지 신경 쓰지 않으므로,
// 항상 빈 응답을 기본값으로 둔다(호출돼도 top3:[]·championCount:1로 기존 동작과 동일).
const emptyOverallStandings: V1LeagueOverallStandingsResponse = {
  standings: [],
  progress: { total: 0, played: 0, remaining: 0, percent: 0 },
  magicNumber: null,
  recalculatedAt: null,
  champions: [],
  tieBreakGroups: [],
};
v1GetMock.mockResolvedValue(emptyOverallStandings);

const awardsApiMocks = vi.hoisted(() => ({
  useV1Tournament: vi.fn(),
  useV1LeagueMatchPlayerRecords: vi.fn((_leagueId: string) => ({
    data: {
      leagueId: 'tournament-1',
      goals: [] as V1LeaguePlayerRecordRow[],
      assists: [] as V1LeaguePlayerRecordRow[],
    },
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
  usePublicTournamentPlayerRecords: vi.fn((_tournamentId: string, _options?: { enabled?: boolean }) => ({
    data: { goals: [] as PublicTournamentPlayerRecordRow[], assists: [] as PublicTournamentPlayerRecordRow[] },
    isLoading: false,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...awardsApiMocks,
}));

vi.mock('@/components/public-game-records/use-public-game-records', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/public-game-records/use-public-game-records')>()),
  usePublicTournamentPlayerRecords: (tournamentId: string, options?: { enabled?: boolean }) =>
    awardsApiMocks.usePublicTournamentPlayerRecords(tournamentId, options),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/tournament-1/awards',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function makeCompletedTournament(overrides: Partial<V1TournamentDetail> = {}): V1TournamentDetail {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    status: 'completed',
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

describe('AwardsPageClient GA events', () => {
  const originalShare = navigator.share;
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.clearAllMocks();
    awardsApiMocks.usePublicTournamentPlayerRecords.mockReturnValue({
      data: { goals: [], assists: [] },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    awardsApiMocks.useV1LeagueMatchPlayerRecords.mockReturnValue({
      data: {
        leagueId: 'tournament-1',
        goals: [] as V1LeaguePlayerRecordRow[],
        assists: [] as V1LeaguePlayerRecordRow[],
      },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });

  it('tracks tournament_share with channel=native_share when the Web Share API is available', () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    fireEvent.click(screen.getByRole('button', { name: '결과 공유' }));

    expect(trackEvent).toHaveBeenCalledWith('tournament_share', { channel: 'native_share' });
    expect(shareMock).toHaveBeenCalled();
  });

  it('tracks tournament_share with channel=clipboard when the Web Share API is unavailable', () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextMock }, configurable: true });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    fireEvent.click(screen.getByRole('button', { name: '결과 공유' }));

    expect(trackEvent).toHaveBeenCalledWith('tournament_share', { channel: 'clipboard' });
    expect(writeTextMock).toHaveBeenCalled();
  });
});

describe('AwardsPageClient — regular league player records endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    awardsApiMocks.usePublicTournamentPlayerRecords.mockReturnValue({
      data: { goals: [], assists: [] },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament({ kind: 'regular_league' }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    awardsApiMocks.useV1LeagueMatchPlayerRecords.mockReturnValue({
      data: {
        leagueId: 'tournament-1',
        goals: [{ userId: 'user-1', nickname: '리그 득점자', goals: 3, assists: 0 }],
        assists: [{ userId: 'user-2', nickname: '리그 도움자', goals: 0, assists: 2 }],
      },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('uses the league player-records query and does not enable the tournament query', () => {
    render(<AwardsPageClient tournamentId="tournament-1" />);

    expect(awardsApiMocks.useV1LeagueMatchPlayerRecords).toHaveBeenCalledWith('tournament-1');
    expect(awardsApiMocks.usePublicTournamentPlayerRecords).toHaveBeenCalledWith('tournament-1', { enabled: false });
    expect(screen.getByText('리그 득점자')).toBeInTheDocument();
    expect(screen.getByText('리그 도움자')).toBeInTheDocument();
  });
});

describe('AwardsPageClient — 개인 기록 프로필 링크의 뒤로가기 출처(MD-QA #15)', () => {
  const FROM = '?from=%2Ftournaments%2Ftournament-1%2Fawards';

  beforeEach(() => {
    vi.clearAllMocks();
    awardsApiMocks.useV1LeagueMatchPlayerRecords.mockReturnValue({
      data: {
        leagueId: 'tournament-1',
        goals: [{ userId: 'league-scorer', nickname: '리그 득점자', goals: 3, assists: 0 }],
        assists: [{ userId: 'league-assister', nickname: '리그 도움자', goals: 0, assists: 2 }],
      },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    // 일반 대회 행은 서버가 profileHref를 출처 없이 내려준다.
    awardsApiMocks.usePublicTournamentPlayerRecords.mockReturnValue({
      data: {
        goals: [{ userId: 'cup-scorer', nickname: '대회 득점자', profileHref: '/users/cup-scorer', goals: 4, assists: 0 }] as PublicTournamentPlayerRecordRow[],
        assists: [{ userId: 'cup-assister', nickname: '대회 도움자', profileHref: '/users/cup-assister', goals: 0, assists: 1 }] as PublicTournamentPlayerRecordRow[],
      },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it.each([
    ['일반 대회', undefined, ['cup-scorer', 'cup-assister']],
    ['정규 리그', 'regular_league', ['league-scorer', 'league-assister']],
  ] as const)('%s 득점·도움 랭킹 링크가 시상 화면을 출처로 싣는다', (_label, kind, userIds) => {
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament(kind ? { kind } : {}),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AwardsPageClient tournamentId="tournament-1" />);

    const hrefs = screen
      .getAllByRole('link', { name: /공개 프로필 보기/ })
      .map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(userIds.map((id) => `/users/${id}${FROM}`)));
    expect(hrefs.filter((href) => href?.startsWith('/users/') && !href.includes('?from='))).toEqual([]);
  });
});

/**
 * 정규 리그 거울 행(kind==='regular_league') 시상 페이지 회귀 테스트.
 *
 * `getTopThree`는 거울 행에서 `tournament.groups`·`fixtures`가 항상 []라 팀 수와 무관하게
 * 항상 빈 배열을 낸다. 결과 페이지는 이미 `isLeagueMirror` 라우팅으로 통합 순위 API를
 * 타지만, 이 페이지는 그 체크가 없어 단일 시즌 리그가 완료돼도 시상대가 계속 비어
 * 있었다(실사용자 발견, 2026-09-16). 아래는 그 라우팅 수정과, 라우팅이 뚫린 뒤 드러나는
 * 공동 우승 데이터 손실(포디움 `.find`, 상금란 `teamByPos`)을 함께 검증한다.
 */
describe('AwardsPageClient — 정규 리그 거울 행(kind=regular_league)의 시상대·상금', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    awardsApiMocks.usePublicTournamentPlayerRecords.mockReturnValue({
      data: { goals: [], assists: [] },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    awardsApiMocks.useV1LeagueMatchPlayerRecords.mockReturnValue({
      data: { leagueId: 'tournament-1', goals: [], assists: [] },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('단일 시즌 거울 행은 groups가 비어 있어도 통합 순위 API로 시상대를 채운다(라우팅 수정)', async () => {
    const overall: V1LeagueOverallStandingsResponse = {
      standings: [
        { teamId: 'team-1', teamName: '풋살크루', position: 1, points: 3, wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 0 },
        { teamId: 'team-2', teamName: 'Tttt', position: 2, points: 0, wins: 0, draws: 0, losses: 1, goalsFor: 0, goalsAgainst: 3 },
      ],
      progress: { total: 1, played: 1, remaining: 0, percent: 100 },
      magicNumber: null,
      recalculatedAt: null,
      champions: [{ teamId: 'team-1', teamName: '풋살크루', teamLogoUrl: null }],
      tieBreakGroups: [],
    };
    v1GetMock.mockResolvedValueOnce(overall);
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament({ kind: 'regular_league', groups: [], fixtures: [] }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    await waitFor(() => expect(screen.getByText('풋살크루', { selector: '.tm-awards-podium-name' })).toBeInTheDocument());
    // caption은 "<strong>팀명</strong>, 우승을 축하드려요! 🎉" — 쉼표가 붙은 텍스트 노드라 정규식으로 부분 매칭한다.
    expect(screen.getByText(/우승을 축하드려요/)).toBeInTheDocument();
    expect(v1GetMock).toHaveBeenCalledWith('/tournaments/tournament-1/standings/overall');
  });

  /**
   * 실사용자 발견 결함(2026-09-16)과 같은 마포 레인저스 vs 풋살크루 완전 동률 재현
   * (results-page-client.test.tsx와 동일 데이터) — 라우팅이 뚫린 뒤에도 포디움이
   * `top3.find(pos===1)`로 하나만 집으면 공동 우승 팀 하나가 조용히 사라진다.
   */
  it('공동 우승이면 포디움 금메달 자리에 두 팀 이름을 함께 보여준다', async () => {
    const overall: V1LeagueOverallStandingsResponse = {
      standings: [
        { teamId: 'team-mapo', teamName: '마포 레인저스', position: 1, points: 1, wins: 0, draws: 1, losses: 0, goalsFor: 1, goalsAgainst: 1 },
        { teamId: 'team-futsal', teamName: '풋살크루', position: 2, points: 1, wins: 0, draws: 1, losses: 0, goalsFor: 1, goalsAgainst: 1 },
      ],
      progress: { total: 1, played: 1, remaining: 0, percent: 100 },
      magicNumber: null,
      recalculatedAt: null,
      champions: [
        { teamId: 'team-mapo', teamName: '마포 레인저스', teamLogoUrl: null },
        { teamId: 'team-futsal', teamName: '풋살크루', teamLogoUrl: null },
      ],
      tieBreakGroups: [{ teamIds: ['team-mapo', 'team-futsal'], teamNames: ['마포 레인저스', '풋살크루'] }],
    };
    v1GetMock.mockResolvedValueOnce(overall);
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament({ kind: 'regular_league', groups: [], fixtures: [] }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    await waitFor(() => expect(screen.getByText(/공동 우승이에요/)).toBeInTheDocument());
    expect(screen.getByText('마포 레인저스 · 풋살크루', { selector: '.tm-awards-podium-name' })).toBeInTheDocument();
  });

  it('공동 우승이고 상금이 걸려 있으면 1위 상금란에도 두 팀 이름을 함께 보여준다(한쪽만 남기지 않는다)', async () => {
    const overall: V1LeagueOverallStandingsResponse = {
      standings: [
        { teamId: 'team-mapo', teamName: '마포 레인저스', position: 1, points: 1, wins: 0, draws: 1, losses: 0, goalsFor: 1, goalsAgainst: 1 },
        { teamId: 'team-futsal', teamName: '풋살크루', position: 2, points: 1, wins: 0, draws: 1, losses: 0, goalsFor: 1, goalsAgainst: 1 },
      ],
      progress: { total: 1, played: 1, remaining: 0, percent: 100 },
      magicNumber: null,
      recalculatedAt: null,
      champions: [
        { teamId: 'team-mapo', teamName: '마포 레인저스', teamLogoUrl: null },
        { teamId: 'team-futsal', teamName: '풋살크루', teamLogoUrl: null },
      ],
      tieBreakGroups: [{ teamIds: ['team-mapo', 'team-futsal'], teamNames: ['마포 레인저스', '풋살크루'] }],
    };
    v1GetMock.mockResolvedValueOnce(overall);
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament({
        kind: 'regular_league',
        groups: [],
        fixtures: [],
        prizePool: 1000000,
        prizeBreakdown: '1위,1000000',
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    await waitFor(() => expect(screen.getByText('마포 레인저스 · 풋살크루', { selector: '.tm-awards-podium-name' })).toBeInTheDocument());
    // 상금란의 "1위" 행 — teamByPos가 Object.fromEntries였다면 마지막 팀(풋살크루)만
    // 남고 마포 레인저스는 조용히 사라졌을 것이다.
    expect(screen.getByText('마포 레인저스 · 풋살크루', { selector: 'div:not(.tm-awards-podium-name)' })).toBeInTheDocument();
  });
});

// 감사 evidence: 미완료 분기가 `tournament.prizeSummary` 존재만 봐서, prizePool·
// prizeBreakdown만 채우고 prizeSummary는 비운(스키마상 유효한 흔한 조합) 대회는
// 모집·진행 중에 상금 정보가 전혀 안 보이다가 완료 시점에야 나타나는 모순이 있었다.
// 완료 분기와 동일한 hasPrizeData() 판정을 쓰는지 직접 검증한다.
describe('AwardsPageClient — 완료 전 상금 정보 노출 (hasPrizeData 판정 일치)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('진행 중이라도 prizePool+prizeBreakdown만 있으면(prizeSummary 없이도) 상금 섹션을 보여준다', () => {
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament({
        status: 'in_progress',
        prizePool: 3000000,
        prizeSummary: null,
        prizeBreakdown: '1위,1500000\n2위,800000',
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    expect(screen.getByText('총 상금')).toBeInTheDocument();
  });

  it('진행 중이고 prizePool·prizeSummary·prizeBreakdown 전부 없으면 상금 섹션을 그리지 않는다', () => {
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament({
        status: 'in_progress',
        prizePool: null,
        prizeSummary: null,
        prizeBreakdown: null,
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    expect(screen.queryByText('총 상금')).not.toBeInTheDocument();
  });
});

// M-A 감사: 수상자 이름이 전부 일반 텍스트였고 /users/:id 로 가는 링크가 0건이었다
// (바로 위 개인 기록 섹션은 이미 같은 화면에서 그 링크를 공개하는데 어워드만 빠져
// 있었다). recipientUserId가 있을 때만 링크+아바타, 없으면 기존 아이콘 그대로.
describe('AwardsPageClient — 개인 어워드 수상자 프로필 링크(M-A)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    awardsApiMocks.usePublicTournamentPlayerRecords.mockReturnValue({
      data: { goals: [], assists: [] },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    awardsApiMocks.useV1LeagueMatchPlayerRecords.mockReturnValue({
      data: { leagueId: 'tournament-1', goals: [], assists: [] },
      isLoading: false,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('recipientUserId가 있으면 /users/:id 링크로 감싸고 아바타를 보여준다', () => {
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament({
        awards: [
          {
            id: 'award-1',
            awardType: 'mvp',
            awardLabel: 'MVP',
            iconKey: 'trophy',
            recipientName: 'tester',
            recipientUserId: 'user-59050e8a',
            recipientProfileImageUrl: null,
            teamName: 'A팀',
            note: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    const link = screen.getByRole('link', { name: 'MVP 수상자 tester 프로필 보기' });
    // 뒤로가기가 이 어워드 화면으로 돌아오도록 `?from=`을 함께 실어 보낸다(MD-QA #15).
    expect(link).toHaveAttribute('href', '/users/user-59050e8a?from=%2Ftournaments%2Ftournament-1%2Fawards');
    expect(link).toHaveTextContent('tester');
  });

  it('recipientUserId가 없으면(레거시/탈퇴 계정) 링크 없이 일반 텍스트로 남는다', () => {
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament({
        awards: [
          {
            id: 'award-2',
            awardType: 'top_scorer',
            awardLabel: '득점왕',
            iconKey: 'crown',
            recipientName: '이팀장',
            recipientUserId: null,
            recipientProfileImageUrl: null,
            teamName: 'B팀',
            note: null,
          },
        ],
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    expect(screen.getByText('이팀장')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /이팀장 프로필 보기/ })).not.toBeInTheDocument();
  });
});

// 감사 evidence: 이 바텀시트는 role=dialog·aria-modal만 선언하고 ESC·backdrop 닫기가
// onClose로 연결돼 있지 않았다(백드롭 클릭은 인라인 핸들러로 이미 동작했지만 ESC는
// 전혀 없었다) — 공용 `useModalA11y` 훅으로 옮긴 뒤 계약이 실제로 지켜지는지 검증한다.
describe('ReviewFormModal — 모달 a11y(useModalA11y) 배선', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ESC 키를 누르면 onClose가 호출된다', () => {
    const onClose = vi.fn();
    render(<ReviewFormModal tournamentId="tournament-1" onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('배경(backdrop)을 클릭하면 onClose가 호출되고, 패널 내부 클릭은 닫지 않는다', () => {
    const onClose = vi.fn();
    render(<ReviewFormModal tournamentId="tournament-1" onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog', { name: '리뷰 작성' }));
    expect(onClose).not.toHaveBeenCalled();

    // 백드롭은 dialog 패널의 부모 요소다.
    const backdrop = screen.getByRole('dialog', { name: '리뷰 작성' }).parentElement as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
