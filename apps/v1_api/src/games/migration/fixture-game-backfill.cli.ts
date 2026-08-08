/**
 * Post-deploy CLI for the fixture-game backfill (see fixture-game-backfill.ts
 * for the full design writeup — why this exists, what it does and does not
 * create, and why it lives outside prisma/migrations/).
 *
 * Run against a deployed environment (e.g. alpha, right after this branch's
 * deploy) as:
 *
 *   DATABASE_URL=<target> pnpm exec ts-node --transpile-only \
 *     src/games/migration/fixture-game-backfill.cli.ts [--dry-run]
 *
 * `--dry-run` reports what WOULD be created/backfilled without writing
 * anything. Without it, the backfill actually runs. Exactly one JSON object
 * is printed to stdout per invocation; the process exits non-zero (via an
 * uncaught rejection) on any failure.
 *
 * Mirrors the same migration-logic-lives-in-a-CLI split Task 10
 * (game-result-backfill.ts/.cli.ts) and D-21
 * (game-period-live-backfill.ts/.cli.ts) already established in this
 * directory.
 */
import { PrismaService } from '../../prisma/prisma.service';
import { runFixtureGameBackfill } from './fixture-game-backfill';

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
    const result = await runFixtureGameBackfill(prisma, { mode: dryRun ? 'dry-run' : 'apply' });
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
