import { PrismaService } from '../../prisma/prisma.service';
import {
  LeagueTeamBackfillBlockedError,
  backfillLeagueTeamsAsRegistrations,
} from './league-team-registration-backfill';

/**
 * **기본이 dry-run 이다 — 쓰려면 `--apply` 를 명시해야 한다.**
 *
 * 리그 시즌 백필 CLI(`league-competition-backfill.cli.ts`)와 같은 계약이다. 이 백필도
 * **행을 새로 만드는 작업**이라, 플래그를 빠뜨렸을 때 향하는 방향이 안전한 쪽이어야 한다.
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
    const result = await backfillLeagueTeamsAsRegistrations(prisma, { dryRun: !apply });
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
  // 그대로 보여 준다(대회 행 없는 리그 / 종류가 리그가 아닌 행 / owner 없는 팀 /
  // 우리 것이 아닌 id 충돌).
  if (error instanceof LeagueTeamBackfillBlockedError) {
    process.stderr.write(`${JSON.stringify({ ok: false, blocked: error.detail }, null, 2)}\n`);
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
