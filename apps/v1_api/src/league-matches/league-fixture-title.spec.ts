import { leagueFixtureTitle, leagueFixtureTitles, nextOrderInCalendarWeek } from './league-fixture-creation';
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

  it('시각이 같은 경기끼리는 입력 순서대로, 주가 바뀌면 순번을 1부터 다시 센다 (시간 없이 만든 대진)', () => {
    const startAts = [kstNine('2026-11-21'), kstNine('2026-11-21'), kstNine('2026-11-28')];

    expect(leagueFixtureTitles('옛 리그', startAts)).toEqual([
      '옛 리그 1주차 1경기',
      '옛 리그 1주차 2경기',
      '옛 리그 2주차 1경기',
    ]);
  });

  it('하루 경기 수 없이 토·일 두 라운드로 만든 대진은 날짜 순서 → 입력 순서로 1경기부터 이어진다', () => {
    // 4 teams, 2 rounds, no timing: the games of a round share one start time (Sat 11/21, Sun 11/22).
    const teamIds = ['team-1', 'team-2', 'team-3', 'team-4'];
    const rounds = generateRoundRobinFixtures(teamIds, 2);
    const dates = [kstNine('2026-11-21'), kstNine('2026-11-22')];
    const startAts = rounds.map((fixture) => dates[fixture.round - 1]);

    const titles = leagueFixtureTitles('여성부 리그', startAts);

    expect(rounds.map((fixture) => fixture.round)).toEqual([1, 1, 2, 2]);
    expect(titles).toEqual([
      '여성부 리그 1주차 1경기',
      '여성부 리그 1주차 2경기',
      '여성부 리그 1주차 3경기',
      '여성부 리그 1주차 4경기',
    ]);
  });

  it('입력이 날짜 순서가 아니어도 이른 날짜가 먼저 번호를 받는다 (같은 날짜는 입력 순서)', () => {
    const startAts = [kstNine('2026-11-22'), kstNine('2026-11-21'), kstNine('2026-11-22'), kstNine('2026-11-21')];

    expect(leagueFixtureTitles('리그', startAts)).toEqual([
      '리그 1주차 3경기',
      '리그 1주차 1경기',
      '리그 1주차 4경기',
      '리그 1주차 2경기',
    ]);
  });

  it('하루 경기 수로 순차 배치한 대진의 제목은 입력 순서 그대로다 (자정을 넘기는 마지막 경기 포함)', () => {
    // Sat 22:00 start, 40 minute games, 4 a day: the 4th game starts at Sun 00:00 KST, still the same
    // calendar week; Sun's own matchday starts at 22:00 and continues the numbering.
    const fixtures = generateRoundRobinFixtures(['team-1', 'team-2', 'team-3', 'team-4'], 3);
    const slots = resolveFixtureTimeSlots(
      fixtures,
      [new Date('2026-11-21T22:00:00+09:00'), new Date('2026-11-22T22:00:00+09:00')],
      { gameDurationMinutes: 40, breakMinutes: 0, gamesPerDay: 4 },
    );
    const startAts = slots.map((slot) => slot.startAt);

    expect(startAts.map((startAt) => startAt.getTime())).toEqual([...startAts.map((startAt) => startAt.getTime())].sort((a, b) => a - b));
    expect(leagueFixtureTitles('심야 리그', startAts)).toEqual([
      '심야 리그 1주차 1경기',
      '심야 리그 1주차 2경기',
      '심야 리그 1주차 3경기',
      '심야 리그 1주차 4경기',
      '심야 리그 1주차 5경기',
      '심야 리그 1주차 6경기',
    ]);
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
  it('주차 뒤에 경기 순번을 붙인다', () => {
    expect(leagueFixtureTitle({ leagueTitle: '가을 리그', week: 2, orderInWeek: 4 })).toBe('가을 리그 2주차 4경기');
  });
});
