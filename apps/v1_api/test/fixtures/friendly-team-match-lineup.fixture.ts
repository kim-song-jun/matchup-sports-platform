import type { PrismaClient } from '@prisma/client';

/**
 * Task 106 (games.service.ts assertFriendlyTeamMatchLineupsReady,
 * team-match-record.service.ts lineupReadiness) requires every side of a
 * friendly (non-tournament) TEAM_MATCH game to have a current
 * SUBMITTED/LOCKED lineup with at least one participant before a result
 * revision or shared-record mutation is allowed.
 * `createFromSourceInTransaction`/`persistCanonicalGameAggregate` always
 * create the initial per-side lineup in DRAFT (and only when the caller's
 * `participants` array covers that side) — this helper backfills a
 * placeholder participant when needed and (re)creates/flips each side's
 * lineup to SUBMITTED, so fixtures written before Task 106 keep exercising
 * what they originally tested instead of tripping the new 409
 * ROSTER_INCOMPLETE gate.
 */
export async function submitFriendlyTeamMatchLineups(prisma: PrismaClient, gameId: string): Promise<void> {
  const sides = await prisma.v1GameSide.findMany({
    where: { gameId, teamId: { not: null } },
    select: { id: true, sideKey: true },
  });
  for (const side of sides) {
    let lineup = await prisma.v1GameLineup.findFirst({
      where: { gameId, sideId: side.id, invalidatedAt: null },
      orderBy: { revision: 'desc' },
    });
    const existingDraft = lineup?.state === 'DRAFT';
    if (lineup === null) {
      // (gameId, sideId, revision) is unique and invalidated rows still hold
      // their revision, so continue from the max over all of the side's rows.
      const latestAny = await prisma.v1GameLineup.findFirst({
        where: { gameId, sideId: side.id },
        orderBy: { revision: 'desc' },
        select: { revision: true },
      });
      lineup = await prisma.v1GameLineup.create({
        data: {
          gameId,
          sideId: side.id,
          revision: (latestAny?.revision ?? 0) + 1,
          state: 'SUBMITTED',
          submittedAt: new Date(),
        },
      });
    }
    const participantCount = await prisma.v1GameParticipant.count({
      where: { gameId, sideId: side.id, lineupId: lineup.id },
    });
    if (participantCount === 0) {
      await prisma.v1GameParticipant.create({
        data: {
          gameId,
          sideId: side.id,
          lineupId: lineup.id,
          displayNameSnapshot: `Fixture Roster ${side.sideKey}`,
        },
      });
    }
    // Only a DRAFT needs flipping; LOCKED/SUBMITTED already satisfy the gate.
    if (existingDraft) {
      await prisma.v1GameLineup.update({
        where: { id: lineup.id },
        data: { state: 'SUBMITTED', submittedAt: new Date() },
      });
    }
  }
}
