import type { V1AdminMe, V1TournamentStaffRole } from '@/types/api';

/**
 * 대회 관리 화면에서 "지금 이 사람이 무엇을 할 수 있는가"를 나타내는 단일 어휘.
 *
 * 어휘를 `V1TournamentStaffRole` 하나로 맞춘 이유: 서버(`TournamentStaffAccessService`)가
 * 이미 플랫폼 관리자와 대회 스태프를 **같은 역할 집합으로** 판정한다. 프론트가 관리자에는
 * `canWrite` boolean, 스태프에는 별도 enum 을 쓰면 같은 개념이 두 벌로 갈린다.
 *
 * 매핑 근거(서버 실제 규칙):
 * - `assertAccess` 는 활성 관리자 중 **owner/ops 만** `platform_ops` 주체로 인정한다.
 * - 관리자 `support` 는 그 분기를 타지 않는다 — 플랫폼 단위 조회 전용이라 여기서는
 *   같은 성격의 읽기 전용 역할인 `SUPPORT_READONLY` 로 본다.
 */
export type TournamentAdminRole = V1TournamentStaffRole;

export type TournamentAdminPrincipal =
  | { kind: 'platform'; adminRole: V1AdminMe['adminRole'] }
  | { kind: 'staff'; role: V1TournamentStaffRole };

export function deriveTournamentAdminRole(principal: TournamentAdminPrincipal): TournamentAdminRole {
  if (principal.kind === 'staff') return principal.role;
  return principal.adminRole === 'support' ? 'SUPPORT_READONLY' : 'PLATFORM_OPS';
}

/**
 * 대회 관리(설정·콘텐츠) 화면의 쓰기 허용 여부.
 *
 * 지금은 `PLATFORM_OPS` 만 true 다 — 기존 `capabilities.includes('status:write')` 와
 * **정확히 같은 결과**를 내도록 의도한 것이고(owner/ops→true, support→false), 그 동치성은
 * 테스트로 고정한다. 스태프 역할이 어느 화면까지 쓸 수 있는지는 그 화면을 어드민으로
 * 들여올 때 화면별로 정한다 — 여기서 미리 넓히지 않는다(서버가 막더라도 화면이
 * 쓸 수 있는 것처럼 보이면 그 자체로 결함이다).
 */
export function canWriteTournamentAdmin(role: TournamentAdminRole): boolean {
  return role === 'PLATFORM_OPS';
}

export const TOURNAMENT_ADMIN_ROLE_LABEL: Record<TournamentAdminRole, string> = {
  PLATFORM_OPS: '플랫폼 운영',
  TOURNAMENT_DIRECTOR: '대회 총괄',
  FIELD_OPERATOR: '필드 담당',
  SUPPORT_READONLY: '조회 전용',
};
