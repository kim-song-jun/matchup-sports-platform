/**
 * D-21 (T1-0) post-deploy CLI for the period-live backfill.
 *
 * Run against a deployed environment (e.g. alpha, right after this branch's
 * deploy) as:
 *
 *   DATABASE_URL=<target> pnpm exec ts-node --transpile-only \
 *     src/games/migration/game-period-live-backfill.cli.ts [--dry-run]
 *
 * `--dry-run` reports how many V1GamePeriod rows WOULD be flipped to LIVE
 * without writing anything. Without it, the backfill actually runs. Exactly
 * one JSON object is printed to stdout per invocation; the process exits
 * non-zero (via an uncaught rejection) on any failure.
 *
 * Fix round 4: this CLI (and game-period-live-backfill.ts, which holds the
 * actual query logic) replaces what used to be a migration.sql UPDATE --
 * see that file's doc comment for why. Mirrors the same
 * migration-logic-lives-in-a-CLI split Task 10 already established
 * (game-result-backfill.ts/.cli.ts in this same directory).
 */
import { PrismaService } from '../../prisma/prisma.service';
import { runGamePeriodLiveBackfill } from './game-period-live-backfill';

function parseArgs(argv: string[]): { dryRun: boolean } {
  const dryRun = argv.includes('--dry-run');
  const unknown = argv.filter((arg) => arg !== '--dry-run');
  if (unknown.length > 0) {
    throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);
  }
  return { dryRun };
}

function emit(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

async function main(): Promise<void> {
  const { dryRun } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaService();
  try {
    const result = await runGamePeriodLiveBackfill(prisma, { dryRun });
    emit({ mode: dryRun ? 'dry-run' : 'apply', ...result });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
