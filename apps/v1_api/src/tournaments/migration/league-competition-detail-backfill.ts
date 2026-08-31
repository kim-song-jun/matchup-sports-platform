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

  // ── 가드 1: 대회 행이 없거나 종류가 리그가 아닌 것 ────────────────────────
  // 종류로 거르지 않고 읽는다 — 거르면 "행이 없다" 와 "종류가 다르다" 가 한 통에 섞인다.
  // (참가팀 백필에서 같은 지적을 받아 고친 것과 같은 규율.)
  const tournaments = await prisma.v1Tournament.findMany({
    where: { id: { in: leagues.map((row) => row.id) } },
    select: { id: true, kind: true, status: true, scheduledAt: true, scheduledEndAt: true, regionId: true },
  });
  const byId = new Map(tournaments.map((row) => [row.id, row]));
  const missingTournaments = leagues
    .filter((league) => byId.get(league.id)?.kind !== 'regular_league')
    .map((league) => ({ leagueId: league.id }));

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

  if (missingTournaments.length > 0 || alreadyFilled.length > 0) {
    throw new LeagueDetailBackfillBlockedError(
      '백필을 중단했다 — 대회 행이 없거나 종류가 리그가 아닌 것, 또는 이미 값이 채워진 행이 있다.',
      { missingTournaments, alreadyFilled },
    );
  }

  if (!options.dryRun && leagues.length > 0) {
    const results = await prisma.$transaction(
      leagues.map((league) =>
        // `updateMany` + 가드 조건을 `where` 에 넣는다. 위 가드는 트랜잭션 **밖** 스냅샷이라
        // 읽기와 쓰기 사이의 경합을 못 잡지만, 이 `where` 는 **쓰기 시점에** 강제된다 —
        // 그 사이 누가 값을 채웠으면 이 행은 count 0 이 되고 아래 합계 단언이 걸린다.
        prisma.v1Tournament.updateMany({
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
        }),
      ),
    );
    const updated = results.reduce((sum, row) => sum + row.count, 0);
    if (updated !== leagues.length) {
      throw new Error(
        `백필이 고친 행 수가 계획과 다르다: 계획 ${leagues.length} · 실제 ${updated}`,
      );
    }
  }

  return { scanned: leagues.length, updated: options.dryRun ? 0 : leagues.length, dryRun: options.dryRun };
}
