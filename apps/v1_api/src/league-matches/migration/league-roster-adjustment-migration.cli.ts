import { PrismaService } from '../../prisma/prisma.service';
import { migrateLeagueRosterAdjustments } from './league-roster-adjustment-migration';

/** 기본은 dry-run(아무것도 쓰지 않는다). 실제 적용은 `--apply` — alpha 는 dry-run 결과를 사용자에게 보고하고 승인받은 뒤. */
async function main(): Promise<void> {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const result = await migrateLeagueRosterAdjustments(prisma, { apply: process.argv.includes('--apply') });
    process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
