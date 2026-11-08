import { describe, expect, it } from 'vitest';
import { sameGroupPairs, type SameGroupFixture, type SameGroupSlot } from './multi-final-same-group';

// 6-team tournament: seeds 1 and 2 skip the first round (byes); seeds 4-5 and 3-6 play it.
const slots: SameGroupSlot[] = [1, 2, 3, 4, 5, 6].map(position => ({ id: `s${position}`, position }));
const fixtures: SameGroupFixture[] = [
  { id: 'r1', homeSlotId: 's4', awaySlotId: 's5', bracketSources: [] },
  { id: 'r2', homeSlotId: 's3', awaySlotId: 's6', bracketSources: [] },
  { id: 'semi1', homeSlotId: 's1', awaySlotId: null, bracketSources: [{ fixtureId: 'r1', side: 'AWAY' }] },
  { id: 'semi2', homeSlotId: 's2', awaySlotId: null, bracketSources: [{ fixtureId: 'r2', side: 'AWAY' }] },
  { id: 'final', homeSlotId: null, awaySlotId: null, bracketSources: [{ fixtureId: 'semi1', side: 'HOME' }, { fixtureId: 'semi2', side: 'AWAY' }] },
];
const groupOf = (teams: Record<string, string>) => (id: string) => teams[id];
const pairs = (seeds: string[], teams: Record<string, string>) => sameGroupPairs({ fixtures, slots, seeds, groupOf: groupOf(teams) });

describe('sameGroupPairs', () => {
  const seeds = ['t1', 't4', 't2', 't5', 't3', 't6'];

  it('lists same-group teams that can still reach each other through a pending winner', () => {
    const result = pairs(seeds, { t1: 'A', t2: 'A', t3: 'A', t4: 'B', t5: 'B', t6: 'B' });
    expect(result.get('semi1')).toEqual([['t1', 't3']]);
    expect(result.get('semi2')).toEqual([['t4', 't6']]);
  });
  it('lists teams drawn against each other in a first-round game', () => {
    // seeds 4 and 5 (t5, t3) now share a group
    const result = pairs(seeds, { t1: 'A', t2: 'B', t3: 'C', t4: 'B', t5: 'C', t6: 'A' });
    expect(result.get('r1')).toEqual([['t5', 't3']]);
  });
  it('stays silent for games whose possible teams all come from different groups', () => {
    const result = pairs(seeds, { t1: 'A', t2: 'B', t3: 'C', t4: 'D', t5: 'E', t6: 'F' });
    expect([...result.values()].flat()).toEqual([]);
  });
  it('follows pending winners through every earlier round into the final', () => {
    const result = pairs(seeds, { t1: 'A', t5: 'B', t3: 'C', t4: 'D', t2: 'C', t6: 'E' });
    expect(result.get('final')).toEqual([['t3', 't2']]);
  });
  it('ignores unassigned seeds and teams without a group', () => {
    const result = pairs(['t1', 't4', 't2'], { t1: 'A', t2: 'A', t3: 'A', t4: 'B' });
    expect(result.get('semi1')).toEqual([]);
    expect(result.get('semi2')).toEqual([]);
  });
  it('does not loop on a corrupt advancement cycle', () => {
    const cyclic: SameGroupFixture[] = [
      { id: 'x', homeSlotId: 's1', awaySlotId: null, bracketSources: [{ fixtureId: 'y', side: 'AWAY' }] },
      { id: 'y', homeSlotId: 's2', awaySlotId: null, bracketSources: [{ fixtureId: 'x', side: 'AWAY' }] },
    ];
    expect(() => sameGroupPairs({ fixtures: cyclic, slots, seeds: ['t1', 't2'], groupOf: () => 'A' })).not.toThrow();
  });
});
