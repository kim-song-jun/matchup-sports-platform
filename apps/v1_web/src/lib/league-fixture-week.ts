import type { V1LeagueFixture } from '@/types/league-match';
import { toKstDateString } from './kst-calendar';

type FixtureStart = Pick<V1LeagueFixture, 'startAt'>;

/**
 * 경기가 속한 KST 달력 주의 키 — 그 주 월요일의 `'YYYY-MM-DD'`. 문자열 정렬이 곧 주 순서다.
 * 서버 `league-week-number.ts` 의 `kstWeekKey` 와 같은 규칙이다(2026-11-03 사용자 확정 — 주차는 달력 주).
 */
export function kstWeekKey(instant: Date): string {
  const date = new Date(`${toKstDateString(instant)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

/**
 * 리그 경기의 주차(1부터). KST 월~일을 한 주로 묶고 **경기가 있는 주만** 순서대로 센다 — 토·일에 나눠 치러도
 * 같은 주차이고 쉬는 주는 번호를 건너뛰지 않는다. 서버(`league-week-number.ts`)와 같은 규칙이라 화면마다 주차가 갈리지 않는다.
 */
export function leagueFixtureWeekNumber(fixtures: readonly FixtureStart[], target: FixtureStart): number | null {
  const weeks = [...new Set(fixtures.map((fixture) => kstWeekKey(new Date(fixture.startAt))))].sort();
  const index = weeks.indexOf(kstWeekKey(new Date(target.startAt)));
  return index >= 0 ? index + 1 : null;
}

/** 저장된 제목 끝의 "N주차" 토큰만 파생 주차로 바꾼다. 끝에 토큰이 없는 사용자 지정 제목은 그대로 둔다. */
export function withDerivedWeek(storedTitle: string, week: number | null): string {
  if (week === null) return storedTitle;
  return storedTitle.replace(/ \d+주차(?=( \d+경기)?$)/, ` ${week}주차`);
}
