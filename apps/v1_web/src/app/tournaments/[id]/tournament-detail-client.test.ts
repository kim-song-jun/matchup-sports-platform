import { describe, expect, it } from 'vitest';
import { partitionTournamentSections } from './tournament-detail-client';
import type { V1TournamentFixture, V1TournamentGroup } from '@/types/api';

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

/* ── Tests ── */

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
