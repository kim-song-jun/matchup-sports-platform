import type { LeagueTieBreakCriterion } from './league-standings';

/**
 * **동점 처리 순서는 플랫폼 공통 상수다 — 대회별 설정이 아니다** (정본 §5, Task 164 BE-5).
 *
 * 예전에는 `V1League.tieBreakJson` 이 리그마다 이 순서를 담았다. 그런데 그 컬럼은
 * **생성 시 이 값이 그대로 박히고, 그 뒤 바꾸는 경로가 하나도 없었다** — 운영자 화면에도,
 * API 에도 없었다. 읽는 쪽 세 곳은 전부 `?? [같은 배열]` 로 같은 기본값을 인라인해 두고
 * 있었고, 쓰는 쪽 두 곳은 이 배열을 **각자 따로 정의**하고 있었다(같은 값 5벌).
 *
 * 통합 축(`V1Tournament`)으로 옮기면서 이 컬럼을 따라 옮기지 않기로 했다 — 아무도 바꿀 수
 * 없는 설정은 설정이 아니라 상수이고, 옮기면 죽은 설정을 새 테이블로 이사시키는 것뿐이다.
 * 진짜로 대회마다 다른 순서가 필요해지면 그때 컬럼을 **의미 있게** 추가한다(그때는 바꾸는
 * 경로도 함께 만든다는 뜻이다).
 */
export const LEAGUE_TIE_BREAK_ORDER: readonly LeagueTieBreakCriterion[] = [
  'points',
  'goalDifference',
  'goalsFor',
  'headToHead',
];
