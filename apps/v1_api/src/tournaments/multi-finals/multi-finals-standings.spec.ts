import { savedStandingsSnapshot, standingOrder, standingsOrderChanged } from './multi-finals-standings';

const row = (registrationId: string, position: number | null) => ({ registrationId, position });
const groupStandings = [
  { groupId: 'A', rows: [row('a2', 2), row('a1', 1), row('a3', 3), row('a4', 4)] },
  { groupId: 'B', rows: [row('b1', 1), row('b2', 2), row('b3', 3)] },
  { groupId: 'C', rows: [row('c1', 1), row('c2', 2)] },
];

describe('standingOrder', () => {
  it('orders each requested group by stored position and skips groups that were not requested', () => {
    expect(standingOrder(groupStandings, ['A', 'B'])).toEqual([
      { groupId: 'A', registrationIds: ['a1', 'a2', 'a3', 'a4'] },
      { groupId: 'B', registrationIds: ['b1', 'b2', 'b3'] },
    ]);
  });
  it('leaves unranked teams out so a group that lost its ranking differs from the saved order', () => {
    const rows = [row('a1', 1), row('a2', null), row('a3', 3)];
    expect(standingOrder([{ groupId: 'A', rows }], ['A'])).toEqual([{ groupId: 'A', registrationIds: ['a1', 'a3'] }]);
  });
  it('reports a requested group that no longer exists as an empty order', () => {
    expect(standingOrder(groupStandings, ['Z'])).toEqual([{ groupId: 'Z', registrationIds: [] }]);
  });
});

describe('standingsOrderChanged', () => {
  const saved = [{ groupId: 'A', registrationIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'] }, { groupId: 'B', registrationIds: ['b1', 'b2', 'b3', 'b4', 'b5', 'b6'] }];
  const ranks = (groupIds: string[], list: number[]) => groupIds.flatMap(groupId => list.map(rank => ({ groupId, rank })));
  const premier = ranks(['A', 'B'], [1, 2, 3]);
  const challenger = ranks(['A', 'B'], [4, 5, 6]);
  const swapIn = (groupId: string, first: number, second: number) => saved.map(group => {
    if (group.groupId !== groupId) return { ...group, registrationIds: [...group.registrationIds] };
    const ids = [...group.registrationIds]; [ids[first - 1], ids[second - 1]] = [ids[second - 1], ids[first - 1]];
    return { ...group, registrationIds: ids };
  });
  it('is false while every referenced rank keeps its team', () => {
    expect(standingsOrderChanged(saved, swapIn('Z', 1, 2), premier)).toBe(false);
  });
  it('warns the final using ranks 1-3 on a 1<->2 swap but not the one using ranks 4-6', () => {
    const now = swapIn('A', 1, 2);
    expect(standingsOrderChanged(saved, now, premier)).toBe(true);
    expect(standingsOrderChanged(saved, now, challenger)).toBe(false);
  });
  it('warns both finals on a 3<->4 swap because each uses one of the two ranks', () => {
    const now = swapIn('B', 3, 4);
    expect(standingsOrderChanged(saved, now, premier)).toBe(true);
    expect(standingsOrderChanged(saved, now, challenger)).toBe(true);
  });
  it('ignores a swap in a group the rules do not point at', () => {
    expect(standingsOrderChanged(saved, swapIn('B', 1, 2), ranks(['A'], [1, 2, 3]))).toBe(false);
  });
  it('warns when the group shrank below a referenced rank, but not when only unreferenced ranks disappeared', () => {
    const shrunk = saved.map(group => group.groupId === 'A' ? { ...group, registrationIds: group.registrationIds.slice(0, 4) } : group);
    expect(standingsOrderChanged(saved, shrunk, challenger)).toBe(true);
    expect(standingsOrderChanged(saved, shrunk, premier)).toBe(false);
  });
  it('warns when a referenced group is gone or a rank is filled now that was empty', () => {
    expect(standingsOrderChanged(saved, [saved[0]], premier)).toBe(true);
    expect(standingsOrderChanged([{ groupId: 'A', registrationIds: ['a1'] }], [{ groupId: 'A', registrationIds: ['a1', 'a2'] }], ranks(['A'], [2]))).toBe(true);
  });
  it('is false when the referenced rank was empty and still is', () => {
    expect(standingsOrderChanged([{ groupId: 'A', registrationIds: ['a1'] }], [{ groupId: 'A', registrationIds: ['a1'] }], ranks(['A'], [1, 2]))).toBe(false);
  });
});

describe('savedStandingsSnapshot', () => {
  const snapshot = [{ groupId: 'A', registrationIds: ['a1', 'a2'] }];
  const roster = ['a1', 'x1'];
  it('returns the snapshot stored with the same roster', () => {
    expect(savedStandingsSnapshot({ registrationIds: roster, standingsSnapshot: snapshot }, roster)).toEqual(snapshot);
  });
  it.each([
    ['an assignment recorded before snapshots existed', { registrationIds: roster }],
    ['a roster that was replaced after the assignment', { registrationIds: ['a1', 'x2'], standingsSnapshot: snapshot }],
    ['the same teams in a different seed order', { registrationIds: ['x1', 'a1'], standingsSnapshot: snapshot }],
    ['a malformed snapshot', { registrationIds: roster, standingsSnapshot: [{ groupId: 'A', registrationIds: 'a1' }] }],
    ['a non-object audit payload', null],
  ])('returns null for %s', (_label, afterJson) => {
    expect(savedStandingsSnapshot(afterJson, roster)).toBeNull();
  });
});
