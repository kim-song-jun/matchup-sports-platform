import { PrismaClient } from '@prisma/client';

/**
 * **리그 참가팀(`V1LeagueTeam`) → 대회 등록(`V1TournamentRegistration`) 백필.**
 *
 * 리그 시즌 백필(`league-competition-backfill.ts`)의 다음 조각이다. 그 백필은 리그 **메타**만
 * 옮겼고 참가팀은 리그 축에 남겨 뒀는데, 화면 전환(R4-a)이 그 위에서 막힌다:
 *
 * ```
 * league-match-public.service.ts:142  listMine
 *   where: { teams: { some: { teamId: { in: teamIds } } } }   ← 참가팀으로 **필터**한다
 * ```
 * 투영(`teamCount`)이면 별도 조회로 때울 수 있지만 **WHERE 절은 못 때운다** — 통합 축만 읽어서는
 * "내가 속한 리그"를 찾을 수가 없다. 그래서 참가팀이 먼저 옮겨져야 한다.
 *
 * ## 되돌리기 창을 닫지 않는다
 * `V1TournamentRegistration.tournament` 는 **`onDelete: Cascade`** 다. 즉 이 백필이 만든 행은
 * 리그 백필 행(88개)을 지울 때 **함께 지워진다.** 창을 닫는 것은 `Restrict` 관계 셋뿐이고
 * (`docs/ops/read-swap-preflight.md` 2절) 등록은 거기 없다 — 2026-08-31 사용자 결정
 * ("결과 확정 경로를 마지막으로 미룬다 = 그때까지 되돌릴 수 있게")과 충돌하지 않는다.
 *
 * ## 필드 결정 — 원본에 없는 값 셋
 * | 필드 | 값 | 왜 |
 * |---|---|---|
 * | `appliedByUserId` | 팀 owner | **리그 참가팀에는 신청자가 없다.** `league-match-admin.service.ts` 의 `addTeam(user, …)` 으로 **운영자가 추가**하고 그 사람은 감사 로그에만 남는다. 감사 로그 역추적은 로그가 지워지면 백필이 불가능해지므로 데이터 무결성을 로그에 의존시키는 셈이라 쓰지 않는다. 컬럼을 nullable 로 바꾸는 것은 스키마 변경이라 비용이 크다. |
 * | `entrySource` | `seeded` | enum 정의가 **"운영자가 지정"** 이다. 위 owner 귀속과 짝이 되어 *"팀 owner 에게 귀속되지만 신청이 아니라 운영자 지정"* 을 정확히 표현한다. |
 * | `status` | `confirmed` | **리그 백필과 답이 다르다.** 리그 행은 아무도 안 읽어 `draft` 가 안전했지만, 참가팀은 R4-a 가 읽는다 — `draft` 면 `teamCount = 0`·`listMine` 0 이라 **백필하고도 화면 전환이 성립하지 않는다.** `confirmed` 소비처 19곳을 전수 분류해 대회 스코프 밖 쿼리가 (한 곳을 고친 뒤) 없음을 확인했다. |
 */

/** 원본에 신청자가 없어 팀 owner 로 귀속시킨다 — 위 표 참조. */
const ENTRY_SOURCE = 'seeded' as const;
const REGISTRATION_STATUS = 'confirmed' as const;

export interface LeagueTeamBackfillResult {
  scanned: number;
  created: number;
  alreadyPresent: number;
  dryRun: boolean;
}

export class LeagueTeamBackfillBlockedError extends Error {
  constructor(
    message: string,
    readonly detail: {
      teamsWithoutOwner: Array<{ leagueId: string; teamId: string }>;
      idConflicts: Array<{ leagueTeamId: string; existingTournamentId: string }>;
      missingTournaments: Array<{ leagueId: string }>;
    },
  ) {
    super(message);
    this.name = 'LeagueTeamBackfillBlockedError';
  }
}

export async function backfillLeagueTeamsAsRegistrations(
  prisma: PrismaClient,
  options: { dryRun: boolean },
): Promise<LeagueTeamBackfillResult> {
  const leagueTeams = await prisma.v1LeagueTeam.findMany({
    select: { id: true, leagueId: true, teamId: true, createdAt: true },
    orderBy: { id: 'asc' },
  });

  // ── 가드 1: 대회 행이 없는 리그 ────────────────────────────────────────────
  // 리그 시즌 백필이 먼저 돌아 있어야 한다. 안 돌았으면 `tournamentId` FK 가 터지는데,
  // 그때는 "무엇이 빠졌는지"가 에러에 안 나온다 — 먼저 세어서 이름을 보여 준다.
  const leagueIds = [...new Set(leagueTeams.map((row) => row.leagueId))];
  const tournaments = await prisma.v1Tournament.findMany({
    where: { id: { in: leagueIds }, kind: 'regular_league' },
    select: { id: true },
  });
  const tournamentIds = new Set(tournaments.map((row) => row.id));
  const missingTournaments = leagueIds
    .filter((id) => !tournamentIds.has(id))
    .map((leagueId) => ({ leagueId }));

  // ── 가드 2: owner 가 없는 팀 ──────────────────────────────────────────────
  // `appliedByUserId` 는 **필수**이고 `onDelete: Restrict` 다. owner 를 못 찾으면 그 행은
  // 만들 수 없다 — 조용히 건너뛰면 "만들었다고 보고했는데 일부가 없는" 상태가 된다.
  // 실행 시점에 멤버십이 바뀔 수 있으므로 **매 실행 다시 센다**(2026-08-31 alpha 실측 0건).
  const teamIds = [...new Set(leagueTeams.map((row) => row.teamId))];
  const owners = await prisma.v1TeamMembership.findMany({
    where: { teamId: { in: teamIds }, role: 'owner', status: 'active' },
    select: { teamId: true, userId: true },
  });
  const ownerByTeamId = new Map(owners.map((row) => [row.teamId, row.userId]));
  const teamsWithoutOwner = leagueTeams
    .filter((row) => !ownerByTeamId.has(row.teamId))
    .map((row) => ({ leagueId: row.leagueId, teamId: row.teamId }));

  // ── 가드 3: id 충돌 ───────────────────────────────────────────────────────
  // 리그 백필과 같은 규율: **"id 가 이미 있다"를 무조건 skip 으로 처리하지 않는다.**
  // 우리가 만든 행(그 리그의 등록)이면 재실행이라 skip 이 맞지만, 다른 대회의 등록이면
  // **남의 행을 우리 것으로 착각하는 것**이다.
  const existing = await prisma.v1TournamentRegistration.findMany({
    where: { id: { in: leagueTeams.map((row) => row.id) } },
    select: { id: true, tournamentId: true },
  });
  const existingById = new Map(existing.map((row) => [row.id, row.tournamentId]));
  const idConflicts = leagueTeams
    .filter((row) => {
      const found = existingById.get(row.id);
      return found !== undefined && found !== row.leagueId;
    })
    .map((row) => ({ leagueTeamId: row.id, existingTournamentId: existingById.get(row.id) ?? '' }));

  if (missingTournaments.length > 0 || teamsWithoutOwner.length > 0 || idConflicts.length > 0) {
    throw new LeagueTeamBackfillBlockedError(
      '백필을 중단했다 — 대회 행이 없는 리그, owner 없는 팀, 또는 우리 것이 아닌 id 충돌이 있다.',
      { teamsWithoutOwner, idConflicts, missingTournaments },
    );
  }

  const toCreate = leagueTeams.filter((row) => !existingById.has(row.id));

  // ── PK 가 진짜 백스톱이다 — 죽이지 마라 ───────────────────────────────────
  // 위 가드는 트랜잭션 **밖에서** 읽은 스냅샷이라 가드와 쓰기 사이의 경합을 못 잡는다.
  // 실제로 막는 것은 **명시 `id` insert 의 PK 유니크 위반**(과 `@@unique([tournamentId,
  // teamId])` 가 있다면 그것)이고, 터지면 트랜잭션 전체가 롤백된다.
  //
  // 그래서 `createMany({ skipDuplicates: true })` 도 `upsert` 도 쓰지 않는다 — 전자는
  // 충돌을 조용히 삼켜 **백스톱을 없애고**, 후자는 **남의 행을 덮어쓴다.**
  if (!options.dryRun && toCreate.length > 0) {
    const created = await prisma.$transaction(
      toCreate.map((row) =>
        prisma.v1TournamentRegistration.create({
          data: {
            id: row.id,
            tournamentId: row.leagueId,
            teamId: row.teamId,
            // 가드 2 를 통과했으므로 반드시 있다. `!` 대신 다시 확인해 조용한 undefined 를 막는다.
            appliedByUserId: ownerByTeamId.get(row.teamId) as string,
            status: REGISTRATION_STATUS,
            entrySource: ENTRY_SOURCE,
            createdAt: row.createdAt,
          },
        }),
      ),
    );
    // 조용히 빠진 행이 없는지 확인한다 — 개수가 다르면 위 금지사항 중 하나가 되살아났거나
    // 경합이 있었다는 뜻이다.
    if (created.length !== toCreate.length) {
      throw new Error(
        `백필이 만든 행 수가 계획과 다르다: 계획 ${toCreate.length} · 실제 ${created.length}`,
      );
    }
  }

  return {
    scanned: leagueTeams.length,
    created: options.dryRun ? 0 : toCreate.length,
    alreadyPresent: leagueTeams.length - toCreate.length,
    dryRun: options.dryRun,
  };
}
