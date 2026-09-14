import { Prisma, V1GameLineupState, V1GameState } from '@prisma/client';
import { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { createSourceRosterIdentityLinks } from '../games/games.service';
import { carryRevokedConsent, loadRevokedConsentByUserId } from '../team-matches/lineup-consent-carry';
import { leagueTeamRosterEntries, loadLeagueTeamRosters, type LeagueRosterEntry } from './league-fixture-creation';

type Transaction = Prisma.TransactionClient;

export const LEAGUE_ROSTER_SYNC_ACTION = 'LEAGUE_ROSTER_SYNCED';
const LEAGUE_ROSTER_SYNC_ACTOR = 'LEAGUE_ROSTER_SYNC';

/**
 * 리그 참가 명단이 바뀐 뒤 그 팀의 **시작 전 리그 경기** 명단을 참가 명단에 다시 맞춘다(Task 170 D1′).
 * 대진이 명단보다 먼저 만들어져도 명단 선수가 계정과 함께 경기에 들어가게 하는 경로다.
 *
 * 시스템이 만든 초안만 바꾼다 — 리비전 1(대진 생성 스냅샷)이거나 이 함수가 만든 리비전이면서 아직
 * DRAFT 인 것. 팀장이 저장·제출한 라인업은 건드리지 않는다. 라인업 행에는 누가 만들었는지 적는 칸이
 * 없어, 동기화 리비전은 운영 감사 행(`requestId = gameId:lineupId`)으로 표시하고 그것으로 가른다.
 *
 * 명단을 쓰는 트랜잭션 안에서 부른다. 바뀐 경기 사이드 수를 돌려준다.
 */
export async function syncLeagueRosterLineups(
  tx: Transaction,
  input: { leagueId: string; teamId: string },
): Promise<number> {
  const games = await tx.v1Game.findMany({
    where: {
      state: V1GameState.SCHEDULED,
      teamMatch: {
        leagueId: input.leagueId,
        deletedAt: null,
        status: { not: 'cancelled' },
        // 팀장 라인업 수정 마감(시작 시각)과 같은 경계다.
        startAt: { gt: new Date() },
      },
      sides: { some: { teamId: input.teamId } },
    },
    select: {
      id: true,
      teamMatch: { select: { id: true, tournamentId: true } },
      sides: { where: { teamId: input.teamId }, select: { id: true } },
    },
  });
  if (games.length === 0) return 0;
  const team = (await loadLeagueTeamRosters(tx, input.leagueId, [input.teamId])).get(input.teamId);
  // 비활성·삭제된 팀은 대진 생성과 같은 이유로 대상이 아니다.
  if (team === undefined) return 0;
  const entries = leagueTeamRosterEntries(team);

  let synced = 0;
  for (const game of games) {
    if (game.teamMatch === null) continue;
    for (const side of game.sides) {
      const changed = await syncSide(
        tx,
        {
          gameId: game.id,
          sideId: side.id,
          teamMatchId: game.teamMatch.id,
          tournamentId: game.teamMatch.tournamentId,
          leagueId: input.leagueId,
        },
        entries,
      );
      if (changed) synced += 1;
    }
  }
  return synced;
}

function auditRequestId(gameId: string, lineupId: string): string {
  return `${gameId}:${lineupId}`;
}

function rosterKey(rows: ReadonlyArray<{ userId: string | null; displayNameSnapshot: string }>): string {
  return rows
    .map((row) => `${row.userId ?? ''}␟${row.displayNameSnapshot}`)
    .sort()
    .join('␞');
}

async function syncSide(
  tx: Transaction,
  target: { gameId: string; sideId: string; teamMatchId: string; tournamentId: string | null; leagueId: string },
  entries: readonly LeagueRosterEntry[],
): Promise<boolean> {
  const latest = await tx.v1GameLineup.findFirst({
    where: { gameId: target.gameId, sideId: target.sideId, invalidatedAt: null },
    orderBy: { revision: 'desc' },
  });
  if (latest === null || latest.state !== V1GameLineupState.DRAFT) return false;
  if (latest.revision !== 1) {
    const marker = await tx.v1OperationAudit.findFirst({
      where: { requestId: auditRequestId(target.gameId, latest.id), action: LEAGUE_ROSTER_SYNC_ACTION },
      select: { id: true },
    });
    if (marker === null) return false;
  }

  const current = await tx.v1GameParticipant.findMany({
    where: { lineupId: latest.id },
    select: { userId: true, displayNameSnapshot: true },
  });
  const desired = entries.map((entry) => ({ userId: entry.userId ?? null, displayNameSnapshot: entry.displayNameSnapshot }));
  if (rosterKey(current) === rosterKey(desired)) return false;

  const carried = await loadRevokedConsentByUserId(tx, latest.id);
  const lineup = await tx.v1GameLineup.create({
    data: {
      gameId: target.gameId,
      sideId: target.sideId,
      revision: latest.revision + 1,
      supersedesId: latest.id,
      formation: latest.formation,
    },
  });
  const created = await tx.v1GameParticipant.createManyAndReturn({
    data: desired.map((row) => ({
      gameId: target.gameId,
      sideId: target.sideId,
      lineupId: lineup.id,
      userId: row.userId,
      displayNameSnapshot: row.displayNameSnapshot,
      // 명단 = 출전자(정본 §3). 출전 판정은 이 값을 읽는다.
      started: true,
    })),
    select: { id: true, userId: true },
  });
  const linked = created.flatMap((row) => (row.userId === null ? [] : [{ participantId: row.id, userId: row.userId }]));
  await createSourceRosterIdentityLinks(
    tx,
    linked,
    { actorType: 'SYSTEM', systemActor: LEAGUE_ROSTER_SYNC_ACTOR },
    'league_roster_sync',
  );
  for (const row of linked) {
    await carryRevokedConsent(tx, row.participantId, carried.get(row.userId));
  }
  await new OperationAuditWriterService().create(tx, {
    actor: { type: 'SYSTEM', id: LEAGUE_ROSTER_SYNC_ACTOR },
    requestId: auditRequestId(target.gameId, lineup.id),
    action: LEAGUE_ROSTER_SYNC_ACTION,
    targetType: 'GAME',
    targetId: target.gameId,
    // 감사의 경기 참조는 (tournamentId, teamMatchId) 복합 FK 라, 경기 행에 tournamentId 가 없는 옛 데이터에
    // 리그 id 를 짝지으면 FK 위반으로 명단 변경 트랜잭션이 깨진다. 리그 범위만 남기고 경기 참조는 뺀다.
    tournamentId: target.tournamentId ?? target.leagueId,
    teamMatchId: target.tournamentId === null ? null : target.teamMatchId,
    occurredAt: new Date(),
    before: { lineupId: latest.id },
    after: { lineupId: lineup.id, sideId: target.sideId, participantCount: created.length },
  });
  return true;
}
