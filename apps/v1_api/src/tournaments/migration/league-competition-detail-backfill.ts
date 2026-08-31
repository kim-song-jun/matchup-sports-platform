import { PrismaClient, V1LeagueState, V1TournamentStatus } from '@prisma/client';

/**
 * **리그 → 대회 표시 필드 백필 (R4-a).**
 *
 * 리그 시즌 백필(`league-competition-backfill.ts`)은 **식별에 필요한 것만** 옮겼다
 * (`id`·`title`·`kind`·`sportId`·`series`·`tier`·`seasonNo`). 화면이 쓰는 나머지는
 * 비어 있어서, 통합 축만 읽으면 리그 목록이 **에러 없이 잘못 그려진다**:
 *
 * ```
 * status        88행 전부 draft   → listMine 의 state 게이트가 무너져 active·completed 53개의
 *                                   순위·다음 경기가 통째로 사라진다 (에러 없이)
 * scheduledAt   88행 전부 NULL    → 기간이 안 보인다
 * regionId      컬럼이 없었다     → R4-a expand 로 추가했다
 * ```
 *
 * ## 앞선 두 백필과 성격이 다르다 — **INSERT 가 아니라 UPDATE 다**
 * 그래서 백스톱이 PK 유니크 위반일 수 없다. 대신 **가드 조건을 `where` 에 넣어**
 * 쓰기 시점에 강제한다(읽고 나서 쓰는 사이의 경합을 `where` 가 막는다).
 *
 * ## `status` 매핑 — **D7 과 무관하다**
 * | `V1LeagueState` | `V1TournamentStatus` | 왜 |
 * |---|---|---|
 * | `draft` | `draft` | 그대로 |
 * | `active` | `in_progress` | **오늘의 리그에는 신청 단계가 없다.** 운영자가 팀을 넣고 시즌이 돈다 — 그래서 `active` 는 "경기가 진행 중"이라는 뜻이다 |
 * | `completed` | `completed` | 그대로 |
 *
 * **`open` 은 쓰지 않는다.** `open` 은 "신청 받는 중"이고 그 단계는 **오늘 존재하지 않는다** —
 * D7(참가 경로를 신청제로 통일)이 도입할 때 생긴다. 즉 이 매핑은 D7 을 미리 정하는 것이
 * 아니라 **현재 의미를 그대로 옮기는 것**이다. `open` 이 비어 있는 것은 누락이 아니다.
 */
const STATUS_BY_LEAGUE_STATE: Record<V1LeagueState, V1TournamentStatus> = {
  [V1LeagueState.draft]: V1TournamentStatus.draft,
  [V1LeagueState.active]: V1TournamentStatus.in_progress,
  [V1LeagueState.completed]: V1TournamentStatus.completed,
};

export interface LeagueDetailBackfillResult {
  scanned: number;
  updated: number;
  dryRun: boolean;
}

export class LeagueDetailBackfillBlockedError extends Error {
  constructor(
    message: string,
    readonly detail: {
      missingTournaments: Array<{ leagueId: string }>;
      kindMismatches: Array<{ leagueId: string; kind: string | null }>;
      alreadyFilled: Array<{ leagueId: string; filled: string[] }>;
    },
  ) {
    super(message);
    this.name = 'LeagueDetailBackfillBlockedError';
  }
}

export async function backfillLeagueCompetitionDetails(
  prisma: PrismaClient,
  options: { dryRun: boolean },
): Promise<LeagueDetailBackfillResult> {
  const leagues = await prisma.v1League.findMany({
    select: { id: true, state: true, startsOn: true, endsOn: true, regionId: true },
    orderBy: { id: 'asc' },
  });

  // ── 가드 1: 대회 행이 없는 것 / 종류가 리그가 아닌 것 ─────────────────────
  // **두 통으로 나눈다.** 종류로 걸러 읽거나 한 배열에 합치면 운영자가 조치를 못 고른다:
  //   행이 없다      → 리그 시즌 백필을 **먼저 돌려라**
  //   종류가 다르다  → 그 id 는 **우리 리그가 아니다.** 멈추고 조사해라
  // (참가팀 백필에서 같은 지적을 받아 고쳤는데 이 파일에 그대로 재현했다 — Copilot 이 잡았다.)
  const tournaments = await prisma.v1Tournament.findMany({
    where: { id: { in: leagues.map((row) => row.id) } },
    select: { id: true, kind: true, status: true, scheduledAt: true, scheduledEndAt: true, regionId: true },
  });
  const byId = new Map(tournaments.map((row) => [row.id, row]));
  const missingTournaments = leagues
    .filter((league) => !byId.has(league.id))
    .map((league) => ({ leagueId: league.id }));
  const kindMismatches = leagues
    .filter((league) => byId.has(league.id) && byId.get(league.id)?.kind !== 'regular_league')
    .map((league) => ({ leagueId: league.id, kind: byId.get(league.id)?.kind ?? null }));

  // ── 가드 2: 이미 값이 있는 행 ─────────────────────────────────────────────
  // **덮어쓰기를 하지 않는다.** 덮어쓰는 순간 원래 값이 사라져 되돌리기가 불가능해진다
  // (앞선 두 백필은 INSERT 라 되돌리기가 DELETE 였지만, UPDATE 는 그렇지 않다).
  // 지금은 0건이지만 재실행·부분 실행 뒤에는 생길 수 있고, 그때 멈추는 것이 맞다.
  const alreadyFilled = leagues
    .map((league) => {
      const row = byId.get(league.id);
      if (!row || row.kind !== 'regular_league') return null;
      const filled: string[] = [];
      if (row.status !== V1TournamentStatus.draft) filled.push('status');
      if (row.scheduledAt !== null) filled.push('scheduledAt');
      if (row.scheduledEndAt !== null) filled.push('scheduledEndAt');
      if (row.regionId !== null) filled.push('regionId');
      return filled.length > 0 ? { leagueId: league.id, filled } : null;
    })
    .filter((row): row is { leagueId: string; filled: string[] } => row !== null);

  if (missingTournaments.length > 0 || kindMismatches.length > 0 || alreadyFilled.length > 0) {
    throw new LeagueDetailBackfillBlockedError(
      '백필을 중단했다 — 대회 행이 없는 리그, 종류가 리그가 아닌 대회 행, ' +
        '또는 이미 값이 채워진 행이 있다.',
      { missingTournaments, kindMismatches, alreadyFilled },
    );
  }

  let updated = 0;

  if (!options.dryRun && leagues.length > 0) {
    // ── **interactive 트랜잭션이어야 한다 — 배열형이면 단언이 롤백을 못 일으킨다** ────
    // `$transaction([...])` 는 결과를 돌려주기 **전에 커밋한다.** 그래서 그 뒤에서 개수를
    // 세고 throw 하면 **이미 커밋된 부분 적용이 남고 종료 코드만 실패**가 된다
    // (88 중 87 만 매칭되면 87 은 들어간 채 "실패" 로 끝난다).
    //
    // 이건 **사용자 승인을 받아 alpha 에 돌리는 쓰기**다. 승인을 받는 작업에 필요한 성질은
    // 전부 되거나 전부 안 되거나이고, "실패했다는데 87 행은 들어갔다" 는 승인자가 판단할 수
    // 없는 상태다. interactive 형에서는 아래 throw 가 롤백을 일으킨다.
    //
    // > **앞선 참가팀 백필(create)은 같은 모양이어도 이 결함이 아니다** — `create` 는
    // > 실패하면 트랜잭션 전체가 터져 결과가 아예 안 돌아온다. `updateMany` 만 **에러 없이
    // > 0행**을 돌려줄 수 있어서 "커밋됐는데 개수가 안 맞는" 상태가 성립한다.
    //
    // 88행이라 순차 왕복 비용은 무시해도 된다.
    await prisma.$transaction(async (tx) => {
      for (const league of leagues) {
        // 가드 조건을 `where` 에 넣는다. 위 가드는 트랜잭션 **밖** 스냅샷이라 읽기와 쓰기
        // 사이의 경합을 못 잡지만, 이 `where` 는 **쓰기 시점에** 강제된다 — 그 사이 누가
        // 값을 채웠으면 이 행은 count 0 이 되고 아래 합계 단언이 걸린다.
        const result = await tx.v1Tournament.updateMany({
          where: {
            id: league.id,
            kind: 'regular_league',
            status: V1TournamentStatus.draft,
            scheduledAt: null,
            scheduledEndAt: null,
            regionId: null,
          },
          data: {
            status: STATUS_BY_LEAGUE_STATE[league.state],
            scheduledAt: league.startsOn,
            scheduledEndAt: league.endsOn,
            regionId: league.regionId,
          },
        });
        updated += result.count;
      }
      if (updated !== leagues.length) {
        throw new Error(
          `백필이 고친 행 수가 계획과 다르다: 계획 ${leagues.length} · 실제 ${updated}`,
        );
      }
    });
  }

  // **계획이 아니라 실적을 반환한다.** 위 단언이 통과했으면 둘이 같지만, 계획값을 실적으로
  // 보고하는 모양 자체가 "쓴 것과 보고한 것이 다를 수 있는" 구조다.
  return { scanned: leagues.length, updated, dryRun: options.dryRun };
}
