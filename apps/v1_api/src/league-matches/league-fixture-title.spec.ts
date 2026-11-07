import { leagueFixtureTitle, leagueFixtureTitles, leagueFixtureWeeks, nextOrderInCalendarWeek } from './league-fixture-creation';
import { generateRoundRobinFixtures, resolveFixtureTimeSlots } from './round-robin-schedule';

/** 09:00 KST. 2026-11-21 is a Saturday; Mon 11/16 - Sun 11/22 is one calendar week. */
const kstNine = (date: string) => new Date(`${date}T09:00:00+09:00`);

/** Start times from the real round-robin + slot resolution, i.e. what the generation path hands to the title function. */
function generatedStartAts(teamCount: number, rounds: number, gamesPerDay: number, dates: readonly string[]): Date[] {
  const teamIds = Array.from({ length: teamCount }, (_, index) => `team-${index + 1}`);
  const fixtures = generateRoundRobinFixtures(teamIds, rounds);
  return resolveFixtureTimeSlots(
    fixtures,
    dates.map(kstNine),
    { gameDurationMinutes: 40, breakMinutes: 0, gamesPerDay },
  ).map((slot) => slot.startAt);
}

describe('leagueFixtureTitles', () => {
  it('이틀에 나눠 치르는 한 주 15경기는 제목 15개가 모두 다르고 1경기부터 15경기까지 이어진다', () => {
    const startAts = generatedStartAts(6, 5, 8, ['2026-11-21', '2026-11-22']);

    const titles = leagueFixtureTitles('여성부 리그', startAts);

    expect(startAts).toHaveLength(15);
    expect(titles).toEqual(Array.from({ length: 15 }, (_, index) => `여성부 리그 1주차 ${index + 1}경기`));
    expect(new Set(titles).size).toBe(15);
  });

  it('하루짜리 리그는 하루 안에서 1경기부터 센다 (대조군)', () => {
    const startAts = generatedStartAts(4, 3, 6, ['2026-11-21']);

    expect(leagueFixtureTitles('하루 리그', startAts)).toEqual(
      Array.from({ length: 6 }, (_, index) => `하루 리그 1주차 ${index + 1}경기`),
    );
  });

  it('다른 달력 주로 넘어가면 주차가 오르고 순번은 1부터 다시 센다 (대조군)', () => {
    // 4 games a day: Sat 11/21 and Sun 11/22 are one week (8 games), Sat 11/28 is the next week (2 games).
    const startAts = generatedStartAts(5, 5, 4, ['2026-11-21', '2026-11-22', '2026-11-28']);

    const titles = leagueFixtureTitles('가을 리그', startAts);

    expect(titles.slice(0, 8)).toEqual(Array.from({ length: 8 }, (_, index) => `가을 리그 1주차 ${index + 1}경기`));
    expect(titles.slice(8)).toEqual(Array.from({ length: startAts.length - 8 }, (_, index) => `가을 리그 2주차 ${index + 1}경기`));
  });

  it('순번 없는 생성(하루 한 라운드)은 주차만 붙인다', () => {
    const startAts = [kstNine('2026-11-21'), kstNine('2026-11-21'), kstNine('2026-11-28')];

    expect(leagueFixtureTitles('옛 리그', startAts, { numbered: false })).toEqual([
      '옛 리그 1주차',
      '옛 리그 1주차',
      '옛 리그 2주차',
    ]);
  });
});

describe('leagueFixtureWeeks', () => {
  it('토·일은 같은 주차, 다음 주 토요일은 다음 주차이고 제목의 N주차와 한 칸도 어긋나지 않는다', () => {
    const startAts = generatedStartAts(5, 5, 4, ['2026-11-21', '2026-11-22', '2026-11-28']);

    const weeks = leagueFixtureWeeks(startAts);

    expect(weeks).toEqual([...Array(8).fill(1), ...Array(startAts.length - 8).fill(2)]);
    expect(weeks).toEqual(
      leagueFixtureTitles('가을 리그', startAts).map((title) => Number(/ (\d+)주차/.exec(title)?.[1])),
    );
  });
});

describe('nextOrderInCalendarWeek', () => {
  const sibling = (date: string, title: string) => ({ startAt: kstNine(date), title });

  it('그 주에 이미 있는 경기 다음 번호를 준다 — 날짜가 달라도 같은 주면 이어진다', () => {
    const siblings = [
      ...Array.from({ length: 8 }, (_, index) => sibling('2026-11-21', `리그 1주차 ${index + 1}경기`)),
      ...Array.from({ length: 7 }, (_, index) => sibling('2026-11-22', `리그 1주차 ${index + 9}경기`)),
    ];

    expect(nextOrderInCalendarWeek(siblings, kstNine('2026-11-22'))).toBe(16);
    expect(nextOrderInCalendarWeek(siblings, kstNine('2026-11-18'))).toBe(16);
  });

  it('경기가 없는 주는 1경기부터다 (대조군)', () => {
    const siblings = [sibling('2026-11-21', '리그 1주차 1경기'), sibling('2026-11-22', '리그 1주차 2경기')];

    expect(nextOrderInCalendarWeek(siblings, kstNine('2026-11-28'))).toBe(1);
    expect(nextOrderInCalendarWeek(siblings, kstNine('2026-11-14'))).toBe(1);
  });

  it('중간 경기가 지워져 개수가 번호보다 작아도 이미 쓴 번호와 겹치지 않는다', () => {
    // Game 3 was deleted: three fixtures remain but game 4 exists.
    const siblings = [
      sibling('2026-11-21', '리그 1주차 1경기'),
      sibling('2026-11-21', '리그 1주차 2경기'),
      sibling('2026-11-22', '리그 1주차 4경기'),
    ];

    expect(nextOrderInCalendarWeek(siblings, kstNine('2026-11-22'))).toBe(5);
  });

  it('순번이 없는 옛 제목은 개수로 센다', () => {
    const siblings = [sibling('2026-11-21', '리그 1주차'), sibling('2026-11-22', '리그 1주차')];

    expect(nextOrderInCalendarWeek(siblings, kstNine('2026-11-21'))).toBe(3);
  });

  it('운영자가 지은 제목의 숫자는 순번으로 읽지 않는다', () => {
    const siblings = [sibling('2026-11-21', '결승 99경기'), sibling('2026-11-21', '리그 1주차 1경기')];

    expect(nextOrderInCalendarWeek(siblings, kstNine('2026-11-21'))).toBe(3);
  });
});

describe('leagueFixtureTitle', () => {
  it('순번이 있으면 주차 뒤에 붙이고, 없으면 주차만 쓴다', () => {
    expect(leagueFixtureTitle({ leagueTitle: '가을 리그', week: 2, orderInWeek: 4 })).toBe('가을 리그 2주차 4경기');
    expect(leagueFixtureTitle({ leagueTitle: '가을 리그', week: 3 })).toBe('가을 리그 3주차');
  });
});
