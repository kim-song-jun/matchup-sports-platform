import { ConflictException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { lockGameRows } from '../../games/roster/game-row-lock';
import { updateTournamentMatchInTx } from '../tournament-match-update';
import type { SlotMutationContext } from './tournament-slot.service';

type Side = 'HOME' | 'AWAY';
const changed = () => new ConflictException({ code: 'BYE_SIDE_STALE', message: '대진 연결이 변경됐어요. 새로고침 후 위치를 확인해 주세요.' });

/** The caller holds the competition lock. Exchange the two incoming branches, keeping fixture identities. */
export async function moveByeInTx(tx: Prisma.TransactionClient, ctx: SlotMutationContext, tournamentId: string,
  slotId: string, sourceId: string, from: Side, targetId: string, to: Side, expectedOrigin: string) {
  const slot = await tx.v1TournamentSlot.findFirst({ where: { id: slotId, tournamentId } });
  if (!slot?.groupId || slot.byeSortOrder == null || (sourceId === targetId && from === to)) throw changed();
  const fixtures = await tx.v1TournamentMatchDetails.findMany({ where: { tournamentId, teamMatchId: { in: [sourceId, targetId] },
    teamMatch: { deletedAt: null } }, include: { teamMatch: true } });
  const source = fixtures.find(f => f.teamMatchId === sourceId), target = fixtures.find(f => f.teamMatchId === targetId);
  if (!source?.groupId || source.groupId !== target?.groupId || (from === 'HOME' ? source.teamMatch.homeSlotId : source.teamMatch.awaySlotId) !== slotId) throw changed();
  const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { tournamentId } });
  const edge = edges.find(e => e.targetTeamMatchId === targetId && e.targetSide === to);
  const targetSlotId = to === 'HOME' ? target.teamMatch.homeSlotId : target.teamMatch.awaySlotId;
  const targetSlot = targetSlotId ? await tx.v1TournamentSlot.findUnique({ where: { id: targetSlotId } }) : null;
  if (edges.some(e => e.targetTeamMatchId === sourceId && e.targetSide === from) ||
    (edge ? edge.sourceOutcome !== 'WINNER' || targetSlotId !== null || edge.sourceTeamMatchId !== expectedOrigin :
      targetSlot ? targetSlot.groupId !== slot.groupId || targetSlot.byeSortOrder == null || targetSlot.id !== expectedOrigin : false)) throw changed();
  if (edge && !await tx.v1TournamentMatchDetails.findFirst({ where: { teamMatchId: edge.sourceTeamMatchId, tournamentId, groupId: slot.groupId } })) throw changed();
  const affected = new Set([sourceId, targetId]);
  for (const id of affected) for (const e of edges) if (e.sourceTeamMatchId === id) affected.add(e.targetTeamMatchId);
  const feeders = edges.filter(e => affected.has(e.targetTeamMatchId)).map(e => e.sourceTeamMatchId);
  const games = await tx.v1Game.findMany({ where: { teamMatchId: { in: [...affected, ...feeders] } }, select: { id: true } });
  await lockGameRows(tx, games.map(g => g.id), false);
  const guarded = await tx.v1TeamMatch.findMany({ where: { id: { in: [...affected] } }, include: { game: { include: {
    _count: { select: { events: true } }, resultRevisions: { where: { state: { not: 'VOID' } }, select: { id: true } },
  } } } });
  if (guarded.length !== affected.size || guarded.some(m => m.deletedAt || m.status === 'cancelled' || !m.game ||
    m.game.state !== 'SCHEDULED' || m.game.currentOfficialRevisionId || m.game._count.events || m.game.resultRevisions.length)) {
    throw new ConflictException({ code: 'SLOT_LOCKED', message: '연결된 경기 또는 이후 경기에 기록이 있어 위치를 바꿀 수 없어요.' });
  }
  const current = await tx.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: sourceId } });
  const other = await tx.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: targetId } });
  const reg = from === 'HOME' ? current.homeRegistrationId : current.awayRegistrationId;
  const otherReg = to === 'HOME' ? other.homeRegistrationId : other.awayRegistrationId;
  if ((!targetSlot && !edge && expectedOrigin !== (otherReg ?? targetId)) || reg !== slot.registrationId || (targetSlot && otherReg !== targetSlot.registrationId)) throw changed();
  const peers = await tx.v1TournamentMatchDetails.findMany({ where: { groupId: source.groupId, teamMatch: { deletedAt: null } },
    orderBy: [{ fixtureNumber: 'asc' }, { teamMatchId: 'asc' }], select: { teamMatchId: true } });
  const order = targetSlot?.byeSortOrder ?? (peers.findIndex(f => f.teamMatchId === targetId) * 2 + (to === 'AWAY' ? 1 : 0));
  const groupId = slot.groupId;
  async function updateOrder(id: string, before: number, after: number) {
    const where = { groupId, sortOrder: before };
    const teams = await tx.v1TournamentGroupTeam.updateMany({ where: { ...where, isBye: true }, data: { sortOrder: after } });
    const empty = await tx.v1TournamentByeSlot.updateMany({ where, data: { sortOrder: after } });
    if (teams.count + empty.count !== 1) throw changed();
    await tx.v1TournamentSlot.update({ where: { id }, data: { byeSortOrder: after } });
  }
  if (targetSlot && targetSlot.byeSortOrder != null) await updateOrder(targetSlot.id, targetSlot.byeSortOrder, -1);
  else {
    const occupied = await tx.v1TournamentGroupTeam.count({ where: { groupId: slot.groupId, sortOrder: order, isBye: true } }) +
      await tx.v1TournamentByeSlot.count({ where: { groupId: slot.groupId, sortOrder: order } });
    if (occupied && order !== slot.byeSortOrder) throw changed();
  }
  await updateOrder(slotId, slot.byeSortOrder, order);
  if (targetSlot) await updateOrder(targetSlot.id, -1, slot.byeSortOrder);
  if (edge) await tx.v1TournamentMatchAdvancementEdge.delete({ where: { id: edge.id } });
  const regKey = (s: Side) => s === 'HOME' ? 'homeRegistrationId' : 'awayRegistrationId';
  const slotKey = (s: Side) => s === 'HOME' ? 'homeSlotId' : 'awaySlotId';
  const labelKey = (s: Side) => s === 'HOME' ? 'homeDisplayLabel' : 'awayDisplayLabel';
  if (sourceId === targetId) {
    await updateTournamentMatchInTx(tx, { teamMatchId: sourceId, [regKey(from)]: otherReg, [regKey(to)]: reg });
    await tx.v1TeamMatch.update({ where: { id: sourceId }, data: { [slotKey(from)]: targetSlotId, [slotKey(to)]: slotId } });
    await tx.v1TournamentMatchDetails.update({ where: { teamMatchId: sourceId }, data: {
      [labelKey(from)]: other[labelKey(to)], [labelKey(to)]: current[labelKey(from)],
    } });
  } else {
    await updateTournamentMatchInTx(tx, { teamMatchId: sourceId, [regKey(from)]: otherReg });
    await updateTournamentMatchInTx(tx, { teamMatchId: targetId, [regKey(to)]: reg });
    await tx.v1TeamMatch.update({ where: { id: sourceId }, data: { [slotKey(from)]: targetSlotId } });
    await tx.v1TeamMatch.update({ where: { id: targetId }, data: { [slotKey(to)]: slotId } });
    await tx.v1TournamentMatchDetails.update({ where: { teamMatchId: sourceId }, data: { [labelKey(from)]: other[labelKey(to)] } });
    await tx.v1TournamentMatchDetails.update({ where: { teamMatchId: targetId }, data: { [labelKey(to)]: current[labelKey(from)] } });
  }
  if (edge) await tx.v1TournamentMatchAdvancementEdge.create({ data: { ...edge, targetTeamMatchId: sourceId, targetSide: from } });
  await ctx.adminContext.logAdminAction(ctx.admin, { action: 'tournament.bracket.bye.move', targetType: 'tournament_slot', targetId: slotId,
    beforeJson: { fixtureId: sourceId, side: from }, afterJson: { fixtureId: targetId, side: to, expectedOrigin } }, tx);
  return { affectedTeamMatchIds: [sourceId, targetId], side: to, sortOrder: order };
}
