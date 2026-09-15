import { Prisma, V1GameLineupState, V1GameState } from '@prisma/client';
import { OperationAuditWriterService } from '../common/audit/operation-audit-writer.service';
import { createSourceRosterIdentityLinks } from '../games/games.service';
import { carryRevokedConsent, loadRevokedConsentByUserId } from '../team-matches/lineup-consent-carry';
import { participantDisplayName } from './participant-display-name';
import { readJerseyNumbers } from './tournament-player-jersey';

type Transaction = Prisma.TransactionClient;

export const TOURNAMENT_ROSTER_SYNC_ACTION = 'TOURNAMENT_ROSTER_SYNCED';
const TOURNAMENT_ROSTER_SYNC_ACTOR = 'TOURNAMENT_ROSTER_SYNC';

/**
 * 대회 참가 명단이 바뀐 뒤 그 팀의 **시작 전 대진 경기** 명단을 참가 명단에 다시 맞춘다
 * (Task 170 D1′의 대회판 — 리그는 `league-roster-sync.ts`가 이미 맡고 있었는데, 그 태스크
 * 문서 자체가 "대회는 범위 밖"이라고 못박아 뒀었다).
 *
 * 대회는 대진 생성 시점에 명단을 한 번 복사해 경기 참가자를 만든다
 * (`tournament-bracket.service.ts`의 `createFixture`). 그 복사는 로스터 잠금 여부를
 * 전혀 보지 않고, 한 번 만들어진 뒤로는 절대 다시 돌지 않는다 — 로스터를 잠그기 전에
 * 대진이 먼저 생기면(또는 대진 생성 뒤 선수를 추가/삭제하면) 참가자 명단이 그 시점
 * 스냅샷에 영원히 고정된다. 실사용자가 실제로 겪은 결함(빈 참가자로 남아 골 기록에
 * 선수 정보가 안 붙고, 경기 뒤 "이 선수가 저예요" 후보도 없음)을 이 함수로 막는다.
 *
 * 판정·쓰기 로직은 리그판과 동일하다 — 시스템이 만든 DRAFT 초안(리비전 1이거나 이 함수가
 * 만든 리비전)만 바꾸고, 팀장이 저장·제출한 라인업은 건드리지 않는다. 다른 점은 두 가지뿐이다:
 * ① 대상 경기를 `teamMatch.leagueId === null`(리그가 아닌 대진)로 가른다.
 * ② 등번호(`V1TournamentPlayer.jersey_number`, raw SQL 컬럼)를 새 참가자 행에 다시 찍는다
 *    — 리그 참가자는 애초에 등번호가 없어 리그판엔 이 단계가 없다.
 *
 * 명단을 쓰는 트랜잭션 안에서 부른다. 바뀐 경기 사이드 수를 돌려준다.
 */
export async function syncTournamentRosterLineups(
  tx: Transaction,
  input: { tournamentId: string; teamId: string },
): Promise<number> {
  const games = await tx.v1Game.findMany({
    where: {
      state: V1GameState.SCHEDULED,
      teamMatch: {
        tournamentId: input.tournamentId,
        leagueId: null,
        deletedAt: null,
        status: { not: 'cancelled' },
        // 리그 대진(`createLeagueFixture`)은 생성 시점에 시각이 필수라 `gt: now` 만으로
        // 충분하지만, 대회 대진(`createFixture`)은 `scheduledAt` 이 선택값이라 대진표를
        // 먼저 통째로 만들고 시각은 나중에 배정하는 흐름이 흔하다 — 실사용자가 겪은 바로
        // 그 순서다. 아직 시각이 안 잡힌 경기도 "시작 전"이므로 대상에 포함한다.
        OR: [{ startAt: null }, { startAt: { gt: new Date() } }],
      },
      sides: { some: { teamId: input.teamId } },
    },
    select: {
      id: true,
      teamMatch: { select: { id: true } },
      sides: { where: { teamId: input.teamId }, select: { id: true } },
    },
  });
  if (games.length === 0) return 0;

  const registration = await tx.v1TournamentRegistration.findFirst({
    where: { tournamentId: input.tournamentId, teamId: input.teamId, status: 'confirmed' },
    select: {
      id: true,
      players: {
        where: { removedAt: null },
        select: {
          id: true,
          userId: true,
          user: { select: { profile: { select: { nickname: true, displayName: true } } } },
        },
        orderBy: { id: 'asc' },
      },
    },
  });
  // 확정된 신청이 없는 팀(신청 취소 등)은 대진 생성과 같은 이유로 대상이 아니다.
  if (registration === null) return 0;
  const jerseys = await readJerseyNumbers(tx, registration.id);
  const entries = registration.players.map((player) => ({
    userId: player.userId,
    displayNameSnapshot: participantDisplayName(player),
    jerseyNumber: jerseys.get(player.id),
  }));

  let synced = 0;
  for (const game of games) {
    if (game.teamMatch === null) continue;
    for (const side of game.sides) {
      const changed = await syncSide(
        tx,
        { gameId: game.id, sideId: side.id, teamMatchId: game.teamMatch.id, tournamentId: input.tournamentId },
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

function rosterKey(
  rows: ReadonlyArray<{ userId: string | null; displayNameSnapshot: string; jerseyNumber: number | null | undefined }>,
): string {
  return rows
    .map((row) => `${row.userId ?? ''}␟${row.displayNameSnapshot}␟${row.jerseyNumber ?? ''}`)
    .sort()
    .join('␞');
}

async function syncSide(
  tx: Transaction,
  target: { gameId: string; sideId: string; teamMatchId: string; tournamentId: string },
  entries: readonly { userId: string | null; displayNameSnapshot: string; jerseyNumber: number | undefined }[],
): Promise<boolean> {
  const latest = await tx.v1GameLineup.findFirst({
    where: { gameId: target.gameId, sideId: target.sideId, invalidatedAt: null },
    orderBy: { revision: 'desc' },
  });
  if (latest === null || latest.state !== V1GameLineupState.DRAFT) return false;
  if (latest.revision !== 1) {
    const marker = await tx.v1OperationAudit.findFirst({
      where: { requestId: auditRequestId(target.gameId, latest.id), action: TOURNAMENT_ROSTER_SYNC_ACTION },
      select: { id: true },
    });
    if (marker === null) return false;
  }

  const current = await tx.v1GameParticipant.findMany({
    where: { lineupId: latest.id },
    select: { userId: true, displayNameSnapshot: true, jerseyNumber: true },
  });
  if (rosterKey(current) === rosterKey(entries)) return false;

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
    data: entries.map((entry) => ({
      gameId: target.gameId,
      sideId: target.sideId,
      lineupId: lineup.id,
      userId: entry.userId,
      displayNameSnapshot: entry.displayNameSnapshot,
      jerseyNumber: entry.jerseyNumber,
      // 명단 = 출전자(정본 §3). 출전 판정은 이 값을 읽는다.
      started: true,
    })),
    select: { id: true, userId: true },
  });
  const linked = created.flatMap((row) => (row.userId === null ? [] : [{ participantId: row.id, userId: row.userId }]));
  await createSourceRosterIdentityLinks(
    tx,
    linked,
    { actorType: 'SYSTEM', systemActor: TOURNAMENT_ROSTER_SYNC_ACTOR },
    'tournament_roster_sync',
  );
  for (const row of linked) {
    await carryRevokedConsent(tx, row.participantId, carried.get(row.userId));
  }
  await new OperationAuditWriterService().create(tx, {
    actor: { type: 'SYSTEM', id: TOURNAMENT_ROSTER_SYNC_ACTOR },
    requestId: auditRequestId(target.gameId, lineup.id),
    action: TOURNAMENT_ROSTER_SYNC_ACTION,
    targetType: 'GAME',
    targetId: target.gameId,
    tournamentId: target.tournamentId,
    teamMatchId: target.teamMatchId,
    occurredAt: new Date(),
    before: { lineupId: latest.id },
    after: { lineupId: lineup.id, sideId: target.sideId, participantCount: created.length },
  });
  return true;
}
