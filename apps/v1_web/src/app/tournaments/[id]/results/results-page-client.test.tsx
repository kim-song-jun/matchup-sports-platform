import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultsPageContent } from './results-page-client';
import type {
  V1LeagueOverallStandingsResponse,
  V1TournamentDetail,
  V1TournamentFixture,
  V1TournamentGroup,
  V1TournamentStanding,
} from '@/types/api';

const { v1GetMock } = vi.hoisted(() => ({ v1GetMock: vi.fn() }));
vi.mock('@/lib/api-client', () => ({ v1Get: v1GetMock }));

/**
 * 우승팀을 못 뽑는 완료 대회(리그전, 또는 결승 무승부)에서 등록된 경기 영상에
 * 접근할 방법이 아예 없었던 결함(감사 index 77)의 회귀 방지 테스트. 탭 네비가
 * `isCompleted && championName` 블록 안에 갇혀 있어 championName===null이면
 * `videosTotal>0`이어도 탭 자체가 렌더되지 않았다.
 */
function baseTournament(overrides: Partial<V1TournamentDetail> = {}): V1TournamentDetail {
  return {
    id: 'tour-1',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 리그',
    status: 'completed',
    format: 'league',
    // format 은 'league' 인데 kind 는 대회다 — 둘이 독립임을 픽스처에서도 유지한다
    kind: 'regular_tournament',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: '2026-01-01T00:00:00.000Z',
    bracketPublishScheduledAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    latitude: null,
    longitude: null,
    coverImageUrl: null,
    teamCount: 4,
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
    yellowAccumulationLimit: null,
    redCardSuspensionMatches: null,
    rulesText: null,
    refundPolicyText: null,
    confirmedCount: 4,
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

function leagueFixtureWithVideo(): V1TournamentFixture {
  return {
    id: 'fx-1',
    groupId: null,
    // 리그 대진은 항상 'league_r{N}' 라운드로 생성되고 'final'/'결승' 라운드가
    // 존재하지 않는다. 이 픽스처는 groups: []로 렌더되므로 최종 순위 정본
    // (groups[].standings)이 없어 championName은 계속 null이다.
    round: 'league_r1',
    fixtureNumber: 1,
    legNumber: 1,
    scheduledAt: null,
    venue: null,
    status: 'completed',
    liveStatus: 'ended',
    homeRegistrationId: null,
    homeTeamId: 'team-1',
    homeTeamName: '성수 FC',
    homeTeamLogoUrl: null,
    awayRegistrationId: null,
    awayTeamId: 'team-2',
    awayTeamName: '한강 유나이티드',
    awayTeamLogoUrl: null,
    result: {
      homeScore: 3,
      awayScore: 1,
      hasPenalty: false,
      homePenaltyScore: null,
      awayPenaltyScore: null,
      note: null,
      recordedAt: '2026-01-02T00:00:00.000Z',
      goals: [],
    },
    videos: [{ id: 'v-1', title: '하이라이트', url: 'https://example.com/v1' }],
  };
}

describe('ResultsPageContent — 우승팀 없는 완료 대회의 경기 영상 탭', () => {
  it('리그전(championName===null)이어도 영상이 있으면 "경기 영상" 탭이 보이고 진입할 수 있다', () => {
    const tournament = baseTournament({ fixtures: [leagueFixtureWithVideo()] });
    render(<ResultsPageContent tournament={tournament} />);

    const videosTab = screen.getByRole('button', { name: '경기 영상 1' });
    expect(videosTab).toBeInTheDocument();

    fireEvent.click(videosTab);
    // VideoGallerySection이 렌더되어야 한다 — 등록된 영상 제목이 화면에 보인다.
    expect(screen.getByText('하이라이트')).toBeInTheDocument();
  });

  it('영상이 없으면(videosTotal===0) 탭 자체를 렌더하지 않는다', () => {
    const tournament = baseTournament({ fixtures: [{ ...leagueFixtureWithVideo(), videos: [] }] });
    render(<ResultsPageContent tournament={tournament} />);

    expect(screen.queryByRole('button', { name: /경기 영상/ })).not.toBeInTheDocument();
  });
});

/**
 * 완료된 리그 방식(format='league') 대회의 최종결과 회귀 테스트. 이 화면은 원래
 * knockout 전용 'final'/'결승' 라운드 픽스처만 보고 우승팀·최종 순위를 계산해
 * 리그 대회에서는 항상 챔피언 히어로가 사라지고 "최종 순위가 아직 등록되지
 * 않았어요" 라는 거짓 안내가 떴다(순위 데이터는 groups[].standings에 이미 있었다).
 */
function standing(overrides: Partial<V1TournamentStanding> & Pick<V1TournamentStanding, 'registrationId' | 'teamName' | 'position'>): V1TournamentStanding {
  return {
    teamId: null,
    teamLogoUrl: null,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    recalculatedAt: null,
    ...overrides,
  };
}

function leagueGroup(overrides: Partial<V1TournamentGroup> & Pick<V1TournamentGroup, 'id' | 'name' | 'standings'>): V1TournamentGroup {
  return {
    phase: 'group',
    sortOrder: 0,
    advanceCount: null,
    groupTeams: [],
    ...overrides,
  };
}

describe('ResultsPageContent — 완료된 리그 방식 대회의 최종 순위', () => {
  it('단일 조 리그는 groups[].standings 1위를 우승팀 히어로로, 전체 순위를 최종 순위표로 그린다', () => {
    const tournament = baseTournament({
      groups: [
        leagueGroup({
          id: 'group-1',
          name: '통합조',
          standings: [
            standing({ registrationId: 'r-1', teamName: '성수 FC', position: 1, points: 10, wins: 3, draws: 1, losses: 0, goalsFor: 8, goalsAgainst: 2 }),
            standing({ registrationId: 'r-2', teamName: '한강 유나이티드', position: 2, points: 7 }),
            standing({ registrationId: 'r-3', teamName: '동작 레인저스', position: 3, points: 4 }),
          ],
        }),
      ],
    });

    render(<ResultsPageContent tournament={tournament} />);

    // 챔피언 히어로 — 데스크탑/모바일 둘 다 championName 게이트 안에 있다.
    expect(screen.getAllByText('성수 FC').length).toBeGreaterThan(0);
    expect(screen.queryByText('최종 순위가 아직 등록되지 않았어요.')).not.toBeInTheDocument();
    // 최종 순위표 — 2·3위도 함께 그려진다(우승팀만이 아니라 전체 순위).
    expect(screen.getByText('한강 유나이티드')).toBeInTheDocument();
    expect(screen.getByText('동작 레인저스')).toBeInTheDocument();
  });

  it('4위 밑 순위(예: 5위)를 "4위"로 잘못 라벨링하지 않고 실제 순위로 표기한다', () => {
    const tournament = baseTournament({
      groups: [
        leagueGroup({
          id: 'group-1',
          name: '통합조',
          standings: [1, 2, 3, 4, 5].map((pos) => standing({ registrationId: `r-${pos}`, teamName: `${pos}위팀`, position: pos })),
        }),
      ],
    });

    render(<ResultsPageContent tournament={tournament} />);

    expect(screen.getByText('5위')).toBeInTheDocument();
    // POS_CFG fallback이 항상 "4위"를 재사용했다면 5위팀 행에도 "4위"라는 라벨이
    // 하나 더 나타나 총 2개가 잡혔을 것이다.
    expect(screen.getAllByText('4위')).toHaveLength(1);
  });

  it('다조(2개 이상) 리그는 조별 standings를 병합하지 않고 통합 순위 API(GET /standings/overall) 결과를 최종 순위로 쓴다', async () => {
    const overall: V1LeagueOverallStandingsResponse = {
      standings: [
        { registrationId: 'r-b1', teamName: 'B조 1위팀', position: 1, points: 12, wins: 4, draws: 0, losses: 0, goalsFor: 10, goalsAgainst: 1, fairPlayPoints: 0 },
        { registrationId: 'r-a1', teamName: 'A조 1위팀', position: 2, points: 10, wins: 3, draws: 1, losses: 0, goalsFor: 9, goalsAgainst: 3, fairPlayPoints: 0 },
      ],
      progress: { total: 10, played: 10, remaining: 0, percent: 100 },
      magicNumber: null,
      recalculatedAt: null,
      champions: [],
      tieBreakGroups: [],
    };
    v1GetMock.mockResolvedValueOnce(overall);

    const tournament = baseTournament({
      groups: [
        // 조 단위 position은 1부터 다시 매겨진다 — A조 1위(position=1)를 그대로 믿으면
        // 실제로는 2위인 팀을 우승으로 잘못 표시하게 된다.
        leagueGroup({ id: 'group-a', name: 'A조', standings: [standing({ registrationId: 'r-a1', teamName: 'A조 1위팀', position: 1 })] }),
        leagueGroup({ id: 'group-b', name: 'B조', standings: [standing({ registrationId: 'r-b1', teamName: 'B조 1위팀', position: 1 })] }),
      ],
    });

    render(<ResultsPageContent tournament={tournament} />);

    await waitFor(() => expect(screen.getAllByText('B조 1위팀').length).toBeGreaterThan(0));
    expect(v1GetMock).toHaveBeenCalledWith(`/tournaments/${tournament.id}/standings/overall`);
  });
});

/**
 * 정규 리그 거울 행(kind==='regular_league') 회귀 테스트.
 *
 * 거울 행은 groups가 항상 []다 — 순위가 V1League 축에서 계산되고 대회 행에는 미러링되지
 * 않기 때문이다(단일 시즌·다조 무관). 그래서 groups.length로 다조 여부를 판정하는 기존
 * 가드로는 이 행이 절대 통합 순위 API(GET /standings/overall)로 가지 않고, 뒤이은
 * groups[0].standings 읽기(buildSingleGroupLeagueRanking)도 groups가 비어 있어 항상 []가
 * 나온다 — 시즌이 전부 끝나 GET .../standings/overall이 진짜 순위를 갖고 있어도
 * "최종 순위가 아직 등록되지 않았어요"만 뜬다.
 *
 * alpha 실측(2026-09-13): 2팀·경기 1개짜리 완결 리그("(테스트) 9.11.2")에서 그대로
 * 재현 — GET .../standings/overall은 200으로 정상 순위를 주는데 화면은 미등록 안내만
 * 그렸다.
 */
describe('ResultsPageContent — 정규 리그 거울 행(kind=regular_league)의 최종 순위', () => {
  // v1GetMock은 파일 전체가 공유하는 hoisted mock이라 이전 describe의 호출 기록이 남는다
  // (이 파일에 다른 곳도 전역 clear가 없다) — 두 번째 테스트의 "호출 안 됨" 단언이 앞
  // 테스트들의 누적 호출과 섞이지 않도록 이 블록에서만 매 테스트 전에 비운다.
  beforeEach(() => {
    v1GetMock.mockClear();
  });

  it('groups가 비어 있어도(단일 시즌) 통합 순위 API로 최종 순위를 그린다', async () => {
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

    const tournament = baseTournament({
      format: 'group_knockout',
      kind: 'regular_league',
      groups: [],
      fixtures: [],
    });

    render(<ResultsPageContent tournament={tournament} />);

    await waitFor(() => expect(screen.getAllByText('풋살크루').length).toBeGreaterThan(0));
    expect(screen.getByText('Tttt')).toBeInTheDocument();
    expect(screen.queryByText('최종 순위가 아직 등록되지 않았어요.')).not.toBeInTheDocument();
    expect(v1GetMock).toHaveBeenCalledWith(`/tournaments/${tournament.id}/standings/overall`);

    // 감사 evidence: 순위는 뜨지만 W/GF/+/- 칸이 전부 0으로 나오던 결함(별도 수정) —
    // computeTeamRecord가 tournament.fixtures(거울 행은 항상 [])를 스캔해서 생기는
    // 문제라, 이 API가 이미 가진 승/득점/실점을 행에 실어야 한다. 우승팀(풋살크루)의
    // 득실차 +3·챔피언 히어로의 "1경기 중"이 뜨는지로 검증한다 — 둘 다 0/기본값으로는
    // 절대 안 나오는 값이다.
    expect(screen.getAllByText('+3').length).toBeGreaterThan(0);
    expect(screen.getByText('-3')).toBeInTheDocument();
    expect(screen.getAllByText('1경기 중').length).toBeGreaterThan(0);
  });

  /**
   * 실사용자 발견 결함(2026-09-16) — 마포 레인저스 vs 풋살크루, 1:1 무승부. 두 팀이 이
   * 경기 하나뿐이면 승점·골득실·다득점·상대전적·최소실점 전부 완전히 대칭이라 절대
   * 안 갈린다. 고치기 전에는 이 잔여 동률이 팀ID 사전순으로 조용히 "1위/2위"가 되어
   * 트로피 히어로에 한쪽 팀만 확정 우승팀으로 떴다 — API가 `champions`(2개)로 그
   * 동률을 알려주면 화면은 단독 우승 히어로 대신 담백한 공동 우승 배너를 보여줘야
   * 한다(2026-09-17 3안 중 B 선택).
   */
  it('완전 동률(공동 우승)이면 단독 챔피언 히어로 대신 공동 우승 배너를 보여준다', async () => {
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

    const tournament = baseTournament({
      format: 'group_knockout',
      kind: 'regular_league',
      groups: [],
      fixtures: [],
    });

    render(<ResultsPageContent tournament={tournament} />);

    await waitFor(() => expect(screen.getByText('공동 우승')).toBeInTheDocument());
    expect(screen.getByText('마포 레인저스 · 풋살크루')).toBeInTheDocument();
    // 단독 우승 히어로는 아예 렌더되지 않는다 — "득실차"는 그 히어로에만 있는 라벨이다.
    expect(screen.queryByText('득실차')).not.toBeInTheDocument();
    // 최종 순위 표: 두 팀 다 "우승"을 공유하고, 아무도 "준우승"이 아니다.
    expect(screen.getAllByText('우승').length).toBe(2);
    expect(screen.queryByText('준우승')).not.toBeInTheDocument();
  });

  it('다조(2개 이상) format=league 대회의 기존 동작은 그대로 유지한다(회귀 방지)', () => {
    // kind가 대회(regular_tournament)이고 groups가 실제로 채워진 경우 — 거울 행 가드
    // (isLeagueMirror)가 이 경로를 건드리지 않고, groups.length>1 판정이 그대로
    // 통합 순위 API를 태워야 한다(228행 테스트와 동일 전제, 여기서는 회귀만 못박는다).
    const tournament = baseTournament({
      kind: 'regular_tournament',
      groups: [
        leagueGroup({ id: 'group-a', name: 'A조', standings: [standing({ registrationId: 'r-a1', teamName: 'A조 1위팀', position: 1 })] }),
      ],
    });

    render(<ResultsPageContent tournament={tournament} />);

    // 단일 조(groups.length===1)이므로 통합 순위 API를 타지 않고 groups[0].standings를
    // 그대로 쓴다 — 184행 테스트와 같은 경로.
    expect(v1GetMock).not.toHaveBeenCalled();
    expect(screen.getAllByText('A조 1위팀').length).toBeGreaterThan(0);
  });
});
