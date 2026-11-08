import { describe, expect, it } from 'vitest';
import {
  computeDailyPlan,
  dayOffsetLabel,
  groupPreviewByMatchday,
  groupPreviewByWeek,
  hasCalendarWeeks,
  previewTimingGroups,
  previewWeekCount,
  suggestGamesPerDay,
  weekGroupHeading,
} from './league-fixture-timing.view-model';

describe('suggestGamesPerDay (시간창 역산)', () => {
  it('운영 시나리오: 22:00~00:00 · 15분 경기 · 5분 휴식이면 하루 6경기를 제안한다', () => {
    const suggestion = suggestGamesPerDay({ startTime: '22:00', endTime: '00:00', gameDurationMinutes: 15, breakMinutes: 5 });
    expect(suggestion).not.toBeNull();
    expect(suggestion!.gamesPerDay).toBe(6);
    expect(suggestion!.plan.totalGamesPerDay).toBe(6);
    expect(suggestion!.plan.lastGameEndTime).toBe('23:55');
    expect(suggestion!.plan.spansNextDay).toBe(false);
  });

  it('라운드 크기와 상관없이 창에 들어가는 경기 수 그대로 제안한다 — 100분 창이면 5경기', () => {
    // 예전 '팀당' 제안은 4팀(라운드당 2경기)이면 완결 라운드만 쳐서 4경기로 내렸다.
    expect(suggestGamesPerDay({ startTime: '22:00', endTime: '23:40', gameDurationMinutes: 15, breakMinutes: 5 })!.gamesPerDay).toBe(5);
  });

  it('자정을 넘는 시간창(23:00~01:00)도 120분으로 계산하고 다음날 종료를 표시한다', () => {
    const suggestion = suggestGamesPerDay({ startTime: '23:00', endTime: '01:00', gameDurationMinutes: 15, breakMinutes: 5 });
    expect(suggestion!.gamesPerDay).toBe(6);
    expect(suggestion!.plan.lastGameEndTime).toBe('00:55');
    expect(suggestion!.plan.spansNextDay).toBe(true);
  });

  it('한 경기도 못 치르는 시간창이거나 시간창이 0이면 null을 반환한다', () => {
    expect(suggestGamesPerDay({ startTime: '22:00', endTime: '22:10', gameDurationMinutes: 15, breakMinutes: 5 })).toBeNull();
    expect(suggestGamesPerDay({ startTime: '22:00', endTime: '22:00', gameDurationMinutes: 15, breakMinutes: 5 })).toBeNull();
  });

  it('아주 긴 시간창이어도 서버 상한(하루 50경기)을 넘겨 제안하지 않는다', () => {
    expect(suggestGamesPerDay({ startTime: '08:00', endTime: '23:59', gameDurationMinutes: 10, breakMinutes: 0 })!.gamesPerDay).toBe(50);
  });
});

describe('computeDailyPlan (하루 운영 계산)', () => {
  it('하루 6경기 · 15분+5분 · 22:00 시작이면 총 115분 · 23:55 종료다', () => {
    const plan = computeDailyPlan({ startTime: '22:00', gameDurationMinutes: 15, breakMinutes: 5, gamesPerDay: 6 });
    expect(plan).not.toBeNull();
    expect(plan!.totalGamesPerDay).toBe(6);
    expect(plan!.totalMinutes).toBe(115); // 6경기 × 20분 - 마지막 휴식 5분
    expect(plan!.lastGameEndTime).toBe('23:55');
    expect(plan!.spansNextDay).toBe(false);
  });

  it('시작 시각이 없으면(시작일 그대로 모드) 종료 시각 없이 경기 수·소요만 계산한다', () => {
    const plan = computeDailyPlan({ gameDurationMinutes: 15, breakMinutes: 5, gamesPerDay: 6 });
    expect(plan!.totalGamesPerDay).toBe(6);
    expect(plan!.totalMinutes).toBe(115);
    expect(plan!.lastGameEndTime).toBeNull();
  });

  it('자정을 넘겨 끝나면 spansNextDay를 표시한다', () => {
    const plan = computeDailyPlan({ startTime: '23:30', gameDurationMinutes: 15, breakMinutes: 5, gamesPerDay: 6 });
    expect(plan!.lastGameEndTime).toBe('01:25');
    expect(plan!.spansNextDay).toBe(true);
  });

  it('하루 경기 수가 0이면(팀 2개 미만) null을 반환한다', () => {
    expect(computeDailyPlan({ gameDurationMinutes: 15, breakMinutes: 5, gamesPerDay: 0 })).toBeNull();
  });

  it('하루를 여러 번 넘기는 극단 설정은 daysLater로 며칠 뒤 종료인지 정확히 표현한다', () => {
    // 00:00 시작 · 240분 경기 × 하루 20경기 = 4,800분 = 3일 8시간.
    const plan = computeDailyPlan({ startTime: '00:00', gameDurationMinutes: 240, breakMinutes: 0, gamesPerDay: 20 });
    expect(plan!.lastGameEndTime).toBe('08:00');
    expect(plan!.daysLater).toBe(3);
    expect(plan!.spansNextDay).toBe(true);
  });
});

describe('dayOffsetLabel', () => {
  it('당일은 빈 문자열, 1일 뒤는 "다음날", 그 이상은 "N일 뒤"로 표기한다', () => {
    expect(dayOffsetLabel(0)).toBe('');
    expect(dayOffsetLabel(1)).toBe('다음날 ');
    expect(dayOffsetLabel(3)).toBe('3일 뒤 ');
  });
});

describe('groupPreviewByMatchday (미리보기 매치데이 그룹핑)', () => {
  it('matchday가 있으면 매치데이별로 순서대로 묶는다', () => {
    const fixtures = [
      { round: 1, matchday: 1, orderInDay: 1, homeTeamId: 'a', awayTeamId: 'b', startAt: 's1', endAt: 'e1' },
      { round: 2, matchday: 1, orderInDay: 2, homeTeamId: 'c', awayTeamId: 'd', startAt: 's2', endAt: 'e2' },
      { round: 3, matchday: 2, orderInDay: 1, homeTeamId: 'a', awayTeamId: 'c', startAt: 's3', endAt: 'e3' },
    ];
    const groups = groupPreviewByMatchday(fixtures);
    expect(groups.map((g) => g.matchday)).toEqual([1, 2]);
    expect(groups[0].items).toHaveLength(2);
    expect(groups[1].items).toHaveLength(1);
  });

  it('matchday가 없는 레거시 응답은 round를 매치데이로 쓴다', () => {
    const fixtures = [
      { round: 1, homeTeamId: 'a', awayTeamId: 'b', startAt: 's1' },
      { round: 2, homeTeamId: 'a', awayTeamId: 'b', startAt: 's2' },
    ];
    const groups = groupPreviewByMatchday(fixtures);
    expect(groups.map((g) => g.matchday)).toEqual([1, 2]);
  });

  it('입력 순서가 섞여 있어도 그룹 안에서는 경기 순번(orderInDay)순으로 정렬한다', () => {
    const fixtures = [
      { round: 3, matchday: 1, orderInDay: 3, homeTeamId: 'a', awayTeamId: 'd', startAt: '2026-09-02T13:40:00.000Z', endAt: 'e3' },
      { round: 1, matchday: 1, orderInDay: 1, homeTeamId: 'a', awayTeamId: 'b', startAt: '2026-09-02T13:00:00.000Z', endAt: 'e1' },
      { round: 2, matchday: 1, orderInDay: 2, homeTeamId: 'c', awayTeamId: 'd', startAt: '2026-09-02T13:20:00.000Z', endAt: 'e2' },
    ];
    const groups = groupPreviewByMatchday(fixtures);
    expect(groups[0].items.map((item) => item.orderInDay)).toEqual([1, 2, 3]);
  });
});

describe('groupPreviewByWeek (서버 week 로 묶는 미리보기)', () => {
  // 2026-11-21 은 토요일. 09:00 KST = 00:00Z.
  const at = (date: string, hour: number) => new Date(Date.parse(`${date}T00:00:00+09:00`) + hour * 3_600_000).toISOString();
  const fixture = (round: number, matchday: number, week: number, startAt: string, orderInDay: number) => ({
    round, matchday, week, orderInDay, homeTeamId: 'a', awayTeamId: 'b', startAt, endAt: startAt,
  });
  // 입력은 일부러 섞는다: 일 → 다음 주 토 → 토.
  const fixtures = [
    fixture(2, 2, 1, at('2026-11-22', 10), 1),
    fixture(3, 3, 2, at('2026-11-28', 10), 1),
    fixture(1, 1, 1, at('2026-11-21', 11), 2),
    fixture(1, 1, 1, at('2026-11-21', 10), 1),
  ];

  it('토·일을 한 주로 묶고 시작 시각순으로 정렬하며 날마다 경기 수를 센다', () => {
    const groups = groupPreviewByWeek(fixtures);

    expect(groups.map((group) => group.week)).toEqual([1, 2]);
    expect(groups[0].items.map((item) => item.startAt)).toEqual([
      at('2026-11-21', 10), at('2026-11-21', 11), at('2026-11-22', 10),
    ]);
    expect(groups[0].days).toEqual([{ label: '11/21 (토)', count: 2 }, { label: '11/22 (일)', count: 1 }]);
    expect(groups[1].days).toEqual([{ label: '11/28 (토)', count: 1 }]);
  });

  it('헤더는 그 주에 경기가 있는 날만 날짜순으로 적는다', () => {
    const [week1, week2] = groupPreviewByWeek(fixtures);

    expect(weekGroupHeading(week1)).toBe('1주차 · 11/21 (토) 2경기 / 11/22 (일) 1경기');
    expect(weekGroupHeading(week2)).toBe('2주차 · 11/28 (토) 1경기');
  });

  it('KST 자정을 넘긴 경기는 다음 날로 센다 — UTC 날짜로 세면 토요일 밤 경기가 토요일에 남는다', () => {
    const lateSaturday = fixture(1, 1, 1, '2026-11-21T14:30:00.000Z', 1); // 11/21 23:30 KST
    const afterMidnight = fixture(2, 1, 1, '2026-11-21T15:10:00.000Z', 2); // 11/22 00:10 KST

    expect(groupPreviewByWeek([afterMidnight, lateSaturday])[0].days.map((day) => day.label)).toEqual([
      '11/21 (토)', '11/22 (일)',
    ]);
  });
});

describe('previewWeekCount / hasCalendarWeeks', () => {
  const base = { leagueId: 'l', fixtureCount: 3, placeName: 'p', warnings: [] };
  const row = (round: number, week?: number) => ({
    round, homeTeamId: 'a', awayTeamId: 'b', startAt: '2026-11-21T01:00:00.000Z', ...(week === undefined ? {} : { week }),
  });

  it('week 가 있으면 매치데이 수(3)가 아니라 서로 다른 달력 주 수(2)를 센다', () => {
    const result = { ...base, rounds: 3, matchdayCount: 3, fixtures: [row(1, 1), row(2, 1), row(3, 2)] };

    expect(hasCalendarWeeks(result.fixtures)).toBe(true);
    expect(previewWeekCount(result)).toBe(2);
  });

  it('week 가 없는 구버전 응답은 matchdayCount, 그것도 없으면 rounds 를 그대로 쓴다', () => {
    const legacy = { ...base, rounds: 3, fixtures: [row(1), row(2), row(3)] };

    expect(hasCalendarWeeks(legacy.fixtures)).toBe(false);
    expect(previewWeekCount({ ...legacy, matchdayCount: 2 })).toBe(2);
    expect(previewWeekCount(legacy)).toBe(3);
  });

  it('week 가 일부 경기에만 있으면 구버전으로 본다', () => {
    expect(hasCalendarWeeks([row(1, 1), row(2)])).toBe(false);
  });
});

describe('previewTimingGroups', () => {
  const row = (round: number, matchday: number, startAt: string, week?: number) => ({
    round, matchday, orderInDay: 1, homeTeamId: 'a', awayTeamId: 'b', startAt, endAt: startAt, ...(week === undefined ? {} : { week }),
  });

  it('week 가 있으면 한 주의 토·일이 한 묶음이고 요일 접두를 켠다, 하루짜리 주는 끈다', () => {
    const groups = previewTimingGroups([
      row(1, 1, '2026-11-21T01:00:00.000Z', 1),
      row(2, 2, '2026-11-22T01:00:00.000Z', 1),
      row(3, 3, '2026-11-28T01:00:00.000Z', 2),
    ]);

    expect(groups.map((group) => [group.heading, group.showWeekday])).toEqual([
      ['1주차 · 11/21 (토) 1경기 / 11/22 (일) 1경기', true],
      ['2주차 · 11/28 (토) 1경기', false],
    ]);
  });

  it('week 가 없는 구버전 응답은 매치데이로 묶고 기존 헤더 모양을 쓴다', () => {
    const groups = previewTimingGroups([
      row(1, 1, '2026-09-02T13:00:00.000Z'),
      row(2, 1, '2026-09-02T13:20:00.000Z'),
    ]);

    expect(groups.map((group) => [group.heading, group.showWeekday])).toEqual([['1주차 — 9. 2. (수) · 2경기', false]]);
  });
});
