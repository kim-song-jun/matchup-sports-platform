import { extractErrorCode, extractErrorDetails, extractErrorMessage } from '@/lib/error-message';

/** 팀 수정·멤버 관리 쓰기가 돌려주는 에러 코드 → 사용자 문구. 서버 message 는 영어라 화면에 그대로 내지 않는다. */
const TEAM_ERROR_MESSAGES: Record<string, string> = {
  PERMISSION_DENIED: '팀장·매니저만 할 수 있어요. 필요하면 팀장에게 알려 주세요.',
  MANAGER_LIMIT_EXCEEDED: '운영진은 최대 5명이에요. 다른 운영진을 멤버로 바꾼 뒤 지정해 주세요.',
  CONCURRENT_UPDATE: '처리하는 사이 팀 상태가 바뀌었어요. 새로 불러온 뒤 다시 시도해 주세요.',
  VERSION_CONFLICT: '다른 사람이 먼저 팀 정보를 바꿨어요. 새로 불러온 뒤 다시 저장해 주세요.',
};

/** 코드를 알면 이 도메인 문구, 모르면 서버 메시지, 그것도 없으면 fallback. */
export function teamErrorMessage(err: unknown, fallback: string, context: { memberCount?: number } = {}): string {
  const code = extractErrorCode(err);
  if (code === 'VALIDATION_FAILED' && validationField(err) === 'memberGoalCount') {
    const count = context.memberCount;
    return count === undefined
      ? '정원은 지금 팀원 수보다 적게 정할 수 없어요.'
      : `정원은 지금 팀원 수(${count}명)보다 적게 정할 수 없어요.`;
  }
  if (code !== null && TEAM_ERROR_MESSAGES[code] !== undefined) return TEAM_ERROR_MESSAGES[code];
  return extractErrorMessage(err, fallback);
}

function validationField(err: unknown): string | null {
  const details = extractErrorDetails(err);
  if (typeof details !== 'object' || details === null) return null;
  const field = (details as { field?: unknown }).field;
  return typeof field === 'string' ? field : null;
}
