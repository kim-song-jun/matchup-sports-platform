/** Shared form rules for ordinary and platform team-match recruitment. */
export function teamMatchDateErrors(input: {
  startsAt: string;
  endsAt?: string | null;
  deadlineAt?: string | null;
  existingDeadlineAt?: string | null;
}): Partial<Record<'startsAt' | 'endsAt' | 'deadlineAt', string>> {
  const errors: Partial<Record<'startsAt' | 'endsAt' | 'deadlineAt', string>> = {};
  const start = new Date(input.startsAt).getTime();
  const end = input.endsAt ? new Date(input.endsAt).getTime() : null;
  const deadline = input.deadlineAt ? new Date(input.deadlineAt).getTime() : null;
  const now = Date.now();
  if (input.startsAt && (!Number.isFinite(start) || start <= now)) errors.startsAt = '시작 시간은 지금 이후로 설정해 주세요';
  if (end !== null && (!Number.isFinite(end) || end <= start)) errors.endsAt = '종료 시간은 시작 시간보다 늦어야 해요';
  if (deadline !== null) {
    if (!Number.isFinite(deadline)) errors.deadlineAt = '신청 마감일과 시간을 확인해 주세요';
    else if (deadline >= start) errors.deadlineAt = '신청 마감은 시작 시간보다 빨라야 해요';
    else if (deadline <= now && deadline !== (input.existingDeadlineAt ? new Date(input.existingDeadlineAt).getTime() : null)) {
      errors.deadlineAt = '신청 마감은 지금 이후로 설정해 주세요';
    }
  }
  return errors;
}

export function localDateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
