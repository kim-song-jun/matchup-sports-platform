/**
 * KST 달력 계산의 **공통 규칙**. 리그 일정을 다루는 모듈들이 전부 이걸 쓴다.
 *
 * ## 왜 한 곳에 모으나
 * 같은 규칙을 두 벌 두면 한쪽만 고쳐져 갈린다 — 요일 전개(`league-fixture-dates.ts`)와
 * 달력 선택(`league-fixture-calendar.ts`)이 **서로 다른 날짜를 만들면**, 운영자가 달력에서
 * 본 날짜와 "요일로 채우기" 가 넣은 날짜가 어긋난다. 그 어긋남은 저장 후에야 드러난다.
 *
 * ## 왜 브라우저 타임존을 안 쓰나
 * `'YYYY-MM-DD'` 는 **한국 달력의 그 날**이고 `time` 은 그 날의 KST 벽시계 시각이다.
 * 브라우저 타임존으로 계산하면 해외에서 접속한 운영자와 국내 운영자가 **다른 날짜를
 * 보내게 된다** — 서버와 같은 관례로 오프셋을 명시적으로 더하고 뺀다.
 */

/** KST(+09:00). 이 저장소의 리그 일정은 전부 이 기준이다. */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC 인스턴트를 KST 달력 날짜 `'YYYY-MM-DD'` 로. */
export function toKstDateString(instant: Date): string {
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** `'YYYY-MM-DD'`(KST 자정)의 UTC 인스턴트 밀리초. */
export function kstMidnightMs(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`) - KST_OFFSET_MS;
}
