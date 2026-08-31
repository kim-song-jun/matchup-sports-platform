import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
