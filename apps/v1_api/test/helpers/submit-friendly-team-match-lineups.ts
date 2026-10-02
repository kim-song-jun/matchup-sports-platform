import type { PrismaClient } from '@prisma/client';

/**
 * Friendly team-match results require, on every team side, a SUBMITTED/LOCKED lineup with at
 * least one participant (Task 106, ROSTER_INCOMPLETE). The result and live-event gates read each
 * side's latest valid revision, so a newer DRAFT correctly makes the roster incomplete. Fixture setup only:
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
      // Copilot review finding (PR #1315): `(gameId, sideId, revision)` is unique, so a
      // hardcoded `revision: 1` collides whenever the side's only lineup rows are invalidated
      // (revision 1 exists but invalidatedAt is set, so the query above returns null). Continue
      // from the side's true max revision -- invalidated rows included -- instead.
      const latestAny = await prisma.v1GameLineup.findFirst({
        where: { gameId, sideId: side.id },
        orderBy: { revision: 'desc' },
        select: { revision: true },
      });
      lineup = await prisma.v1GameLineup.create({
        data: { gameId, sideId: side.id, revision: (latestAny?.revision ?? 0) + 1, state: 'SUBMITTED', submittedAt: new Date() },
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
