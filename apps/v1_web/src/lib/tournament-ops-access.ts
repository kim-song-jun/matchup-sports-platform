import { V1ApiError } from '@/lib/api-client';

/**
 * `TournamentStaffAccessService.assertAccess`가 던지는 403의 `details.reason`
 * 값 중 "이 액션 자체가 아직 프론트에 구현 안 된 화면(필드/기구 담당자 전용)"을
 * 뜻하는 것들. 나머지는 전부 "스태프로 배정돼야 함"으로 취급한다.
 * `apps/v1_api/src/tournaments/staff/tournament-staff-policy.ts`의
 * `TournamentStaffDecisionReason` 값과 대응하되, 프론트는 그 타입 자체를 import
 * 하지 않는다(백엔드 전용 모듈) — 문자열 값만 재사용한다.
 */
const SCOPE_NOT_YET_SUPPORTED_REASONS = new Set([
  'FIXTURE_SCOPE_REQUIRED',
  'FIELD_SCOPE_REQUIRED',
  'FIXTURE_SCOPE_DENIED',
  'FIELD_SCOPE_DENIED',
]);

/** `_gate.tsx`(셸 진입 게이트)와 `tournament-ops-quick-links.tsx`(D-16 admin 바로가기)가 공유한다. */
export function tournamentStaffDenialReasonCode(error: unknown): string | undefined {
  if (!(error instanceof V1ApiError)) return undefined;
  const details = error.details as { reason?: unknown } | undefined;
  return typeof details?.reason === 'string' ? details.reason : undefined;
}

export function isTournamentStaffScopeNotYetSupported(reasonCode: string | undefined): boolean {
  return reasonCode !== undefined && SCOPE_NOT_YET_SUPPORTED_REASONS.has(reasonCode);
}

/** D-16 공용 사유 문구 — "숨기지 않는다"의 실제 카피 소스. */
export function tournamentOpsAccessDeniedLabel(reasonCode: string | undefined): string {
  return isTournamentStaffScopeNotYetSupported(reasonCode)
    ? '아직 지원하지 않는 화면이에요.'
    : '스태프 배정이 필요해요.';
}

/**
 * `staff` 조회 실패를 "권한 거부(403)"와 "그 외(네트워크/5xx)"로 분류한다. `_gate.tsx`(셸
 * 진입 게이트)와 `tournament-ops-quick-links.tsx`(D-16 admin 바로가기) 둘 다 같은
 * `useV1TournamentStaffAssignments` 에러를 다루는데, 403이 아닌 실패(예: 5xx)를 403과
 * 동일하게 "스태프 배정이 필요해요"로 표시하면 운영자가 실제 원인과 다른 조치를 하게 된다 —
 * 그래서 분류 로직 자체(무엇이 권한 거부인지)를 한 곳에 두고 두 화면이 공유한다. 다만 렌더링
 * 방식(풀스크린 게이트 vs 인라인 배지)은 소비처마다 다르므로 이 함수는 라벨 문자열이 아니라
 * 분류 결과만 반환한다.
 */
export interface TournamentStaffAccessDenial {
  isAuthDenied: boolean;
  reasonCode: string | undefined;
}

export function classifyTournamentStaffAccessError(error: unknown): TournamentStaffAccessDenial {
  const isAuthDenied = error instanceof V1ApiError && error.statusCode === 403;
  return { isAuthDenied, reasonCode: isAuthDenied ? tournamentStaffDenialReasonCode(error) : undefined };
}

/** 권한과 무관한 실패(5xx/네트워크 등)의 공용 재시도 유도 문구. */
export const TOURNAMENT_OPS_TRANSIENT_ERROR_LABEL = '일시적인 오류예요. 다시 시도해 주세요.';
