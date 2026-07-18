const CHAT_TIME_ZONE = 'Asia/Seoul';

const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: CHAT_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: CHAT_TIME_ZONE,
  month: 'long',
  day: 'numeric',
});

const dateKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CHAT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function toDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatChatTime(sentAt: string) {
  const date = toDate(sentAt);
  return date ? timeFormatter.format(date) : '';
}

export function formatChatDate(sentAt: string) {
  const date = toDate(sentAt);
  return date ? dateFormatter.format(date) : '';
}

export function getChatDateKey(sentAt: string) {
  const date = toDate(sentAt);
  return date ? dateKeyFormatter.format(date) : '';
}

export function shouldShowChatDate(sentAt: string, previousSentAt?: string) {
  const dateKey = getChatDateKey(sentAt);
  return dateKey !== '' && dateKey !== (previousSentAt ? getChatDateKey(previousSentAt) : '');
}

export function formatChatListTimestamp(sentAt: string, now = new Date()) {
  const sentDateKey = getChatDateKey(sentAt);
  if (!sentDateKey) return '';

  return sentDateKey === getChatDateKey(now.toISOString())
    ? formatChatTime(sentAt)
    : formatChatDate(sentAt);
}
