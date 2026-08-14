/**
 * Post-deploy CLI for the team-record-facts backfill (see
 * team-record-facts-backfill.ts for the full design writeup -- why this
 * exists, the idempotency key, and why the calculation itself is reused
 * from GameResultOfficialFactsService rather than reimplemented).
 *
 * Run against a deployed environment as:
 *
 *   DATABASE_URL=<target> pnpm exec ts-node --transpile-only \
 *     src/games/migration/team-record-facts-backfill.cli.ts [--dry-run]
 *
 * `--dry-run` reports what WOULD be projected/quarantined without writing
 * anything. Without it, the backfill actually runs. Exactly one JSON object
 * is printed to stdout per invocation; the process exits non-zero (via an
 * uncaught rejection) on any failure.
 *
 * Mirrors the same migration-logic-lives-in-a-CLI split goal-event-backfill.ts/
 * .cli.ts (and Task 10's game-result-backfill.ts/.cli.ts) already
 * established in this directory.
 */
import { PrismaService } from '../../prisma/prisma.service';
import { runTeamRecordFactsBackfill } from './team-record-facts-backfill';

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
    const result = await runTeamRecordFactsBackfill(prisma, { mode: dryRun ? 'dry-run' : 'apply' });
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
