import type { ConfirmOptions, ConfirmReasonConfig } from '@/components/v1-ui/confirm-modal';

/**
 * 호스트가 팀매치를 취소할 때의 확인창 — 상세와 수정 화면이 같은 문구를 쓴다.
 * 취소해도 제출된 참석명단 행은 지워지지 않는다. 경기가 취소되면 서버가 명단을 잠가 수정만 막는다.
 */
export const TEAM_MATCH_CANCEL_CONFIRM = {
  title: '팀매치를 취소할까요?',
  message:
    '취소하면 되돌릴 수 없어요. 신청자 전원의 참가가 취소되고 취소 알림이 발송돼요. 제출한 참석명단은 잠겨서 더는 수정할 수 없어요.',
  confirmLabel: '팀매치 취소',
  // 기본값 '취소'는 확정 버튼("팀매치 취소")과 헷갈린다.
  cancelLabel: '닫기',
} as const satisfies ConfirmOptions;

/** 신청한 팀이 승인 전에 신청을 거둘 때의 확인창. */
export const TEAM_MATCH_WITHDRAW_CONFIRM = {
  title: '신청을 취소할까요?',
  message: '호스트 팀에 취소 알림이 가요. 다시 신청할 수 있어요.',
  confirmLabel: '신청 취소',
  cancelLabel: '아니요',
  tone: 'danger',
} as const satisfies ConfirmOptions;

/** 서버 CancelTeamMatchDto.reason 의 @MaxLength(500) 과 같다. */
const CANCEL_REASON_MAX_LENGTH = 500;

/** 확정된 상대팀이 있으면 사유가 그 팀 알림에 담기므로 꼭 받는다. */
export function teamMatchCancelReasonField(opponentConfirmed: boolean): ConfirmReasonConfig {
  return {
    label: opponentConfirmed ? '취소 사유' : '취소 사유 (선택)',
    required: opponentConfirmed,
    maxLength: CANCEL_REASON_MAX_LENGTH,
    hint: opponentConfirmed ? '상대팀에 가는 취소 알림에 그대로 담겨요.' : '팀 일정과 변경 기록에 남아요.',
  };
}
