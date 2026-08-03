import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import type { GameActorRole, GameResultRevisionState } from '@/hooks/use-tournament-result-review';

/**
 * Domain error codes named in the frozen REST contract
 * (`docs/api/global-contract.md`, `docs/api/domains/tournament-operations.md`)
 * that this screen's actions can receive, mapped to 해요체 안내.
 * Unknown codes fall back to the server's own message via
 * `extractErrorMessage` -- never a raw stack/technical string.
 */
const KNOWN_ERROR_MESSAGES: Record<string, string> = {
  DIRECTOR_OFFICIALIZE_DISABLED: '이 기능은 아직 활성화되지 않았어요. 플랫폼 운영팀에 문의해 주세요.',
  STAFF_SCOPE_DENIED: '이 대회의 담당자 권한이 없어졌거나 만료됐어요. 새로고침 후 다시 시도해 주세요.',
  PROJECTION_PREVIEW_MISMATCH: '결과 내용이 방금 바뀌었어요. 최신 내용을 다시 확인한 뒤 시도해 주세요.',
  REVISION_MUST_BE_SUPERSEDED: '이 결과는 이미 다른 처리로 대체됐어요. 화면을 새로고침해 주세요.',
  NEXT_FIXTURE_CONFLICT: '다음 라운드 경기가 이미 진행돼서 무효화할 수 없어요.',
  RESULT_RESUBMISSION_NOT_ALLOWED: '반려되거나 보완 요청된 결과만 다시 제출할 수 있어요.',
  RESULT_REVISION_NOT_FOUND: '결과 정보를 찾을 수 없어요. 화면을 새로고침해 주세요.',
  COMMAND_CONCURRENCY_CONFLICT: '다른 처리와 동시에 진행돼 반영하지 못했어요. 화면을 새로고침해 주세요.',
  VERSION_CONFLICT: '경기 정보가 그 사이 바뀌었어요. 화면을 새로고침해 주세요.',
  PARTICIPANT_INVALID: '선수 정보가 올바르지 않아요. 각 선수는 한 번씩만, 소속 진영에 맞게 입력해 주세요.',
  MVP_INVALID: 'MVP는 입력한 선수 중 한 명이어야 해요.',
  SCORER_REQUIRED: '득점자를 입력해야 확정할 수 있어요.',
  COMMAND_IDEMPOTENCY_KEY_MISMATCH: '요청을 다시 시도하지 못했어요. 화면을 새로고침한 뒤 다시 시도해 주세요.',
  IDEMPOTENCY_PAYLOAD_CONFLICT: '요청 내용이 바뀌어 다시 시도하지 못했어요. 화면을 새로고침해 주세요.',
};

/** Extracts a domain error code and maps it to a 해요체 안내 문구, falling
 * back to `extractErrorMessage`'s own fallback chain for anything unmapped. */
export function describeResultReviewError(err: unknown): string {
  const code = extractErrorCode(err);
  if (code && KNOWN_ERROR_MESSAGES[code]) return KNOWN_ERROR_MESSAGES[code];
  return extractErrorMessage(err, '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
}

/** `true` when the caught error is specifically the flag-gate denial --
 * callers use this to flip a tournament_director's officialize/void CTA back
 * to a hidden/disabled state (see the "director visibility follows flag"
 * acceptance criterion; there is no accessible read of `DIRECTOR_OFFICIALIZE`
 * for a non-platform_ops actor, so visibility is necessarily driven
 * reactively by the real 403 rather than a proactive flag read -- see
 * `use-tournament-result-review.ts`'s module doc comment). */
export function isDirectorOfficializeDisabledError(err: unknown): boolean {
  return extractErrorCode(err) === 'DIRECTOR_OFFICIALIZE_DISABLED';
}

export const REVISION_STATE_LABELS: Record<GameResultRevisionState, string> = {
  DRAFT: '작성 중(정정 초안)',
  SUBMITTED: '제출됨 · 검토 대기',
  CHANGE_REQUESTED: '수정 요청됨',
  SUPPLEMENT_REQUESTED: '보완 요청됨',
  REJECTED: '반려됨',
  OFFICIAL: '공식 확정',
  VOID: '무효 처리됨',
};

export const REVISION_STATE_BADGE_TONE: Record<GameResultRevisionState, 'blue' | 'orange' | 'red' | 'green' | 'grey'> = {
  DRAFT: 'grey',
  SUBMITTED: 'blue',
  CHANGE_REQUESTED: 'orange',
  SUPPLEMENT_REQUESTED: 'orange',
  REJECTED: 'red',
  OFFICIAL: 'green',
  VOID: 'red',
};

export const ACTOR_ROLE_LABELS: Record<GameActorRole, string> = {
  platform_ops: '플랫폼 운영자',
  tournament_director: '대회 감독관',
  field_operator: '현장 진행요원',
  support_readonly: '고객지원(읽기 전용)',
};

/** tournament_director/platform_ops only -- field_operator/support_readonly
 * are denied `result_review`/`result_officialize` entirely server-side
 * (`tournament-staff-policy.ts`'s `allowsRoleAction`), so this screen must
 * never render a mutation CTA for those two roles. */
export function canActOnResultReview(role: GameActorRole): boolean {
  return role === 'platform_ops' || role === 'tournament_director';
}

/** platform_ops may always officialize/void; tournament_director may only
 * while `DIRECTOR_OFFICIALIZE=on` -- see the module doc comment on
 * `use-tournament-result-review.ts` for why this cannot be determined ahead
 * of an actual attempt for a director actor. */
export function officializeAlwaysAllowed(role: GameActorRole): boolean {
  return role === 'platform_ops';
}
