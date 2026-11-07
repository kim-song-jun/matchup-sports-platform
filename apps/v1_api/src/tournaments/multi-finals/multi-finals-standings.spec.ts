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
  const saved = [{ groupId: 'A', registrationIds: ['a1', 'a2', 'a3', 'a4'] }, { groupId: 'B', registrationIds: ['b1', 'b2'] }];
  it('is false while every saved group keeps its order', () => {
    expect(standingsOrderChanged(saved, saved.map(group => ({ ...group, registrationIds: [...group.registrationIds] })))).toBe(false);
  });
  it('is true when two teams of one saved group swap places while an untouched group stays unchanged', () => {
    const swapped = [{ groupId: 'A', registrationIds: ['a1', 'a2', 'a4', 'a3'] }, saved[1]];
    expect(standingsOrderChanged(saved, swapped)).toBe(true);
    expect(standingsOrderChanged([saved[1]], [swapped[1]])).toBe(false);
  });
  it('is true when a saved group is missing or shorter now', () => {
    expect(standingsOrderChanged(saved, [saved[0]])).toBe(true);
    expect(standingsOrderChanged(saved, [saved[0], { groupId: 'B', registrationIds: ['b1'] }])).toBe(true);
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
