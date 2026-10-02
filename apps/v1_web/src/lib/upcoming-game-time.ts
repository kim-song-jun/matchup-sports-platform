import { formatKstTime, formatTournamentDateTimeShort } from './date-utils';
import { toKstDateString } from './kst-calendar';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * 다가오는 경기의 시각 표기.
 *
 * `when` 은 같은 KST 날이면 "오늘 01:10", 아니면 "9/30 (수) 01:10" 이다. "내일" 은 쓰지 않는다 —
 * 자정을 넘긴 새벽 경기가 "내일" 로 읽혀 오늘 밤 경기로 오해되기 때문이다.
 * `countdown` 은 24시간 안일 때만 있다("45분 뒤" · "3시간 뒤"). 이미 시작 시각이 지났으면 null 이고
 * `started` 가 true 다 — 홈 "다음 경기" 는 결과가 나갈 때까지 킥오프 뒤에도 그 경기를 내려 준다.
 */
export function describeUpcomingGameTime(
  scheduledAt: string,
  now: Date,
): { when: string; countdown: string | null; started: boolean } | null {
  const start = new Date(scheduledAt);
  if (Number.isNaN(start.getTime())) return null;

  const sameKstDay = toKstDateString(start) === toKstDateString(now);
  const when = sameKstDay ? `오늘 ${formatKstTime(scheduledAt)}` : formatTournamentDateTimeShort(scheduledAt);
  if (when === null) return null;

  const diff = start.getTime() - now.getTime();
  if (diff <= 0) return { when, countdown: null, started: true };
  if (diff >= 24 * HOUR_MS) return { when, countdown: null, started: false };
  if (diff < HOUR_MS) return { when, countdown: `${Math.max(1, Math.floor(diff / MINUTE_MS))}분 뒤`, started: false };
  return { when, countdown: `${Math.floor(diff / HOUR_MS)}시간 뒤`, started: false };
}
