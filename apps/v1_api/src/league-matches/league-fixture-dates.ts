/**
 * 정규 리그 대진의 **날짜 목록**을 라운드별 시작 시각으로 푸는 순수 규칙 (Task 164 BE-2).
 *
 * ## 왜 요일이 아니라 날짜인가
 * 예전엔 운영자가 요일 하나(`dayOfWeek`)를 고르면 서버가 "시작일 이후 매주 그 요일" 로
 * 무한 반복해 라운드를 채웠다. 그러면 **명절·구장 사정으로 한 주를 건너뛰거나 날짜를
 * 옮기는 것을 표현할 수 없다** — 사용자 요구가 "임의 날짜" 였다(2026-08-29 원지시 ①).
 *
 * 이제 **서버는 요일을 모른다.** 운영자가 고른 날짜들이 그대로 온다. 요일로 고르고 싶으면
 * 화면이 그 요일을 날짜 목록으로 전개해 보낸다 — 그래야 전개된 결과를 운영자가 눈으로
 * 확인하고 개별 날짜를 지우거나 바꿀 수 있다.
 *
 * ## 날짜는 KST 달력 날짜다
 * `'YYYY-MM-DD'` 는 **한국 달력의 그 날**이고, `time` 은 그 날의 KST 벽시계 시각이다.
 * 서버 프로세스 타임존에 의존하면 배포 환경마다 결과가 달라지므로 오프셋을 명시적으로
 * 더하고 뺀다(`round-robin-schedule.ts` 가 요일 계산에서 쓰던 것과 같은 관례).
 */

/** KST(+09:00). 이 저장소의 리그 일정은 전부 이 기준이다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface LeagueFixtureDateSchedule {
  /** `'YYYY-MM-DD'` (KST 달력 날짜). 중복·순서 무관 — 여기서 정리한다. */
  readonly dates: readonly string[];
  /** `'HH:mm'` (KST 24시간제). 모든 날짜에 같은 시각을 쓴다. */
  readonly time: string;
}

export type LeagueFixtureDateError =
  | { readonly kind: 'past'; readonly dates: readonly string[] }
  | { readonly kind: 'insufficient'; readonly required: number; readonly provided: number };

/**
 * 날짜 목록을 **라운드 수만큼** 오름차순 시작 시각으로 푼다.
 *
 * - **중복 날짜는 제거한다** — 운영자가 같은 날을 두 번 고르는 것은 "그 날에 두 라운드"가
 *   아니라 입력 실수다. 하루에 여러 경기를 넣는 것은 `timing`(한 구장 순차 진행)이 담당한다.
 * - **과거 날짜는 거부한다** — 이미 지난 날에 경기를 만들면 결과 입력 리마인더가 곧바로
 *   발화하고, 팀 캘린더에 지난 일정이 새로 생긴다.
 * - **날짜가 라운드보다 적으면 거부한다** — 남는 라운드를 조용히 버리면 대진표가 반쪽이
 *   되고, 운영자는 "왜 경기가 덜 생겼지" 를 화면에서 알 수 없다. 몇 개가 필요한지 함께 준다.
 * - 날짜가 라운드보다 **많으면 앞에서부터 필요한 만큼만** 쓴다 — 여유분을 미리 고르는 것은
 *   정상적인 사용이다.
 */
export function resolveLeagueFixtureDates(
  schedule: LeagueFixtureDateSchedule,
  totalRounds: number,
  now: Date,
): { ok: true; startAts: Date[] } | { ok: false; error: LeagueFixtureDateError } {
  // 정렬 전에 접는다 — 문자열 정렬이 곧 날짜 정렬이다('YYYY-MM-DD').
  const unique = [...new Set(schedule.dates)].sort();
  const [hours, minutes] = schedule.time.split(':').map(Number);

  const startAts = unique.map((date) => {
    const [year, month, day] = date.split('-').map(Number);
    // KST 벽시계로 조립한 뒤 오프셋을 빼서 UTC 인스턴트로 되돌린다.
    return new Date(Date.UTC(year, month - 1, day, hours, minutes) - KST_OFFSET_MS);
  });

  const past = startAts
    .map((startAt, index) => ({ startAt, date: unique[index] }))
    .filter((entry) => entry.startAt.getTime() < now.getTime())
    .map((entry) => entry.date);
  if (past.length > 0) {
    return { ok: false, error: { kind: 'past', dates: past } };
  }

  if (startAts.length < totalRounds) {
    // 중복 제거 **뒤**의 수를 보고한다 — 운영자가 고른 개수가 아니라 실제로 쓸 수 있는
    // 날짜 수여야 "몇 개를 더 골라야 하는지" 가 맞는다.
    return { ok: false, error: { kind: 'insufficient', required: totalRounds, provided: startAts.length } };
  }

  return { ok: true, startAts: startAts.slice(0, totalRounds) };
}
