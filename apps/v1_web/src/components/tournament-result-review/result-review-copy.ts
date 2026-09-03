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
  // contract 이후 base 는 `SUBMITTED` 뿐이다 — 반려·보완 요청 상태가 사라졌으므로
  // 그 어휘로 안내하면 있지도 않은 상태를 찾게 만든다.
  RESULT_RESUBMISSION_NOT_ALLOWED: '확인 대기 중인 결과만 다시 보낼 수 있어요.',
  RESULT_REVISION_NOT_FOUND: '결과 정보를 찾을 수 없어요. 화면을 새로고침해 주세요.',
  COMMAND_CONCURRENCY_CONFLICT: '다른 처리와 동시에 진행돼 반영하지 못했어요. 화면을 새로고침해 주세요.',
  VERSION_CONFLICT: '경기 정보가 그 사이 바뀌었어요. 화면을 새로고침해 주세요.',
  PARTICIPANT_INVALID: '선수 정보가 올바르지 않아요. 각 선수는 한 번씩만, 소속 진영에 맞게 입력해 주세요.',
  MVP_INVALID: 'MVP는 입력한 선수 중 한 명이어야 해요.',
  SCORER_REQUIRED: '득점자를 입력해야 확정할 수 있어요.',
  COMMAND_IDEMPOTENCY_KEY_MISMATCH: '요청을 다시 시도하지 못했어요. 화면을 새로고침한 뒤 다시 시도해 주세요.',
  IDEMPOTENCY_PAYLOAD_CONFLICT: '요청 내용이 바뀌어 다시 시도하지 못했어요. 화면을 새로고침해 주세요.',
  // 승부차기 가드 3종. 서버 문구는 바이트 동일 제약이 있어 서버에서 못 바꾸는데
  // 그중 4개가 영문 원문이라(`games.service.ts`), 매핑이 없으면 그대로 화면에 노출된다.
  //
  // NOT_ALLOWED·INVALID 는 서버에 **문구가 2종씩** 있지만 프론트는 두 변종을 구분할 수
  // 없다 -- `extractErrorCode` 는 code 만 읽고, 두 변종의 code 와 HTTP status 가 완전히
  // 같다(NOT_ALLOWED 는 둘 다 409, INVALID 는 둘 다 422). 서버 원문 substring 매칭으로
  // 갈라 쓰는 방법은 "바꿀 수 없는 영문 원문"에 프론트를 결합시키는 새 기술부채이므로 쓰지
  // 않고, **코드별 문구 하나가 두 원인을 모두 포괄**하도록 적는다.
  //   NOT_ALLOWED: '결선 픽스처가 아님' + '정규시간이 무승부가 아님'
  //   INVALID:     '0 이상 정수가 아님' + '승자가 갈리지 않음'
  TOURNAMENT_PENALTY_REQUIRED: '결선 경기는 무승부로 끝낼 수 없어요. 승부차기 결과를 입력해 주세요.',
  TOURNAMENT_PENALTY_NOT_ALLOWED:
    '승부차기는 결선 경기의 정규시간 무승부에서만 기록할 수 있어요. 경기 종류와 정규시간 점수를 다시 확인해 주세요.',
  TOURNAMENT_PENALTY_INVALID:
    '승부차기 점수가 올바르지 않아요. 양 팀 점수를 0 이상의 정수로, 승자가 갈리도록 입력해 주세요.',
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
  OFFICIAL: '공식 확정',
  VOID: '무효 처리됨',
};

export const REVISION_STATE_BADGE_TONE: Record<GameResultRevisionState, 'blue' | 'orange' | 'red' | 'green' | 'grey'> = {
  DRAFT: 'grey',
  SUBMITTED: 'blue',
  CHANGE_REQUESTED: 'orange',
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
