import { PrismaService } from '../../prisma/prisma.service';
import {
  LeagueDetailBackfillBlockedError,
  backfillLeagueCompetitionDetails,
} from './league-competition-detail-backfill';

/**
 * **기본이 dry-run 이다 — 쓰려면 `--apply` 를 명시해야 한다.**
 *
 * 리그 시즌 백필 CLI(`league-competition-backfill.cli.ts`)와 같은 계약이다. 다만 이 백필은
 * **기존 행을 고치는(UPDATE) 작업**이라 앞선 둘보다 기본값이 더 중요하다: INSERT 는
 * 되돌리기가 DELETE 지만, **덮어쓴 값은 되돌릴 곳이 없다.** 그래서 플래그를 빠뜨렸을 때
 * 향하는 방향이 반드시 안전한 쪽이어야 하고, 값이 이미 있는 행은 가드가 아예 막는다.
 *
 * `--dry-run` 도 그대로 받되 **둘을 함께 주면 멈춘다** — 한쪽을 조용히 우선하면 사용자가
 * 표현한 모순된 의도를 코드가 대신 결정하는 것이고, 그 방향이 "쓴다" 쪽이면 안전 설계가
 * 통째로 무의미해진다.
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const explicitDryRun = process.argv.includes('--dry-run');
  if (apply && explicitDryRun) {
    throw new Error('--apply 와 --dry-run 을 함께 줄 수 없다. 하나만 골라라.');
  }
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const result = await backfillLeagueCompetitionDetails(prisma, { dryRun: !apply });
    process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`);
    if (!apply) {
      process.stdout.write('dry-run 이었다. 실제로 쓰려면 --apply 를 붙여라.\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // 가드에 걸린 것은 "실패"가 아니라 **사람이 판단할 거리**다 — 무엇에 걸렸는지를
  // 그대로 보여 준다(대회 행 없는 리그·종류 불일치 / 이미 값이 채워진 행).
  if (error instanceof LeagueDetailBackfillBlockedError) {
    process.stderr.write(`${JSON.stringify({ ok: false, blocked: error.detail }, null, 2)}\n`);
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
