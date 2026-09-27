import type { PrismaClient } from '@prisma/client';

/**
 * Friendly team-match results require a SUBMITTED/LOCKED latest lineup with at least one
 * participant on every team side (Task 106, ROSTER_INCOMPLETE). Fixture setup only:
 * a DRAFT latest lineup (createFromSourceInTransaction leaves revision 1 DRAFT) is promoted
 * in place, SUBMITTED/LOCKED ones are kept, and a participant is added only when the
 * lineup has none, so seeded participants stay as-is.
 */
export async function submitFriendlyTeamMatchLineups(prisma: PrismaClient, gameId: string) {
  const sides = await prisma.v1GameSide.findMany({ where: { gameId, teamId: { not: null } } });
  for (const side of sides) {
    let lineup = await prisma.v1GameLineup.findFirst({
      where: { gameId, sideId: side.id, invalidatedAt: null },
      orderBy: { revision: 'desc' },
    });
    if (lineup === null) {
      lineup = await prisma.v1GameLineup.create({
        data: { gameId, sideId: side.id, revision: 1, state: 'SUBMITTED', submittedAt: new Date() },
      });
    } else if (lineup.state === 'DRAFT') {
      lineup = await prisma.v1GameLineup.update({
        where: { id: lineup.id },
        data: { state: 'SUBMITTED', submittedAt: new Date() },
      });
    }
    if ((await prisma.v1GameParticipant.count({ where: { lineupId: lineup.id } })) === 0) {
      await prisma.v1GameParticipant.create({
        data: {
          gameId,
          sideId: side.id,
          lineupId: lineup.id,
          displayNameSnapshot: `${side.displayNameSnapshot} 선수`,
        },
      });
    }
  }
}
