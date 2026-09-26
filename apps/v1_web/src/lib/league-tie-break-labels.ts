import type { V1LeagueTieBreakCriterion } from '@/types/league-match';

/**
 * 동점 처리 기준의 한국어 라벨 단일 소스(정본 §5). `Record<유니온, string>` 이라 서버
 * 기준이 하나 늘면 여기가 컴파일 에러가 난다 — 라벨 누락이 화면에 enum 값으로 새어
 * 나가는 경로를 막는 게 이 타입의 일이다.
 */
export const LEAGUE_TIE_BREAK_LABELS: Record<V1LeagueTieBreakCriterion, string> = {
  points: '승점',
  goalDifference: '골득실',
  goalsFor: '다득점',
  headToHead: '승자승',
  fewestGoalsAgainst: '최소 실점',
};

/**
 * 서버 `LEAGUE_TIE_BREAK_ORDER`(apps/v1_api/src/league-matches/league-tie-break.ts)의 사본.
 * 리그가 아직 없어 순위표 응답을 못 받는 화면(리그 만들기)에만 쓴다 — 응답이 있는 화면은
 * 그 순서를 그대로 쓴다. 서버 상수와의 일치는 이 파일의 테스트가 지킨다.
 */
export const LEAGUE_TIE_BREAK_ORDER: readonly V1LeagueTieBreakCriterion[] = [
  'points',
  'goalDifference',
  'goalsFor',
  'headToHead',
  'fewestGoalsAgainst',
];

/**
 * 라벨을 모르는 값은 **버린다** — 그대로 찍으면 사용자가 내부 식별자를 읽게 된다.
 * 여기까지 모르는 값이 오는 경로는 "새 서버 + 오래된 캐시 번들" 하나뿐이라 규칙 줄이
 * 조금 짧은 편이 낫다. 전부 모르면 빈 문자열이므로 호출부가 줄째로 감출 수 있다.
 */
export function formatTieBreakRule(order: readonly string[]): string {
  const labels: Record<string, string | undefined> = LEAGUE_TIE_BREAK_LABELS;
  return order
    .map((criterion) => labels[criterion])
    .filter((label): label is string => label !== undefined)
    .join(' → ');
}
