import { V1ApiError } from './api-client';

const fieldLabels: Record<string, string> = {
  realName: '이름',
  phone: '휴대폰 번호',
  gender: '성별',
};

export function getCreatorProfilePrompt(error: unknown, resourceLabel: string) {
  if (!(error instanceof V1ApiError) || error.code !== 'PROFILE_COMPLETION_REQUIRED') return null;

  const details = error.details as { missingFields?: unknown } | null;
  const missingFields = Array.isArray(details?.missingFields)
    ? details.missingFields.filter((field): field is string => typeof field === 'string')
    : [];
  const labels = missingFields.map((field) => fieldLabels[field] ?? field);
  const missingLabel = labels.length > 0 ? labels.join(', ') : '프로필 정보';

  return `${resourceLabel}을(를) 만들려면 ${missingLabel} 입력이 필요합니다. 프로필을 수정할까요?`;
}

export function profileEditHref(returnTo: string) {
  const safeReturnTo = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/my';
  return `/my/profile/edit?returnTo=${encodeURIComponent(safeReturnTo)}`;
}