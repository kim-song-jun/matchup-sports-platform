import { readSharedGoals } from './widget-scorers.service';

describe('readSharedGoals · 친선 공유 기록의 골', () => {
  it('골 항목을 읽고, 분이 없거나 이상하면 null 로 둔다', () => {
    expect(
      readSharedGoals([
        { id: 'a', sideId: 's1', participantId: 'p1', ownGoal: false, minute: 7 },
        { id: 'b', sideId: 's2', participantId: null, ownGoal: true, minute: null },
        { id: 'c', sideId: 's1', ownGoal: false, minute: -3 },
      ]),
    ).toEqual([
      { sideId: 's1', participantId: 'p1', playerNameSnapshot: null, ownGoal: false, minute: 7 },
      { sideId: 's2', participantId: null, playerNameSnapshot: null, ownGoal: true, minute: null },
      { sideId: 's1', participantId: null, playerNameSnapshot: null, ownGoal: false, minute: null },
    ]);
  });

  it('배열이 아니거나 깨진 항목은 건너뛴다', () => {
    expect(readSharedGoals(null)).toEqual([]);
    expect(readSharedGoals({ goals: [] })).toEqual([]);
    expect(readSharedGoals(['x', null, [1], { participantId: 'p' }, { sideId: 7 }])).toEqual([]);
  });
});
