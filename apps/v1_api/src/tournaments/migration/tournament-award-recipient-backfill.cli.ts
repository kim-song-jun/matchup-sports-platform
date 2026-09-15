import { PrismaService } from '../../prisma/prisma.service';
import { backfillTournamentAwardRecipients } from './tournament-award-recipient-backfill';

async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const result = await backfillTournamentAwardRecipients(prisma, {
      dryRun: process.argv.includes('--dry-run'),
    });
    process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
