import { PrismaService } from '../../prisma/prisma.service';
import { repairQueensCupRanking } from './queens-cup-ranking-repair';

async function main() {
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    process.stdout.write(`${JSON.stringify({ ok: true, ...await repairQueensCupRanking(prisma) })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
