import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  backfillLeagueCreatedAt,
  LeagueCreatedAtBackfillBlockedError,
} from './league-created-at-backfill';

type Row = Record<string, unknown>;

const ORIGIN = new Date('2026-02-01T09:30:00.000Z');
const BACKFILL_STAMP = new Date('2026-08-30T18:43:43.000Z');

function league(overrides: Row = {}) {
  return { id: 'lg-1', createdAt: ORIGIN, ...overrides };
}

function mirror(overrides: Row = {}) {
  return { id: 'lg-1', kind: 'regular_league', createdAt: BACKFILL_STAMP, ...overrides };
}

/**
 * `updateMany` 의 `where` 를 **실제로 적용**하는 fake — 앞선 백필 스펙과 같은 패턴이다.
 *
 * 고정 `{ count: 1 }` 을 돌려주면 *"가드 조건을 where 에서 빼는"* 변이가 red 가 되지 않는다.
 * `Date` 는 `===` 로 비교하면 같은 시각이라도 다른 객체라 안 맞으므로 `getTime()` 으로 본다
 * (실제 Prisma 도 값으로 비교한다).
 */
function fakePrisma(
  leagues: Row[],
  mirrors: Row[],
  onAfterRead?: (stored: Row[]) => void,
  mirrorCount?: number,
) {
  const txClient: { v1Tournament: { updateMany: jest.Mock; count: jest.Mock } } = {
    v1Tournament: { updateMany: undefined as never, count: undefined as never },
  };
  const matchesWhere = (row: Row, where: Row) =>
    Object.entries(where).every(([key, want]) => {
      const have = row[key];
      if (have instanceof Date && want instanceof Date) return have.getTime() === want.getTime();
      return have === want;
    });
  const updateMany = jest.fn((args: { where: Row; data: Row }) => {
    const row = mirrors.find((m) => m.id === args.where.id);
    const ok = row !== undefined && matchesWhere(row, args.where);
    if (ok && row) Object.assign(row, args.data);
    return Promise.resolve({ count: ok ? 1 : 0 });
  });
  const readMirrors = jest.fn(async () => {
    // 읽기는 **스냅샷**이다 — 읽은 뒤 저장된 행이 바뀌는 상황을 흉내내려면 복사본이어야 한다.
    const snapshot = mirrors.map((row) => ({ ...row }));
    onAfterRead?.(mirrors);
    return snapshot;
  });
  const countMirrors = jest.fn(async () => mirrorCount ?? mirrors.length);
  txClient.v1Tournament.updateMany = updateMany;
  txClient.v1Tournament.count = countMirrors;
  return {
    updateMany,
    mirrors,
    prisma: {
      v1League: { findMany: jest.fn().mockResolvedValue(leagues) },
      v1Tournament: { findMany: readMirrors, updateMany, count: countMirrors },
      // **interactive 형만 받는다** — 배열형을 통과시키면 호출부가 되돌아가도 테스트가
      // 통과해서 부분 커밋 결함이 다시 들어온다.
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        if (typeof fn !== 'function') {
          throw new TypeError(
            'interactive $transaction 콜백이어야 한다 — 배열형은 단언이 롤백을 못 일으킨다',
          );
        }
        // **롤백을 흉내낸다** — 그래야 "단언이 트랜잭션 안에 있는가" 가 관측된다.
        const snapshot = mirrors.map((row) => ({ ...row }));
        try {
          return await fn(txClient);
        } catch (error) {
          mirrors.length = 0;
          mirrors.push(...snapshot);
          throw error;
        }
      }),
    } as never,
  };
}

describe('backfillLeagueCreatedAt', () => {
  it('거울의 createdAt 을 원본 리그 값으로 바꾼다', async () => {
    const { prisma, mirrors } = fakePrisma([league()], [mirror()]);

    const result = await backfillLeagueCreatedAt(prisma, { dryRun: false });

    expect((mirrors[0].createdAt as Date).getTime()).toBe(ORIGIN.getTime());
    expect(result.updated).toBe(1);
    expect(result.planned).toBe(1);
  });

  it('dry-run 은 쓰지 않는다 — 계획만 센다', async () => {
    const { prisma, mirrors, updateMany } = fakePrisma([league()], [mirror()]);

    const result = await backfillLeagueCreatedAt(prisma, { dryRun: true });

    expect(updateMany).not.toHaveBeenCalled();
    expect((mirrors[0].createdAt as Date).getTime()).toBe(BACKFILL_STAMP.getTime());
    expect(result.planned).toBe(1);
    expect(result.updated).toBe(0);
  });

  /**
   * **되돌리기의 유일한 근거.** 이 백필은 덮어쓰는 것이 목적이라 `--apply` 후에는 원래 값을
   * DB 에서 얻을 수 없다. dry-run 출력의 `from` 이 그 값이고, 그게 비면 되돌릴 방법이 없다.
   */
  it('dry-run 이 덮어쓸 원래 값을 changes 에 싣는다 — 이게 유일한 되돌리기 경로다', async () => {
    const { prisma } = fakePrisma([league()], [mirror()]);

    const result = await backfillLeagueCreatedAt(prisma, { dryRun: true });

    expect(result.changes).toEqual([
      { leagueId: 'lg-1', from: BACKFILL_STAMP.toISOString(), to: ORIGIN.toISOString() },
    ]);
  });

  it('이미 원본과 같은 행은 건드리지 않는다', async () => {
    const { prisma, updateMany } = fakePrisma([league()], [mirror({ createdAt: ORIGIN })]);

    const result = await backfillLeagueCreatedAt(prisma, { dryRun: false });

    expect(updateMany).not.toHaveBeenCalled();
    expect(result.planned).toBe(0);
    expect(result.skipped).toBe(1);
  });

  /**
   * **대회 행을 건드리면 안 된다.** 읽을 때 걸러도 읽기~쓰기 사이에 종류가 바뀔 수 있으므로
   * `where` 에 넣어 **쓰기 시점에** 강제한다. 이 조건을 빼는 변이는 여기서 red 가 된다.
   */
  it('대회 행은 쓰기 조건에서 제외한다 — where 에 kind 가 있다', async () => {
    const { prisma, updateMany } = fakePrisma([league()], [mirror()]);

    await backfillLeagueCreatedAt(prisma, { dryRun: false });

    expect(updateMany.mock.calls[0][0].where).toMatchObject({ kind: 'regular_league' });
  });

  it('같은 id 인데 종류가 대회면 아무것도 쓰지 않고 막는다', async () => {
    const { prisma, updateMany } = fakePrisma(
      [league()],
      [mirror({ kind: 'regular_tournament' })],
    );

    await expect(backfillLeagueCreatedAt(prisma, { dryRun: false })).rejects.toBeInstanceOf(
      LeagueCreatedAtBackfillBlockedError,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('거울 행이 없는 리그가 있으면 막는다 — 시즌 백필이 선행이다', async () => {
    const { prisma, updateMany } = fakePrisma([league(), league({ id: 'lg-2' })], [mirror()]);

    await expect(backfillLeagueCreatedAt(prisma, { dryRun: false })).rejects.toBeInstanceOf(
      LeagueCreatedAtBackfillBlockedError,
    );
    expect(updateMany).not.toHaveBeenCalled();
  });

  /**
   * 읽기~쓰기 사이에 누가 값을 바꾸면 `where` 가 0행을 만들고, 개수 단언이 롤백을 일으킨다.
   * **부분 적용이 남으면 안 된다** — 승인을 받아 도는 쓰기라 전부 되거나 전부 안 되거나여야 한다.
   */
  it('읽은 뒤 값이 바뀌면 쓰지 않고 롤백한다 — 부분 적용이 남지 않는다', async () => {
    const { prisma, mirrors } = fakePrisma(
      [league(), league({ id: 'lg-2' })],
      [mirror(), mirror({ id: 'lg-2' })],
      (stored) => {
        // 읽은 직후 두 번째 행을 누가 바꾼다 → 그 행의 where 가 안 맞아 0행이 된다.
        stored[1].createdAt = new Date('2026-08-31T00:00:00.000Z');
      },
    );

    await expect(backfillLeagueCreatedAt(prisma, { dryRun: false })).rejects.toThrow(
      /고친 행 수가 계획과 다르다/,
    );
    // 첫 행은 트랜잭션 안에서 바뀌었다가 **롤백**돼야 한다.
    expect((mirrors[0].createdAt as Date).getTime()).toBe(BACKFILL_STAMP.getTime());
  });

  it('거울 수가 리그 수와 다르면 롤백한다 — dual-write 누락 신호다', async () => {
    const { prisma, mirrors } = fakePrisma([league()], [mirror()], undefined, 0);

    await expect(backfillLeagueCreatedAt(prisma, { dryRun: false })).rejects.toThrow(
      /거울 수가 리그 수와 다르다/,
    );
    expect((mirrors[0].createdAt as Date).getTime()).toBe(BACKFILL_STAMP.getTime());
  });

  /**
   * **멱등이다 — 이게 되돌리기보다 중요한 성질이다.**
   *
   * 목표값(`V1League.createdAt`)은 이 백필이 건드리지 않으므로 **불변**이다. 그래서 두 번
   * 돌려도 같은 상태로 수렴한다 — *"중간에 실패하면 어떻게 되나"* 가 위험이 아니라
   * **다시 돌리면 되는** 문제가 된다.
   *
   * 되돌리기(옛 백필 시각으로 복원)는 dry-run 출력이 유일한 근거지만, 그건 감사를 위한
   * 것이지 복구 계획이 아니다 — 옛 값은 **행을 만든 시각**이라 되살릴 이유가 없다.
   *
   * 2회차에 `updateMany` 를 **아예 안 부르는 것**까지 본다. 결과만 보면 "이미 같은 값을
   * 다시 쓰기" 도 통과하는데, 그건 승인받은 쓰기를 불필요하게 한 번 더 하는 것이다.
   */
  it('두 번 돌려도 같은 상태다 — 2회차엔 쓰지 않는다 (멱등)', async () => {
    const { prisma, mirrors, updateMany } = fakePrisma([league()], [mirror()]);

    const first = await backfillLeagueCreatedAt(prisma, { dryRun: false });
    expect(first.updated).toBe(1);
    expect(updateMany).toHaveBeenCalledTimes(1);

    const second = await backfillLeagueCreatedAt(prisma, { dryRun: false });

    expect(second.planned).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.skipped).toBe(1);
    // **추가 호출이 없어야 한다** — 있으면 같은 값을 다시 쓰는 것이다.
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect((mirrors[0].createdAt as Date).getTime()).toBe(ORIGIN.getTime());
  });

  it('updatedAt 은 쓰지 않는다 — @updatedAt 이라 Prisma 가 관리한다', async () => {
    const { prisma, updateMany } = fakePrisma([league()], [mirror()]);

    await backfillLeagueCreatedAt(prisma, { dryRun: false });

    expect(Object.keys(updateMany.mock.calls[0][0].data)).toEqual(['createdAt']);
  });
});

/**
 * **플래그를 읽는 코드가 실제로 있는지 본다.**
 *
 * 이 저장소에서 *"주석은 `--dry-run` 을 서술하는데 그걸 읽는 코드가 아예 없었다"* 는 사고가
 * 있었다. 주석이 코드보다 안전하게 적혀 있으면 **없는 보호를 믿게 된다.**
 *
 * 동작 테스트(`dryRun: true` 면 안 쓴다)는 위에 있지만, 그건 **CLI 가 그 값을 옳게 넘길 때만**
 * 의미가 있다. 그래서 CLI 쪽은 소스에서 세 가지를 확인한다 — 파싱·기본값·모순 거부.
 */
describe('league-created-at-backfill.cli 의 안전 계약', () => {
  const source = readFileSync(join(__dirname, 'league-created-at-backfill.cli.ts'), 'utf8');

  it('--apply 를 실제로 읽는다', () => {
    expect(source).toContain("process.argv.includes('--apply')");
  });

  it('기본이 dry-run 이다 — apply 가 없으면 dryRun 이 참이다', () => {
    expect(source).toContain('dryRun: !apply');
  });

  it('--apply 와 --dry-run 을 함께 주면 거부한다', () => {
    expect(source).toContain("process.argv.includes('--dry-run')");
    expect(source).toMatch(/if \(apply && explicitDryRun\)[\s\S]{0,120}throw new Error/);
  });
});
