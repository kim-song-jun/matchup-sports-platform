import type { TeamMatchCreateStep } from './team-matches.types';

/**
 * 팀매치 생성 위저드의 스텝 → 라우트 경로.
 *
 * `TeamMatchCreateStep`의 각 값은 그 스텝의 라우트 세그먼트 문자열과 항상
 * 동일하므로(`team-matches.validation.ts`의 RULES가 참조하는 step 값도 같은
 * 문자열이다) 템플릿 하나로 전 스텝을 커버한다.
 *
 * 두 소비자가 각자 같은 함수를 들고 있었다(진행 표시줄 클릭 이동은
 * `team-matches-create-client.tsx`, 결측 필드 배너의 스텝 링크는
 * `team-matches-page.tsx`). 라우팅 규칙이 바뀔 때 한쪽만 고치면 조용히
 * 갈라지므로 여기 한 곳으로 모은다. 한 칸 이동 전용인 nextHref/previousHref로는
 * 임의 스텝 이동을 표현할 수 없어 이 헬퍼가 따로 필요하다.
 */
export function teamMatchStepHref(step: TeamMatchCreateStep): string {
  return `/team-matches/new/${step}`;
}
