/**
 * 개인 매치·팀매치 공개 목록의 상태 묶음 순서(2026-10-21 사용자 확정).
 *
 * 예전에는 서버가 경기일 순으로만 주고 화면이 받은 20개 안에서만 신청 가능한 카드를 앞으로 당겨, 다음 페이지의
 * 신청 가능 카드가 앞 페이지의 마감 카드 뒤에 나왔다. 이제 서버가 묶음 순서대로 페이지를 채운다 — 한 묶음을 끝까지
 * 보낸 뒤 다음 묶음으로 넘어간다(`paginateByStatePriority`). 화면은 다시 정렬하지 않는다.
 *
 * live 진행 중 → open 신청 가능 → scheduled 경기 예정(상대·인원 확정) → closed 신청 마감 → ended 끝난 경기
 * → unscheduled 일정 미정(시작 시각이 없는 리그 대진).
 */
export const LIST_STATUS_GROUPS = ['live', 'open', 'scheduled', 'closed', 'ended', 'unscheduled'] as const;
export type ListStatusGroup = (typeof LIST_STATUS_GROUPS)[number];

export type ListSort = 'recommended' | 'latest' | 'starts_at' | 'deadline' | undefined;

type ListOrderBy =
  | { startAt: 'asc' | 'desc' }
  | { createdAt: 'desc' }
  | { id: 'desc' }
  | { deadlineAt: { sort: 'asc'; nulls: 'last' } };

/**
 * 묶음 안의 순서. 정렬 메뉴는 신청 가능 묶음 안의 순서만 바꾼다 — 마감임박은 마감 가까운 순(마감 시각이 없는 글은
 * 그 뒤에 경기 가까운 순), 최신순은 등록 최신순. 나머지 묶음은 정렬과 무관하다. 마지막은 언제나 id 라 커서로
 * 이어 읽어도 겹치거나 빠지지 않는다.
 */
export function listGroupOrderBy(group: ListStatusGroup, sort: ListSort): ListOrderBy[] {
  const tail: ListOrderBy[] = [{ createdAt: 'desc' }, { id: 'desc' }];
  if (group === 'open') {
    if (sort === 'latest') return tail;
    if (sort === 'deadline') return [{ deadlineAt: { sort: 'asc', nulls: 'last' } }, { startAt: 'asc' }, ...tail];
    return [{ startAt: 'asc' }, ...tail];
  }
  if (group === 'ended') return [{ startAt: 'desc' }, ...tail];
  if (group === 'unscheduled') return tail;
  return [{ startAt: 'asc' }, ...tail];
}

/** 행마다 묶음을 정해 묶음별 id 목록으로 모은다. 묶음 순서는 LIST_STATUS_GROUPS 다. */
export function groupIdsByListStatus<T extends { id: string }>(
  rows: readonly T[],
  groupOf: (row: T) => ListStatusGroup,
): Map<ListStatusGroup, string[]> {
  const ids = new Map<ListStatusGroup, string[]>(LIST_STATUS_GROUPS.map((group) => [group, []]));
  for (const row of rows) ids.get(groupOf(row))!.push(row.id);
  return ids;
}
