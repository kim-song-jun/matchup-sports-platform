import { readEndedResult, tallySharedRecordGoals } from './widget-home';

describe('readEndedResult', () => {
  it('홈이면 그대로, 원정이면 뒤집어서 우리 팀 기준으로 읽는다', () => {
    expect(readEndedResult({ home: 2, away: 1 }, 'HOME')).toEqual({ score: { mine: 2, opponent: 1 }, penalties: null });
    expect(readEndedResult({ home: 2, away: 1 }, 'AWAY')).toEqual({ score: { mine: 1, opponent: 2 }, penalties: null });
  });

  it('승부차기가 있으면 따로 우리 팀 기준으로 준다(평평한 형태와 중첩 형태 둘 다)', () => {
    expect(readEndedResult({ home: 1, away: 1, penalties: { home: 4, away: 3 } }, 'AWAY')).toEqual({
      score: { mine: 1, opponent: 1 },
      penalties: { mine: 3, opponent: 4 },
    });
    expect(readEndedResult({ regulation: { home: 0, away: 0 }, penalty: { home: 5, away: 4 } }, 'HOME')).toEqual({
      score: { mine: 0, opponent: 0 },
      penalties: { mine: 5, opponent: 4 },
    });
  });

  it('점수가 없거나 깨졌으면 null', () => {
    expect(readEndedResult(null, 'HOME')).toBeNull();
    expect(readEndedResult(undefined, 'HOME')).toBeNull();
    expect(readEndedResult({ home: 'x', away: 1 }, 'HOME')).toBeNull();
  });
});

describe('tallySharedRecordGoals', () => {
  const sides = new Map<string, 'HOME' | 'AWAY'>([['s-home', 'HOME'], ['s-away', 'AWAY']]);

  it('골의 sideId 로 홈·원정 득점을 센다', () => {
    const goals = [{ id: 'g1', sideId: 's-home' }, { id: 'g2', sideId: 's-home' }, { id: 'g3', sideId: 's-away' }];
    expect(tallySharedRecordGoals(goals, sides)).toEqual({ home: 2, away: 1 });
  });

  it('모르는 사이드·깨진 항목·배열이 아닌 값은 세지 않는다', () => {
    expect(tallySharedRecordGoals([{ sideId: 'x' }, null, 3, { id: 'a' }, { sideId: 7 }], sides)).toEqual({ home: 0, away: 0 });
    expect(tallySharedRecordGoals(null, sides)).toEqual({ home: 0, away: 0 });
    expect(tallySharedRecordGoals({ sideId: 's-home' }, sides)).toEqual({ home: 0, away: 0 });
  });
});
