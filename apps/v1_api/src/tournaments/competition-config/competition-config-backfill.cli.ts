/**
 * Ops entrypoint for the Task 9 competition-config expand/contract backfill.
 *
 * Run once against alpha (and again immediately before the deferred
 * contract-phase migration — see
 * docs/ops/task9-competition-config-contract-phase.md):
 *
 *   pnpm --filter v1_api exec ts-node --transpile-only \
 *     src/tournaments/competition-config/competition-config-backfill.cli.ts
 *
 * Exits non-zero (and prints the offending rows) if any v1_tournaments/
 * v1_team_matches row has an unsupported or missing sport code — that is a
 * genuine data problem the contract-phase migration cannot proceed past
 * either (its SET NOT NULL would fail on the same rows), so this CLI is the
 * intended place to discover it first.
 */
import { PrismaService } from '../../prisma/prisma.service';
import {
  CompetitionConfigSourceUnsupportedError,
  runCompetitionConfigContractPhaseBackfill,
} from './competition-config-backfill';

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const counts = await runCompetitionConfigContractPhaseBackfill(prisma);
    process.stdout.write(`${JSON.stringify({ ok: true, counts }, null, 2)}\n`);
  } catch (error) {
    if (error instanceof CompetitionConfigSourceUnsupportedError) {
      process.stderr.write(`${JSON.stringify({ ok: false, code: 'COMPETITION_CONFIG_SOURCE_UNSUPPORTED', message: error.message }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
