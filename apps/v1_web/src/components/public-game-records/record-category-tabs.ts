import type { TeamRecordCategory } from './types';

/**
 * 리그/대회/친선 분류를 화면에 보여주는 **공용 어휘** (Task 166 BE-4).
 *
 * 팀 전적(`team-records-content.tsx`)이 먼저 갖고 있던 것을, 개인 기록
 * (`user-records-content.tsx`)이 같은 4탭을 쓰게 되면서 여기로 끌어올렸다.
 * 복사하지 않는 이유는 서버가 두 화면에 **같은 분류 함수**
 * (`classifyTeamRecordCategory`)를 쓰기 때문이다 — 화면 어휘만 갈리면 같은 경기가
 * 두 화면에서 다른 이름으로 불린다.
 */
export type RecordTypeFilter = TeamRecordCategory | 'all';

/** 탭 순서는 고정이다. `'all'` 만 로컬 값이고 나머지 셋은 서버 `?type=` 값과 같다. */
export const RECORD_TYPE_TABS: readonly { readonly key: RecordTypeFilter; readonly label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'tournament', label: '대회' },
  { key: 'league', label: '리그' },
  { key: 'friendly', label: '친선' },
];

export const RECORD_TYPE_LABEL: Readonly<Record<TeamRecordCategory, string>> = {
  league: '리그',
  tournament: '대회',
  friendly: '친선',
};

/** 빈 탭 문구. 어느 탭인지에 따라 "무엇이 없는지" 를 그대로 말한다. */
export function recordEmptyCopy(
  activeType: RecordTypeFilter,
  allCopy: { readonly title: string; readonly sub: string },
): { readonly title: string; readonly sub: string } {
  if (activeType === 'all') return allCopy;
  const label = RECORD_TYPE_LABEL[activeType];
  return { title: `아직 ${label} 경기가 없어요`, sub: `${label} 결과가 확정되면 이곳에 표시돼요.` };
}
