import { planBracketTemplate, type BracketTemplateInput } from './bracket-template-plan';

const plan = (input: BracketTemplateInput) => planBracketTemplate(input, { fixtureNumberOffset: 0 });

describe('flexible bracket', () => {
  it.each([0, 1, 7, 99, 0xffffffff])('2개 조 각3팀은 seed %i에도 상단 A1-[B2/A3], 하단 B1-[A2/B3]로 생성한다', (drawSeed) => {
    for (const thirdPlace of [false, true]) {
      const p = plan({ kind: 'group_knockout', schemaVersion: 2, groupCount: 2, teamsPerGroup: 5,
        advancePerGroup: 3, legs: 1, thirdPlace, drawSeed,
        groups: [{ name: 'A조', capacity: 5, advanceCount: 3 }, { name: 'B조', capacity: 4, advanceCount: 3 }] });
      const slot = (key: string | null) => {
        const row = p.slots.find(s => s.key === key)!;
        return [row.sourceGroupKey, row.position];
      };
      const semis = p.fixtures.filter(f => f.groupKey === 'ko:semi');
      expect(semis).toHaveLength(2);
      expect(semis.map(f => slot(f.homeSlotKey))).toEqual([['group:0', 1], ['group:1', 1]]);
      expect(semis.map(f => p.slots.find(s => s.key === f.homeSlotKey)?.byeSortOrder)).toEqual([0, 2]);
      for (const [index, semi] of semis.entries()) {
        const incoming = p.edges.filter(e => e.targetFixtureKey === semi.key);
        expect(incoming).toEqual([expect.objectContaining({ outcome: 'WINNER', targetSide: 'AWAY' })]);
        const first = p.fixtures.find(f => f.key === incoming[0].sourceFixtureKey)!;
        expect([slot(first.homeSlotKey), slot(first.awaySlotKey)]).toEqual(index === 0
          ? [['group:1', 2], ['group:0', 3]] : [['group:0', 2], ['group:1', 3]]);
      }
      const final = p.fixtures.find(f => f.groupKey === 'ko:final')!;
      expect(p.edges.filter(e => e.targetFixtureKey === final.key)).toEqual(semis.map((f, index) => ({
        sourceFixtureKey: f.key, outcome: 'WINNER', targetFixtureKey: final.key, targetSide: index === 0 ? 'HOME' : 'AWAY',
      })));
      expect(p.slots.filter(s => s.kind === 'GROUP_RANK')).toHaveLength(6);
      expect(plan({ kind: 'group_knockout', schemaVersion: 2, groupCount: 2, teamsPerGroup: 5,
        advancePerGroup: 3, legs: 1, thirdPlace, drawSeed }).slots.filter(s => s.byeSortOrder != null)
        .map(s => [s.sourceGroupKey, s.position, s.byeSortOrder])).toEqual([['group:0', 1, 0], ['group:1', 1, 2]]);
    }
  });

  it('uses each group rotation independently and keeps old global rotations compatible', () => {
    const input = { kind: 'group_knockout' as const, schemaVersion: 2 as const, groupCount: 2,
      teamsPerGroup: 3, advancePerGroup: 1, legs: 2 as const, thirdPlace: false,
      groups: [{ name: 'A', capacity: 3, advanceCount: 1, legs: 1 as const },
        { name: 'B', capacity: 3, advanceCount: 1, legs: 2 as const }] };
    const mixed = plan(input);
    expect(mixed.fixtures.filter(row => row.groupKey === 'group:0')).toHaveLength(3);
    const second = mixed.fixtures.filter(row => row.groupKey === 'group:1');
    expect(second).toHaveLength(6);
    for (const fixture of second) expect(second).toEqual(expect.arrayContaining([
      expect.objectContaining({ homeSlotKey: fixture.awaySlotKey, awaySlotKey: fixture.homeSlotKey }),
    ]));
    expect(mixed.fixtures).toHaveLength(10);
    const legacy = plan({ ...input, groups: input.groups.map(({ legs: _legs, ...group }) => group) });
    expect(legacy.fixtures).toHaveLength(13);
  });

  it('rejects invalid per-group rotations and includes them in the 240-game limit', () => {
    const input = { kind: 'group_knockout' as const, schemaVersion: 2 as const, groupCount: 8,
      teamsPerGroup: 8, advancePerGroup: 2, legs: 1 as const, thirdPlace: true,
      groups: Array.from({ length: 8 }, (_, i) => ({ name: String(i), capacity: 8, advanceCount: 2, legs: 1 as 1 | 2 })) };
    expect(plan(input).fixtures).toHaveLength(240);
    expect(() => plan({ ...input, groups: input.groups.map((group, i) => ({ ...group, legs: i === 0 ? 2 : 1 })) })).toThrow();
    expect(() => plan({ ...input, groups: input.groups.map(group => ({ ...group, legs: 3 as 1 })) })).toThrow();
  });

  it.each(Array.from({ length: 61 }, (_, i) => 4 + i))('%i teams have a complete playable path to the final', (size) => {
    const p = plan({ kind: 'knockout', schemaVersion: 2, size, thirdPlace: true, drawSeed: 7 });
    expect(p.fixtures).toHaveLength(size);
    expect(p.slots).toHaveLength(size);
    expect(p.byeSlots).toHaveLength(2 ** Math.ceil(Math.log2(size)) - size);
    const participants = new Map(p.slots.map((slot, i) => [slot.key, new Set([i])]));
    const winners = new Map<string, Set<number>>();
    for (const fixture of p.fixtures.filter((row) => row.groupKey !== 'ko:third_place')) {
      const sides = (['HOME', 'AWAY'] as const).map((side) => {
        const key = side === 'HOME' ? fixture.homeSlotKey : fixture.awaySlotKey;
        const edges = p.edges.filter((edge) => edge.targetFixtureKey === fixture.key && edge.targetSide === side);
        expect(Number(key !== null) + edges.length).toBe(1);
        return key ? participants.get(key)! : winners.get(edges[0].sourceFixtureKey)!;
      });
      expect([...sides[0]].filter((id) => sides[1].has(id))).toEqual([]);
      winners.set(fixture.key, new Set([...sides[0], ...sides[1]]));
    }
    expect(winners.get('ko:2:0')?.size).toBe(size);
  });

  it('14 teams in unequal groups create 18 group games and a connected 8-team final', () => {
    const input = { kind: 'group_knockout' as const, schemaVersion: 2 as const, participantCount: 14,
      groupCount: 4, teamsPerGroup: 4, advancePerGroup: 2, legs: 1 as const, thirdPlace: false,
      groups: [4, 4, 3, 3].map((capacity, i) => ({ name: `${i}조`, capacity, advanceCount: 2 })) };
    const p = plan(input);
    expect(p.fixtures).toHaveLength(25);
    expect(p.slots.filter((slot) => slot.kind === 'GROUP_RANK')).toHaveLength(8);
    expect(p.slots.filter((slot) => slot.kind === 'GROUP_RANK').every((slot) => slot.sourceGroupKey)).toBe(true);
    for (let i = 0; i < 4; i++) {
      const games = p.fixtures.filter((row) => row.groupKey === `group:${i}`);
      expect(games).toHaveLength(i < 2 ? 6 : 3);
      expect(new Set(games.map((row) => [row.homeSlotKey, row.awaySlotKey].sort().join('|'))).size).toBe(games.length);
    }
    expect(plan(input)).toEqual(p);
  });

  it('5 qualifiers preserve their source ranks even when they get a bye', () => {
    const p = plan({ kind: 'group_knockout', schemaVersion: 2, groupCount: 3, teamsPerGroup: 5, advancePerGroup: 2,
      legs: 1, thirdPlace: false, groups: [5, 5, 4].map((capacity, i) => ({ name: `${i}조`, capacity, advanceCount: i === 2 ? 1 : 2 })) });
    expect(p.fixtures).toHaveLength(30);
    expect(p.byeSlots).toHaveLength(3);
    const byes = p.slots.filter((slot) => slot.byeSortOrder != null);
    expect(byes).toHaveLength(3);
    expect(byes.every((slot) => slot.kind === 'GROUP_RANK' && slot.position === 1 && slot.sourceGroupKey)).toBe(true);
  });

  it('9 teams in 5+4 groups generate only real games and a 5-team final', () => {
    const p = plan({ kind: 'group_knockout', schemaVersion: 2, participantCount: 9,
      groupCount: 2, teamsPerGroup: 5, advancePerGroup: 2, legs: 1, thirdPlace: false,
      groups: [{ name: 'A', capacity: 5, advanceCount: 3 }, { name: 'B', capacity: 4, advanceCount: 2 }] });
    expect(p.fixtures).toHaveLength(20); // 10 + 6 group games, 4 knockout games
    expect(p.byeSlots).toHaveLength(3);
    for (const [index, count] of [5, 4].entries()) {
      const key = `group:${index}`;
      const slots = p.slots.filter(slot => slot.groupKey === key);
      const games = p.fixtures.filter(game => game.groupKey === key);
      expect(games).toHaveLength(count * (count - 1) / 2);
      expect(new Set(games.map(game => [game.homeSlotKey, game.awaySlotKey].sort().join('|'))).size).toBe(games.length);
      for (const game of games) {
        expect(slots.some(slot => slot.key === game.homeSlotKey)).toBe(true);
        expect(slots.some(slot => slot.key === game.awaySlotKey)).toBe(true);
        expect(game.homeSlotKey).not.toBe(game.awaySlotKey);
      }
      for (const slot of slots) expect(games.filter(game => game.homeSlotKey === slot.key || game.awaySlotKey === slot.key)).toHaveLength(count - 1);
    }
  });

  it('enforces the combined 240-game limit', () => {
    const input = { kind: 'group_knockout' as const, schemaVersion: 2 as const, groupCount: 8, teamsPerGroup: 8,
      advancePerGroup: 2, legs: 1 as const, thirdPlace: true };
    expect(plan(input).fixtures).toHaveLength(240);
    expect(() => plan({ ...input, legs: 2 })).toThrow();
  });
  it.each([2, 3, 7])('%i qualifiers retain a complete small or odd final without a third-place match', (size) => {
    const groups = size === 7 ? [{ name: 'A', capacity: 5, advanceCount: 4 }, { name: 'B', capacity: 5, advanceCount: 3 }]
      : [{ name: 'A', capacity: 3, advanceCount: size - 1 }, { name: 'B', capacity: 3, advanceCount: 1 }];
    const p = plan({ kind: 'group_knockout', schemaVersion: 2, groups, groupCount: 2, teamsPerGroup: 3, advancePerGroup: 1, legs: 1, thirdPlace: false });
    expect(p.fixtures.filter(row => row.groupKey.startsWith('ko:'))).toHaveLength(size - 1);
    expect(p.byeSlots).toHaveLength(2 ** Math.ceil(Math.log2(size)) - size);
    expect(p.slots.filter(row => row.kind === 'GROUP_RANK')).toHaveLength(size);
  });

  it.each([0, 3, 65, 66, 4.5])('rejects invalid standalone count %i', (size) => {
    expect(() => plan({ kind: 'knockout', schemaVersion: 2, size, thirdPlace: false })).toThrow();
  });
});
