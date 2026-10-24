import { randomUUID } from 'node:crypto';
import { OperationAuditWriterService } from '../../common/audit/operation-audit-writer.service';
import { ConflictException } from '@nestjs/common';
import { Prisma, V1GameResultRevisionState, V1GameState } from '@prisma/client';
import { createSourceRosterIdentityLinks } from '../games.service';
import { carryRevokedConsent, loadRevokedConsentByUserId } from '../../team-matches/lineup-consent-carry';
import { closeRevisionReviewSla } from '../../tournament-operations/results/close-review-sla';
import { loadGameRoster, loadPlayedLineup } from './game-roster-loader';

/** Caller holds the game lock and has verified an active owner/ops admin. */
export async function syncAdminEndedGameRoster(
  tx: Prisma.TransactionClient,
  target: { gameId: string; sideId: string },
  actorUserId: string,
  changes: readonly { userId: string; op: 'EXCLUDE' | 'REVOKE' }[],
): Promise<void> {
  const game = await tx.v1Game.findUniqueOrThrow({ where: { id: target.gameId } });
  if (game.state !== V1GameState.ENDED) return;
  const loaded = await loadGameRoster(tx, target);
  if (loaded === null) throw new ConflictException({ code: 'GAME_ROSTER_NOT_AVAILABLE', message: '경기 명단을 다시 불러와 주세요.' });
  const played = await loadPlayedLineup(tx, loaded.context);
  const snapshots = await tx.v1GameParticipant.findMany({
    where: target, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  const matches = (row: typeof snapshots[number], userId: string) => {
    const entry = loaded.base.find((person) => person.userId === userId);
    return row.userId === userId || (entry?.accountLinked === false && row.userId === null && row.displayNameSnapshot === entry.displayNameSnapshot);
  };
  let participants = snapshots.filter((row) => played?.some((person) => person.id === row.id));
  const attendanceKey = (rows: typeof snapshots) => rows.map((row) => row.userId === null ? `guest:${row.displayNameSnapshot}` : `user:${row.userId}`).sort().join('\n');
  const beforeAttendance = attendanceKey(participants);
  for (const change of changes) {
    participants = participants.filter((row) => !matches(row, change.userId));
    if (change.op === 'REVOKE') {
      const snapshot = snapshots.find((row) => matches(row, change.userId));
      if (snapshot === undefined) throw new ConflictException({ code: 'ROSTER_RESULT_CORRECTION_REQUIRED', message: '경기 기록에 없는 선수예요. 결과 정정에서 출전자를 수정해 주세요.' });
      participants.push(snapshot);
    }
  }
  // Replayed requests may reach here even when a prior adjustment row already exists.
  if (attendanceKey(participants) === beforeAttendance) return;
  const latest = await tx.v1GameResultRevision.findFirst({ where: { gameId: target.gameId }, orderBy: { revision: 'desc' } });
  const base = game.currentOfficialRevisionId === null
    ? latest?.state === V1GameResultRevisionState.SUBMITTED ? latest : null
    : await tx.v1GameResultRevision.findUnique({ where: { id: game.currentOfficialRevisionId } });
  const activeResult = base !== null && (base.state === V1GameResultRevisionState.OFFICIAL || base.state === V1GameResultRevisionState.SUBMITTED) ? base : null;
  if (activeResult === null) {
    const excludedIds = new Set(snapshots.filter((row) => changes.some((change) => change.op === 'EXCLUDE' && matches(row, change.userId))).map((row) => row.id));
    const events = await tx.v1GameEvent.findMany({ where: { gameId: target.gameId }, select: { id: true, participantId: true, assistParticipantId: true, reversesEventId: true } });
    const reversed = new Set(events.flatMap((event) => event.reversesEventId === null ? [] : [event.reversesEventId]));
    if (events.some((event) => event.reversesEventId === null && !reversed.has(event.id) &&
      ((event.participantId !== null && excludedIds.has(event.participantId)) || (event.assistParticipantId !== null && excludedIds.has(event.assistParticipantId))))) {
      throw new ConflictException({ code: 'ROSTER_RESULT_CORRECTION_REQUIRED', message: '경기 기록이 있는 선수예요. 결과 정정에서 기록과 출전자를 함께 수정해 주세요.' });
    }
  }
  if (activeResult !== null) {
    const rows = await tx.v1GameResultParticipant.findMany({ where: { resultRevisionId: activeResult.id } });
    const samePerson = (a: typeof snapshots[number], b: typeof snapshots[number]) =>
      a.userId !== null ? a.userId === b.userId : b.userId === null && a.displayNameSnapshot === b.displayNameSnapshot;
    const retainedIds = new Set(snapshots.filter((row) => participants.some((person) => samePerson(row, person))).map((row) => row.id));
    const removed = rows.filter((row) => row.sideId === target.sideId && !retainedIds.has(row.participantId));
    // Attendance toggles must not silently erase goals, cards, MVP or an edited timeline.
    const timeline = Array.isArray(activeResult.goalEvents) ? activeResult.goalEvents : [];
    if (removed.some((row) => row.goals !== 0 || row.assists !== 0 || row.fouls !== 0 ||
      Object.values((row.cards ?? {}) as Record<string, unknown>).some((count) => typeof count === 'number' && count > 0) ||
      activeResult.mvpParticipantId === row.participantId ||
      timeline.some((event) => event !== null && typeof event === 'object' && !Array.isArray(event) && event.participantId === row.participantId))) {
      throw new ConflictException({ code: 'ROSTER_RESULT_CORRECTION_REQUIRED', message: '개인 기록이 있는 선수예요. 결과 정정에서 기록과 출전자를 함께 수정해 주세요.' });
    }
    const revision = await tx.v1GameResultRevision.create({ data: {
      gameId: target.gameId, revision: (latest?.revision ?? activeResult.revision) + 1,
      state: activeResult.state, supersedesId: activeResult.id,
      score: activeResult.score as Prisma.InputJsonValue,
      goalEvents: activeResult.goalEvents === null ? Prisma.DbNull : activeResult.goalEvents as Prisma.InputJsonValue,
      eventsHash: activeResult.eventsHash, missingScorer: activeResult.missingScorer,
      mvpParticipantId: activeResult.mvpParticipantId, outcomeReason: activeResult.outcomeReason, outcomeNote: activeResult.outcomeNote,
      reason: '어드민 경기별 명단 출전 정정', createdByActorType: 'USER', createdByUserId: actorUserId,
      submittedAt: activeResult.submittedAt ?? new Date(),
      officialAt: activeResult.state === 'OFFICIAL' ? new Date() : null,
    } });
    const kept = rows.filter((row) => row.sideId !== target.sideId || retainedIds.has(row.participantId));
    await tx.v1GameResultParticipant.createMany({ data: [
      ...kept.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => ({ ...row, resultRevisionId: revision.id, cards: row.cards as Prisma.InputJsonValue })),
      ...participants.filter((person) => !kept.some((row) => snapshots.some((snapshot) => snapshot.id === row.participantId && samePerson(snapshot, person)))).map((person) => ({
        resultRevisionId: revision.id, participantId: person.id, sideId: target.sideId, started: true,
        goals: 0, assists: 0, fouls: 0, cards: { yellow: 0, red: 0 }, goalkeeper: person.position === (loaded.context.goalkeeperPositionCode ?? 'GK'),
      })),
    ] });
    if (activeResult.state === 'OFFICIAL') {
      await tx.v1Game.update({ where: { id: target.gameId }, data: { currentOfficialRevisionId: revision.id } });
    }
    if (activeResult.state === 'SUBMITTED') await closeRevisionReviewSla(tx, activeResult.id, 'admin_ended_roster_correction');
    await tx.v1OutboxEvent.create({ data: {
      businessKey: `game:${target.gameId}:revision:${revision.revision}:${activeResult.state === 'OFFICIAL' ? 'officialize' : 'submitted'}`,
      aggregateType: 'GAME', aggregateId: target.gameId, revisionId: revision.id,
      type: activeResult.state === 'OFFICIAL' ? 'GAME_RESULT_OFFICIAL' : 'GAME_RESULT_SUBMITTED', payload: { revisionId: revision.id },
    } });
  }
  if (activeResult?.state !== 'OFFICIAL') {
    const previous = await tx.v1GameLineup.findFirst({ where: { ...target, invalidatedAt: null }, orderBy: { revision: 'desc' } });
    const top = await tx.v1GameLineup.findFirst({ where: target, orderBy: { revision: 'desc' } });
    if (previous === null) throw new ConflictException({ code: 'GAME_ROSTER_NOT_AVAILABLE', message: '기록 명단이 없어요. 결과 정정을 이용해 주세요.' });
    const lineup = await tx.v1GameLineup.create({ data: { ...target, revision: (top?.revision ?? 0) + 1, supersedesId: previous.id, formation: previous.formation, state: 'SUBMITTED', submittedAt: new Date() } });
    const carried = await loadRevokedConsentByUserId(tx, previous.id);
    const created = await tx.v1GameParticipant.createManyAndReturn({ data: participants.map(({ id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...row }) => ({ ...row, lineupId: lineup.id })), select: { id: true, userId: true } });
    const linked = created.flatMap((row) => row.userId === null ? [] : [{ participantId: row.id, userId: row.userId }]);
    await createSourceRosterIdentityLinks(tx, linked, { actorType: 'USER', actorUserId }, 'admin_ended_roster_correction');
    for (const row of linked) await carryRevokedConsent(tx, row.participantId, carried.get(row.userId));
  }
  await tx.v1Game.update({ where: { id: target.gameId }, data: { version: { increment: 1 } } });
  await new OperationAuditWriterService().create(tx, {
    actor: { type: 'PLATFORM_OPS', id: actorUserId }, action: 'ADMIN_ENDED_GAME_ROSTER_CORRECTED',
    requestId: randomUUID(), occurredAt: new Date(), targetType: 'GAME_SIDE', targetId: target.sideId,
    before: { officialRevisionId: game.currentOfficialRevisionId },
    after: { gameId: target.gameId, changes: changes.map((change) => ({ ...change })) },
    reason: '어드민 경기별 명단 출전 정정',
  });
}
