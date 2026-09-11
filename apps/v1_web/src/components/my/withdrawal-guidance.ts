import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';

export type WithdrawalErrorGuidance = {
  title: string;
  message: string;
};

export function getWithdrawalErrorGuidance(error: unknown): WithdrawalErrorGuidance {
  const message = extractErrorMessage(error, '탈퇴 요청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요.');

  switch (extractErrorCode(error)) {
    case 'WITHDRAWAL_BLOCKED_ACTIVE_MATCH':
      return { title: '진행 중인 매치를 먼저 정리해 주세요', message };
    case 'WITHDRAWAL_BLOCKED_TEAM_AUTHORITY':
      return { title: '팀 관리 권한을 먼저 넘겨 주세요', message };
    case 'ADMIN_WITHDRAWAL_FORBIDDEN':
      return { title: '운영자 권한을 먼저 해제해 주세요', message };
    default:
      return { title: '탈퇴 요청을 접수하지 못했어요', message };
  }
}
