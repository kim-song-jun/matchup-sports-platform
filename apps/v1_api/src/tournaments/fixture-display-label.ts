import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AdminContextService, V1ActiveAdmin } from '../common/admin-context.service';

type Labels = { homeDisplayLabel?: string | null; awayDisplayLabel?: string | null };
/** Same competition lock as fixture/slot edits. BYE text belongs to its slot, never a second copy on the quarter-final. */
export async function updateFixtureDisplayLabelsInTx(tx: Prisma.TransactionClient, adminContext: AdminContextService,
  admin: V1ActiveAdmin, fixtureId: string, input: Labels) {
  await tx.$queryRaw`SELECT id FROM v1_games WHERE team_match_id = ${fixtureId} FOR UPDATE`;
  await tx.$queryRaw`SELECT team_match_id FROM v1_tournament_match_details WHERE team_match_id = ${fixtureId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM v1_team_matches WHERE id = ${fixtureId} FOR UPDATE`;
  const current = await tx.v1TournamentMatchDetails.findUniqueOrThrow({ where: { teamMatchId: fixtureId }, include: {
    teamMatch: { select: { deletedAt: true, homeSlot: { select: { id: true, kind: true, displayLabel: true } }, awaySlot: { select: { id: true, kind: true, displayLabel: true } } } },
  } });
  if (current.teamMatch.deletedAt !== null) throw new NotFoundException({ code: 'FIXTURE_NOT_FOUND', message: '경기를 찾을 수 없어요.' });
  const before = {
    homeDisplayLabel: current.teamMatch.homeSlot?.kind === 'BYE' ? current.teamMatch.homeSlot.displayLabel : current.homeDisplayLabel,
    awayDisplayLabel: current.teamMatch.awaySlot?.kind === 'BYE' ? current.teamMatch.awaySlot.displayLabel : current.awayDisplayLabel,
  };
  const after = { ...before };
  for (const [key, slot] of [['homeDisplayLabel', current.teamMatch.homeSlot], ['awayDisplayLabel', current.teamMatch.awaySlot]] as const) {
    if (input[key] === undefined) continue;
    const value = input[key]?.trim() || null;
    if (value === before[key]) continue;
    if (slot?.kind === 'BYE') await tx.v1TournamentSlot.update({ where: { id: slot.id }, data: { displayLabel: value } });
    else await tx.v1TournamentMatchDetails.update({ where: { teamMatchId: fixtureId }, data: { [key]: value } });
    after[key] = value;
  }
  if (before.homeDisplayLabel !== after.homeDisplayLabel || before.awayDisplayLabel !== after.awayDisplayLabel) {
    await adminContext.logAdminAction(admin, { action: 'tournament.bracket.fixture.display_labels', targetType: 'team_match', targetId: fixtureId,
      beforeJson: before, afterJson: after }, tx);
  }
  return after;
}
