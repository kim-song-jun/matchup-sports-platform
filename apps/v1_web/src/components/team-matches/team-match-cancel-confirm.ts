import type { ConfirmOptions } from '@/components/v1-ui/confirm-modal';

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
