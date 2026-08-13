import { useQuery } from '@tanstack/react-query';
import { v1Get } from '@/lib/api-client';
import { v1Keys } from '@/lib/query-keys';
import type { V1TournamentStaffRole } from '@/types/api';

/**
 * `GET /tournament-ops/me/assignments` — 내가 받은 대회 스태프 배정.
 *
 * 대회 단위 조회(`useV1TournamentStaffAssignments`)와 달리 대회를 지정하지 않는다. 필드
 * 담당자(FIELD_OPERATOR)는 대회 전역 리소스를 읽을 권한이 없어 대회 셸에 들어갈 수 없으므로,
 * 이 목록이 그들이 자기 담당 경기 콘솔로 갈 수 있는 유일한 출발점이다.
 */

export type V1MyStaffAssignmentFixture = {
  fixtureId: string;
  round: string;
  fixtureNumber: number;
  legNumber: number;
  scheduledAt: string | null;
  status: string;
  fieldId: string | null;
  fieldName: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
};

export type V1MyStaffAssignment = {
  assignmentId: string;
  tournamentId: string;
  tournamentTitle: string;
  tournamentStatus: string;
  tournamentScheduledAt: string | null;
  role: V1TournamentStaffRole;
  /**
   * 배정의 낙관적 잠금 버전. 경기 콘솔의 실시간 소켓 핸드셰이크가 이 값을 제시해야
   * `game.subscribe`/`game.takeover.request`의 staleness 게이트를 통과한다 —
   * 필드 담당자는 대회 전역 스태프 목록을 읽을 수 없어 이 응답이 유일한 출처다
   * (`use-v1-game-operations-console.ts`의 `useMyTournamentStaffAssignmentVersion`).
   */
  version: number;
  expiresAt: string | null;
  fieldId: string | null;
  fieldName: string | null;
  /** FIELD_OPERATOR 전용 — 다른 역할은 대회 셸로 들어가므로 항상 빈 배열이다. */
  fixtures: V1MyStaffAssignmentFixture[];
  fixturesTruncated: boolean;
};

export type V1MyStaffAssignmentListResponse = {
  items: V1MyStaffAssignment[];
};

export function useV1MyStaffAssignments(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: v1Keys.myTournamentOpsAssignments(),
    queryFn: () => v1Get<V1MyStaffAssignmentListResponse>('/tournament-ops/me/assignments'),
    enabled: options?.enabled ?? true,
    // 권한 화면의 출발점이라 실패를 오래 되풀이하지 않는다 — 화면이 "배정 없음"으로 조용히
    // 넘어가지 않도록 에러는 그대로 노출한다.
    retry: false,
  });
}

/** 역할별 진입 목적지. FIELD_OPERATOR 만 셸을 건너뛰고 담당 경기 콘솔로 직행한다. */
export function myStaffAssignmentEntryHref(
  assignment: V1MyStaffAssignment,
  fixtureId?: string,
): string | null {
  const tournamentId = encodeURIComponent(assignment.tournamentId);
  if (assignment.role === 'FIELD_OPERATOR') {
    const target = fixtureId ?? assignment.fixtures[0]?.fixtureId;
    if (target === undefined) return null;
    return `/tournament-ops/tournaments/${tournamentId}/fixtures/${encodeURIComponent(target)}/operate`;
  }
  return `/tournament-ops/tournaments/${tournamentId}/operations`;
}

/**
 * 이 배정이 해당 경기 콘솔을 담당하는가 — 딥링크 진입 허용 판정에 쓴다(서버가 최종 판정).
 *
 * `fixtures`는 안내용으로 상한(배정당 50건)이 걸린 목록이라, 그 자체를 거부 근거로 쓰면
 * 필드 스코프 배정에서 51번째 이후 경기가 서버는 허용하는데 화면만 막는 상태가 된다.
 * 그래서 목록이 잘렸으면(`fixturesTruncated`) 여기서 막지 않고 통과시켜 실제 리소스 판정에
 * 맡긴다 — 권한이 없으면 콘솔이 데이터를 읽는 순간 서버가 403으로 돌려주므로 과다 노출이 아니다.
 * (반대로 목록이 온전한데 그 경기가 없으면 확실히 담당 밖이므로 그대로 거부한다.)
 */
export function assignmentCoversFixture(
  assignment: V1MyStaffAssignment,
  tournamentId: string,
  fixtureId: string,
): boolean {
  if (assignment.tournamentId !== tournamentId) return false;
  if (assignment.fixtures.some((fixture) => fixture.fixtureId === fixtureId)) return true;
  return assignment.fixturesTruncated;
}
