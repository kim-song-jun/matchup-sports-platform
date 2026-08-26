import { generateRoundRobin } from '../common/scheduling/round-robin';

export interface RoundRobinFixture {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

export const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

export interface FixtureScheduleTemplate {
  /** 0(일)~6(토), KST 기준 요일. */
  dayOfWeek: number;
  /** 'HH:mm', KST 기준 24시간제 시각. */
  time: string;
}

/**
 * 주차 기반 라운드로빈. 페어링 자체는 공용 커널
 * (`common/scheduling/round-robin.ts`)이 계산하고 여기서는 시리즈의
 * 기존 계약(주차=round, teamId 필드명)으로 변환만 한다.
 */
export function generateRoundRobinFixtures(
  teamIds: readonly string[],
  weeksCount: number,
): RoundRobinFixture[] {
  return generateRoundRobin(teamIds, { rounds: weeksCount, balanceHome: true }).map(
    ({ round, homeId, awayId }) => ({ round, homeTeamId: homeId, awayTeamId: awayId }),
  );
}

export interface FixtureTimingOptions {
  /** 경기당 소요 시간(분). */
  gameDurationMinutes: number;
  /** 경기 간 휴식(분). */
  breakMinutes: number;
  /** 팀당 매치데이(하루) 경기 수 = 하루에 소화하는 라운드 수. */
  gamesPerTeamPerDay: number;
}

export interface FixtureTimeSlot {
  /** 1부터 시작하는 매치데이(주차) 번호. */
  matchday: number;
  /** 그 매치데이 안에서 1부터 시작하는 경기 순번. */
  orderInDay: number;
  startAt: Date;
  endAt: Date;
}

/**
 * "한 구장 순차 진행" 모델의 경기 시각 배정. `gamesPerTeamPerDay`개 라운드를 한 매치데이로
 * 묶고(라운드 r → 매치데이 ceil(r/G)), 매치데이 시작 시각은 기존 주간 리듬 계산
 * (`resolveFixtureStartAt`)을 매치데이 번호로 재사용한다. 매치데이 안에서는 경기들이
 * `경기 시간 + 휴식` 간격으로 연달아 배치된다 — 예: 4팀·팀당 3경기·15분+5분이면
 * 22:00/22:20/22:40/23:00/23:20/23:40 (하루 6경기).
 *
 * 입력 `fixtures`는 round 오름차순이어야 한다(라운드로빈 생성기의 계약). 반환 배열은
 * 입력과 같은 순서·같은 길이로, i번째 슬롯이 i번째 대진의 시각이다.
 */
export function resolveFixtureTimeSlots(
  fixtures: readonly RoundRobinFixture[],
  leagueStartsOn: Date,
  timing: FixtureTimingOptions,
  template?: FixtureScheduleTemplate,
): FixtureTimeSlot[] {
  const intervalMs = (timing.gameDurationMinutes + timing.breakMinutes) * 60_000;
  const durationMs = timing.gameDurationMinutes * 60_000;
  const lastOrderByMatchday = new Map<number, number>();
  return fixtures.map((fixture) => {
    const matchday = Math.ceil(fixture.round / timing.gamesPerTeamPerDay);
    const orderInDay = (lastOrderByMatchday.get(matchday) ?? 0) + 1;
    lastOrderByMatchday.set(matchday, orderInDay);
    const dayStartMs = resolveFixtureStartAt(leagueStartsOn, matchday, template).getTime();
    const startAt = new Date(dayStartMs + (orderInDay - 1) * intervalMs);
    return { matchday, orderInDay, startAt, endAt: new Date(startAt.getTime() + durationMs) };
  });
}

/**
 * 리그 시작일 기준으로 round(주차)의 경기 시작 시각을 계산한다.
 *
 * template이 없으면 기존 동작을 그대로 유지한다: leagueStartsOn + (round-1)주, 시각은
 * leagueStartsOn 그대로(대개 자정) — 이 브랜치가 하위 호환의 전부다.
 *
 * template이 있으면 "시작일 이후 첫 template.dayOfWeek 요일의 template.time(KST)"부터
 * 매주 채운다. 요일 판정은 서버 프로세스 타임존에 의존하면 배포 환경마다 결과가 달라지므로,
 * leagueStartsOn에 KST 오프셋(+9h)을 더한 뒤 UTC getter로 "KST 벽시계 날짜"를 읽고,
 * 계산이 끝나면 다시 오프셋을 빼 UTC 인스턴트로 되돌린다.
 */
export function resolveFixtureStartAt(
  leagueStartsOn: Date,
  round: number,
  template?: FixtureScheduleTemplate,
): Date {
  if (!template) {
    return new Date(leagueStartsOn.getTime() + (round - 1) * WEEK_MS);
  }
  const [hours, minutes] = template.time.split(':').map(Number);
  const kstStart = new Date(leagueStartsOn.getTime() + KST_OFFSET_MS);
  const startWeekdayKst = kstStart.getUTCDay();
  const daysUntilTarget = (template.dayOfWeek - startWeekdayKst + 7) % 7;
  const firstOccurrenceKstWallClockMs = Date.UTC(
    kstStart.getUTCFullYear(),
    kstStart.getUTCMonth(),
    kstStart.getUTCDate() + daysUntilTarget,
    hours,
    minutes,
  );
  let firstOccurrenceUtcMs = firstOccurrenceKstWallClockMs - KST_OFFSET_MS;
  // daysUntilTarget이 0(시작일과 같은 요일)이면서 template.time이 시작일 당일의 실제 시각보다
  // 이르면, 위 계산은 "시작일 이후 첫 occurrence"라는 계약을 어기고 시작일보다 과거 시각을
  // 반환한다 — 그 경우 한 주 뒤로 민다.
  if (firstOccurrenceUtcMs < leagueStartsOn.getTime()) {
    firstOccurrenceUtcMs += WEEK_MS;
  }
  return new Date(firstOccurrenceUtcMs + (round - 1) * WEEK_MS);
}
