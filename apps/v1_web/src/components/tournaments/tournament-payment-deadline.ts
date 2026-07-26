type PaymentDeadlineState = {
  label: string;
  isOverdue: boolean;
  message: string;
};

const KST_TIME_ZONE = 'Asia/Seoul';

function getDatePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string | null {
  return parts.find((part) => part.type === type)?.value ?? null;
}

export function formatTournamentPaymentDeadline(paymentDueAt: string | null): string | null {
  if (!paymentDueAt) return null;
  const dueAt = new Date(paymentDueAt);
  if (Number.isNaN(dueAt.getTime())) return null;
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST_TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(dueAt);
  const month = getDatePart(parts, 'month');
  const day = getDatePart(parts, 'day');
  const hour = getDatePart(parts, 'hour');
  const minute = getDatePart(parts, 'minute');
  if (!month || !day || !hour || !minute) return null;
  return `${month}월 ${day}일 ${hour}:${minute}`;
}

export function getTournamentPaymentDeadlineState(
  paymentDueAt: string | null,
  now: Date = new Date(),
): PaymentDeadlineState | null {
  const label = formatTournamentPaymentDeadline(paymentDueAt);
  if (!paymentDueAt || !label) return null;
  const dueAt = new Date(paymentDueAt);
  if (Number.isNaN(dueAt.getTime())) return null;
  const isOverdue = dueAt.getTime() <= now.getTime();
  return {
    label,
    isOverdue,
    message: isOverdue
      ? '입금 기한이 지났어요. 새로 신청해 주세요.'
      : `${label}까지 입금해 주세요.`,
  };
}
