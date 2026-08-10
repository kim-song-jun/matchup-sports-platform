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

const BYE: unique symbol = Symbol('bye');
type Slot = string | typeof BYE;

export function generateRoundRobinFixtures(
  teamIds: readonly string[],
  weeksCount: number,
): RoundRobinFixture[] {
  if (teamIds.length < 2 || weeksCount < 1) return [];

  const padded: Slot[] = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, BYE];
  const cycleRounds = padded.length - 1;
  const homeCounts = new Map<string, number>(teamIds.map((id) => [id, 0]));
  const fixtures: RoundRobinFixture[] = [];

  for (let week = 1; week <= weeksCount; week++) {
    const cycleIndex = (week - 1) % cycleRounds;
    const arrangement = cycleIndex === 0 ? padded : rotateCircle(padded, cycleIndex);
    for (const [a, b] of circlePairs(arrangement)) {
      if (a === BYE || b === BYE) continue;
      const [homeTeamId, awayTeamId] = homeCounts.get(a)! <= homeCounts.get(b)! ? [a, b] : [b, a];
      homeCounts.set(homeTeamId, homeCounts.get(homeTeamId)! + 1);
      fixtures.push({ round: week, homeTeamId, awayTeamId });
    }
  }
  return fixtures;
}

/**
 * series 시작일 기준으로 round(주차)의 경기 시작 시각을 계산한다.
 *
 * template이 없으면 기존 동작을 그대로 유지한다: seriesStartsOn + (round-1)주, 시각은
 * seriesStartsOn 그대로(대개 자정) — 이 브랜치가 하위 호환의 전부다.
 *
 * template이 있으면 "시작일 이후 첫 template.dayOfWeek 요일의 template.time(KST)"부터
 * 매주 채운다. 요일 판정은 서버 프로세스 타임존에 의존하면 배포 환경마다 결과가 달라지므로,
 * seriesStartsOn에 KST 오프셋(+9h)을 더한 뒤 UTC getter로 "KST 벽시계 날짜"를 읽고,
 * 계산이 끝나면 다시 오프셋을 빼 UTC 인스턴트로 되돌린다.
 */
export function resolveFixtureStartAt(
  seriesStartsOn: Date,
  round: number,
  template?: FixtureScheduleTemplate,
): Date {
  if (!template) {
    return new Date(seriesStartsOn.getTime() + (round - 1) * WEEK_MS);
  }
  const [hours, minutes] = template.time.split(':').map(Number);
  const kstStart = new Date(seriesStartsOn.getTime() + KST_OFFSET_MS);
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
  if (firstOccurrenceUtcMs < seriesStartsOn.getTime()) {
    firstOccurrenceUtcMs += WEEK_MS;
  }
  return new Date(firstOccurrenceUtcMs + (round - 1) * WEEK_MS);
}

/** base[0]을 고정하고 나머지를 시계방향으로 steps만큼 회전한다(표준 circle method). */
function rotateCircle(base: readonly Slot[], steps: number): Slot[] {
  const [fixed, ...rest] = base;
  const offset = steps % rest.length;
  return [fixed, ...rest.slice(rest.length - offset), ...rest.slice(0, rest.length - offset)];
}

function circlePairs(arrangement: readonly Slot[]): Array<[Slot, Slot]> {
  const n = arrangement.length;
  const pairs: Array<[Slot, Slot]> = [];
  for (let i = 0; i < n / 2; i++) pairs.push([arrangement[i], arrangement[n - 1 - i]]);
  return pairs;
}
