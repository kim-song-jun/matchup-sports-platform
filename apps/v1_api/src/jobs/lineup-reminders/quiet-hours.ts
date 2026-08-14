/** 한국 표준시는 UTC+9이고 서머타임이 없다 — 오프셋이 고정이라 이 상수 하나로 끝난다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

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
