import { V1IdentityLinkAction, type Prisma } from '@prisma/client';

/** `PrismaService` 와 트랜잭션 클라이언트 양쪽이 만족하는 최소 표면. */
export type LineupAccountDb = Pick<
  Prisma.TransactionClient,
  'v1Game' | 'v1GameLineup' | 'v1GameParticipant' | 'v1ParticipantIdentityLinkCurrent' | 'v1ParticipantIdentityLinkEvent'
>;

export type LineupParticipantRow = {
  id: string;
  sideId: string;
  userId: string | null;
  displayNameSnapshot: string;
};

/**
 * 사이드(side)별 최신 라인업 id. 라인업 저장은 매번 새 revision 행 + 새 참가자 행을 만들 뿐
 * 이전 revision의 참가자 행을 지우지 않는다(team-match-lineup.service.ts에 delete/deleteMany가
 * 0건) — 그래서 "그 경기에 실제로 뛴 명단"을 구하려면 gameId/sideId만으로는 부족하고 반드시
 * 최신 revision 하나로 좁혀야 한다. team-match-lineup.service.ts의 private latestLineup()과
 * 같은 규칙(revision desc, 상태 무관)을 그대로 따른다 — 두 곳이 서로 다른 "최신"의 정의를
 * 갖게 되는 걸 막기 위해 규칙을 일치시켰다.
 */
export async function latestLineupIdsBySideId(
  db: Pick<LineupAccountDb, 'v1GameLineup'>,
  sideIds: string[],
): Promise<Map<string, string>> {
  if (!sideIds.length) return new Map();
  const lineups = await db.v1GameLineup.findMany({
    where: { sideId: { in: sideIds }, invalidatedAt: null },
    select: { id: true, sideId: true },
    orderBy: { revision: 'desc' },
  });
  const latestBySideId = new Map<string, string>();
  for (const lineup of lineups) {
    if (!latestBySideId.has(lineup.sideId)) latestBySideId.set(lineup.sideId, lineup.id);
  }
  return latestBySideId;
}

/**
 * TeamMatch roster identity is authoritative in the current-link table. A
 * participant row may legitimately keep `userId=null` after a REQUESTED →
 * ATTESTED identity flow. Conversely, falling back to that snapshot when a
 * current link disappeared could resurrect a REVOKED/EXPIRED identity.
 *
 * A persisted participant.userId is retained for rows whose history contains
 * only a request/rejection/expiry. Those actions do not establish a terminal
 * identity assignment. ATTESTED and REVOKED are terminal lifecycle actions:
 * without a current link, either one suppresses the snapshot so a revoked
 * identity can never be resurrected.
 */
export async function resolveLineupParticipantUsers<T extends LineupParticipantRow>(
  db: Pick<LineupAccountDb, 'v1ParticipantIdentityLinkCurrent' | 'v1ParticipantIdentityLinkEvent'>,
  participants: readonly T[],
): Promise<Array<Omit<T, 'userId'> & { userId: string }>> {
  if (participants.length === 0) return [];
  const participantIds = participants.map((participant) => participant.id);
  const [currentLinks, identityEvents] = await Promise.all([
    db.v1ParticipantIdentityLinkCurrent.findMany({
      where: { participantId: { in: participantIds } },
      select: { participantId: true, userId: true },
    }),
    db.v1ParticipantIdentityLinkEvent.findMany({
      where: { participantId: { in: participantIds } },
      select: { participantId: true, action: true },
    }),
  ]);
  const currentUserByParticipantId = new Map(currentLinks.map((link) => [link.participantId, link.userId]));
  const hasTerminalIdentityHistory = new Set(
    identityEvents
      .filter((event) => event.action === V1IdentityLinkAction.ATTESTED || event.action === V1IdentityLinkAction.REVOKED)
      .map((event) => event.participantId),
  );
  return participants.flatMap((participant) => {
    const linkedUserId = currentUserByParticipantId.get(participant.id);
    if (linkedUserId !== undefined) return [{ ...participant, userId: linkedUserId }];
    if (hasTerminalIdentityHistory.has(participant.id) || participant.userId === null) return [];
    return [{ ...participant, userId: participant.userId }];
  });
}

/**
 * 여러 팀 매치의 팀별 "최신 라인업에 계정으로 해석된 참가자" userId 를 한 번에 — 후기 목록이 매치마다
 * 왕복하지 않도록 배치 조회한다. 최신 revision 라인업으로만 좁히지 않으면 지워지지 않는 옛 라인업
 * 참가자만큼 명단이 부풀려진다. 결과는 Map<teamMatchId, Map<teamId, userId[]>> 이고, 계정으로 해석된
 * 참가자가 없는 팀은 빈 배열이다.
 */
export async function readTeamMatchLineupUserIds(
  db: LineupAccountDb,
  teamMatchIds: string[],
): Promise<Map<string, Map<string, string[]>>> {
  const byTeamMatchId = new Map<string, Map<string, string[]>>();
  if (!teamMatchIds.length) return byTeamMatchId;

  const games = await db.v1Game.findMany({
    where: { teamMatchId: { in: teamMatchIds } },
    select: { id: true, teamMatchId: true, sides: { select: { id: true, teamId: true } } },
  });
  if (!games.length) return byTeamMatchId;

  const sideIds = games.flatMap((game) => game.sides.map((side) => side.id));
  const latestLineupIdBySideId = await latestLineupIdsBySideId(db, sideIds);
  const latestLineupIds = [...latestLineupIdBySideId.values()];

  const participants = latestLineupIds.length
    ? await db.v1GameParticipant.findMany({
        where: { lineupId: { in: latestLineupIds } },
        select: { id: true, gameId: true, sideId: true, userId: true, displayNameSnapshot: true },
      })
    : [];
  const resolvedParticipants = await resolveLineupParticipantUsers(db, participants);

  for (const game of games) {
    if (!game.teamMatchId) continue;
    const byTeamId = new Map<string, string[]>();
    for (const side of game.sides) {
      if (!side.teamId) continue;
      const userIds = [
        ...new Set(
          resolvedParticipants
            .filter((participant) => participant.gameId === game.id && participant.sideId === side.id)
            .map((participant) => participant.userId),
        ),
      ];
      byTeamId.set(side.teamId, [...(byTeamId.get(side.teamId) ?? []), ...userIds]);
    }
    byTeamMatchId.set(game.teamMatchId, byTeamId);
  }
  return byTeamMatchId;
}

/**
 * 팀 매치 후기 작성 자격 — 후기 목록·상세·제출과 완료 알림 수신자가 같은 판정을 쓴다.
 * 작성자 사이드의 최신 라인업에 계정으로 해석된 참가자가 있을 때만 명단 기준이고, 없으면 활성 팀원
 * 전원이 작성자다(2026-08-18 정책). "라인업이 있는가"로 가르면 안 된다 — 게임은 사이드마다 빈 rev1
 * 라인업을 항상 만들고, 계정 없는 자동 명단(리그)도 해석된 참가자가 0명이라 전원이 자격을 잃는다.
 */
export function canReviewFromLineup(lineupUserIds: readonly string[], userId: string): boolean {
  return lineupUserIds.length === 0 || lineupUserIds.includes(userId);
}
