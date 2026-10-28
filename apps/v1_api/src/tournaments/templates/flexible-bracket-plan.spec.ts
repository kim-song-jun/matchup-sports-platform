import { planBracketTemplate, type BracketTemplateInput } from './bracket-template-plan';

const plan = (input: BracketTemplateInput) => planBracketTemplate(input, { fixtureNumberOffset: 0 });

describe('flexible bracket', () => {
  it.each(Array.from({ length: 31 }, (_, i) => 4 + i * 2))('%i teams have a complete playable path to the final', (size) => {
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

  it.each([0, 3, 5, 65, 66, 4.5])('rejects invalid standalone count %i', (size) => {
    expect(() => plan({ kind: 'knockout', schemaVersion: 2, size, thirdPlace: false })).toThrow();
  });
});
