import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  getTournamentPostEventCards,
  getTournamentVenuePrepItems,
} from '@/components/tournaments/tournament-venue-retention-sections';
import { getTournamentSponsorCards } from '@/components/tournaments/tournament-sponsor-section';
import {
  getCompletedChampionName,
  getParticipantTeamBuckets,
  getPrizeBreakdownChips,
  partitionTournamentSections,
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
    homeRegistrationId: null,
    homeTeamName: 'Home',
    awayRegistrationId: null,
    awayTeamName: 'Away',
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
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: null,
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
    refundPolicyText: null,
    confirmedCount: 0,
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
    expect(cards.find((card) => card.key === 'reviews')).toMatchObject({
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
    expect(cards.find((card) => card.key === 'reviews')).toMatchObject({
      status: 'available',
      actionLabel: '리뷰 안내 보기',
      href: '#announcement-ann-review',
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
          registrationId: 'r2', teamId: 'team-2', teamName: '2위팀', position: 2,
          points: 10, wins: 3, draws: 1, losses: 1, goalsFor: 8, goalsAgainst: 5, recalculatedAt: null,
        },
        {
          registrationId: 'r1', teamId: 'team-1', teamName: '1위팀', position: 1,
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
    expect(screen.queryByText('대진표 준비 중')).not.toBeInTheDocument();
  });

  it('keeps the application guide, flow explainer, and inline standings/fixtures sections for open tournaments (non-destructive)', () => {
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
    expect(screen.getByText('순위표')).toBeInTheDocument();
    expect(screen.getByText('대진표 준비 중')).toBeInTheDocument();
  });

  it('keeps the application guide and flow explainer for in_progress tournaments (non-destructive)', () => {
    const tournament = makeTournament({ id: 't1', status: 'in_progress', format: 'league', groups: [], fixtures: [] });

    render(createElement(TournamentDetailView, { tournament, myRegistration: null }));

    expect(screen.getByText('참가 신청 안내')).toBeInTheDocument();
    expect(screen.getByText('대회 진행 방식')).toBeInTheDocument();
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

describe('AccordionSection toggle (rendered via completed TournamentDetailView)', () => {
  it('toggles aria-expanded from false to true to false across real click interactions', () => {
    const tournament = makeTournament({
      id: 't1',
      status: 'completed',
      format: 'league',
      groups: [],
      rulesText: '경기 시작 10분 전까지 집합해 주세요.',
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
