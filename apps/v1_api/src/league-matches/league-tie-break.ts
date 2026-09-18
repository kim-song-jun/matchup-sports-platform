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
 *
 * **5번째 기준(`fewestGoalsAgainst`)은 2026-09-17 팀 확정으로 추가됐다.**
 *
 * ⚠️ **이 위치에서는 대수적으로 절대 발동하지 않는다 — 버그가 아니라 알고 남긴 것이다.**
 * `goalDifference = goalsFor - goalsAgainst` 이므로, 2번(goalDifference)과 3번(goalsFor)이
 * 둘 다 같은 팀들은 goalsAgainst 도 자동으로 같다(대수적으로 강제된다). 5번까지 내려오는
 * 그룹은 이미 2·3번을 통과한 그룹이므로, 5번 자리에서 실제로 갈리는 경우는 존재할 수
 * 없다 — 팀이 그대로 이 순서로 확정했다(2026-09-17, "B안": 순서는 그대로 두고 잔여
 * 동률은 공동 우승으로 받아들인다). 실제로 순위를 더 갈라내고 싶으면 이 기준을
 * goalDifference **앞으로** 옮겨야 한다(그땐 goalsFor·goalDifference가 아직 강제되기
 * 전이라 goalsAgainst 가 독립적으로 다를 수 있다).
 *
 * 이 기준이 있어도(사실상 없어도) 완전 동률(예: 두 팀이 서로 딱 한 번만 붙고 그게
 * 무승부인 경우)은 여전히 남을 수 있다 — 그 잔여 동률은
 * `calculateLeagueStandingsWithTieBreakInfo`의 `tieGroups` 로 감지해
 * `resolveLeagueChampions`가 공동 우승으로 처리한다.
 */
export const LEAGUE_TIE_BREAK_ORDER: readonly LeagueTieBreakCriterion[] = [
  'points',
  'goalDifference',
  'goalsFor',
  'headToHead',
  'fewestGoalsAgainst',
];
