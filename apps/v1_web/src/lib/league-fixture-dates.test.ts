import { describe, expect, it } from 'vitest';

import { expandWeeklyFixtureDates } from './league-fixture-dates';

/**
 * 이 테스트가 지키는 계약은 **서버가 실제로 거부하는 것들**이다
 * (`apps/v1_api/src/league-matches/league-fixture-dates.ts`):
 * 달력에 없는 날짜 거부 · 중복 제거 · 과거 거부 · 매치데이 수보다 적으면 거부.
 * 그래서 단순히 "함수가 뭘 반환하나"가 아니라 **서버 규칙을 통과하는 값인가**를 단언한다.
 */

/** 서버의 과거 판정과 같은 방식으로 인스턴트를 만든다(KST 벽시계 → UTC). */
const kstInstant = (date: string, time: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - 9 * 60 * 60 * 1000);
};

/** KST 요일. 서버 `round-robin-schedule.ts` 가 쓰는 것과 같은 관례. */
const kstDayOfWeek = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

const isRealCalendarDate = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const rolled = new Date(Date.UTC(y, m - 1, d));
  return rolled.getUTCFullYear() === y && rolled.getUTCMonth() === m - 1 && rolled.getUTCDate() === d;
};

describe('expandWeeklyFixtureDates', () => {
  // 2026-09-04(금) 10:00 KST 를 "지금"으로 고정한다. 고정 날짜를 쓰면 그 날이 지나는 순간
  // 과거 거부 규칙에 걸려 테스트가 깨지므로, now 를 주입받는 설계로 고정한다.
  const now = kstInstant('2026-09-04', '10:00');

  it('시작일이 이미 그 요일이면 그 날부터 시작한다', () => {
    // 2026-09-12 는 토요일. 리그가 그 날 시작하고 토요일을 고르면 첫 경기는 당일이다 —
    // 한 주 밀어내면 운영자가 고른 시작일에 경기가 없는 리그가 된다.
    const dates = expandWeeklyFixtureDates({
      startsOn: '2026-09-12',
      dayOfWeek: 6,
      time: '18:00',
      weeksCount: 3,
      now,
    });
    expect(dates).toEqual(['2026-09-12', '2026-09-19', '2026-09-26']);
  });

  it('시작일이 지났으면 오늘 이후 첫 그 요일부터 시작한다', () => {
    // 8월에 시작한 리그에 지금 대진을 만든다. 시작일부터 전개하면 지난 날짜가 나와
    // 서버가 422 LEAGUE_SCHEDULE_DATE_PAST 로 거부한다.
    const dates = expandWeeklyFixtureDates({
      startsOn: '2026-08-01',
      dayOfWeek: 6,
      time: '18:00',
      weeksCount: 2,
      now,
    });
    expect(dates).toEqual(['2026-09-05', '2026-09-12']);
    for (const date of dates) {
      expect(kstInstant(date, '18:00').getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it('오늘이 그 요일인데 시각이 이미 지났으면 한 주 밀어낸다', () => {
    // 금요일 20:00 에 "금요일 18:00" 리그를 만들면 그 날 18:00 은 이미 지났다 —
    // 날짜만 보고 통과시키면 서버가 인스턴트로 판정해 거부한다.
    const friday2000 = kstInstant('2026-09-04', '20:00');
    const dates = expandWeeklyFixtureDates({
      startsOn: '2026-08-01',
      dayOfWeek: 5,
      time: '18:00',
      weeksCount: 1,
      now: friday2000,
    });
    expect(dates).toEqual(['2026-09-11']);
  });

  it('오늘이 그 요일이고 시각이 아직 안 지났으면 당일을 쓴다', () => {
    const dates = expandWeeklyFixtureDates({
      startsOn: '2026-08-01',
      dayOfWeek: 5,
      time: '18:00',
      weeksCount: 1,
      now,
    });
    expect(dates).toEqual(['2026-09-04']);
  });

  it('weeksCount 개를 정확히 만든다 — 서버가 요구하는 매치데이 수와 같다', () => {
    for (const weeksCount of [1, 2, 7, 12]) {
      const dates = expandWeeklyFixtureDates({
        startsOn: '2026-09-12',
        dayOfWeek: 6,
        time: '18:00',
        weeksCount,
        now,
      });
      expect(dates).toHaveLength(weeksCount);
    }
  });

  it('달 넘김·월말을 달력에 있는 날짜로만 만든다', () => {
    // 2026-09-26 다음 토요일은 10-03 이다. 날짜 산술을 "월+1" 로 하면 09-33 같은 값이 나오고
    // 서버는 422 LEAGUE_SCHEDULE_DATE_INVALID 로 거부한다.
    const dates = expandWeeklyFixtureDates({
      startsOn: '2026-09-26',
      dayOfWeek: 6,
      time: '18:00',
      weeksCount: 4,
      now,
    });
    expect(dates).toEqual(['2026-09-26', '2026-10-03', '2026-10-10', '2026-10-17']);
    for (const date of dates) expect(isRealCalendarDate(date)).toBe(true);
  });

  it('결과는 전부 고른 요일이고, 오름차순이며 중복이 없다', () => {
    const dates = expandWeeklyFixtureDates({
      startsOn: '2026-09-01',
      dayOfWeek: 3,
      time: '22:00',
      weeksCount: 10,
      now,
    });
    expect(dates.every((date) => kstDayOfWeek(date) === 3)).toBe(true);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('시작일을 읽을 수 없으면 던진다 — 오늘 기준으로 떨어뜨리면 조용히 틀린 날짜를 만든다', () => {
    // 폴백은 매력적이지만, 다음 달에 시작하는 초안 리그가 이번 주부터 경기를 갖게 된다.
    // 서버는 과거만 거부하므로 그 잘못된 대진이 **실제로 생성된다**. 호출 화면이 시작일
    // 유무를 먼저 보고 폼을 잠그는 쪽이 맞다(league-match-fixtures-client.test.tsx 가 고정).
    for (const startsOn of ['', 'not-a-date', undefined as unknown as string]) {
      expect(() =>
        expandWeeklyFixtureDates({ startsOn, dayOfWeek: 6, time: '18:00', weeksCount: 2, now }),
      ).toThrow(/리그 시작일/);
    }
  });

  it('weeksCount 가 0 이하면 빈 배열 — 서버에 빈 dates 를 보내지 않게 호출부가 판단한다', () => {
    expect(expandWeeklyFixtureDates({ startsOn: '2026-09-12', dayOfWeek: 6, time: '18:00', weeksCount: 0, now })).toEqual([]);
  });

  it('브라우저 타임존이 KST 가 아니어도 같은 날짜를 만든다', () => {
    // 해외에서 접속한 운영자와 국내 운영자가 다른 날짜를 보내면 안 된다. now 를 UTC 인스턴트로
    // 주되 KST 로는 이미 다음 날인 경계를 쓴다: 2026-09-04 16:00 UTC = 2026-09-05 01:00 KST(토).
    const dates = expandWeeklyFixtureDates({
      startsOn: '2026-08-01',
      dayOfWeek: 6,
      time: '18:00',
      weeksCount: 1,
      now: new Date('2026-09-04T16:00:00.000Z'),
    });
    // KST 로 이미 토요일 새벽이고 18:00 은 아직 안 지났으므로 당일(09-05)이다.
    expect(dates).toEqual(['2026-09-05']);
  });
});
