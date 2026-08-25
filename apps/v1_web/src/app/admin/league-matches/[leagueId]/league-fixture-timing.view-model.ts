import type { V1PreviewLeagueFixture } from '@/types/league-match';

// 서버 DTO(LeagueFixtureTimingDto)의 gamesPerTeamPerDay @Max(10)와 같은 값 — 역산 제안이
// 서버가 거부할 값을 만들지 않게 여기서도 같은 상한을 쓴다.
const MAX_GAMES_PER_TEAM_PER_DAY = 10;
const DAY_MINUTES = 24 * 60;

export interface DailyPlan {
  /** 하루 총 경기 수 = 팀당 경기 수 × floor(팀 수 / 2). */
  totalGamesPerDay: number;
  /** 첫 킥오프부터 마지막 경기 종료까지(마지막 경기 뒤 휴식 제외). */
  totalMinutes: number;
  gamesPerTeamPerDay: number;
  /** 'HH:mm'. startTime이 없으면(시작일 그대로 모드) null. */
  lastGameEndTime: string | null;
  /** 마지막 경기가 시작일 자정을 넘겨 끝나는지 — 화면에서 "다음날" 표기용. */
  spansNextDay: boolean;
}

export interface DailyPlanInput {
  gameDurationMinutes: number;
  breakMinutes: number;
  gamesPerTeamPerDay: number;
  teamCount: number;
  /** 'HH:mm'. 요일 템플릿을 안 쓰는 폼 상태에서는 생략된다. */
  startTime?: string;
}

export interface SuggestInput {
  startTime: string;
  endTime: string;
  gameDurationMinutes: number;
  breakMinutes: number;
  teamCount: number;
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
  const gamesPerRound = Math.floor(input.teamCount / 2);
  if (gamesPerRound < 1 || input.gamesPerTeamPerDay < 1 || input.gameDurationMinutes < 1 || input.breakMinutes < 0) {
    return null;
  }
  const totalGamesPerDay = input.gamesPerTeamPerDay * gamesPerRound;
  const interval = input.gameDurationMinutes + input.breakMinutes;
  const totalMinutes = totalGamesPerDay * interval - input.breakMinutes;

  let lastGameEndTime: string | null = null;
  let spansNextDay = false;
  if (input.startTime !== undefined) {
    const startMinutes = parseTimeToMinutes(input.startTime);
    if (startMinutes !== null) {
      const endMinutes = startMinutes + totalMinutes;
      lastGameEndTime = formatClock(endMinutes);
      spansNextDay = endMinutes >= DAY_MINUTES;
    }
  }
  return {
    totalGamesPerDay,
    totalMinutes,
    gamesPerTeamPerDay: input.gamesPerTeamPerDay,
    lastGameEndTime,
    spansNextDay,
  };
}

/**
 * 시간창 역산: "몇 시부터 몇 시까지 구장을 쓴다"에서 팀당 하루 경기 수를 제안한다.
 * 종료가 시작보다 이르면 자정을 넘는 창(22:00~00:00 = 120분)으로 해석한다.
 * 완결된 라운드만 제안한다 — 시간이 남아도 라운드 중간에서 끊지 않는다.
 */
export function suggestGamesPerTeamPerDay(input: SuggestInput): { gamesPerTeamPerDay: number; plan: DailyPlan } | null {
  const startMinutes = parseTimeToMinutes(input.startTime);
  const endMinutes = parseTimeToMinutes(input.endTime);
  if (startMinutes === null || endMinutes === null || input.gameDurationMinutes < 1 || input.breakMinutes < 0) return null;
  const windowMinutes = ((endMinutes - startMinutes) + DAY_MINUTES) % DAY_MINUTES;
  if (windowMinutes === 0) return null;
  const gamesPerRound = Math.floor(input.teamCount / 2);
  if (gamesPerRound < 1) return null;

  const interval = input.gameDurationMinutes + input.breakMinutes;
  // 마지막 경기 뒤 휴식은 창 안에 없어도 되므로 +break 하고 나눈다.
  const totalGamesFit = Math.floor((windowMinutes + input.breakMinutes) / interval);
  const gamesPerTeamPerDay = Math.min(Math.floor(totalGamesFit / gamesPerRound), MAX_GAMES_PER_TEAM_PER_DAY);
  if (gamesPerTeamPerDay < 1) return null;

  const plan = computeDailyPlan({
    gameDurationMinutes: input.gameDurationMinutes,
    breakMinutes: input.breakMinutes,
    gamesPerTeamPerDay,
    teamCount: input.teamCount,
    startTime: input.startTime,
  });
  if (plan === null) return null;
  return { gamesPerTeamPerDay, plan };
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
    .map(([matchday, items]) => ({ matchday, items }));
}
