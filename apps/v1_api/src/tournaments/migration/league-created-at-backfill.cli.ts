import { PrismaService } from '../../prisma/prisma.service';
import {
  LeagueCreatedAtBackfillBlockedError,
  backfillLeagueCreatedAt,
} from './league-created-at-backfill';

/**
 * **기본이 dry-run 이다 — 쓰려면 `--apply` 를 명시해야 한다.**
 *
 * 앞선 백필 CLI 들과 같은 계약이고, 이 백필은 그중에서도 **되돌리기가 가장 어렵다**:
 * ```
 * INSERT 백필   되돌리기 = DELETE
 * UPDATE 백필   덮어쓴 값이 사라진다 — 다만 앞선 것은 "다른 값이면 막는" 가드가 있었다
 * 이 백필        **덮어쓰는 것이 목적**이라 그 가드를 쓸 수 없다
 * ```
 * 그래서 `--apply` 전에 **dry-run 출력을 반드시 보관해야 한다** — `changes[].from` 이
 * 덮어쓸 원래 값이고, 그 출력이 유일한 되돌리기 근거다. 아래에서 그 사실을 매번 찍는다.
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
    const result = await backfillLeagueCreatedAt(prisma, { dryRun: !apply });
    process.stdout.write(`${JSON.stringify({ ok: true, result }, null, 2)}\n`);
    if (!apply) {
      process.stdout.write(
        'dry-run 이었다. 실제로 쓰려면 --apply 를 붙여라.\n' +
          '⚠️ 이 출력의 changes[].from 이 덮어쓸 원래 값이다 — **--apply 전에 저장해라.** ' +
          '적용 후에는 DB 에서 다시 얻을 수 없다.\n',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  // 가드에 걸린 것은 "실패"가 아니라 **사람이 판단할 거리**다 — 무엇에 걸렸는지 그대로 보여 준다.
  if (error instanceof LeagueCreatedAtBackfillBlockedError) {
    process.stderr.write(`${JSON.stringify({ ok: false, blocked: error.detail }, null, 2)}\n`);
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
