import { formatKstDateShort, formatTournamentDateShort } from '@/lib/date-utils';
import type { V1PreviewLeagueFixture, V1PreviewLeagueFixturesResult } from '@/types/league-match';

// 서버 DTO(LeagueFixtureTimingDto)의 gamesPerDay @Max(50)와 같은 값 — 역산 제안이
// 서버가 거부할 값을 만들지 않게 여기서도 같은 상한을 쓴다.
export const MAX_GAMES_PER_DAY = 50;
const DAY_MINUTES = 24 * 60;

export interface DailyPlan {
  /** 하루 총 경기 수. */
  totalGamesPerDay: number;
  /** 첫 킥오프부터 마지막 경기 종료까지(마지막 경기 뒤 휴식 제외). */
  totalMinutes: number;
  /** 'HH:mm'. startTime이 없으면(시작일 그대로 모드) null. */
  lastGameEndTime: string | null;
  /** 마지막 경기가 시작일 자정을 넘겨 끝나는지 — daysLater >= 1 과 동치. */
  spansNextDay: boolean;
  /** 시작일 기준 며칠 뒤에 끝나는지(0=당일). 극단 설정은 하루를 여러 번 넘길 수 있어
   * "다음날" 불리언만으로는 오표기가 된다 — 화면 표기는 dayOffsetLabel()을 쓴다. */
  daysLater: number;
}

/** DailyPlan.daysLater의 화면 표기: 0 → '', 1 → '다음날 ', n → 'n일 뒤 '. */
export function dayOffsetLabel(daysLater: number): string {
  if (daysLater <= 0) return '';
  return daysLater === 1 ? '다음날 ' : `${daysLater}일 뒤 `;
}

export interface DailyPlanInput {
  gameDurationMinutes: number;
  breakMinutes: number;
  /** 하루 경기 수(전 팀 합계). 칸을 비웠으면 부르는 쪽이 한 라운드 경기 수를 넘긴다. */
  gamesPerDay: number;
  /** 'HH:mm'. 요일 템플릿을 안 쓰는 폼 상태에서는 생략된다. */
  startTime?: string;
}

export interface SuggestInput {
  startTime: string;
  endTime: string;
  gameDurationMinutes: number;
  breakMinutes: number;
}

function parseTimeToMinutes(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (match === null) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatClock(minutesSinceMidnight: number): string {
  const wrapped = ((minutesSinceMidnight % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hours = Math.floor(wrapped / 60);
  const minutes = wrapped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** 현재 폼 값 그대로의 "하루 운영 계산" — 계산기 카드가 쓴다. */
export function computeDailyPlan(input: DailyPlanInput): DailyPlan | null {
  if (input.gamesPerDay < 1 || input.gameDurationMinutes < 1 || input.breakMinutes < 0) {
    return null;
  }
  const totalGamesPerDay = input.gamesPerDay;
  const interval = input.gameDurationMinutes + input.breakMinutes;
  const totalMinutes = totalGamesPerDay * interval - input.breakMinutes;

  let lastGameEndTime: string | null = null;
  let daysLater = 0;
  if (input.startTime !== undefined) {
    const startMinutes = parseTimeToMinutes(input.startTime);
    if (startMinutes !== null) {
      const endMinutes = startMinutes + totalMinutes;
      lastGameEndTime = formatClock(endMinutes);
      daysLater = Math.floor(endMinutes / DAY_MINUTES);
    }
  }
  return {
    totalGamesPerDay,
    totalMinutes,
    lastGameEndTime,
    spansNextDay: daysLater >= 1,
    daysLater,
  };
}

/**
 * 시간창 역산: "몇 시부터 몇 시까지 구장을 쓴다"에서 하루 경기 수를 제안한다 — 그 창에 들어가는 경기 수 그대로.
 * 종료가 시작보다 이르면 자정을 넘는 창(22:00~00:00 = 120분)으로 해석한다.
 */
export function suggestGamesPerDay(input: SuggestInput): { gamesPerDay: number; plan: DailyPlan } | null {
  const startMinutes = parseTimeToMinutes(input.startTime);
  const endMinutes = parseTimeToMinutes(input.endTime);
  if (startMinutes === null || endMinutes === null || input.gameDurationMinutes < 1 || input.breakMinutes < 0) return null;
  const windowMinutes = ((endMinutes - startMinutes) + DAY_MINUTES) % DAY_MINUTES;
  if (windowMinutes === 0) return null;

  const interval = input.gameDurationMinutes + input.breakMinutes;
  // 마지막 경기 뒤 휴식은 창 안에 없어도 되므로 +break 하고 나눈다.
  const totalGamesFit = Math.floor((windowMinutes + input.breakMinutes) / interval);
  const gamesPerDay = Math.min(totalGamesFit, MAX_GAMES_PER_DAY);
  if (gamesPerDay < 1) return null;

  const plan = computeDailyPlan({
    gameDurationMinutes: input.gameDurationMinutes,
    breakMinutes: input.breakMinutes,
    gamesPerDay,
    startTime: input.startTime,
  });
  if (plan === null) return null;
  return { gamesPerDay, plan };
}

export interface MatchdayGroup {
  matchday: number;
  items: V1PreviewLeagueFixture[];
}

/** 미리보기 응답을 매치데이별로 묶는다. matchday가 없는 레거시 응답은 round를 그대로 쓴다. */
export function groupPreviewByMatchday(fixtures: V1PreviewLeagueFixture[]): MatchdayGroup[] {
  const groups = new Map<number, V1PreviewLeagueFixture[]>();
  for (const fixture of fixtures) {
    const matchday = fixture.matchday ?? fixture.round;
    const bucket = groups.get(matchday);
    if (bucket === undefined) groups.set(matchday, [fixture]);
    else bucket.push(fixture);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([matchday, items]) => ({
      matchday,
      // 서버는 생성 순서(=시간순)로 내려주지만, 표시 순서가 응답 배열 순서에 묵시적으로
      // 기대는 대신 그룹 안에서 경기 순번으로 명시 정렬한다. 순번이 없는 항목(레거시)은
      // 0이 아니라 뒤로 보낸다 — 혹시 섞여 오더라도 순번 있는 경기가 항상 먼저다.
      items: [...items].sort(
        (a, b) =>
          (a.orderInDay ?? Number.MAX_SAFE_INTEGER) - (b.orderInDay ?? Number.MAX_SAFE_INTEGER) ||
          a.startAt.localeCompare(b.startAt),
      ),
    }));
}

/** 서버가 만들어질 제목의 "N주차"(`week`)를 모든 경기에 실어 보냈는지. 구버전 응답은 false. */
export function hasCalendarWeeks(fixtures: V1PreviewLeagueFixture[]): boolean {
  return fixtures.length > 0 && fixtures.every((fixture) => fixture.week !== undefined);
}

/** 한 주 안의 경기일 하나: 'M/D (요일)' 라벨과 그날 경기 수. */
export interface PreviewWeekDay {
  label: string;
  count: number;
}

export interface PreviewWeekGroup {
  week: number;
  days: PreviewWeekDay[];
  items: V1PreviewLeagueFixture[];
}

/**
 * 미리보기를 서버가 준 달력 주(`week`)로 묶는다. 토·일처럼 한 주 안의 날은 한 그룹이고,
 * 그룹 안에서는 시작 시각순이다(경기일을 넘나드는 순번은 `orderInDay` 로 못 정한다).
 * `hasCalendarWeeks` 가 참일 때만 부른다.
 */
export function groupPreviewByWeek(fixtures: V1PreviewLeagueFixture[]): PreviewWeekGroup[] {
  const byWeek = new Map<number, V1PreviewLeagueFixture[]>();
  for (const fixture of fixtures) {
    const week = fixture.week as number;
    const bucket = byWeek.get(week);
    if (bucket === undefined) byWeek.set(week, [fixture]);
    else bucket.push(fixture);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, bucket]) => {
      const items = [...bucket].sort(
        (a, b) =>
          Date.parse(a.startAt) - Date.parse(b.startAt) ||
          (a.matchday ?? a.round) - (b.matchday ?? b.round) ||
          (a.orderInDay ?? Number.MAX_SAFE_INTEGER) - (b.orderInDay ?? Number.MAX_SAFE_INTEGER),
      );
      const days: PreviewWeekDay[] = [];
      for (const item of items) {
        const label = formatTournamentDateShort(item.startAt) ?? item.startAt;
        const last = days[days.length - 1];
        if (last?.label === label) last.count += 1;
        else days.push({ label, count: 1 });
      }
      return { week, days, items };
    });
}

/** '1주차 · 11/21 (토) 8경기 / 11/22 (일) 7경기' — 그 주에 경기가 있는 날만 날짜순으로. */
export function weekGroupHeading(group: PreviewWeekGroup): string {
  return `${group.week}주차 · ${group.days.map((day) => `${day.label} ${day.count}경기`).join(' / ')}`;
}

export interface PreviewTimingGroup {
  key: number;
  heading: string;
  items: V1PreviewLeagueFixture[];
  /** 한 주가 여러 경기일에 걸치면 각 행의 시각 앞에 요일을 붙인다. */
  showWeekday: boolean;
}

/** timing 미리보기의 묶음. 서버가 `week` 를 주면 달력 주로, 구버전 응답은 매치데이로 묶는다. */
export function previewTimingGroups(fixtures: V1PreviewLeagueFixture[]): PreviewTimingGroup[] {
  if (hasCalendarWeeks(fixtures)) {
    return groupPreviewByWeek(fixtures).map((group) => ({
      key: group.week,
      heading: weekGroupHeading(group),
      items: group.items,
      showWeekday: group.days.length > 1,
    }));
  }
  return groupPreviewByMatchday(fixtures).map((group) => ({
    key: group.matchday,
    heading: `${group.matchday}주차 — ${formatKstDateShort(group.items[0].startAt)} · ${group.items.length}경기`,
    items: group.items,
    showWeekday: false,
  }));
}

/** 미리보기 요약의 "N주". `week` 가 있으면 달력 주 수, 구버전 응답은 매치데이(없으면 라운드) 수. */
export function previewWeekCount(result: V1PreviewLeagueFixturesResult): number {
  if (hasCalendarWeeks(result.fixtures)) return new Set(result.fixtures.map((fixture) => fixture.week)).size;
  return result.matchdayCount ?? result.rounds;
}
