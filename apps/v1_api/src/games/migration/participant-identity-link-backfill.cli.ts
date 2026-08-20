/**
 * Exact-tournament repair for source-created participants whose persisted
 * userId never received the identity event/current-link pair.
 *
 * Dry-run is the default and writes nothing:
 *   pnpm exec ts-node --transpile-only \
 *     src/games/migration/participant-identity-link-backfill.cli.ts \
 *     --tournament-id <uuid>
 *
 * Apply requires an explicit flag:
 *   ... --tournament-id <uuid> --apply
 */
import { PrismaService } from '../../prisma/prisma.service';
import { runParticipantIdentityLinkBackfill } from './participant-identity-link-backfill';

function parseArgs(argv: string[]): { tournamentId: string; apply: boolean } {
  let tournamentId: string | undefined;
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--tournament-id') {
      tournamentId = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  if (!tournamentId) throw new Error('--tournament-id <uuid> is required');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tournamentId)) {
    throw new Error('--tournament-id must be a UUID');
  }
  return { tournamentId, apply };
}

async function main(): Promise<void> {
  const input = parseArgs(process.argv.slice(2));
  const prisma = new PrismaService();
  try {
    const result = await runParticipantIdentityLinkBackfill(prisma, {
      tournamentId: input.tournamentId,
      mode: input.apply ? 'apply' : 'dry-run',
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
