import { pullBackToDaytime } from './quiet-hours';

/** KST 시각을 UTC Date 로 만든다(KST = UTC+9). */
const kst = (month: number, day: number, hour: number, minute = 0) => new Date(Date.UTC(2026, month - 1, day, hour - 9, minute));

describe('pullBackToDaytime', () => {
  it('낮(09:00~20:59)이면 그대로 둔다', () => {
    expect(pullBackToDaytime(kst(11, 20, 9))).toEqual(kst(11, 20, 9));
    expect(pullBackToDaytime(kst(11, 20, 20, 59))).toEqual(kst(11, 20, 20, 59));
  });

  it('밤 21시~자정이면 같은 날 20:30 으로 앞당긴다', () => {
    expect(pullBackToDaytime(kst(11, 20, 21))).toEqual(kst(11, 20, 20, 30));
    expect(pullBackToDaytime(kst(11, 20, 23, 59))).toEqual(kst(11, 20, 20, 30));
  });

  it('새벽 00:00~08:59 이면 전날 20:30 으로 앞당긴다', () => {
    expect(pullBackToDaytime(kst(11, 21, 0))).toEqual(kst(11, 20, 20, 30));
    expect(pullBackToDaytime(kst(11, 21, 8, 59))).toEqual(kst(11, 20, 20, 30));
  });
});
