import { describe, expect, it } from 'vitest';
import { kstWeekKey, leagueFixtureWeekNumber, withDerivedWeek } from './league-fixture-week';

const at = (startAt: string) => ({ startAt });

describe('leagueFixtureWeekNumber', () => {
  const fixtures = [
    at('2026-09-13T11:00:00.000Z'),
    at('2026-09-13T13:00:00.000Z'),
    at('2026-09-20T11:00:00.000Z'),
    at('2026-09-27T14:57:00.000Z'),
  ];

  it('같은 주의 경기는 한 주차로 세고 주 순서대로 번호를 매긴다', () => {
    expect(leagueFixtureWeekNumber(fixtures, fixtures[1])).toBe(1);
    expect(leagueFixtureWeekNumber(fixtures, fixtures[2])).toBe(2);
    expect(leagueFixtureWeekNumber(fixtures, fixtures[3])).toBe(3);
  });

  it('KST 로 같은 날인 저녁·밤 경기는 한 주차다', () => {
    // 11:00Z 는 KST 20:00, 14:57Z 는 KST 23:57 — 둘 다 9/20 이다.
    const sameKstDay = [at('2026-09-20T11:00:00.000Z'), at('2026-09-20T14:57:00.000Z'), at('2026-09-27T11:00:00.000Z')];
    expect(leagueFixtureWeekNumber(sameKstDay, sameKstDay[1])).toBe(1);
    expect(leagueFixtureWeekNumber(sameKstDay, sameKstDay[2])).toBe(2);
  });

  // 2026-11-03 사용자 확정: 주차는 달력 주(월~일) — 서버 league-week-number.spec.ts 와 같은 사례.
  it('토·일에 나눠 치른 한 주는 같은 주차이고 쉬는 주는 번호를 건너뛰지 않는다', () => {
    const list = [at('2026-11-21T01:00:00.000Z'), at('2026-11-22T01:00:00.000Z'), at('2026-12-05T01:00:00.000Z')];
    expect(leagueFixtureWeekNumber(list, list[1])).toBe(1);
    expect(leagueFixtureWeekNumber(list, list[2])).toBe(2);
  });

  it('주의 경계는 KST 월요일 0시다', () => {
    expect(kstWeekKey(new Date('2026-11-22T14:30:00.000Z'))).toBe('2026-11-16'); // 일요일 23:30 KST
    expect(kstWeekKey(new Date('2026-11-22T15:30:00.000Z'))).toBe('2026-11-23'); // 월요일 00:30 KST
  });

  it('목록에 없는 날짜면 null', () => {
    expect(leagueFixtureWeekNumber([], at('2026-09-13T11:00:00.000Z'))).toBeNull();
  });
});

describe('withDerivedWeek', () => {
  it('저장된 제목의 주차만 바꾸고 나머지(리그명·경기 번호)는 둔다', () => {
    expect(withDerivedWeek('서울 나이트 풋살 리그 2주차', 3)).toBe('서울 나이트 풋살 리그 3주차');
    expect(withDerivedWeek('서울 나이트 풋살 리그 2주차 1경기', 3)).toBe('서울 나이트 풋살 리그 3주차 1경기');
  });

  it('주차 토큰이 없는 사용자 지정 제목과 주차를 모를 때는 그대로 둔다', () => {
    expect(withDerivedWeek('개막전', 3)).toBe('개막전');
    expect(withDerivedWeek('서울 나이트 풋살 리그 2주차', null)).toBe('서울 나이트 풋살 리그 2주차');
  });
});
