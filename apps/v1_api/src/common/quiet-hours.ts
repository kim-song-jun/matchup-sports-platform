import { KST_OFFSET_MS } from './kst-datetime';

/** 알림을 보내지 않는 시간대(한국 시간). 21시부터 다음 날 9시 전까지. */
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 9;

/** 그 순간의 한국 날짜·시각. `Date`의 로컬 타임존에 의존하지 않기 위해 오프셋을 더한 뒤
 * UTC 게터로 읽는다 — 서버가 어느 타임존에서 돌든 같은 답이 나와야 한다. */
export function kstParts(at: Date): { dateKey: string; hour: number } {
  const shifted = new Date(at.getTime() + KST_OFFSET_MS);
  return {
    // YYYY-MM-DD. 알림 businessKey에 박혀 "하루 한 번"을 DB 제약으로 보장하는 값이다.
    dateKey: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
  };
}

/** `at` 의 한국 날짜 기준 `offsetDays` 일 뒤 0시(UTC 로 표현). 0 이면 오늘 0시. */
export function kstMidnight(at: Date, offsetDays: number): Date {
  const shifted = new Date(at.getTime() + KST_OFFSET_MS);
  const midnightShifted = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + offsetDays);
  return new Date(midnightShifted - KST_OFFSET_MS);
}

/**
 * 지금 알림을 보내면 안 되는 시간인가.
 *
 * 야간에는 발송을 **미루지 않고 그냥 거른다**. 밤새 밀어뒀다가 아침에 한꺼번에 터뜨리면
 * 같은 내용이 여러 건 쌓이는데, 어차피 그날치 businessKey는 하나뿐이라 아침 첫 스캔이
 * 그 하루의 알림을 정확히 한 번 보낸다.
 */
export function isQuietHour(at: Date): boolean {
  const { hour } = kstParts(at);
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** `at` 이후 처음 오는 KST 9시 — 밤이면 그 밤이 끝나는 시각, 낮이면 다음 날 아침. */
export function quietHoursEndAfter(at: Date): Date {
  const { hour } = kstParts(at);
  return new Date(kstMidnight(at, hour < QUIET_END_HOUR ? 0 : 1).getTime() + QUIET_END_HOUR * 60 * 60 * 1000);
}

/**
 * 팀·경기 사건 알림을 지금 푸시해도 되는가(Task 180 H1-night). 낮이면 항상, 밤이면 그 밤이 끝나기(다음 9시)
 * 전에 시작하는 일정·경기일 때만. 시작 시각을 모르면(null) 밤에는 보내지 않는다 — 알림함 행은 어느 쪽이든 남는다.
 */
export function nightPushAllowed(now: Date, startsAt: Date | null): boolean {
  if (!isQuietHour(now)) return true;
  return startsAt !== null && startsAt < quietHoursEndAfter(now);
}

/** 밤이 시작되기 전 마지막 스캔 창(KST 20:45~21:00). 스캔이 15분 슬롯이라 이 창에는 한 번만 든다. */
export function isEveningCutoffScan(at: Date): boolean {
  const shifted = new Date(at.getTime() + KST_OFFSET_MS);
  return shifted.getUTCHours() === QUIET_START_HOUR - 1 && shifted.getUTCMinutes() >= 45;
}
