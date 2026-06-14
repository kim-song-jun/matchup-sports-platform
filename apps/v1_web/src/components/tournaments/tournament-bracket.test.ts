import { describe, expect, it } from 'vitest';
import { groupFixturesByRound } from './tournament-bracket';
import type { V1TournamentFixture, V1TournamentGroup } from '@/types/api';

/* ── Fixture / group factories ── */

function makeFixture(
  overrides: Partial<V1TournamentFixture> & Pick<V1TournamentFixture, 'id' | 'fixtureNumber'>,
): V1TournamentFixture {
  return {
    groupId: null,
    round: 'round_1',
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

function makeGroup(
  overrides: Partial<V1TournamentGroup> & Pick<V1TournamentGroup, 'id' | 'phase'>,
): V1TournamentGroup {
  return {
    name: overrides.phase,
    sortOrder: 0,
    groupTeams: [],
    standings: [],
    ...overrides,
  };
}

/* ── Tests ── */

describe('groupFixturesByRound', () => {
  it('returns an empty array when no fixtures are provided', () => {
    const result = groupFixturesByRound([], []);
    expect(result).toEqual([]);
  });

  it('partitions fixtures by group.phase when groupId is matched', () => {
    const groupSemi = makeGroup({ id: 'g-semi', phase: 'semi' });
    const groupFinal = makeGroup({ id: 'g-final', phase: 'final' });

    const f1 = makeFixture({ id: 'f1', fixtureNumber: 1, groupId: 'g-semi' });
    const f2 = makeFixture({ id: 'f2', fixtureNumber: 2, groupId: 'g-semi' });
    const f3 = makeFixture({ id: 'f3', fixtureNumber: 1, groupId: 'g-final' });

    const rounds = groupFixturesByRound([f1, f2, f3], [groupSemi, groupFinal]);

    expect(rounds).toHaveLength(2);
    expect(rounds[0].key).toBe('semi');
    expect(rounds[0].fixtures.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(rounds[1].key).toBe('final');
    expect(rounds[1].fixtures.map((f) => f.id)).toEqual(['f3']);
  });

  it('sorts rounds by PHASE_ORDER: semi(0) < final(1) < third_place(2)', () => {
    const groupThird = makeGroup({ id: 'g-third', phase: 'third_place' });
    const groupSemi = makeGroup({ id: 'g-semi', phase: 'semi' });
    const groupFinal = makeGroup({ id: 'g-final', phase: 'final' });

    const fThird = makeFixture({ id: 'ft', fixtureNumber: 1, groupId: 'g-third' });
    const fFinal = makeFixture({ id: 'ff', fixtureNumber: 1, groupId: 'g-final' });
    const fSemi1 = makeFixture({ id: 'fs1', fixtureNumber: 2, groupId: 'g-semi' });
    const fSemi2 = makeFixture({ id: 'fs2', fixtureNumber: 1, groupId: 'g-semi' });

    // Feed in deliberate wrong order to verify sort is applied
    const rounds = groupFixturesByRound(
      [fThird, fFinal, fSemi1, fSemi2],
      [groupThird, groupSemi, groupFinal],
    );

    expect(rounds.map((r) => r.key)).toEqual(['semi', 'final', 'third_place']);
  });

  it('sorts fixtures within a round by fixtureNumber ascending', () => {
    const groupSemi = makeGroup({ id: 'g-semi', phase: 'semi' });

    const fA = makeFixture({ id: 'fA', fixtureNumber: 3, groupId: 'g-semi' });
    const fB = makeFixture({ id: 'fB', fixtureNumber: 1, groupId: 'g-semi' });
    const fC = makeFixture({ id: 'fC', fixtureNumber: 2, groupId: 'g-semi' });

    const rounds = groupFixturesByRound([fA, fB, fC], [groupSemi]);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].fixtures.map((f) => f.fixtureNumber)).toEqual([1, 2, 3]);
    expect(rounds[0].fixtures.map((f) => f.id)).toEqual(['fB', 'fC', 'fA']);
  });

  it('uses fixture.round as key with sortIndex=100 when groupId is null', () => {
    const f = makeFixture({ id: 'f-free', fixtureNumber: 1, groupId: null, round: 'quarterfinal' });

    const rounds = groupFixturesByRound([f], []);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].key).toBe('quarterfinal');
    expect(rounds[0].sortIndex).toBe(100);
  });

  it('uses fixture.round as fallback when groupId is present but group is not found', () => {
    const f = makeFixture({ id: 'f-missing', fixtureNumber: 1, groupId: 'nonexistent', round: 'mystery' });

    const rounds = groupFixturesByRound([f], []);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].key).toBe('mystery');
    expect(rounds[0].sortIndex).toBe(100);
  });

  it('places phase-keyed rounds before fallback round-string rounds', () => {
    const groupFinal = makeGroup({ id: 'g-final', phase: 'final' });

    const fFinal = makeFixture({ id: 'ff', fixtureNumber: 1, groupId: 'g-final' });
    const fFree = makeFixture({ id: 'fr', fixtureNumber: 1, groupId: null, round: 'aaa' });

    // 'aaa' would sort before 'final' alphabetically — but it should come AFTER since sortIndex=100
    const rounds = groupFixturesByRound([fFree, fFinal], [groupFinal]);

    expect(rounds[0].key).toBe('final');
    expect(rounds[1].key).toBe('aaa');
  });

  it('returns correct labels for known phases', () => {
    const groupSemi = makeGroup({ id: 'g-semi', phase: 'semi' });
    const groupFinal = makeGroup({ id: 'g-final', phase: 'final' });
    const groupThird = makeGroup({ id: 'g-third', phase: 'third_place' });

    const rounds = groupFixturesByRound(
      [
        makeFixture({ id: 'fs', fixtureNumber: 1, groupId: 'g-semi' }),
        makeFixture({ id: 'ff', fixtureNumber: 1, groupId: 'g-final' }),
        makeFixture({ id: 'ft', fixtureNumber: 1, groupId: 'g-third' }),
      ],
      [groupSemi, groupFinal, groupThird],
    );

    const byKey = Object.fromEntries(rounds.map((r) => [r.key, r.label]));
    expect(byKey['semi']).toBe('4강');
    expect(byKey['final']).toBe('결승');
    expect(byKey['third_place']).toBe('3·4위전');
  });

  it('uses key as label for unknown phases', () => {
    const f = makeFixture({ id: 'f-unknown', fixtureNumber: 1, groupId: null, round: 'unknown_round' });

    const rounds = groupFixturesByRound([f], []);

    expect(rounds[0].label).toBe('unknown_round');
  });

  it('multiple fixtures with same null groupId and same round string collapse into one round', () => {
    const f1 = makeFixture({ id: 'f1', fixtureNumber: 2, groupId: null, round: 'r1' });
    const f2 = makeFixture({ id: 'f2', fixtureNumber: 1, groupId: null, round: 'r1' });

    const rounds = groupFixturesByRound([f1, f2], []);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].fixtures.map((f) => f.id)).toEqual(['f2', 'f1']);
  });
});
