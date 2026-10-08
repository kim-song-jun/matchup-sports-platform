import type { Prisma, V1CompetitionKind } from '@prisma/client';
import { assertLeagueFixtureGenerationAllowedInTx } from '../../league-matches/league-fixture-generation-guard';

export type LockableCompetition = { id: string; kind: V1CompetitionKind | null };

/**
 * Takes the lock only. Tournaments use the same advisory lock as `createFixture`/`deleteFixture`/group creation;
 * regular leagues use the same competition-row `FOR UPDATE` as the league service. The two locks do not
 * serialize against each other, so lanes must not be mixed. Registration-withdrawal paths that free slots
 * use this variant because they must not be blocked while a league is on hold.
 */
export async function lockCompetitionForSlotReleaseInTx(
  tx: Prisma.TransactionClient,
  competition: LockableCompetition,
): Promise<void> {
  if (competition.kind === 'regular_league') {
    await tx.$queryRaw`SELECT id FROM "v1_tournaments" WHERE id = ${competition.id} FOR UPDATE`;
    return;
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`league-fixture-generation:${competition.id}`}, 0))`;
}

/** Every bracket/slot mutation calls this first. Leagues also reject while on hold, after the lock. */
export async function lockCompetitionForBracketMutationInTx(
  tx: Prisma.TransactionClient,
  competition: LockableCompetition,
): Promise<void> {
  await lockCompetitionForSlotReleaseInTx(tx, competition);
  if (competition.kind === 'regular_league') {
    await assertLeagueFixtureGenerationAllowedInTx(tx, competition.id);
  }
}
