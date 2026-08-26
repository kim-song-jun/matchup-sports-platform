import type { PrismaClient } from '@prisma/client';

export type TournamentAwardRecipientBackfillResult = {
  candidates: number;
  linkable: number;
  ambiguous: number;
  updated: number;
  dryRun: boolean;
};

/**
 * Links historical name-only tournament awards to an account only when the
 * confirmed roster produces one distinct user. It never guesses between
 * duplicate names and is idempotent because already-linked awards are not
 * candidates.
 */
export async function backfillTournamentAwardRecipients(
  prisma: PrismaClient,
  options: { dryRun?: boolean } = {},
): Promise<TournamentAwardRecipientBackfillResult> {
  const dryRun = options.dryRun ?? false;
  const awards = await prisma.v1TournamentAward.findMany({
    where: { recipientUserId: null },
    select: {
      id: true,
      recipientName: true,
      teamName: true,
      tournament: {
        select: {
          registrations: {
            where: { status: 'confirmed' },
            select: {
              team: { select: { name: true } },
              players: {
                where: { removedAt: null },
                select: { userId: true, realName: true },
              },
            },
          },
        },
      },
    },
  });

  let linkable = 0;
  let ambiguous = 0;
  let updated = 0;
  for (const award of awards) {
    const recipientName = award.recipientName.trim();
    const teamName = award.teamName?.trim() || null;
    const matchedUsers = new Set<string>();
    for (const registration of award.tournament.registrations) {
      if (teamName !== null && registration.team.name.trim() !== teamName) continue;
      for (const player of registration.players) {
        if (player.realName.trim() === recipientName) matchedUsers.add(player.userId);
      }
    }

    if (matchedUsers.size !== 1) {
      ambiguous += 1;
      continue;
    }
    const recipientUserId = matchedUsers.values().next().value;
    if (recipientUserId === undefined) {
      ambiguous += 1;
      continue;
    }
    linkable += 1;
    if (dryRun) continue;

    const result = await prisma.v1TournamentAward.updateMany({
      where: { id: award.id, recipientUserId: null },
      data: { recipientUserId },
    });
    updated += result.count;
  }

  return { candidates: awards.length, linkable, ambiguous, updated, dryRun };
}
