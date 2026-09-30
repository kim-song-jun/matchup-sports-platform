/** 한국 표준시는 UTC+9 고정이다(서머타임 없음). 서버 타임존과 무관하게 같은 답이 나오도록 오프셋을 더한 뒤 UTC 게터로 읽는다. */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function twoDigits(value: number): string {
  return String(value).padStart(2, '0');
}

/** 알림 본문용 시각 — "01:10". */
export function formatKstTime(at: Date): string {
  const shifted = new Date(at.getTime() + KST_OFFSET_MS);
  return `${twoDigits(shifted.getUTCHours())}:${twoDigits(shifted.getUTCMinutes())}`;
}

/** 알림 본문용 날짜·시각 — "9/30 (수) 01:10". 자정을 넘긴 경기가 "내일"로 읽히지 않도록 상대 표현을 쓰지 않는다. */
export function formatKstMonthDayTime(at: Date): string {
  const shifted = new Date(at.getTime() + KST_OFFSET_MS);
  const weekday = WEEKDAY_LABELS[shifted.getUTCDay()];
  return `${shifted.getUTCMonth() + 1}/${shifted.getUTCDate()} (${weekday}) ${formatKstTime(at)}`;
}
