import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { lockGameRows } from '../../games/roster/game-row-lock';
import { updateTournamentMatchInTx } from '../tournament-match-update';
import type { SlotMutationContext } from './tournament-slot.service';

type Side = 'HOME' | 'AWAY';
const invalid = () => new ConflictException({ code: 'BYE_SIDE_INVALID', message: '12강 부전승과 승자가 연결된 8강 경기에서만 위치를 바꿀 수 있어요.' });

/** Caller holds the competition lock. Move the slot, registrations and incoming
 * edge atomically; the source fixture and every outgoing edge keep their IDs. */
export async function setByeSideInTx(tx: Prisma.TransactionClient, ctx: SlotMutationContext,
  tournamentId: string, slotId: string, side: Side, expectedSide: Side) {
  const slot = await tx.v1TournamentSlot.findUnique({ where: { id: slotId }, include: { group: true } });
  if (!slot) throw new NotFoundException({ code: 'SLOT_NOT_FOUND', message: '자리를 찾을 수 없어요.' });
  if (slot.tournamentId !== tournamentId || slot.kind !== 'BYE' || slot.group?.phase !== 'round12' || slot.byeSortOrder === null) throw invalid();
  const matches = await tx.v1TeamMatch.findMany({ where: { deletedAt: null, OR: [{ homeSlotId: slotId }, { awaySlotId: slotId }] },
    include: { tournamentDetails: { include: { group: { select: { phase: true } } } } } });
  if (matches.length !== 1) throw invalid();
  const match = matches[0];
  const detail = match.tournamentDetails;
  if (!detail || detail.tournamentId !== tournamentId || detail.group?.phase !== 'quarter' || match.status === 'cancelled') throw invalid();
  const current: Side = match.homeSlotId === slotId ? 'HOME' : 'AWAY';
  const opposite: Side = current === 'HOME' ? 'AWAY' : 'HOME';
  if ((current === 'HOME' ? match.awaySlotId : match.homeSlotId) !== null) throw invalid();
  const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { tournamentId } });
  const incoming = edges.filter((edge) => edge.targetTeamMatchId === match.id);
  if (incoming.length !== 1 || incoming[0].targetSide !== opposite || incoming[0].sourceOutcome !== 'WINNER') throw invalid();
  const source = await tx.v1TournamentMatchDetails.findUnique({ where: { teamMatchId: incoming[0].sourceTeamMatchId } });
  if (source?.groupId !== slot.groupId) throw invalid();
  if (current === side) return { affectedTeamMatchIds: [match.id], side, sortOrder: slot.byeSortOrder };
  if (current !== expectedSide) throw new ConflictException({ code: 'BYE_SIDE_STALE', message: '부전승 위치가 바뀌었어요. 새로고침 후 다시 확인해 주세요.' });

  const affected = new Set([match.id]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const edge of edges) if (affected.has(edge.sourceTeamMatchId) && !affected.has(edge.targetTeamMatchId)) {
      affected.add(edge.targetTeamMatchId); expanded = true;
    }
  }
  // Lock source as well: a simultaneous result projection must see either the
  // whole old assignment or the whole new assignment.
  const lockIds = [...affected, source.teamMatchId];
  const games = await tx.v1Game.findMany({ where: { teamMatchId: { in: lockIds } }, select: { id: true } });
  await lockGameRows(tx, games.map((game) => game.id), false);
  const guarded = await tx.v1TeamMatch.findMany({ where: { id: { in: [...affected] } }, include: {
    game: { include: { _count: { select: { events: true } }, resultRevisions: { where: { state: { not: 'VOID' } }, select: { id: true } } } },
  } });
  if (guarded.length !== affected.size || guarded.some((row) => row.deletedAt !== null || row.status === 'cancelled' || !row.game ||
    row.game.state !== 'SCHEDULED' || row.game.currentOfficialRevisionId !== null || row.game._count.events > 0 || row.game.resultRevisions.length > 0)) {
    throw new ConflictException({ code: 'SLOT_LOCKED', message: '8강 또는 이후 경기에 시작·결과·기록이 있어 위치를 바꿀 수 없어요.' });
  }
  // Read assignments again under the game lock: the 12강 winner may just have arrived.
  const fresh = await tx.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: match.id } });
  const byeRegistration = current === 'HOME' ? fresh.homeRegistrationId : fresh.awayRegistrationId;
  if (byeRegistration !== slot.registrationId) throw invalid();
  const sortOrder = Math.floor(slot.byeSortOrder / 2) * 2 + (side === 'AWAY' ? 1 : 0);
  const occupied = await tx.v1TournamentGroupTeam.findFirst({ where: { groupId: slot.groupId!, isBye: true, sortOrder } });
  const occupiedEmpty = await tx.v1TournamentByeSlot.findUnique({ where: { groupId_sortOrder: { groupId: slot.groupId!, sortOrder } } });
  if (occupied || occupiedEmpty) throw new ConflictException({ code: 'BYE_POSITION_OCCUPIED', message: '이 위치에 다른 부전승이 있어요.' });

  await tx.v1TournamentMatchAdvancementEdge.delete({ where: { id: incoming[0].id } });
  await updateTournamentMatchInTx(tx, { teamMatchId: match.id,
    homeRegistrationId: fresh.awayRegistrationId, awayRegistrationId: fresh.homeRegistrationId });
  await tx.v1TeamMatch.update({ where: { id: match.id }, data: { homeSlotId: match.awaySlotId, awaySlotId: match.homeSlotId } });
  await tx.v1TournamentMatchAdvancementEdge.create({ data: { ...incoming[0], targetSide: current } });
  const rows = await tx.v1TournamentGroupTeam.updateMany({ where: { groupId: slot.groupId!, isBye: true, sortOrder: slot.byeSortOrder }, data: { sortOrder } });
  const emptyRows = await tx.v1TournamentByeSlot.updateMany({ where: { groupId: slot.groupId!, sortOrder: slot.byeSortOrder }, data: { sortOrder } });
  if (rows.count + emptyRows.count !== 1) throw invalid();
  await tx.v1TournamentSlot.update({ where: { id: slotId }, data: { byeSortOrder: sortOrder } });
  await ctx.adminContext.logAdminAction(ctx.admin, { action: 'tournament.bracket.bye.side', targetType: 'tournament_slot', targetId: slotId,
    beforeJson: { side: current, sortOrder: slot.byeSortOrder }, afterJson: { side, sortOrder, fixtureId: match.id, sourceFixtureId: source.teamMatchId } }, tx);
  return { affectedTeamMatchIds: [match.id], side, sortOrder };
}
