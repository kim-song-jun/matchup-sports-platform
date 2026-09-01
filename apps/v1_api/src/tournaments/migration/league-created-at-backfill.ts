import { PrismaClient } from '@prisma/client';

/**
 * **리그 거울의 `createdAt` 을 원본 리그 값으로 되돌리는 백필.**
 *
 * ## 무엇이 잘못됐나
 * `leagueMirrorCreateData` 가 `createdAt` 을 안 옮겨서, 거울 행에 `@default(now())` 가 남았다
 * — 즉 **백필/시드를 실행한 시각**이 박혔다. 그 값은 아무 뜻도 없는데 **목록 정렬을 지배한다**:
 *
 * ```
 * orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
 * ```
 *
 * 2026-09-01 alpha 실측:
 * ```
 * 리그 50건   createdAt 전부 2026-08-30T18:43:43   ← 한 번에 백필된 시각
 * 대회        createdAt 2026-08-18                 ← 12일 전
 * → ?kind=all 첫 50건이 **전부 리그**. 통합 목록 첫 화면에 대회가 하나도 없다.
 * ```
 * 화면엔 에러가 없다. *"대회가 없네"* 로만 보인다.
 *
 * `V1League` 에도 `@@index([createdAt desc, id desc])` 가 있어 **리그 목록도 같은 축으로
 * 정렬한다** — 원본 시각을 옮기면 두 목록의 순서가 일치한다. 새 동작을 만드는 게 아니라
 * **원래 그래야 했던 상태로 돌리는 것**이다.
 *
 * ## 앞선 백필들과 가드 설계가 다르다 — **덮어쓰는 것이 목적이다**
 * `league-competition-detail-backfill` 은 *"목표와 다른 값이 있으면 막는다"* 였다. 여기서는
 * **모든 행이 목표와 다른 값(생성 시각)을 갖고 있고, 그걸 바꾸는 것이 이 백필의 목적**이라
 * 같은 가드를 쓰면 전부 막힌다.
 *
 * 대신 되돌릴 수 있게 만든다:
 * ```
 * dry-run 이 changes[] 에 { leagueId, from, to } 를 **전부** 싣는다
 *   → --apply 전에 그 출력을 보관하면 되돌릴 수 있다 (from 값으로 되쓰면 된다)
 * ```
 * **덮어쓰기 전에 원래 값을 밖으로 내보내는 것**이 여기서의 안전장치다.
 *
 * ## 그리고 이 백필은 **멱등**이다 — 되돌리기보다 이쪽이 중요하다
 * 목표값(`V1League.createdAt`)은 이 백필이 건드리지 않으므로 **불변**이다. 두 번 돌려도 같은
 * 상태로 수렴하고, 이미 같은 행은 건너뛴다(쓰지 않는다). 그래서 *"중간에 실패하면 어떻게
 * 되나"* 가 위험이 아니라 **다시 돌리면 되는** 문제다.
 *
 * `changes[]` 를 보관하는 이유는 그래서 복구가 아니라 **감사**다 — *"무엇이 무엇으로 바뀌었나"*
 * 를 나중에 물을 수 있어야 한다. 옛 값은 **행을 만든 시각**이라 되살릴 이유가 없다.
 *
 * ## 대회 행은 건드리지 않는다
 * `where` 에 `kind: 'regular_league'` 를 넣어 **쓰기 시점에** 강제한다. 읽을 때 걸러도
 * 읽기~쓰기 사이에 종류가 바뀔 수 있고, 그때 대회 행의 생성 시각을 바꾸면 그 대회가
 * 목록에서 엉뚱한 자리로 간다.
 */

export interface LeagueCreatedAtBackfillResult {
  scanned: number;
  /** 이미 원본과 같아 건드릴 필요가 없던 행. 새로 만들어진 거울(수정된 헬퍼 경유)이 여기 온다. */
  skipped: number;
  /** `kind='regular_league'` 대회 행 수. **리그 수와 같아야 한다** — 불변식의 관측값이다. */
  mirrorCount: number;
  /**
   * **고칠 계획인 행 수.** dry-run 에서 `updated` 는 항상 0 이라 이 값이 없으면
   * "몇 건이 바뀌는가" 를 알 수 없다 — 승인을 요청할 때 필요한 바로 그 숫자다.
   */
  planned: number;
  updated: number;
  dryRun: boolean;
  /**
   * **되돌리기용 원본 값.** 덮어쓸 행 전부의 `{ leagueId, from, to }` 를 싣는다.
   *
   * 이 백필은 값을 지우므로(생성 시각 → 원본 시각) `--apply` 후에는 `from` 을 DB 에서
   * 다시 얻을 수 없다. **dry-run 출력을 보관하는 것이 유일한 되돌리기 경로**다.
   */
  changes: Array<{ leagueId: string; from: string; to: string }>;
}

export class LeagueCreatedAtBackfillBlockedError extends Error {
  constructor(
    message: string,
    readonly detail: {
      /** 거울 행이 없는 리그 — **리그 시즌 백필을 먼저 돌려야 한다.** */
      missingTournaments: Array<{ leagueId: string }>;
      /** 같은 id 인데 종류가 리그가 아닌 행 — **우리 리그가 아니다.** 멈추고 조사해라. */
      kindMismatches: Array<{ leagueId: string; kind: string | null }>;
    },
  ) {
    super(message);
    this.name = 'LeagueCreatedAtBackfillBlockedError';
  }
}

export async function backfillLeagueCreatedAt(
  prisma: PrismaClient,
  options: { dryRun: boolean },
): Promise<LeagueCreatedAtBackfillResult> {
  const leagues = await prisma.v1League.findMany({
    select: { id: true, createdAt: true },
    orderBy: { id: 'asc' },
  });

  // ── 가드: 거울이 없는 리그 / 종류가 리그가 아닌 행 ────────────────────────────
  // **두 통으로 나눈다** — 조치가 다르기 때문이다(앞선 백필에서 합쳤다가 지적받았다).
  const tournaments = await prisma.v1Tournament.findMany({
    where: { id: { in: leagues.map((row) => row.id) } },
    select: { id: true, kind: true, createdAt: true },
  });
  const byId = new Map(tournaments.map((row) => [row.id, row]));
  const missingTournaments = leagues
    .filter((league) => !byId.has(league.id))
    .map((league) => ({ leagueId: league.id }));
  const kindMismatches = leagues
    .filter((league) => byId.has(league.id) && byId.get(league.id)?.kind !== 'regular_league')
    .map((league) => ({ leagueId: league.id, kind: byId.get(league.id)?.kind ?? null }));

  if (missingTournaments.length > 0 || kindMismatches.length > 0) {
    throw new LeagueCreatedAtBackfillBlockedError(
      '백필을 중단했다 — 거울 행이 없는 리그, 또는 같은 id 인데 종류가 리그가 아닌 행이 있다. ' +
        '전자는 리그 시즌 백필을 먼저 돌려라. 후자는 그 id 가 우리 리그가 아니므로 조사해라.',
      { missingTournaments, kindMismatches },
    );
  }

  // 이미 원본과 같은 행은 건드리지 않는다 — 고친 헬퍼로 새로 만들어진 거울이 여기 온다.
  const toUpdate = leagues.filter((league) => {
    const mirror = byId.get(league.id);
    return mirror !== undefined && mirror.createdAt.getTime() !== league.createdAt.getTime();
  });

  const changes = toUpdate.map((league) => ({
    leagueId: league.id,
    // `from` 은 **덮어쓰면 사라지는 값**이다. 되돌리려면 이 출력이 유일한 근거다.
    from: (byId.get(league.id) as { createdAt: Date }).createdAt.toISOString(),
    to: league.createdAt.toISOString(),
  }));

  let updated = 0;
  let mirrorCount = 0;

  if (!options.dryRun && toUpdate.length > 0) {
    // **interactive 트랜잭션이어야 한다.** `$transaction([...])` 는 결과를 돌려주기 전에
    // 커밋해서, 뒤에서 개수를 세고 throw 하면 **이미 커밋된 부분 적용이 남고 종료 코드만
    // 실패**가 된다. 사용자 승인을 받아 alpha 에 돌리는 쓰기이므로 전부 되거나 전부 안
    // 되거나여야 한다 — "실패했다는데 87 행은 들어갔다" 는 승인자가 판단할 수 없는 상태다.
    await prisma.$transaction(async (tx) => {
      for (const league of toUpdate) {
        // **`observed?.` 를 쓰지 않는다** — Prisma 의 `where` 는 값이 `undefined` 면 그
        // 조건을 통째로 버린다. optional chaining 이면 가드가 조용히 사라진다.
        const observed = byId.get(league.id);
        if (observed === undefined) {
          throw new Error(
            `거울을 읽지 못했다: ${league.id}. 위 가드를 통과했는데 여기서 없다면 그 가드가 무력해진 것이다.`,
          );
        }
        const result = await tx.v1Tournament.updateMany({
          where: {
            id: league.id,
            // 대회 행을 건드리지 않는다 — **쓰기 시점에** 강제한다.
            kind: 'regular_league',
            // 낙관적 동시성: 내가 읽은 그 값일 때만 쓴다. 읽기~쓰기 사이에 누가 바꿨으면
            // 0행이 되고 아래 합계 단언이 걸린다.
            createdAt: observed.createdAt,
          },
          // `updatedAt` 은 건드리지 않는다 — `@updatedAt` 이라 Prisma 가 자동으로 쓴다.
          // 백필이 그걸 바꾸는 것은 정상이고 막을 수도 없다.
          data: { createdAt: league.createdAt },
        });
        updated += result.count;
      }
      if (updated !== toUpdate.length) {
        throw new Error(
          `백필이 고친 행 수가 계획과 다르다: 계획 ${toUpdate.length} · 실제 ${updated}`,
        );
      }

      // ── 불변식: 리그 수 == 거울 수 ────────────────────────────────────────────
      // **트랜잭션 안이어야 한다** — 밖에 두면 쓰기는 커밋되고 종료 코드만 실패가 된다.
      mirrorCount = await tx.v1Tournament.count({ where: { kind: 'regular_league' } });
      if (mirrorCount !== leagues.length) {
        throw new Error(
          `거울 수가 리그 수와 다르다: 리그 ${leagues.length} · 거울 ${mirrorCount}. ` +
            'dual-write 가 빠진 쓰기 자리가 있는지 확인해라.',
        );
      }
    });
  } else {
    // 여기 오는 길이 **둘**이다: ① dry-run ② `--apply` 인데 고칠 게 없다.
    // ②는 `--apply` 를 한 번 돌린 뒤 확인차 다시 돌릴 때 오는 길이다.
    mirrorCount = await prisma.v1Tournament.count({ where: { kind: 'regular_league' } });
  }

  // 불변식은 **쓰기 여부와 무관하게** `--apply` 면 항상 센다 — 위 트랜잭션 안에만 두면
  // `--apply` + 고칠 것 없음 경로에서 통째로 건너뛴다. 그런데 그 경우가 바로 **"다
  // 들어갔나" 를 확인하려고 재실행하는 순간**이다.
  if (!options.dryRun && mirrorCount !== leagues.length) {
    throw new Error(
      `거울 수가 리그 수와 다르다: 리그 ${leagues.length} · 거울 ${mirrorCount}. ` +
        'dual-write 가 빠진 쓰기 자리가 있는지 확인해라.',
    );
  }

  return {
    scanned: leagues.length,
    skipped: leagues.length - toUpdate.length,
    planned: toUpdate.length,
    updated,
    mirrorCount,
    dryRun: options.dryRun,
    changes,
  };
}
