import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultsPageContent } from './results-page-client';
import type { V1TournamentDetail, V1TournamentFixture } from '@/types/api';

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
    // 존재하지 않는다 — getChampionName()이 null을 반환하는 실제 조건.
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
