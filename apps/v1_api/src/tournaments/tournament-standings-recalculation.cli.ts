/**
 * Post-deploy CLI that recalculates `V1TournamentStanding` rows for every
 * deletedAt-null tournament from its actual fixture results, using the same
 * `recalculateAndUpsertGroupStandings()` path as the admin "순위 재계산"
 * route (`TournamentBracketService.recalculateStandings()`) and the
 * automatic per-result trigger (`GameResultStandingsProjectionService`).
 * See `tournament-standings-recalculation.ts` for the full design writeup.
 *
 * Run against a deployed environment right after `fixture-game-backfill`
 * (must run after it — this recalculation reads
 * `V1Game.currentOfficialRevision`, which `fixture-game-backfill` is what
 * creates):
 *
 *   DATABASE_URL=<target> pnpm exec ts-node --transpile-only \
 *     src/tournaments/tournament-standings-recalculation.cli.ts
 *
 * Idempotent and overwrite-with-truth — safe to run on every deploy. A
 * tournament with a missing/invalid competition config is quarantined (logged,
 * skipped) rather than failing the whole run; any other error is a real bug
 * and aborts the CLI (exit 1). No `--dry-run` — see the design writeup for
 * why a preview doesn't add safety here (deterministic recompute from
 * already-committed results, not a new/irreversible write like
 * fixture-game-backfill's).
 *
 * Mirrors the migration-logic-lives-in-a-CLI split already established by
 * `games/migration/fixture-game-backfill.cli.ts` and
 * `config/game-operation-flags-seed.cli.ts`.
 */
import { PrismaService } from '../prisma/prisma.service';
import { runTournamentStandingsRecalculation } from './tournament-standings-recalculation';

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const result = await runTournamentStandingsRecalculation(prisma);
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
