import { readEndedResult } from './widget-home';

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
