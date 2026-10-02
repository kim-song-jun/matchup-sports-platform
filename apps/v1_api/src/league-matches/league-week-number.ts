/**
 * 리그 대진의 "N주차"를 `startAt` 에서 파생하는 **단일 규칙**.
 *
 * ## 왜 저장된 제목을 쓰지 않는가
 * `V1TeamMatch.title` 에는 대진 생성 시점의 주차가 박제돼 있다("<리그명> N주차 M경기").
 * 그런데 재일정(`LeagueMatchAdminService.updateFixture`)은 `startAt`·`placeName` 만 갱신하고
 * **`title` 은 건드리지 않는다** — 그래서 일정을 옮긴 대진은 제목이 옛 주차로 남고, 같은
 * 경기를 화면마다 다른 주차로 부르게 된다.
 *
 * ## 규칙
 * 그 리그의 서로 다른 **KST 경기일**을 오름차순으로 세어, 대상 대진의 경기일이 몇 번째
 * 날인지가 곧 주차다. 공개 경기기록(`public-tournament-records.service.ts` 의
 * `resolveLeagueWeekNumber`)·어드민 영상 화면(`league-fixture-videos.service.ts`)이 쓰는 것과
 * **완전히 같은 규칙**이다. 같은 경기가 화면마다 다르게 불리면 안 되므로 규칙을 새로 만들지
 * 않는다.
 *
 * 이 모듈이 생긴 이유도 그것이다 — 같은 규칙이 이미 세 곳에 복제돼 있었고, 네 번째 소비처
 * (`league-claimable-fixtures.service.ts`)가 저장된 제목을 그대로 쓰다가 이 함정을 다시 밟았다.
 * 여기는 Prisma 를 모른다(순수 함수) — 호출자가 필요한 날짜만 모아서 넘긴다.
 */

/** 리그 일정은 KST 기준이다. `en-CA` 는 `YYYY-MM-DD` 를 주므로 문자열 정렬이 곧 날짜 정렬이다. */
const KST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });

/** 이 대진이 열리는 KST 날짜 키. 주차 계산과 같은 포맷터를 쓰는 것이 핵심이다. */
export function kstDayKey(at: Date): string {
  return KST_DAY.format(at);
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
 *   포함해야 한다 — 위 세 화면이 쓰는 조건(`deletedAt: null` 만)과 같아야 주차가 어긋나지 않는다.
 * @param targets 주차를 알고 싶은 대진들. `leagueId` 가 null 인 친선 팀매치는 결과에 담기지 않는다.
 * @returns 대진 id → 주차(1-base). 자기 경기일을 형제 목록에서 못 찾은 경우(소프트삭제 등)는
 *   근거가 없으므로 위 세 화면과 같은 폴백인 **1주차**를 쓴다.
 */
export function resolveLeagueWeekNumbers(
  siblingStartAtsByLeagueId: ReadonlyMap<string, readonly Date[]>,
  targets: readonly LeagueWeekTarget[],
): Map<string, number> {
  const sortedDaysByLeagueId = new Map<string, string[]>();
  for (const [leagueId, startAts] of siblingStartAtsByLeagueId) {
    const days = new Set<string>();
    for (const startAt of startAts) days.add(kstDayKey(startAt));
    sortedDaysByLeagueId.set(leagueId, [...days].sort());
  }

  const weekNumbers = new Map<string, number>();
  for (const target of targets) {
    if (target.leagueId === null) continue;
    const index = sortedDaysByLeagueId.get(target.leagueId)?.indexOf(kstDayKey(target.startAt)) ?? -1;
    weekNumbers.set(target.id, index >= 0 ? index + 1 : 1);
  }
  return weekNumbers;
}
