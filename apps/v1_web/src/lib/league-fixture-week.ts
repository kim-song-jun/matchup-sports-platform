import type { V1LeagueFixture } from '@/types/league-match';

const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });

type FixtureStart = Pick<V1LeagueFixture, 'startAt'>;

/**
 * 리그 경기의 주차(1부터). 대진은 주 단위 템플릿으로 생성되므로 KST 기준 "몇 번째 경기 날짜인가"가
 * 곧 주차다. 저장된 대진 제목의 주차는 생성 시점 값이라 재일정 뒤 어긋난다 — 화면에 보이는
 * 주차는 항상 이 함수에서 파생한다.
 */
export function leagueFixtureWeekNumber(fixtures: readonly FixtureStart[], target: FixtureStart): number | null {
  const days = [...new Set(fixtures.map((fixture) => KST_DAY.format(new Date(fixture.startAt))))].sort();
  const index = days.indexOf(KST_DAY.format(new Date(target.startAt)));
  return index >= 0 ? index + 1 : null;
}

/** 저장된 제목의 "N주차" 토큰만 파생 주차로 바꾼다. 토큰이 없는 사용자 지정 제목은 그대로 둔다. */
export function withDerivedWeek(storedTitle: string, week: number | null): string {
  if (week === null) return storedTitle;
  return storedTitle.replace(/\d+주차/, `${week}주차`);
}
