import type { V1MyTournamentStaffGroup, V1MyTournamentStaffResponse } from '@/types/api';

/**
 * "내 담당 대회"(`GET /me/tournament-staff`) 응답을 읽는 헬퍼들.
 *
 * 조회 자체는 `useV1MyTournamentStaffAssignments`(hooks/use-v1-api.ts)가 담당한다 — 이 파일은
 * 그 응답을 진입 판정과 딥링크로 해석하는 순수 함수만 둔다. 필드 담당자(FIELD_OPERATOR)는
 * 대회 전역 리소스를 읽을 권한이 없어 대회 셸에 들어갈 수 없으므로, 이 응답이 그들이 자기
 * 담당 경기 콘솔로 갈 수 있는 유일한 출발점이다.
 */

/** 이 대회에서 내가 받은 배정들. 없으면 null. */
export function findMyTournamentGroup(
  response: V1MyTournamentStaffResponse | undefined,
  tournamentId: string,
): V1MyTournamentStaffGroup | null {
  return response?.items.find((group) => group.tournamentId === tournamentId) ?? null;
}

/**
 * 내가 이 경기 콘솔을 담당하는가 — 딥링크 진입 허용 판정에 쓴다(서버가 최종 판정).
 *
 * 경기 단위 배정은 `fixtureIds` 로 정확히 가른다. 반면 **필드 단위 배정**(fixtureIds 가 비고
 * fieldId 만 있는 경우)은 그 필드에서 열리는 모든 경기를 담당하는데 화면은 경기의 소속 필드를
 * 모르므로 여기서 판정할 수 없다 — 막지 않고 통과시켜 서버 `assertAccess` 에 맡긴다.
 * 권한이 없으면 콘솔이 데이터를 읽는 순간 403 이 오므로 과다 노출이 아니다.
 */
export function coversFixture(
  response: V1MyTournamentStaffResponse | undefined,
  tournamentId: string,
  fixtureId: string,
): boolean {
  const group = findMyTournamentGroup(response, tournamentId);
  if (group === null) return false;
  return group.assignments.some((assignment) => {
    if (assignment.role !== 'FIELD_OPERATOR') return false;
    if (assignment.fixtureIds.includes(fixtureId)) return true;
    return assignment.fixtureIds.length === 0 && assignment.fieldId !== null;
  });
}

/**
 * 실시간 소켓 핸드셰이크가 제시할 배정 버전.
 *
 * `game.subscribe`/`game.takeover.request` 의 staleness 게이트가 이 값을 검사한다. 필드
 * 담당자는 대회 전역 스태프 목록을 읽을 수 없어 그쪽에서 읽으면 항상 0 이 되고, 그러면
 * 콘솔은 열리는데 이벤트가 하나도 들어오지 않는다(STAFF_SCOPE_DENIED). 본인 배정에서 읽는다.
 * 한 대회에 배정이 여럿이면 가장 높은 버전을 쓴다 — 게이트는 "제시값이 서버보다 낮으면 거부"라
 * 최댓값이 안전하다. 배정이 없으면(플랫폼 운영자 등) 0 을 돌려주고 게이트는 적용되지 않는다.
 */
export function myAssignmentVersion(
  response: V1MyTournamentStaffResponse | undefined,
  tournamentId: string,
): number {
  const group = findMyTournamentGroup(response, tournamentId);
  if (group === null) return 0;
  return group.assignments.reduce((max, assignment) => Math.max(max, assignment.version), 0);
}

/** 역할별 진입 목적지. FIELD_OPERATOR 만 셸을 건너뛰고 담당 경기 콘솔로 직행한다. */
export function myStaffEntryHref(group: V1MyTournamentStaffGroup): string | null {
  const tournamentId = encodeURIComponent(group.tournamentId);
  const fieldOperator = group.assignments.find((assignment) => assignment.role === 'FIELD_OPERATOR');
  const shellRole = group.assignments.find((assignment) => assignment.role !== 'FIELD_OPERATOR');
  if (shellRole !== undefined) return `/tournament-ops/tournaments/${tournamentId}/operations`;
  if (fieldOperator === undefined) return null;
  const target = fieldOperator.fixtureIds[0];
  // 경기 스코프가 없는 필드 단위 배정은 갈 경기를 화면이 특정할 수 없다 — 링크를 만들지 않는다.
  if (target === undefined) return null;
  return `/tournament-ops/tournaments/${tournamentId}/fixtures/${encodeURIComponent(target)}/operate`;
}
