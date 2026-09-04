import { createElement } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  getTournamentPostEventCards,
  getTournamentVenuePrepItems,
} from '@/components/tournaments/tournament-venue-retention-sections';
import { v1Get } from '@/lib/api-client';
import { getTournamentSponsorCards } from '@/components/tournaments/tournament-sponsor-section';
import {
  getCompletedChampionName,
  getParticipantTeamBuckets,
  getPrizeBreakdownChips,
  partitionTournamentSections,
  FixtureCard,
  TournamentDetailView,
} from './tournament-detail-client';
import type {
  V1TournamentDetail,
  V1TournamentFixture,
  V1TournamentFixtureResult,
  V1TournamentGroup,
  V1TournamentParticipantTeam,
  V1TournamentSponsor,
} from '@/types/api';

vi.mock('@/components/tournaments/tournament-inquiry-section', () => ({
  TournamentInquirySection: () => null,
}));

// 리그(format='league') 대회는 LeagueStandingsSection 이 마운트되면서
// GET /tournaments/:id/standings/overall 을 호출한다. 스텁하지 않으면 실제 fetch 가
// 나가거나 비동기 setState 로 act 경고·플레이키 테스트가 된다.
// never-resolving Promise 로 두면 컴포넌트가 loading 상태(렌더 없음)에 머물러
// 이 파일의 단언(순위표가 아니라 대진표/안내 문구를 본다)이 결정적으로 유지된다.
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  v1Get: vi.fn(() => new Promise(() => {})),
}));

/* ── Factories ── */

function makeGroup(
  overrides: Partial<V1TournamentGroup> & Pick<V1TournamentGroup, 'id' | 'phase'>,
): V1TournamentGroup {
  return {
    name: overrides.phase,
    sortOrder: 0,
    advanceCount: null,
    groupTeams: [],
    standings: [],
    ...overrides,
  };
}

function makeFixture(
  overrides: Partial<V1TournamentFixture> & Pick<V1TournamentFixture, 'id'>,
): V1TournamentFixture {
  return {
    groupId: null,
    round: 'round_1',
    fixtureNumber: 1,
    legNumber: 1,
    scheduledAt: null,
    venue: null,
    status: 'scheduled',
    liveStatus: 'scheduled',
    homeRegistrationId: null,
    homeTeamId: null,
    homeTeamName: 'Home',
    homeTeamLogoUrl: null,
    awayRegistrationId: null,
    awayTeamId: null,
    awayTeamName: 'Away',
    awayTeamLogoUrl: null,
    result: null,
    videos: [],
    ...overrides,
  };
}

function makeParticipantTeam(
  overrides: Partial<V1TournamentParticipantTeam> & Pick<V1TournamentParticipantTeam, 'registrationId' | 'status'>,
): V1TournamentParticipantTeam {
  return {
    teamId: `team-${overrides.registrationId}`,
    teamName: `팀 ${overrides.registrationId}`,
    teamLogoUrl: null,
    teamRegionName: null,
    confirmedAt: null,
    ...overrides,
  };
}

function makeSponsor(overrides: Partial<V1TournamentSponsor> & Pick<V1TournamentSponsor, 'id' | 'name'>): V1TournamentSponsor {
  return {
    description: null,
    logoUrl: null,
    websiteUrl: null,
    instagramUrl: null,
    benefitText: null,
    boothText: null,
    eventTitle: null,
    eventDescription: null,
    eventResultText: null,
    sortOrder: 0,
    ...overrides,
  };
}

function makeFixtureResult(overrides: Partial<V1TournamentFixtureResult> = {}): V1TournamentFixtureResult {
  return {
    homeScore: 0,
    awayScore: 0,
    hasPenalty: false,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    note: null,
    recordedAt: '2026-01-01T00:00:00.000Z',
    goals: [],
    ...overrides,
  };
}

function makeTournament(
  overrides: Partial<V1TournamentDetail> & Pick<V1TournamentDetail, 'id' | 'status' | 'format'>,
): V1TournamentDetail {
  return {
    kind: 'regular_tournament',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
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

/* ── Tests ── */

describe('getParticipantTeamBuckets', () => {
  it('groups confirmed teams before waitlisted teams for public participant display', () => {
    const buckets = getParticipantTeamBuckets([
      makeParticipantTeam({ registrationId: 'wait-1', status: 'waitlisted' }),
      makeParticipantTeam({ registrationId: 'confirmed-1', status: 'confirmed' }),
      makeParticipantTeam({ registrationId: 'confirmed-2', status: 'confirmed' }),
    ]);

    expect(buckets.confirmed.map((team) => team.registrationId)).toEqual(['confirmed-1', 'confirmed-2']);
    expect(buckets.waitlisted.map((team) => team.registrationId)).toEqual(['wait-1']);
    expect(buckets.hasAny).toBe(true);
  });
});

describe('getTournamentVenuePrepItems', () => {
  // venue(장소명)는 대회 생성 시 항상 입력되는 값 — 관리자 공지 유무와 무관하게
  // 항상 장소명 + 지도 링크를 보여준다. venue가 없는 극히 드문 edge case에서만
  // 기존 "운영진 공지 확인 / 공지 대기" 폴백을 유지한다. 4가지 조합(venue 있음/없음 ×
  // 공지 있음/없음)을 모두 커버한다.

  it('venue 있음 + 공지 없음: 장소명과 네이버 지도 검색 링크를 보여주고 보조 공지는 없다. 장소명·지도 링크가 이미 항상 노출되므로 상태 배지는 없다(status: null)', () => {
    const items = getTournamentVenuePrepItems({ venue: '데일리그라운드 청라국제도시점' });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: 'parking',
      label: '장소',
      value: '데일리그라운드 청라국제도시점',
      status: null,
      actionLabel: '지도에서 보기',
      href: 'https://map.naver.com/v5/search/' + encodeURIComponent('데일리그라운드 청라국제도시점'),
      hrefExternal: true,
      notice: null,
    });
  });

  it('venue 있음 + 공지 있음: 장소 정보는 그대로 유지되고 공지는 보조 정보로 덧붙는다. 이 경우도 상태 배지는 없다(status: null)', () => {
    const items = getTournamentVenuePrepItems({
      venue: '데일리그라운드 청라국제도시점',
      announcements: [
        {
          id: 'ann-venue',
          title: '주차·입장·경기 준비 안내',
          category: 'venue' as const,
        },
      ],
    });

    expect(items[0]).toMatchObject({
      label: '장소',
      value: '데일리그라운드 청라국제도시점',
      status: null,
      actionLabel: '지도에서 보기',
      hrefExternal: true,
      notice: {
        summary: '공지: 주차·입장·경기 준비 안내',
        actionLabel: '공지 보기',
        href: '#announcement-ann-venue',
      },
    });
  });

  it('venue 없음 + 공지 없음(edge case): 기존 운영진 공지 확인 폴백을 유지한다', () => {
    const items = getTournamentVenuePrepItems({});

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      key: 'parking',
      label: '주차',
      status: 'operator_update',
      actionLabel: null,
      href: null,
      notice: null,
    });
  });

  it('venue 없음 + 공지 있음(edge case): 기존처럼 공지 링크로 폴백한다', () => {
    const items = getTournamentVenuePrepItems({
      announcements: [
        {
          id: 'ann-venue',
          title: '주차·입장·경기 준비 안내',
          category: 'venue' as const,
        },
      ],
    });

    expect(items.find((item) => item.key === 'parking')).toMatchObject({
      status: 'available',
      actionLabel: '공지 보기',
      href: '#announcement-ann-venue',
      notice: null,
    });
  });
});

describe('getTournamentPostEventCards', () => {
  it('keeps sponsor, video, and review affordances unavailable before v1 contracts exist', () => {
    const cards = getTournamentPostEventCards({
      status: 'open',
      hasCompletedFixture: false,
      hasAnnouncements: false,
    });

    expect(cards.find((card) => card.key === 'sponsor')).toMatchObject({
      status: 'operator_update',
      actionLabel: null,
    });
    expect(cards.find((card) => card.key === 'video')).toMatchObject({
      status: 'upcoming',
      actionLabel: null,
    });
  });

  it('marks results as available only when completed fixture results are present', () => {
    const pending = getTournamentPostEventCards({
      status: 'completed',
      hasCompletedFixture: false,
      hasAnnouncements: true,
    });
    const ready = getTournamentPostEventCards({
      status: 'completed',
      hasCompletedFixture: true,
      hasAnnouncements: true,
    });

    expect(pending.find((card) => card.key === 'results')).toMatchObject({
      status: 'operator_update',
      actionLabel: null,
    });
    expect(ready.find((card) => card.key === 'results')).toMatchObject({
      status: 'available',
      actionLabel: '결과 보기',
    });
  });

  it('opens post-event cards only to matching published announcement anchors', () => {
    const context = {
      status: 'completed' as const,
      hasCompletedFixture: false,
      hasAnnouncements: true,
      announcements: [
        { id: 'ann-sponsor', title: '현장 이벤트 당첨 안내', category: 'sponsor' as const },
        { id: 'ann-media', title: '하이라이트 링크 안내', category: 'media' as const },
        { id: 'ann-review', title: '리뷰 작성 안내', category: 'review' as const },
        { id: 'ann-results', title: '최종 결과 안내', category: 'results' as const },
      ],
    };

    const cards = getTournamentPostEventCards(context);

    expect(cards.find((card) => card.key === 'results')).toMatchObject({
      status: 'available',
      actionLabel: '결과 공지 보기',
      href: '#announcement-ann-results',
    });
    expect(cards.find((card) => card.key === 'video')).toMatchObject({
      status: 'available',
      actionLabel: '미디어 공지 보기',
      href: '#announcement-ann-media',
    });
    expect(cards.find((card) => card.key === 'sponsor')).toMatchObject({
      status: 'available',
      actionLabel: '이벤트 공지 보기',
      href: '#announcement-ann-sponsor',
    });
  });

  it('links sponsor retention directly to the structured sponsor section when sponsors exist', () => {
    const cards = getTournamentPostEventCards({
      status: 'completed',
      hasCompletedFixture: false,
      hasAnnouncements: false,
      sponsorCount: 2,
    });

    expect(cards.find((card) => card.key === 'sponsor')).toMatchObject({
      status: 'available',
      actionLabel: '협찬 보기',
      href: '#tournament-sponsors',
    });
  });

  it('links the next-tournament retention card to the real tournament list', () => {
    const cards = getTournamentPostEventCards({
      status: 'completed',
      hasCompletedFixture: false,
      hasAnnouncements: false,
    });

    expect(cards.find((card) => card.key === 'next_tournament')).toMatchObject({
      status: 'available',
      actionLabel: '다음 대회 찾기',
      href: '/tournaments',
    });
  });
});

describe('getTournamentSponsorCards', () => {
  it('maps sponsor benefits, booth, event, and result fields without inventing missing data', () => {
    const cards = getTournamentSponsorCards([
      makeSponsor({
        id: 'sponsor-1',
        name: '서울 스포츠랩',
        benefitText: '리뷰 참여자에게 풋살공 제공',
        boothText: '본부석 옆 체험 부스 운영',
        eventTitle: '매너 리뷰 이벤트',
        eventDescription: '상대팀 리뷰를 남긴 참가팀 중 추첨으로 협찬품을 지급해요.',
        eventResultText: '당첨팀은 운영진 공지 후 현장 지급',
      }),
      makeSponsor({
        id: 'sponsor-empty',
        name: '지역 파트너',
      }),
    ]);

    expect(cards[0]).toMatchObject({
      id: 'sponsor-1',
      name: '서울 스포츠랩',
      facts: [
        { label: '제공 혜택', value: '리뷰 참여자에게 풋살공 제공' },
        { label: '현장 부스', value: '본부석 옆 체험 부스 운영' },
        { label: '이벤트', value: '매너 리뷰 이벤트' },
        { label: '참여 방법', value: '상대팀 리뷰를 남긴 참가팀 중 추첨으로 협찬품을 지급해요.' },
        { label: '이벤트 결과', value: '당첨팀은 운영진 공지 후 현장 지급' },
      ],
    });
    expect(cards[1]).toMatchObject({
      id: 'sponsor-empty',
      facts: [],
    });
  });
});

describe('getPrizeBreakdownChips', () => {
  it('keeps numeric thousands separators inside prize amounts', () => {
    expect(getPrizeBreakdownChips('우승 200,000원 / 준우승 100,000원')).toEqual([
      '우승 200,000원',
      '준우승 100,000원',
    ]);
  });

  it('still splits comma-separated prize labels when the comma is not numeric', () => {
    expect(getPrizeBreakdownChips('우승 200,000원, MVP 상품권')).toEqual([
      '우승 200,000원',
      'MVP 상품권',
    ]);
  });

  it('splits a mixed amount + goods breakdown on a non-numeric comma', () => {
    expect(getPrizeBreakdownChips('1위 600,000원, MVP 축구화')).toEqual([
      '1위 600,000원',
      'MVP 축구화',
    ]);
  });

  it('keeps a "·" goods listing inside a single chip instead of splitting it', () => {
    expect(getPrizeBreakdownChips('MVP 축구화 · 상품권')).toEqual(['MVP 축구화 · 상품권']);
    expect(getPrizeBreakdownChips('참가팀 전원 음료·간식 제공')).toEqual(['참가팀 전원 음료·간식 제공']);
  });
});

describe('partitionTournamentSections', () => {
  describe('league format', () => {
    it('reports hasGroupStandings=true when phase=group groups exist', () => {
      const groupA = makeGroup({ id: 'gA', phase: 'group' });
      const fA = makeFixture({ id: 'fA', groupId: 'gA' });

      const result = partitionTournamentSections('league', [fA], [groupA]);

      expect(result.hasGroupStandings).toBe(true);
      expect(result.groupPhaseGroups).toHaveLength(1);
      expect(result.groupPhaseGroups[0].id).toBe('gA');
    });

    it('reports hasAnyFixtures=true and knockoutFixtures is empty for league format', () => {
      const groupA = makeGroup({ id: 'gA', phase: 'group' });
      const fA = makeFixture({ id: 'fA', groupId: 'gA' });

      const result = partitionTournamentSections('league', [fA], [groupA]);

      expect(result.hasAnyFixtures).toBe(true);
      // League: knockoutFixtures = only fixtures in knockout-phase groups — none here
      expect(result.knockoutFixtures).toHaveLength(0);
      expect(result.hasKnockoutFixtures).toBe(false);
    });

    it('returns hasGroupStandings=false when no phase=group groups exist', () => {
      const result = partitionTournamentSections('league', [], []);

      expect(result.hasGroupStandings).toBe(false);
      expect(result.hasAnyFixtures).toBe(false);
    });
  });

  describe('knockout format', () => {
    it('returns ALL fixtures as knockoutFixtures regardless of groupId', () => {
      const groupSemi = makeGroup({ id: 'g-semi', phase: 'semi' });
      const fGrouped = makeFixture({ id: 'f1', groupId: 'g-semi' });
      const fUngrouped = makeFixture({ id: 'f2', groupId: null });

      const result = partitionTournamentSections('knockout', [fGrouped, fUngrouped], [groupSemi]);

      expect(result.knockoutFixtures).toHaveLength(2);
      expect(result.knockoutFixtures.map((f) => f.id).sort()).toEqual(['f1', 'f2']);
      expect(result.hasKnockoutFixtures).toBe(true);
    });

    it('returns empty groupPhaseGroups for knockout (no phase=group groups)', () => {
      const groupSemi = makeGroup({ id: 'g-semi', phase: 'semi' });
      const fA = makeFixture({ id: 'fA', groupId: 'g-semi' });

      const result = partitionTournamentSections('knockout', [fA], [groupSemi]);

      expect(result.groupPhaseGroups).toHaveLength(0);
      expect(result.hasGroupStandings).toBe(false);
    });

    it('returns empty groupFixtures for knockout (all fixtures go to knockoutFixtures)', () => {
      const groupSemi = makeGroup({ id: 'g-semi', phase: 'semi' });
      const fA = makeFixture({ id: 'fA', groupId: 'g-semi' });

      const result = partitionTournamentSections('knockout', [fA], [groupSemi]);

      expect(result.groupFixtures).toHaveLength(0);
      expect(result.hasGroupFixtures).toBe(false);
    });
  });

  describe('group_knockout format', () => {
    it('separates group-phase fixtures from knockout-phase fixtures', () => {
      const groupPhase = makeGroup({ id: 'g-group', phase: 'group' });
      const groupSemi = makeGroup({ id: 'g-semi', phase: 'semi' });
      const groupFinal = makeGroup({ id: 'g-final', phase: 'final' });

      const fGroup1 = makeFixture({ id: 'fg1', groupId: 'g-group' });
      const fGroup2 = makeFixture({ id: 'fg2', groupId: 'g-group' });
      const fSemi = makeFixture({ id: 'fs', groupId: 'g-semi' });
      const fFinal = makeFixture({ id: 'ff', groupId: 'g-final' });

      const result = partitionTournamentSections(
        'group_knockout',
        [fGroup1, fGroup2, fSemi, fFinal],
        [groupPhase, groupSemi, groupFinal],
      );

      expect(result.groupPhaseGroups.map((g) => g.id)).toEqual(['g-group']);
      expect(result.groupFixtures.map((f) => f.id).sort()).toEqual(['fg1', 'fg2']);
      expect(result.knockoutFixtures.map((f) => f.id).sort()).toEqual(['ff', 'fs']);
    });

    it('renders group standings: hasGroupStandings=true when phase=group groups present', () => {
      const groupPhase = makeGroup({ id: 'g-group', phase: 'group' });
      const groupSemi = makeGroup({ id: 'g-semi', phase: 'semi' });

      const fGroup = makeFixture({ id: 'fg', groupId: 'g-group' });
      const fSemi = makeFixture({ id: 'fs', groupId: 'g-semi' });

      const result = partitionTournamentSections('group_knockout', [fGroup, fSemi], [groupPhase, groupSemi]);

      expect(result.hasGroupStandings).toBe(true);
      expect(result.hasGroupFixtures).toBe(true);
      expect(result.hasKnockoutFixtures).toBe(true);
    });

    it('excludes ungrouped fixtures from knockoutFixtures in group_knockout', () => {
      const groupSemi = makeGroup({ id: 'g-semi', phase: 'semi' });
      const fSemi = makeFixture({ id: 'fs', groupId: 'g-semi' });
      const fOrphan = makeFixture({ id: 'fo', groupId: null });

      const result = partitionTournamentSections('group_knockout', [fSemi, fOrphan], [groupSemi]);

      // ungrouped fixture is NOT in knockoutFixtures for group_knockout
      expect(result.knockoutFixtures.map((f) => f.id)).toEqual(['fs']);
      expect(result.hasKnockoutFixtures).toBe(true);
    });

    it('hasKnockoutFixtures=false when no knockout-phase group fixtures exist', () => {
      const groupPhase = makeGroup({ id: 'g-group', phase: 'group' });
      const fGroup = makeFixture({ id: 'fg', groupId: 'g-group' });

      const result = partitionTournamentSections('group_knockout', [fGroup], [groupPhase]);

      expect(result.hasKnockoutFixtures).toBe(false);
      expect(result.knockoutFixtures).toHaveLength(0);
    });

    it('third_place fixtures are included in knockoutFixtures', () => {
      const groupThird = makeGroup({ id: 'g-third', phase: 'third_place' });
      const fThird = makeFixture({ id: 'ft', groupId: 'g-third' });

      const result = partitionTournamentSections('group_knockout', [fThird], [groupThird]);

      expect(result.knockoutFixtures.map((f) => f.id)).toEqual(['ft']);
    });

    it('TB-3: groupId=null 픽스처도 round가 녹아웃 단계 문자열이면 knockoutFixtures에 포함', () => {
      // group_knockout에서 groupId 없이 round='semi'/'final'/'third_place'로 직접
      // 지정된 픽스처가 결선 대진표에 포함되어야 한다.
      const fSemiOrphan = makeFixture({ id: 'f-semi-orphan', groupId: null, round: 'semi' });
      const fFinalOrphan = makeFixture({ id: 'f-final-orphan', groupId: null, round: 'final' });
      const fGroupOrphan = makeFixture({ id: 'f-group-orphan', groupId: null, round: 'round_1' });

      const result = partitionTournamentSections(
        'group_knockout',
        [fSemiOrphan, fFinalOrphan, fGroupOrphan],
        [],
      );

      // 녹아웃 round 문자열인 두 픽스처만 포함 — group round 문자열(round_1)은 제외
      expect(result.knockoutFixtures.map((f) => f.id).sort()).toEqual(['f-final-orphan', 'f-semi-orphan']);
      expect(result.hasKnockoutFixtures).toBe(true);
    });
  });
});

describe('getCompletedChampionName', () => {
  it('returns the home team name when the final fixture result is a home win (knockout)', () => {
    const final = makeFixture({
      id: 'f-final',
      round: 'final',
      homeTeamName: '레드 FC',
      awayTeamName: '블루 FC',
      result: makeFixtureResult({ homeScore: 3, awayScore: 1 }),
    });
    const tournament = makeTournament({ id: 't1', status: 'completed', format: 'knockout', fixtures: [final] });

    expect(getCompletedChampionName(tournament)).toBe('레드 FC');
  });

  it('matches the Korean "결승" round label used by admin-authored group_knockout fixtures', () => {
    const final = makeFixture({
      id: 'f-final',
      round: '결승',
      homeTeamName: '레드 FC',
      awayTeamName: '블루 FC',
      result: makeFixtureResult({ homeScore: 0, awayScore: 2 }),
    });
    const tournament = makeTournament({ id: 't1', status: 'completed', format: 'group_knockout', fixtures: [final] });

    expect(getCompletedChampionName(tournament)).toBe('블루 FC');
  });

  it('resolves the winner via penalty shootout scores when regulation time ends level', () => {
    const final = makeFixture({
      id: 'f-final',
      round: 'final',
      homeTeamName: '레드 FC',
      awayTeamName: '블루 FC',
      result: makeFixtureResult({
        homeScore: 1,
        awayScore: 1,
        hasPenalty: true,
        homePenaltyScore: 5,
        awayPenaltyScore: 4,
      }),
    });
    const tournament = makeTournament({ id: 't1', status: 'completed', format: 'knockout', fixtures: [final] });

    expect(getCompletedChampionName(tournament)).toBe('레드 FC');
  });

  it('returns null instead of throwing when no final fixture exists yet', () => {
    const tournament = makeTournament({ id: 't1', status: 'completed', format: 'knockout', fixtures: [] });

    expect(getCompletedChampionName(tournament)).toBeNull();
  });

  it('returns null when the final fixture has not been recorded (result is null)', () => {
    const final = makeFixture({ id: 'f-final', round: 'final', result: null });
    const tournament = makeTournament({ id: 't1', status: 'completed', format: 'knockout', fixtures: [final] });

    expect(getCompletedChampionName(tournament)).toBeNull();
  });

  it('returns null on an unresolved draw with no penalty shootout recorded', () => {
    const final = makeFixture({
      id: 'f-final',
      round: 'final',
      result: makeFixtureResult({ homeScore: 1, awayScore: 1, hasPenalty: false }),
    });
    const tournament = makeTournament({ id: 't1', status: 'completed', format: 'knockout', fixtures: [final] });

    expect(getCompletedChampionName(tournament)).toBeNull();
  });

  it('returns the top-of-standings team name for league format', () => {
    const group = makeGroup({
      id: 'g1',
      phase: 'group',
      standings: [
        {
          registrationId: 'r2', teamId: 'team-2', teamName: '2위팀', teamLogoUrl: null, position: 2,
          points: 10, wins: 3, draws: 1, losses: 1, goalsFor: 8, goalsAgainst: 5, recalculatedAt: null,
        },
        {
          registrationId: 'r1', teamId: 'team-1', teamName: '1위팀', teamLogoUrl: null, position: 1,
          points: 13, wins: 4, draws: 1, losses: 0, goalsFor: 12, goalsAgainst: 3, recalculatedAt: null,
        },
      ],
    });
    const tournament = makeTournament({ id: 't1', status: 'completed', format: 'league', groups: [group] });

    expect(getCompletedChampionName(tournament)).toBe('1위팀');
  });

  it('returns null for league format when no phase=group group exists', () => {
    const tournament = makeTournament({ id: 't1', status: 'completed', format: 'league', groups: [] });

    expect(getCompletedChampionName(tournament)).toBeNull();
  });
});

describe('TournamentDetailView — completed vs non-completed section rendering', () => {
  it('exposes exactly one page-level heading for the tournament title', () => {
    const tournament = makeTournament({
      id: 't1',
      title: '팀밋 풋살컵',
      status: 'open',
      format: 'league',
    });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: '팀밋 풋살컵' })).toBeInTheDocument();
  });

  it('hides the application guide, flow explainer, and inline standings/fixtures sections when completed', () => {
    const group = makeGroup({ id: 'g1', phase: 'group', standings: [] });
    const tournament = makeTournament({
      id: 't1',
      status: 'completed',
      format: 'league',
      groups: [group],
      fixtures: [],
    });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    expect(screen.queryByText('참가 신청 안내')).not.toBeInTheDocument();
    expect(screen.queryByText('대회 진행 방식')).not.toBeInTheDocument();
    expect(screen.queryByText('순위표')).not.toBeInTheDocument();
    // **문구가 아니라 섹션 자체가 없는지 본다.** 특정 문구의 부재만 단언하면 *"무엇이
    // 있으면 안 되는지"* 를 안 보게 된다 — 실제로 리그용 문구를 대회용
    // `FixturesPlaceholder` 로 바꾸는 변이에도 이 테스트가 **통과했다**(vacuous).
    // 헤더 부재로 단언하면 리그 문구든 대회 문구든 **무엇이 렌더돼도 red** 다.
    expect(screen.queryByText('일정 · 대진')).not.toBeInTheDocument();
    expect(screen.queryByText('아직 등록된 경기가 없어요')).not.toBeInTheDocument();
    expect(screen.queryByText('대진표 준비 중')).not.toBeInTheDocument();
  });

  it('keeps the application guide, flow explainer, and standings-moved notice for open tournaments (non-destructive)', () => {
    const group = makeGroup({ id: 'g1', phase: 'group', standings: [] });
    const tournament = makeTournament({
      id: 't1',
      status: 'open',
      format: 'league',
      groups: [group],
      fixtures: [],
    });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    expect(screen.getByText('참가 신청 안내')).toBeInTheDocument();
    expect(screen.getByText('대회 진행 방식')).toBeInTheDocument();
    // §A-1에서 순위표는 /bracket 바로가기 안내(StandingsMovedNotice)로 대체됐지만,
    // 리그전 도입(2026-08-17 스펙 §9)으로 **format='league'인 대회에 한해** 상세 화면이
    // 통합 순위표(LeagueStandingsSection)를 직접 렌더한다 — 조별 순위가 아니라 대회 전체를
    // 합산한 새 개념이라 /bracket의 조별 순위표와 역할이 겹치지 않는다.
    // 그 섹션은 서버 조회 완료 전에는 아무것도 렌더하지 않으므로(레이아웃 흔들림 방지),
    // 여기서는 옛 안내 문구가 더 이상 나오지 않는 것을 확인한다.
    // 다른 format(group_knockout 등)에서는 StandingsMovedNotice가 그대로 유지된다.
    expect(screen.queryByText('실시간 순위표는 대진표에서 확인하세요')).not.toBeInTheDocument();
    // **대회용 문구를 쓰지 않는다.** "대회 시작 전에 대진표가 공개돼요" 는 진행 중인 리그
    // 시즌에 뜨면 틀린 말이다 — 리그에는 "대진표 공개" 라는 사건이 없고 "대진 확정" 이
    // 있다. 문구는 리그 일정 목록이 같은 상황에 쓰는 것을 그대로 가져왔다.
    expect(screen.queryByText('대진표 준비 중')).not.toBeInTheDocument();
    expect(screen.getByText('아직 등록된 경기가 없어요')).toBeInTheDocument();
    expect(screen.getByText('대진이 확정되면 경기 일정이 여기에 나타나요.')).toBeInTheDocument();
  });

  it('shows a pre-created pending knockout bracket before the group stage finishes', () => {
    const group = makeGroup({ id: 'group-a', phase: 'group' });
    const tournament = makeTournament({
      id: 't1',
      status: 'in_progress',
      format: 'group_knockout',
      groups: [group],
      fixtures: [
        makeFixture({ id: 'group-fixture', groupId: group.id, round: 'group', status: 'scheduled' }),
        makeFixture({ id: 'semi-fixture', groupId: null, round: '4강', homeTeamName: 'TBD', awayTeamName: 'TBD' }),
      ],
    });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    expect(screen.getByText('결선 대진표')).toBeInTheDocument();
    expect(screen.getAllByText('미정').length).toBeGreaterThanOrEqual(2);
  });

  it('explains the current team application, payment, and roster flow', () => {
    const tournament = makeTournament({
      id: 't1',
      status: 'open',
      format: 'league',
      groups: [],
      fixtures: [],
    });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    expect(screen.getByText('대회 신청은 팀장과 운영진이 진행할 수 있어요.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('팀원은 미선택 상태로 진행하거나 추후 수정할 수 있어요.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('입금 확인 후 대회 참가가 확정돼요.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('선수단 확정')).toBeInTheDocument();
    expect(screen.getByText('마감일 전까지 등록을 완료해 주세요.', { exact: false })).toBeInTheDocument();
    expect(screen.queryByText('운영진 검토')).not.toBeInTheDocument();
  });

  it('hides the application guide once applications close, but keeps the flow explainer', () => {
    // 신청을 받지 않는 상태에서 "회원가입 후 팀을 만들어 신청하세요" 안내는 따라 할 수 없다.
    // 대회 진행 방식(포맷 설명)은 신청 여부와 무관하므로 계속 보여준다.
    for (const status of ['closed', 'in_progress'] as const) {
      const tournament = makeTournament({ id: 't1', status, format: 'league', groups: [], fixtures: [] });

      const { unmount } = render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

      expect(screen.queryByText('참가 신청 안내')).not.toBeInTheDocument();
      expect(screen.getByText('대회 진행 방식')).toBeInTheDocument();

      unmount();
    }
  });

  it('renders the CompletedResultHero entry point with a safe fallback title when a champion cannot be derived', () => {
    const tournament = makeTournament({ id: 't1', status: 'completed', format: 'league', groups: [] });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    expect(screen.getByText('대회가 끝났어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '대회 최종 결과 보기' })).toHaveAttribute(
      'href',
      '/tournaments/t1/results',
    );
  });

  it('renders the champion name in the CompletedResultHero title when the final result is resolvable', () => {
    const final = makeFixture({
      id: 'f-final',
      round: 'final',
      homeTeamName: '레드 FC',
      awayTeamName: '블루 FC',
      result: makeFixtureResult({ homeScore: 2, awayScore: 0 }),
    });
    const tournament = makeTournament({ id: 't1', status: 'completed', format: 'knockout', fixtures: [final] });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    expect(screen.getByText('레드 FC 우승!')).toBeInTheDocument();
  });

  it('renders the pre-participation checklist exactly once via the accordion and drops the old duplicated copy', () => {
    const tournament = makeTournament({ id: 't1', status: 'completed', format: 'league', groups: [] });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    // 완료 상태 전용 아코디언("참가 전 유의사항")이 유일한 소스여야 하고, 예전 두 곳
    // (모바일 카드 + 데스크탑 aside)에서 쓰던 "참가 전 꼭 확인해 주세요" 카피는 남아있으면 안 된다.
    expect(screen.getAllByText('참가 전 유의사항')).toHaveLength(1);
    expect(screen.queryByText('참가 전 꼭 확인해 주세요')).not.toBeInTheDocument();
  });
});

describe('TournamentParticipantSection — hides team names while the tournament is recruiting (status=open)', () => {
  it('hides confirmed team names/logos and shows the recruiting copy + confirmedCount, even if participantTeams unexpectedly has data (defense-in-depth in case the backend contract regresses)', () => {
    const tournament = makeTournament({
      id: 't1',
      status: 'open',
      format: 'league',
      teamCount: 8,
      confirmedCount: 3,
      participantTeams: [
        makeParticipantTeam({ registrationId: 'confirmed-1', status: 'confirmed' }),
        makeParticipantTeam({ registrationId: 'confirmed-2', status: 'confirmed' }),
      ],
    });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    const participantSection = screen.getByRole('region', { name: '참가팀' });
    expect(within(participantSection).queryByText('팀 confirmed-1')).not.toBeInTheDocument();
    expect(within(participantSection).queryByText('팀 confirmed-2')).not.toBeInTheDocument();
    expect(within(participantSection).getByText('참가팀 공개 전')).toBeInTheDocument();
    expect(within(participantSection).getByText('모집 마감 후 참가팀 명단이 공개돼요.')).toBeInTheDocument();
    expect(within(participantSection).getByText('현재 3팀이 참가를 확정했어요')).toBeInTheDocument();
    expect(within(participantSection).getByText('3/8팀 확정')).toBeInTheDocument();
  });

  it('hides the "현재 N팀이 참가를 확정했어요" line when confirmedCount is 0 while recruiting', () => {
    const tournament = makeTournament({
      id: 't1',
      status: 'open',
      format: 'league',
      teamCount: 8,
      confirmedCount: 0,
      participantTeams: [],
    });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    const participantSection = screen.getByRole('region', { name: '참가팀' });
    expect(within(participantSection).getByText('참가팀 공개 전')).toBeInTheDocument();
    expect(within(participantSection).queryByText(/참가를 확정했어요/)).not.toBeInTheDocument();
    expect(within(participantSection).getByText('0/8팀 확정')).toBeInTheDocument();
  });

  it('reveals confirmed and waitlisted team names once status leaves open (e.g. closed) — regression guard for the pre-existing hasAny-based behavior', () => {
    const tournament = makeTournament({
      id: 't1',
      status: 'closed',
      format: 'league',
      teamCount: 8,
      // confirmedCount matches the single 'confirmed' team below — for non-open statuses the
      // header is derived from the actual confirmed team list (confirmed.length), not this field.
      confirmedCount: 1,
      participantTeams: [
        makeParticipantTeam({ registrationId: 'confirmed-1', status: 'confirmed' }),
        makeParticipantTeam({ registrationId: 'wait-1', status: 'waitlisted' }),
      ],
    });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    const participantSection = screen.getByRole('region', { name: '참가팀' });
    expect(within(participantSection).getByText('팀 confirmed-1')).toBeInTheDocument();
    expect(within(participantSection).getByText('팀 wait-1')).toBeInTheDocument();
    expect(within(participantSection).queryByText('참가팀 공개 전')).not.toBeInTheDocument();
    expect(within(participantSection).getByText('1/8팀 확정')).toBeInTheDocument();
  });

  it('still shows the pre-existing empty state (not the recruiting copy) when closed with zero registrations — regression guard', () => {
    const tournament = makeTournament({
      id: 't1',
      status: 'closed',
      format: 'league',
      teamCount: 8,
      confirmedCount: 0,
      participantTeams: [],
    });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    const participantSection = screen.getByRole('region', { name: '참가팀' });
    expect(within(participantSection).getByText('참가팀 공개 전')).toBeInTheDocument();
    expect(within(participantSection).getByText('입금 확인과 운영진 검토가 끝난 팀부터 이곳에 공개돼요.')).toBeInTheDocument();
  });
});

describe('AccordionSection toggle (rendered via completed TournamentDetailView)', () => {
  it('toggles aria-expanded from false to true to false across real click interactions', () => {
    const tournament = makeTournament({
      id: 't1',
      status: 'completed',
      format: 'league',
      groups: [],
      rulesText: '경기 시작 10분 전까지 집합해 주세요.',
      yellowAccumulationLimit: null,
      redCardSuspensionMatches: null,
    });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    const toggle = screen.getByRole('button', { name: '대회 규정' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('경기 시작 10분 전까지 집합해 주세요.')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('경기 시작 10분 전까지 집합해 주세요.')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('경기 시작 10분 전까지 집합해 주세요.')).not.toBeInTheDocument();
  });
});

/**
 * **거울 행(정규 리그 시즌)이 대회 표면에서 자기 축의 데이터로 그려지는가.**
 *
 * 여기서 쓰는 픽스처는 **실제 거울 모양**이다 — `format: 'group_knockout'`(스키마 기본값,
 * 거울 생성이 format 을 안 쓴다) + `kind: 'regular_league'`. `format: 'league'` 로 테스트하면
 * 실제로 존재하지 않는 조합을 검증하게 되고, 누군가 게이트를 `format` 으로 좁혀도 green 이다.
 */
describe('TournamentDetailView — 정규 리그 거울 행', () => {
  const standingsResponse = {
    standings: [
      { teamId: 'team-a', teamName: '강남 유나이티드', position: 1, points: 3, wins: 1, draws: 0, losses: 0, goalsFor: 3, goalsAgainst: 1 },
      { teamId: 'team-b', teamName: '종로 FC', position: 2, points: 0, wins: 0, draws: 0, losses: 1, goalsFor: 1, goalsAgainst: 3 },
    ],
    progress: { total: 2, played: 1, remaining: 1, percent: 50 },
    magicNumber: null,
    recalculatedAt: null,
  };

  function makeMirror(overrides: Partial<V1TournamentDetail> = {}): V1TournamentDetail {
    return makeTournament({
      id: 'league-1',
      status: 'in_progress',
      // 거울 행은 format 을 쓰지 않아 스키마 기본값이 남는다 — 종류는 kind 가 말한다.
      format: 'group_knockout',
      kind: 'regular_league',
      groups: [],
      fixtures: [],
      leagueFixtures: [
        {
          teamMatchId: 'tm-1',
          title: '1R',
          homeTeamId: 'team-a',
          awayTeamId: 'team-b',
          startAt: '2026-08-31T05:00:00.000Z',
          placeName: '올림픽공원 풋살장 A',
          status: 'matched',
        },
      ],
      ...overrides,
    });
  }

  /**
   * **정원 블록이 리그에 그려지면 안 된다 — 이 결함은 실제로 alpha 에 떠 있었다.**
   *
   * `#898` 로 이 화면을 연 뒤 리그 상세에 *"정원 2 /8팀 아직 6자리 남았어요"* 가 떴다.
   * 8 은 `team_count` 의 스키마 기본값이고(거울은 아무도 안 넣는다) 리그엔 정원 개념이
   * 없다 — 게다가 **참여할 방법도 없다**(리그는 status 가 `open` 이 될 수 없다).
   *
   * 상세는 타입이 아니라 **분기**로 닫았다(리그가 도달 못 하는 화면 5개를 안 열려고).
   * 분기는 기억에 의존하므로 여기서 못박는다 — **진행바(컨테이너) 부재**로 단언한다.
   * 문자열 부재만 보면 "무엇이 있으면 안 되는지" 를 안 보게 된다.
   */
  it('리그 상세에 정원 진행바가 없다', async () => {
    vi.mocked(v1Get).mockResolvedValueOnce(standingsResponse);
    const { container } = render(
      createElement(TournamentDetailView, { tournament: makeMirror(), myRegistration: null }),
    );
    await screen.findByText('통합 순위');

    // ⚠️ 진행바가 **둘**이다 — 순위표의 "전체 일정 진행률" 은 리그에 있는 게 정상이고,
    // 정원 진행바만 없어야 한다. `[role=progressbar]` 를 통째로 세면 그 둘이 섞여
    // "리그에 진행바가 있다" 로 잘못 읽힌다(실제로 처음에 그렇게 틀렸다).
    // aria-label 로 **정원 쪽만** 겨냥한다.
    const bars = [...container.querySelectorAll('[role="progressbar"]')];
    expect(bars.filter((b) => (b.getAttribute('aria-label') ?? '').startsWith('정원'))).toEqual([]);
    // 순위 진행률은 리그에도 있어야 한다 — 대조군을 같은 자리에 둔다.
    expect(bars.some((b) => (b.getAttribute('aria-label') ?? '').includes('일정 진행률'))).toBe(true);
    expect(screen.queryByText(/자리 남았어요/)).toBeNull();
  });

  /**
   * 게이트를 처음 넣었을 때 **정원 진행바 두 자리만** 막았는데, 정원·참가비는 화면에 더
   * 흩어져 있었다. 거울이 안 채우는 필드를 전수로 훑어(`teamCount` · `genderCategory` ·
   * `entryFee` · `format` · `parkingInfo` …) 실제로 그려지는 자리를 마저 찾은 결과다.
   *
   * ```
   * 참가팀 섹션        "2/8팀 확정"    ← 8 은 스키마 기본값
   * 완료 기본정보      "2/8팀 확정" + "참가비 무료"
   * ```
   * `V1League` 에는 정원도 참가비도 **필드가 아예 없다** — 둘 다 미설정이 화면에 뜬 것이다.
   */
  it('리그 상세의 참가팀 줄에 정원이 없다 — 수를 그대로 적는다', async () => {
    vi.mocked(v1Get).mockResolvedValueOnce(standingsResponse);
    render(createElement(TournamentDetailView, { tournament: makeMirror(), myRegistration: null }));
    await screen.findByText('통합 순위');
    expect(screen.queryByText(/\/\s*8팀 확정/)).toBeNull();
    expect(screen.getByText(/팀 참가/)).toBeInTheDocument();
  });

  it('대회 상세의 참가팀 줄에는 정원이 있다 — 대조군', () => {
    // status='open' 이어야 헤더 숫자가 `confirmedCount` 를 쓴다(모집 중에는 서버가
    // participantTeams 를 비워 보내므로 그쪽을 세면 0 이 된다 — 컴포넌트 주석 참조).
    render(
      createElement(TournamentDetailView, {
        tournament: makeTournament({ id: 't-cap', status: 'open', format: 'knockout', teamCount: 16, confirmedCount: 4 }),
        myRegistration: null,
      }),
    );
    // 'open' 대회는 참가팀 헤더 말고도 같은 문구가 더 나온다 — 개수는 이 테스트의 관심사가 아니다.
    expect(screen.getAllByText('4/16팀 확정').length).toBeGreaterThan(0);
  });

  it('리그 상세에 참가비를 적지 않는다 — 0 은 "무료"가 아니라 미설정이다', async () => {
    vi.mocked(v1Get).mockResolvedValueOnce(standingsResponse);
    render(createElement(TournamentDetailView, { tournament: makeMirror(), myRegistration: null }));
    await screen.findByText('통합 순위');
    expect(screen.queryByText('참가비')).toBeNull();
  });

  it('대회 상세에는 참가비를 적는다 — 대조군', () => {
    render(
      createElement(TournamentDetailView, {
        tournament: makeTournament({ id: 't-cap', status: 'closed', format: 'knockout', teamCount: 16, confirmedCount: 4 }),
        myRegistration: null,
      }),
    );
    expect(screen.getAllByText('참가비').length).toBeGreaterThan(0);
  });

  it('대회 상세에는 정원 진행바가 있다 — 대조군', async () => {
    // 이 대조군이 없으면 정원 블록을 통째로 지워도 위 테스트가 통과한다.
    //
    // ⚠️ **정원 진행바가 두 자리에 있다** — 모바일 카드(`tm-hide-desktop`)와 데스크탑
    // 우측 레일. 게이트(`showsCapacity`)가 지키는 것은 **모바일 쪽**이고, 레일은
    // `isOpen` 안에 있어 애초에 리그가 도달하지 못한다(아래 테스트에서 못박는다).
    // 그래서 `container.querySelector('[role=progressbar]')` 로 통째로 잡으면 **레일
    // 것이 잡혀 게이트를 지워도 통과한다** — 실제로 처음에 그렇게 vacuous 였다.
    // 게이트가 지키는 자리만 겨냥한다.
    //
    // ⚠️ `mockResolvedValueOnce` 를 **쓰지 않는다** — 대회는 순위 섹션을 안 그려 v1Get 을
    // 부르지 않고, 그러면 큐에 남은 값이 **다음 테스트로 샌다**(실제로 그렇게 깨졌다).
    const tournament = makeTournament({
      id: 't-capacity',
      status: 'open',
      format: 'knockout',
      kind: 'regular_tournament',
      teamCount: 16,
      confirmedCount: 4,
    });
    const { container } = render(
      createElement(TournamentDetailView, { tournament, myRegistration: null }),
    );
    const capacityBars = [...container.querySelectorAll('[role="progressbar"]')].filter((b) =>
      (b.getAttribute('aria-label') ?? '').startsWith('정원'),
    );
    expect(capacityBars.some((b) => b.closest('.tm-hide-desktop') !== null)).toBe(true);
  });

  /**
   * 위 대조군이 "레일 것을 잡아서" vacuous 였던 사고의 나머지 절반.
   *
   * 레일(`railCTA`)에도 정원 진행바가 있는데 **거기엔 게이트를 안 걸었다.** 리그가 도달할 수
   * 없기 때문이다 — 거울의 status 는 `STATUS_BY_LEAGUE_STATE`(draft/in_progress/completed)
   * 로만 만들어져 **`open` 이 나올 수 없고**, 레일은 `status === 'open'` 일 때만 그려진다.
   * `open` 을 넣을 수 있는 유일한 경로인 어드민 `changeStatus` 는 진입 조회가
   * `TOURNAMENT_KINDS` 라 거울에 닿지 않는다.
   *
   * 그 전제를 여기서 못박는다. 안 박으면 다음 사람은 "왜 레일만 안 막았지?" 를 다시
   * 판단해야 하고, 전제가 깨져도 아무것도 red 가 되지 않는다.
   */
  it('리그 상세에는 참가 신청 레일이 아예 없다 — 레일 정원 블록을 게이팅하지 않은 근거', async () => {
    vi.mocked(v1Get).mockResolvedValueOnce(standingsResponse);
    const { container } = render(
      createElement(TournamentDetailView, { tournament: makeMirror(), myRegistration: null }),
    );
    await screen.findByText('통합 순위');
    expect(container.querySelector('[aria-label="참가 신청"]')).toBeNull();
  });

  it('조가 없어도 통합 순위 섹션을 그린다 — 조 개수로 게이팅하면 리그는 영영 안 뜬다', async () => {
    vi.mocked(v1Get).mockResolvedValueOnce(standingsResponse);
    render(createElement(TournamentDetailView, { tournament: makeMirror(), myRegistration: null }));

    expect(await screen.findByText('통합 순위')).toBeInTheDocument();
    // 팀명은 순위표와 일정 카드 **양쪽에** 나온다(그게 정상이다) — 순위 섹션 안으로
    // 범위를 좁혀 단언한다. 좁히지 않으면 "여러 개 찾음" 으로 실패한다.
    const standings = screen.getByRole('region', { name: '통합 순위' });
    expect(within(standings).getByText('강남 유나이티드')).toBeInTheDocument();
  });

  it('일정은 리그 카드로 그리고 팀 이름을 순위 응답에서 붙인다', async () => {
    vi.mocked(v1Get).mockResolvedValueOnce(standingsResponse);
    render(createElement(TournamentDetailView, { tournament: makeMirror(), myRegistration: null }));

    // 대진에는 팀 id 만 실려 온다 — 이름이 붙었다는 것은 lookup 이 동작했다는 뜻이다.
    expect(await screen.findByRole('group', { name: '강남 유나이티드 대 종로 FC' })).toBeInTheDocument();
    // 리그 어휘로 그려진다. 대회 카드였다면 status 'matched' 가 어느 분기에도 안 걸려
    // '예정'(대회의 scheduled 라벨)으로 떨어졌을 것이다.
    expect(screen.getByText('매칭됨')).toBeInTheDocument();
    expect(screen.getByText('올림픽공원 풋살장 A')).toBeInTheDocument();
  });

  it('순위 조회가 실패해도 일정 섹션이 깨지지 않는다 — 팀 이름만 fallback 으로 떨어진다', async () => {
    vi.mocked(v1Get).mockRejectedValueOnce(new Error('boom'));
    render(createElement(TournamentDetailView, { tournament: makeMirror(), myRegistration: null }));

    expect(await screen.findByText('홈팀 정보 없음')).toBeInTheDocument();
    expect(screen.getByText('상대팀 정보 없음')).toBeInTheDocument();
    // 일정 자체는 그대로 있다 — 장소·상태는 대진에 실려 오므로 순위와 무관하다.
    expect(screen.getByText('올림픽공원 풋살장 A')).toBeInTheDocument();
  });

  it('상대팀이 아직 없는 대진은 "상대팀 미정" 으로 구분한다 — 이름을 못 찾은 것과 다르다', async () => {
    vi.mocked(v1Get).mockResolvedValueOnce(standingsResponse);
    const tournament = makeMirror({
      leagueFixtures: [
        {
          teamMatchId: 'tm-2',
          title: '1R',
          homeTeamId: 'team-a',
          awayTeamId: null,
          startAt: '2026-08-31T05:00:00.000Z',
          placeName: '',
          status: 'matched',
        },
      ],
    });
    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    expect(await screen.findByText('상대팀 미정')).toBeInTheDocument();
    expect(screen.queryByText('상대팀 정보 없음')).not.toBeInTheDocument();
  });
});

/**
 * 2026-09-04 alpha 실측 결함: 끝난 경기가 공개 대회 상세의 "조별 일정" 에서 **"예정"** 으로
 * 보이고 점수가 없었다. 같은 대회의 `/bracket` 은 "종료 · 1 : 0" 을 보여줘 **두 공개 화면이
 * 같은 경기를 두고 서로 다른 상태를 말했다.**
 *
 * 원인은 이 카드가 `status` 만 읽은 것이다. `status` 는 타입 주석이 이미 경고하듯
 * **라이브 판정에 쓰면 안 된다** — 서버가 실제로 쓰는 값은 `scheduled`(생성)와
 * `completed`(확정) 둘뿐이라 경기가 뛰는 중에도 `scheduled` 로 남는다. 진행 상태는
 * `liveStatus`, 점수는 `result` 다.
 */
describe('FixtureCard — 진행 상태 배지', () => {
  it('경기가 끝났으면 status 가 scheduled 여도 "종료" 로 보인다', () => {
    // alpha 가 실제로 준 모양: 확정 전이라 status 는 아직 scheduled 인데 경기는 끝났다.
    render(
      createElement(FixtureCard, {
        fixture: makeFixture({ id: 'f1', status: 'scheduled', liveStatus: 'ended' }),
      }),
    );
    expect(screen.getByText('종료')).toBeInTheDocument();
    expect(screen.queryByText('예정')).not.toBeInTheDocument();
  });

  it('진행 중인 경기는 "진행 중" 으로 보인다 — status 로는 절대 알 수 없는 상태다', () => {
    render(
      createElement(FixtureCard, {
        fixture: makeFixture({ id: 'f2', status: 'scheduled', liveStatus: 'live' }),
      }),
    );
    expect(screen.getByText('진행 중')).toBeInTheDocument();
  });

  it('아직 안 시작한 경기는 그대로 "예정" 이다 (회귀 방지)', () => {
    render(
      createElement(FixtureCard, {
        fixture: makeFixture({ id: 'f3', status: 'scheduled', liveStatus: 'scheduled' }),
      }),
    );
    expect(screen.getByText('예정')).toBeInTheDocument();
  });

  // 점수·득점자는 **일부러 안 싣는다** — 오너 결정("몇 대 몇인지랑 누가 넣었는지 그건 빼주고
  // 장소랑 누가 누구 하는지만"). 그 계약은 `fixture-card-goals.test.tsx` 가 지키므로 여기서
  // 중복해서 단언하지 않는다. 이 결함의 범위는 **진행 상태 배지**뿐이다.
});

/**
 * 정원 진행바의 `aria-label` 은 **스크린리더 사용자가 듣는 유일한 문구**다. 화면 라벨만
 * 고치고 여길 두면 무료 대회에서 "입금 대기" 를 듣게 된다 — 눈으로는 안 보이는 회귀라
 * 테스트로만 잡힌다(2026-09-04 Copilot 리뷰가 짚은 자리).
 */
describe('정원 표시 — 무료 대회의 대기 낱말', () => {
  it('무료 대회는 aria-label 에도 "입금" 을 쓰지 않는다', () => {
    const tournament = makeTournament({
      id: 't-free', status: 'open', format: 'group_knockout',
      entryFee: 0, teamCount: 8, confirmedCount: 5, pendingPaymentCount: 3,
    });
    const { container } = render(
      createElement(TournamentDetailView, { tournament, myRegistration: null }),
    );
    const labels = [...container.querySelectorAll('[aria-label]')].map((el) => el.getAttribute('aria-label') ?? '');
    const capacity = labels.filter((label) => label.includes('정원'));
    expect(capacity.length).toBeGreaterThan(0);
    for (const label of capacity) {
      expect(label).not.toContain('입금');
      expect(label).toContain('확인대기');
    }
  });

  it('유료 대회는 그대로 "입금 대기" 로 읽어 준다 — 무료 분기가 유료를 삼키면 안 된다', () => {
    const tournament = makeTournament({
      id: 't-paid', status: 'open', format: 'group_knockout',
      entryFee: 20000, teamCount: 8, confirmedCount: 5, pendingPaymentCount: 3,
    });
    const { container } = render(
      createElement(TournamentDetailView, { tournament, myRegistration: null }),
    );
    const capacity = [...container.querySelectorAll('[aria-label]')]
      .map((el) => el.getAttribute('aria-label') ?? '')
      .filter((label) => label.includes('정원'));
    expect(capacity.some((label) => label.includes('입금대기'))).toBe(true);
  });
});
