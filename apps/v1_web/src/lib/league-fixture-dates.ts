/**
 * 운영자가 고른 **요일 하나**를 서버가 받는 **날짜 목록**으로 전개하는 순수 규칙.
 *
 * ## 왜 화면이 전개하는가
 * 서버는 요일을 모른다(Task 164 BE-2). `POST /admin/league-matches/:id/fixtures` 의
 * `schedule` 은 `{ dates: 'YYYY-MM-DD'[], time: 'HH:mm' }` 이고, 요일로 고르고 싶으면
 * **화면이 그 요일을 날짜 목록으로 전개해서** 보낸다 — 그래야 명절·구장 사정으로 한 주를
 * 건너뛰거나 날짜를 옮기는 것을 나중에 표현할 수 있다(서버 `league-fixture-dates.ts` 주석).
 *
 * BE-2 가 서버 DTO 만 바꾸고 화면을 안 옮겨서, 요일을 고르면 `{ dayOfWeek, time }` 이 그대로
 * 나가 **400 VALIDATION_ERROR 로 대진 생성이 전면 불능**이었다(2026-09-04 alpha 실측).
 * 이 모듈이 그 계약을 복구한다.
 *
 * ## 몇 개를 만드는가
 * 서버가 요구하는 날짜 수는 **매치데이 수**이고, 그 값은 `weeksCount` 와 같다 —
 * `totalRounds = weeksCount × gamesPerTeamPerDay` 를 다시 `gamesPerTeamPerDay` 로 나누기
 * 때문이다(`league-match-admin.service.ts`). 그래서 여기서도 `weeksCount` 개를 만든다.
 * 모자라면 서버가 422 `LEAGUE_SCHEDULE_SLOTS_INSUFFICIENT` 로 거부한다.
 *
 * ## 날짜는 KST 달력 날짜다
 * `'YYYY-MM-DD'` 는 한국 달력의 그 날이고 `time` 은 그 날의 KST 벽시계 시각이다. 브라우저
 * 타임존에 의존하면 해외에서 접속한 운영자와 국내 운영자가 **다른 날짜를 보내게 되므로**,
 * 서버와 같은 관례로 오프셋을 명시적으로 더하고 뺀다.
 */

/** KST(+09:00). 이 저장소의 리그 일정은 전부 이 기준이다. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExpandWeeklyFixtureDatesInput {
  /** 리그 시작일. `'YYYY-MM-DD'` 또는 ISO 인스턴트 문자열. */
  readonly startsOn: string;
  /** 0(일)~6(토), KST 기준 요일. */
  readonly dayOfWeek: number;
  /** `'HH:mm'` (KST 24시간제). 모든 날짜에 같은 시각을 쓴다. */
  readonly time: string;
  /** 만들 매치데이 수 = 서버의 `weeksCount`. */
  readonly weeksCount: number;
  /** 지금. 테스트가 고정할 수 있게 주입받는다. */
  readonly now: Date;
}

/** KST 달력 기준 `'YYYY-MM-DD'` 로 만든다. */
function toKstDateString(instant: Date): string {
  return new Date(instant.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** `'YYYY-MM-DD'` + `'HH:mm'`(KST 벽시계)를 UTC 인스턴트로. 서버와 같은 조립 방식이다. */
function kstWallClockToInstant(date: string, time: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes) - KST_OFFSET_MS);
}

/**
 * 요일을 주간 날짜 목록으로 전개한다.
 *
 * - 기준일은 **리그 시작일과 지금 중 늦은 쪽**이다. 시작일만 쓰면 이미 진행 중인 리그에서
 *   지난 날짜가 나와 서버가 422 `LEAGUE_SCHEDULE_DATE_PAST` 로 거부하고, 지금만 쓰면
 *   미래에 시작하는 초안 리그에서 **리그 시작 전 날짜**가 조용히 생긴다(서버는 과거만 막고
 *   "리그 시작 전"은 막지 않는다).
 * - 기준일 이후(같은 날 포함) 처음 오는 그 요일에서 시작해 7일씩 더한다.
 * - 그 첫 날의 **시각까지** 이미 지났으면 한 주 밀어낸다 — 서버의 과거 거부는 날짜가 아니라
 *   `날짜+시각` 인스턴트로 판정하기 때문이다(토요일 20시에 그날 18시 경기를 만들 수는 없다).
 * - 결과는 오름차순이고 중복이 없다(주간 간격이라 구조적으로 보장된다).
 */
export function expandWeeklyFixtureDates(input: ExpandWeeklyFixtureDatesInput): string[] {
  const { startsOn, dayOfWeek, time, weeksCount, now } = input;
  if (weeksCount <= 0) return [];

  const nowKst = toKstDateString(now);
  // **읽을 수 없는 시작일은 "제약 없음"으로 취급한다.** 기준일은 어차피
  // `max(시작일, 오늘)` 이라, 시작일을 못 읽으면 오늘로 떨어뜨리는 것이 의미상 맞다.
  // 여기서 던지면 **어드민 리그 화면이 통째로 흰 화면이 된다** — 대진 폼 하나 때문에
  // 표·참가팀·취소까지 전부 못 쓰게 되는 건 과한 대가다(테스트로 고정).
  const startsOnAt = new Date(startsOn);
  const startsOnKst = Number.isNaN(startsOnAt.getTime()) ? nowKst : toKstDateString(startsOnAt);
  // 문자열 비교가 곧 날짜 비교다('YYYY-MM-DD').
  const anchorDate = startsOnKst > nowKst ? startsOnKst : nowKst;

  // 기준일의 KST 요일. 자정 인스턴트로 만들어 UTC 요일을 읽으면 KST 요일과 같다.
  const anchorMidnight = Date.UTC(
    Number(anchorDate.slice(0, 4)),
    Number(anchorDate.slice(5, 7)) - 1,
    Number(anchorDate.slice(8, 10)),
  );
  const anchorDow = new Date(anchorMidnight).getUTCDay();
  const offsetDays = (dayOfWeek - anchorDow + 7) % 7;

  let first = toKstDateString(new Date(anchorMidnight + offsetDays * DAY_MS - KST_OFFSET_MS));
  // 첫 날의 시각이 이미 지났으면 한 주 뒤로.
  if (kstWallClockToInstant(first, time).getTime() < now.getTime()) {
    first = toKstDateString(
      new Date(anchorMidnight + (offsetDays + 7) * DAY_MS - KST_OFFSET_MS),
    );
  }

  const firstMidnight = Date.UTC(
    Number(first.slice(0, 4)),
    Number(first.slice(5, 7)) - 1,
    Number(first.slice(8, 10)),
  );
  return Array.from({ length: weeksCount }, (_, week) =>
    toKstDateString(new Date(firstMidnight + week * 7 * DAY_MS - KST_OFFSET_MS)),
  );
}
