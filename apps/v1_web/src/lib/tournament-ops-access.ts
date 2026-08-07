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
