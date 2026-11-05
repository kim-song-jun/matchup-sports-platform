/**
 * 리그 대진의 "N주차"를 `startAt` 에서 파생하는 **단일 규칙**.
 *
 * ## 왜 저장된 제목을 쓰지 않는가
 * `V1TeamMatch.title` 에는 대진 생성 시점의 주차가 박제돼 있다("<리그명> N주차 M경기").
 * 재일정·끼워 넣기로 주차가 밀리면 박제된 값이 낡는다. 그래서 화면은 이 함수로 파생하고,
 * 저장된 제목도 일정이 바뀔 때마다 `syncLeagueFixtureWeekTitles` 가 이 규칙으로 다시 맞춘다.
 *
 * ## 규칙 (2026-11-03 사용자 확정 — 달력 주)
 * KST 월요일~일요일을 한 주로 묶고, 그 리그에서 **경기가 있는 주만** 오름차순으로 센다.
 * 대상 대진의 주가 몇 번째인지가 곧 주차다. 토·일에 나눠 치러도 같은 주차이고, 경기가 없는 주
 * (휴식 주)는 번호를 건너뛰지 않는다. 예전 규칙은 "서로 다른 경기일의 순번"이라 토·일 리그가
 * 두 주차로 갈렸다.
 *
 * 공개 경기기록·어드민 영상 화면·결과 신청 목록·라인업 할 일·완료 알림이 모두 이 함수를 쓴다.
 * 같은 경기가 화면마다 다른 주차로 불리면 안 되므로 규칙을 다른 곳에 다시 쓰지 않는다.
 * 여기는 Prisma 를 모른다(순수 함수) — 호출자가 필요한 날짜만 모아서 넘긴다.
 */

/** 리그 일정은 KST 기준이다. `en-CA` 는 `YYYY-MM-DD` 를 준다. */
const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });

/** 이 대진이 열리는 KST 날짜 키(`YYYY-MM-DD`). */
export function kstDayKey(at: Date): string {
  return KST_DAY.format(at);
}

/**
 * 이 대진이 속한 KST 달력 주의 키 — 그 주 월요일의 `YYYY-MM-DD`. 문자열 정렬이 곧 주 순서다.
 * 날짜 계산은 KST 날짜를 UTC 자정으로 옮겨서 한다(서버 시간대와 무관하다).
 */
export function kstWeekKey(at: Date): string {
  const [year, month, day] = kstDayKey(at).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

export interface LeagueWeekTarget {
  readonly id: string;
  readonly leagueId: string | null;
  readonly startAt: Date;
}

/**
 * 리그별 주차를 한 번에 구한다.
 *
 * @param siblingStartAtsByLeagueId 리그마다 **그 리그의 모든 대진 시작 시각**. 취소된 대진도
 *   포함해야 한다 — 모든 호출처가 같은 조건(`deletedAt: null` 만)으로 모아야 주차가 어긋나지 않는다.
 * @param targets 주차를 알고 싶은 대진들. `leagueId` 가 null 인 친선 팀매치는 결과에 담기지 않는다.
 * @returns 대진 id → 주차(1-base). 자기 주를 형제 목록에서 못 찾은 경우(소프트삭제 등)는
 *   근거가 없으므로 **1주차**로 폴백한다.
 */
export function resolveLeagueWeekNumbers(
  siblingStartAtsByLeagueId: ReadonlyMap<string, readonly Date[]>,
  targets: readonly LeagueWeekTarget[],
): Map<string, number> {
  const counterByLeagueId = new Map<string, (startAt: Date) => number>();
  for (const [leagueId, startAts] of siblingStartAtsByLeagueId) {
    counterByLeagueId.set(leagueId, leagueWeekCounter(startAts));
  }

  const weekNumbers = new Map<string, number>();
  for (const target of targets) {
    if (target.leagueId === null) continue;
    weekNumbers.set(target.id, counterByLeagueId.get(target.leagueId)?.(target.startAt) ?? 1);
  }
  return weekNumbers;
}

/**
 * 한 리그의 형제 시작 시각으로 주차 계산기를 만든다 — 한 리그의 목록을 한 번에 셀 때 쓴다.
 * 형제 목록에 없는 주는 1주차로 폴백한다(`resolveLeagueWeekNumbers` 와 같다).
 */
export function leagueWeekCounter(siblingStartAts: readonly Date[]): (startAt: Date) => number {
  const weeks = [...new Set(siblingStartAts.map(kstWeekKey))].sort();
  const numberByWeek = new Map(weeks.map((week, index) => [week, index + 1]));
  return (startAt) => numberByWeek.get(kstWeekKey(startAt)) ?? 1;
}
