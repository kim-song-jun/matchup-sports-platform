/**
 * Ops entrypoint for the match-conditions structuring backfill.
 *
 * Run once after deploying the
 * 20260809000100_v1_team_match_structured_conditions migration:
 *
 *   pnpm --filter v1_api exec ts-node --transpile-only \
 *     src/team-matches/migration/team-match-conditions-backfill.cli.ts
 *
 * Safe to re-run — only rows still missing all three structured columns are
 * touched (see team-match-conditions-backfill.ts doc comment).
 */
import { PrismaService } from '../../prisma/prisma.service';
import { backfillTeamMatchConditions } from './team-match-conditions-backfill';

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const counts = await backfillTeamMatchConditions(prisma);
    process.stdout.write(`${JSON.stringify({ ok: true, counts }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
