import type { Prisma } from '@prisma/client';

/** Snapshot of every bracket row a reset can clear; shared by both reset entry points. */
export async function captureBracketResetState(tx: Prisma.TransactionClient, id: string) {
  const fixtures = await tx.v1TournamentMatchDetails.findMany({ where: { tournamentId: id, teamMatch: { deletedAt: null } },
    orderBy: { teamMatchId: 'asc' }, include: { teamMatch: { select: { updatedAt: true, status: true, startAt: true,
      game: { select: { version: true, state: true, currentOfficialRevisionId: true } } } } } });
  const groups = await tx.v1TournamentGroup.findMany({ where: { tournamentId: id }, orderBy: { id: 'asc' } });
  const slots = await tx.v1TournamentSlot.findMany({ where: { tournamentId: id }, orderBy: { id: 'asc' } });
  const groupTeams = await tx.v1TournamentGroupTeam.findMany({ where: { group: { tournamentId: id } }, orderBy: { id: 'asc' } });
  const standings = await tx.v1TournamentStanding.findMany({ where: { group: { tournamentId: id } }, orderBy: { id: 'asc' } });
  const byes = await tx.v1TournamentByeSlot.findMany({ where: { group: { tournamentId: id } }, orderBy: { id: 'asc' } });
  const overallStandings = await tx.v1TournamentOverallStanding.findMany({ where: { tournamentId: id }, orderBy: { id: 'asc' } });
  const edges = await tx.v1TournamentMatchAdvancementEdge.findMany({ where: { tournamentId: id }, orderBy: { id: 'asc' },
    select: { id: true, sourceTeamMatchId: true, targetTeamMatchId: true, sourceOutcome: true, targetSide: true } });
  return { fixtures, groups, slots, groupTeams, edges, standings, byes, overallStandings };
}
