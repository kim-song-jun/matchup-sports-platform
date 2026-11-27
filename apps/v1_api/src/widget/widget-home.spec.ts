import { endedGameScore, matchResult, perspectiveScore, readEndedResult, readPeriod, tallyGameScore, tallySharedRecordGoals } from './widget-home';

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

describe('tallyGameScore · perspectiveScore', () => {
  const sides = [{ id: 's-home', sideKey: 'HOME' as const }, { id: 's-away', sideKey: 'AWAY' as const }];
  const goal = (type: 'GOAL' | 'OWN_GOAL', sideId: string, id: string) => ({ id, type, sideId, reversesEventId: null });

  it('공유 기록이 있으면 그 골로 세고 경기 이벤트는 무시한다(친선)', () => {
    const game = { sides, sharedRecord: { goals: [{ sideId: 's-home' }, { sideId: 's-home' }] } };
    expect(tallyGameScore(game, [goal('GOAL', 's-away', 'e1')])).toEqual({ home: 2, away: 0 });
  });

  it('공유 기록이 없으면 경기 이벤트로 센다(대회·리그)', () => {
    expect(tallyGameScore({ sides, sharedRecord: null }, [goal('GOAL', 's-home', 'e1'), goal('GOAL', 's-away', 'e2'), goal('GOAL', 's-away', 'e3')])).toEqual({ home: 1, away: 2 });
  });

  it('우리 팀 기준으로 뒤집는다', () => {
    expect(perspectiveScore({ home: 2, away: 1 }, 'HOME')).toEqual({ mine: 2, opponent: 1 });
    expect(perspectiveScore({ home: 2, away: 1 }, 'AWAY')).toEqual({ mine: 1, opponent: 2 });
  });
});

describe('endedGameScore', () => {
  const sides = [{ id: 's-home', sideKey: 'HOME' as const }, { id: 's-away', sideKey: 'AWAY' as const }];
  const shared = { goals: [{ sideId: 's-home' }, { sideId: 's-away' }, { sideId: 's-away' }] };

  it('공식 결과를 읽을 수 있으면 그것을 쓴다(공유 기록이 달라도)', () => {
    const game = { sides, sharedRecord: shared, currentOfficialRevision: { score: { home: 5, away: 4, penalties: { home: 3, away: 2 } } } };
    expect(endedGameScore(game, 'HOME')).toEqual({ score: { mine: 5, opponent: 4 }, penalties: { mine: 3, opponent: 2 } });
  });

  it('공식 점수를 못 읽는 친선 경기는 공유 기록의 골로 대신 센다(우리 팀 기준)', () => {
    const game = { sides, sharedRecord: shared, currentOfficialRevision: { score: { home: 'x' } } };
    expect(endedGameScore(game, 'AWAY')).toEqual({ score: { mine: 2, opponent: 1 }, penalties: null });
    expect(endedGameScore({ ...game, currentOfficialRevision: null }, 'HOME')).toEqual({ score: { mine: 1, opponent: 2 }, penalties: null });
  });

  it('공식 점수도 공유 기록도 없으면 null', () => {
    expect(endedGameScore({ sides, sharedRecord: null, currentOfficialRevision: null }, 'HOME')).toEqual({ score: null, penalties: null });
  });
});

describe('readPeriod · 경기의 현재 구간', () => {
  const at = (iso: string) => new Date(iso);
  const first = { number: 1, state: 'ENDED', startedAt: at('2026-11-27T10:00:00Z'), endedAt: at('2026-11-27T10:25:00Z'), pausedTotalMs: 0, pausedAt: null };

  it('진행 중인 구간의 시작 시각과 멈춘 시간을 그대로 내려 준다', () => {
    const second = { number: 2, state: 'LIVE', startedAt: at('2026-11-27T10:35:00Z'), endedAt: null, pausedTotalMs: 90_000, pausedAt: null };
    expect(readPeriod('LIVE', [first, second])).toEqual({ number: 2, phase: 'RUNNING', startedAt: second.startedAt, pausedMs: 90_000, pausedAt: null, restStartedAt: null });
  });

  it('일시정지: 경기 상태가 PAUSED 이거나 구간에 멈춘 시각이 있으면', () => {
    const live = { number: 1, state: 'LIVE', startedAt: at('2026-11-27T10:00:00Z'), endedAt: null, pausedTotalMs: 0, pausedAt: at('2026-11-27T10:12:00Z') };
    expect(readPeriod('PAUSED', [{ ...live, pausedAt: null }])?.phase).toBe('PAUSED');
    expect(readPeriod('LIVE', [live])).toMatchObject({ phase: 'PAUSED', pausedAt: live.pausedAt });
  });

  it('하프타임: 다음 구간이 HALFTIME 이면 앞 구간이 끝난 시각부터 쉬는 시간으로 센다(경기 상태는 LIVE 그대로)', () => {
    const next = { number: 2, state: 'HALFTIME', startedAt: null, endedAt: null, pausedTotalMs: 0, pausedAt: null };
    expect(readPeriod('LIVE', [next, first])).toEqual({ number: 2, phase: 'HALFTIME', startedAt: null, pausedMs: 0, pausedAt: null, restStartedAt: first.endedAt });
  });

  it('구간 기록이 없으면 null(친선 팀 매치)', () => {
    expect(readPeriod('LIVE', [])).toBeNull();
    expect(readPeriod('LIVE', [{ number: 1, state: 'SCHEDULED', startedAt: null, endedAt: null, pausedTotalMs: 0, pausedAt: null }])).toBeNull();
  });
});

describe('matchResult · 승무패', () => {
  it('점수로 가리고, 동점이면 승부차기로, 그것도 같으면 무', () => {
    expect(matchResult({ mine: 2, opponent: 1 }, null)).toBe('WIN');
    expect(matchResult({ mine: 0, opponent: 3 }, null)).toBe('LOSE');
    expect(matchResult({ mine: 1, opponent: 1 }, null)).toBe('DRAW');
    expect(matchResult({ mine: 1, opponent: 1 }, { mine: 4, opponent: 3 })).toBe('WIN');
    expect(matchResult({ mine: 1, opponent: 1 }, { mine: 2, opponent: 5 })).toBe('LOSE');
    expect(matchResult({ mine: 1, opponent: 1 }, { mine: 3, opponent: 3 })).toBe('DRAW');
  });
});
