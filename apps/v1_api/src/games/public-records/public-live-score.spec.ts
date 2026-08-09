import { tallyLiveScore } from './public-live-score';

const homeId = 'side-home';
const awayId = 'side-away';
const sideKeyById = new Map<string, 'HOME' | 'AWAY'>([
  [homeId, 'HOME'],
  [awayId, 'AWAY'],
]);

function goal(id: string, sideId: string | null, reversesEventId: string | null = null) {
  return { id, type: 'GOAL' as const, sideId, reversesEventId };
}

describe('tallyLiveScore', () => {
  it('경기 시작 직후(이벤트 없음)에는 0:0을 반환한다', () => {
    expect(tallyLiveScore([], sideKeyById)).toEqual({ home: 0, away: 0 });
  });

  it('알파 그린 FC 실사고 재현: GOAL 2건(HOME)이 기록되면 2:0을 반환한다 -- 운영 콘솔이 보던 것과 동일한 스코어', () => {
    const events = [goal('g1', homeId), goal('g2', homeId)];
    expect(tallyLiveScore(events, sideKeyById)).toEqual({ home: 2, away: 0 });
  });

  it('양 팀 골을 각자 집계한다', () => {
    const events = [goal('g1', homeId), goal('g2', awayId), goal('g3', homeId)];
    expect(tallyLiveScore(events, sideKeyById)).toEqual({ home: 2, away: 1 });
  });

  it('GOAL이 아닌 이벤트(카드 등)는 집계에서 제외한다', () => {
    const events = [
      goal('g1', homeId),
      { id: 'c1', type: 'CARD' as const, sideId: homeId, reversesEventId: null },
    ];
    expect(tallyLiveScore(events, sideKeyById)).toEqual({ home: 1, away: 0 });
  });

  it('정정으로 취소(reversesEventId)된 골은 집계에서 빠진다', () => {
    const events = [goal('g1', homeId), goal('g2', homeId), goal('g3', homeId, 'g2')];
    // g3 정정 이벤트가 g2를 취소 -- 최종 스코어는 g1만 유효
    expect(tallyLiveScore(events, sideKeyById)).toEqual({ home: 1, away: 0 });
  });

  it('sideId가 null인 골(기록 오류로 팀 미배정)은 집계하지 않는다', () => {
    const events = [goal('g1', null)];
    expect(tallyLiveScore(events, sideKeyById)).toEqual({ home: 0, away: 0 });
  });
});
