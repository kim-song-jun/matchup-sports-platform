import { describe, expect, it } from 'vitest';
import { buildBracketData, groupFixturesByRound } from './tournament-bracket';
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
    advanceCount: null,
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

/* ── bracketry mapping ── */

function makeResult(
  overrides: Partial<V1TournamentFixture['result'] & object> = {},
): NonNullable<V1TournamentFixture['result']> {
  return {
    homeScore: 0,
    awayScore: 0,
    hasPenalty: false,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    note: null,
    recordedAt: '2026-06-18T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildBracketData', () => {
  const semi = makeGroup({ id: 'g-semi', phase: 'semi' });
  const final = makeGroup({ id: 'g-final', phase: 'final' });
  const third = makeGroup({ id: 'g-third', phase: 'third_place' });

  it('maps main rounds to bracketry rounds and assigns roundIndex/order', () => {
    const s1 = makeFixture({ id: 's1', fixtureNumber: 1, groupId: 'g-semi' });
    const s2 = makeFixture({ id: 's2', fixtureNumber: 2, groupId: 'g-semi' });
    const f1 = makeFixture({ id: 'f1', fixtureNumber: 1, groupId: 'g-final' });

    const data = buildBracketData([s1, s2, f1], [semi, final]);

    expect(data.rounds).toEqual([{ name: '4강' }, { name: '결승' }]);
    const main = data.matches.filter((m) => !m.isBronzeMatch);
    expect(main.map((m) => [m.roundIndex, m.order])).toEqual([
      [0, 0], // s1
      [0, 1], // s2
      [1, 0], // final
    ]);
  });

  it('emits third_place as a bronze match pinned to the final round index, order 1', () => {
    const s1 = makeFixture({ id: 's1', fixtureNumber: 1, groupId: 'g-semi' });
    const s2 = makeFixture({ id: 's2', fixtureNumber: 2, groupId: 'g-semi' });
    const f1 = makeFixture({ id: 'f1', fixtureNumber: 1, groupId: 'g-final' });
    const t1 = makeFixture({ id: 't1', fixtureNumber: 1, groupId: 'g-third' });

    const data = buildBracketData([s1, s2, f1, t1], [semi, final, third]);

    // third_place is NOT a separate round — final index is 1 (semi=0, final=1)
    expect(data.rounds).toEqual([{ name: '4강' }, { name: '결승' }]);
    const bronze = data.matches.find((m) => m.isBronzeMatch);
    expect(bronze).toBeDefined();
    expect(bronze!.roundIndex).toBe(1);
    expect(bronze!.order).toBe(1);
  });

  it('marks the winning side and carries scores', () => {
    const f1 = makeFixture({
      id: 'f1', fixtureNumber: 1, groupId: 'g-final', status: 'completed',
      homeTeamName: 'A', awayTeamName: 'B',
      result: makeResult({ homeScore: 3, awayScore: 1 }),
    });

    const data = buildBracketData([f1], [final]);
    const m = data.matches[0];

    expect(m.sides[0].isWinner).toBe(true);
    expect(m.sides[1].isWinner).toBeUndefined();
    expect(m.sides[0].scores).toEqual([{ mainScore: 3, isWinner: true }]);
    expect(m.sides[1].scores).toEqual([{ mainScore: 1, isWinner: false }]);
    expect(m.matchStatus).toBe('종료');
  });

  it('appends 승부차기 to matchStatus on a penalty shootout', () => {
    const f1 = makeFixture({
      id: 'f1', fixtureNumber: 1, groupId: 'g-final', status: 'completed',
      result: makeResult({ homeScore: 1, awayScore: 1, hasPenalty: true, homePenaltyScore: 5, awayPenaltyScore: 4 }),
    });

    const data = buildBracketData([f1], [final]);
    expect(data.matches[0].matchStatus).toBe('종료 · 승부차기 5:4');
    expect(data.matches[0].sides[0].isWinner).toBe(true);
  });

  it('dedupes a team that advances across rounds into one contestant (by registrationId)', () => {
    const s1 = makeFixture({
      id: 's1', fixtureNumber: 1, groupId: 'g-semi', status: 'completed',
      homeRegistrationId: 'reg-A', homeTeamName: 'A',
      awayRegistrationId: 'reg-X', awayTeamName: 'X',
      result: makeResult({ homeScore: 2, awayScore: 0 }),
    });
    const f1 = makeFixture({
      id: 'f1', fixtureNumber: 1, groupId: 'g-final',
      homeRegistrationId: 'reg-A', homeTeamName: 'A',
      awayRegistrationId: 'reg-Y', awayTeamName: 'Y',
    });

    const data = buildBracketData([s1, f1], [semi, final]);

    // 'reg-A' appears in both semi and final but is registered once
    expect(data.contestants['reg-A']).toEqual({ players: [{ title: 'A' }] });
    expect(Object.keys(data.contestants).sort()).toEqual(['reg-A', 'reg-X', 'reg-Y']);
  });

  it('renders an empty side (no contestantId) for a 미정/TBD slot', () => {
    const f1 = makeFixture({
      id: 'f1', fixtureNumber: 1, groupId: 'g-final',
      homeRegistrationId: 'reg-A', homeTeamName: 'A',
      awayRegistrationId: null, awayTeamName: '',
    });

    const data = buildBracketData([f1], [final]);
    const m = data.matches[0];

    expect(m.sides[0].contestantId).toBe('reg-A');
    expect(m.sides[1].contestantId).toBeUndefined();
    // empty slot is not registered as a contestant
    expect(Object.keys(data.contestants)).toEqual(['reg-A']);
  });

  it('falls back to a name-based contestant id when registrationId is null', () => {
    const f1 = makeFixture({
      id: 'f1', fixtureNumber: 1, groupId: 'g-final',
      homeRegistrationId: null, homeTeamName: '강남 러닝 크루',
      awayRegistrationId: null, awayTeamName: '송파 풋살 모임',
    });

    const data = buildBracketData([f1], [final]);
    expect(data.matches[0].sides[0].contestantId).toBe('name:강남 러닝 크루');
    expect(data.contestants['name:강남 러닝 크루']).toEqual({ players: [{ title: '강남 러닝 크루' }] });
  });

  it('returns no matches when there are no fixtures', () => {
    const data = buildBracketData([], []);
    expect(data).toEqual({ rounds: [], matches: [], contestants: {} });
  });
});
