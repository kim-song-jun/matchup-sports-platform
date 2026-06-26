import { describe, expect, it } from 'vitest';
import {
  getTournamentPostEventCards,
  getTournamentVenuePrepItems,
} from '@/components/tournaments/tournament-venue-retention-sections';
import { getTournamentSponsorCards } from '@/components/tournaments/tournament-sponsor-section';
import { getParticipantTeamBuckets, getPrizeBreakdownChips, partitionTournamentSections } from './tournament-detail-client';
import type {
  V1TournamentFixture,
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
    ...overrides,
  };
}

function makeParticipantTeam(
  overrides: Partial<V1TournamentParticipantTeam> & Pick<V1TournamentParticipantTeam, 'registrationId' | 'status'>,
): V1TournamentParticipantTeam {
  return {
    teamId: `team-${overrides.registrationId}`,
    teamName: `팀 ${overrides.registrationId}`,
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
  it('shows confirmed venue data while keeping parking as an operator update state', () => {
    const items = getTournamentVenuePrepItems({
      venue: '서울 풋살파크',
      hasRules: true,
    });

    expect(items.find((item) => item.key === 'venue')).toMatchObject({
      label: '장소',
      value: '서울 풋살파크',
      status: 'confirmed',
    });
    expect(items.find((item) => item.key === 'parking')).toMatchObject({
      label: '주차',
      status: 'operator_update',
    });
    expect(items.find((item) => item.key === 'rules')).toMatchObject({
      status: 'confirmed',
    });
  });

  it('does not invent venue or rules text when the public tournament contract is missing them', () => {
    const items = getTournamentVenuePrepItems({
      venue: null,
      hasRules: false,
    });

    expect(items.find((item) => item.key === 'venue')).toMatchObject({
      value: '장소 공지 전',
      status: 'operator_update',
    });
    expect(items.find((item) => item.key === 'rules')).toMatchObject({
      value: '규정 공지 전',
      status: 'operator_update',
    });
  });

  it('links venue, parking, and preparation rows to the published venue notice when present', () => {
    const context = {
      venue: null,
      hasRules: false,
      announcements: [
        {
          id: 'ann-venue',
          title: '주차·입장·경기 준비 안내',
          category: 'venue' as const,
        },
      ],
    };

    const items = getTournamentVenuePrepItems(context);

    expect(items.find((item) => item.key === 'venue')).toMatchObject({
      value: '주차·입장·경기 준비 안내',
      status: 'available',
      actionLabel: '공지 보기',
      href: '#announcement-ann-venue',
    });
    expect(items.find((item) => item.key === 'parking')).toMatchObject({
      status: 'available',
      actionLabel: '공지 보기',
      href: '#announcement-ann-venue',
    });
    expect(items.find((item) => item.key === 'rules')).toMatchObject({
      status: 'available',
      actionLabel: '공지 보기',
      href: '#announcement-ann-venue',
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
