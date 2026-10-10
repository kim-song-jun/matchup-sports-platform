import { KNOWN_ERROR_MESSAGES } from '@/components/tournament-result-review/result-review-copy';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';

/** 그림 편집기가 새로 만나는 코드. 결과 화면과 겹치는 코드(NEXT_FIXTURE_CONFLICT)는 여기 문구가 이긴다. */
const BRACKET_CANVAS_MESSAGES: Readonly<Record<string, string>> = {
  NEXT_FIXTURE_CONFLICT: '다음 경기가 이미 시작돼서 바꿀 수 없어요.',
  QUICK_RESULT_ROSTER_SYNCING: '명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요.',
  QUICK_RESULT_NOT_AVAILABLE: '이 경기는 점수를 바로 넣을 수 없어요. 진행 중이거나 이미 결과가 있는지 확인해 주세요.',
  QUICK_RESULT_HAS_LIVE_RECORDS: '라이브로 기록한 경기예요. 결과 정정 화면에서 고쳐 주세요.',
  QUICK_RESULT_TEAMS_REQUIRED: '양쪽 팀이 정해진 뒤에 점수를 넣을 수 있어요.',
  QUICK_RESULT_FIXTURE_CANCELLED: '취소된 경기에는 점수를 넣을 수 없어요.',
  QUICK_RESULT_UNSUPPORTED: '이 경기에는 점수를 바로 넣을 수 없어요.',
  SLOT_LOCKED: '이미 시작했거나 결과가 있는 경기라 팀을 바꿀 수 없어요.',
  SLOT_TEAM_ALREADY_PLACED: '이미 다른 자리에 들어간 팀이에요.',
  SLOT_REGISTRATION_INVALID: '이 대회에서 확정된 팀만 자리에 넣을 수 있어요.',
  SLOT_LINKED: '자리에 연결된 팀은 자리에서 바꿔 주세요.',
  SLOT_NOT_FOUND: '자리를 찾지 못했어요. 화면을 새로고침해 주세요.',
  BRACKET_NOT_EMPTY: '이미 대진이 있어요. 템플릿으로 바꾸려면 기존 대진 교체를 선택해 주세요.',
  BRACKET_LOCKED: '시작했거나 결과가 있는 경기가 있어 대진을 교체할 수 없어요.',
  BRACKET_TEMPLATE_UNSUPPORTED: '선택한 구성은 만들 수 없어요. 팀 수와 방식을 확인해 주세요.',
  BRACKET_TEMPLATE_FORMAT_MISMATCH: '이 대회 방식과 맞지 않는 템플릿이에요.',
  BRACKET_TEMPLATE_TOO_LARGE: '경기가 너무 많아 한 번에 만들 수 없어요. 팀 수나 회전 수를 줄여 주세요.',
  GROUP_HAS_SLOTS: '자리가 남아 있는 조는 지울 수 없어요. 자리를 먼저 비워 주세요.',
  IDEMPOTENCY_PAYLOAD_CONFLICT: '같은 요청이 다른 내용으로 이미 처리됐어요. 새로고침한 뒤 다시 시도해 주세요.',
  SLOT_BYE_POSITION_INVALID: '부전승 자리 위치가 올바르지 않아요.',
  SLOT_CHANGE_DUPLICATED: '같은 자리를 한 번에 두 번 바꿀 수 없어요.',
  SLOT_CHANGE_CROSS_TOURNAMENT: '다른 대회의 자리는 함께 바꿀 수 없어요.',
  FIXTURE_RESULT_MUST_BE_VOIDED: '공식 결과가 확정된 경기예요. 결과를 먼저 무효로 돌려 주세요.',
  FIXTURE_CANCELLED: '취소된 경기는 팀을 바꿀 수 없어요.',
  TEAM_CHANGE_REASON_REQUIRED: '시작된 경기의 팀을 바꾸려면 사유를 입력해 주세요.',
  LEAGUE_ON_HOLD: '보류 중인 리그라 대진을 바꿀 수 없어요.',
  LEAGUE_ENDED: '끝났거나 취소된 리그라 대진을 바꿀 수 없어요.',
};

export function describeBracketCanvasError(err: unknown, fallback: string): string {
  const code = extractErrorCode(err);
  if (code !== null) {
    const message = BRACKET_CANVAS_MESSAGES[code] ?? KNOWN_ERROR_MESSAGES[code];
    if (message !== undefined) return message;
  }
  return extractErrorMessage(err, fallback);
}
