import { formatKstMonthDayTime, formatKstTime } from './kst-datetime';

describe('kst-datetime', () => {
  it('UTC 자정 직전 시각도 KST 날짜·요일로 넘어간다', () => {
    // 2026-09-29 16:10 UTC = 2026-09-30(수) 01:10 KST — 목업의 대표 사례(자정을 넘긴 경기).
    const at = new Date('2026-09-29T16:10:00Z');
    expect(formatKstMonthDayTime(at)).toBe('9/30 (수) 01:10');
    expect(formatKstTime(at)).toBe('01:10');
  });

  it('월·일은 0 을 채우지 않고 시·분은 두 자리로 채운다', () => {
    expect(formatKstMonthDayTime(new Date('2026-01-04T00:05:00Z'))).toBe('1/4 (일) 09:05');
  });

  it('같은 순간이라도 KST 날짜가 UTC 날짜와 다를 때 KST 를 쓴다', () => {
    // 2026-12-31 15:00 UTC = 2027-01-01(금) 00:00 KST
    expect(formatKstMonthDayTime(new Date('2026-12-31T15:00:00Z'))).toBe('1/1 (금) 00:00');
  });
});
