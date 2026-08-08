/**
 * Post-deploy CLI that seeds the game-operation flag invariant rows.
 *
 * See `game-operation-flags-seed.ts` for why this exists (the tournament
 * operations board fails closed with `500 GAME_READ_FLAG_MISSING` on any
 * environment where these rows were never created).
 *
 * Run against a deployed environment right after `prisma migrate deploy`:
 *
 *   DATABASE_URL=<target> pnpm exec ts-node --transpile-only \
 *     src/config/game-operation-flags-seed.cli.ts
 *
 * Idempotent — safe to run on every deploy. It never overwrites a value an
 * operator has changed. Exactly one JSON object is printed to stdout; the
 * process exits non-zero on any failure.
 *
 * Mirrors the migration-logic-lives-in-a-CLI split already established by
 * `games/migration/game-result-backfill.cli.ts` (Task 10),
 * `games/migration/game-period-live-backfill.cli.ts` (D-21) and
 * `tournaments/competition-config/competition-config-backfill.cli.ts` (Task 9).
 */
import { PrismaService } from '../prisma/prisma.service';
import { seedGameOperationFlagDefaults } from './game-operation-flags-seed';

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const counts = await seedGameOperationFlagDefaults(prisma);
    process.stdout.write(`${JSON.stringify({ ok: true, counts })}\n`);
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
