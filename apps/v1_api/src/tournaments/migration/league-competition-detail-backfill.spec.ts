import {
  backfillLeagueCompetitionDetails,
  LeagueDetailBackfillBlockedError,
} from './league-competition-detail-backfill';

type Row = Record<string, unknown>;

function league(overrides: Row = {}) {
  return {
    id: 'lg-1',
    state: 'active',
    startsOn: new Date('2026-03-01T00:00:00.000Z'),
    endsOn: new Date('2026-06-30T00:00:00.000Z'),
    regionId: 'region-1',
    ...overrides,
  };
}

function tournament(overrides: Row = {}) {
  return {
    id: 'lg-1',
    kind: 'regular_league',
    status: 'draft',
    scheduledAt: null,
    scheduledEndAt: null,
    regionId: null,
    ...overrides,
  };
}

/**
 * `updateMany` 의 `where` 를 **실제로 적용**하는 fake. 고정 `{ count: 1 }` 을 돌려주면
 * "가드 조건을 where 에서 빼는" 변이가 red 가 되지 않는다 — 그 함정을 이 저장소에서
 * 한 번 밟았다(참가팀 백필 스펙). count 는 조건을 통과한 행에서만 1 이다.
 */
function fakePrisma(
  leagues: Row[],
  tournaments: Row[],
  onAfterRead?: (stored: Row[]) => void,
  mirrorCount?: number,
) {
  const txClient: {
    v1Tournament: { updateMany: jest.Mock; count: jest.Mock };
  } = { v1Tournament: { updateMany: undefined as never, count: undefined as never } };
  // **실제로 행을 바꾼다.** 안 바꾸면 롤백이 관측되지 않고, "단언이 트랜잭션 안에 있는가"
  // 라는 이 결함의 핵심을 테스트가 구분하지 못한다(실제로 못 잡는 것을 변이로 확인했다).
  const updateMany = jest.fn((args: { where: Row; data: Row }) => {
    const row = tournaments.find((t) => t.id === args.where.id);
    const matches =
      row !== undefined &&
      Object.entries(args.where).every(([key, want]) => row[key] === want);
    if (matches && row) Object.assign(row, args.data);
    return Promise.resolve({ count: matches ? 1 : 0 });
  });
  const readTournaments = jest.fn(async () => {
    // 읽기는 **스냅샷**이다 — 복사본을 준다. 그래야 읽은 뒤 저장된 행이 바뀌는 상황을
    // 흉내낼 수 있고, `updateMany` 의 `where` 가 그걸 막는지 검증할 수 있다.
    const snapshot = tournaments.map((row) => ({ ...row }));
    onAfterRead?.(tournaments);
    return snapshot;
  });
  // 불변식(리그 수 == 거울 수) 관측값. 기본은 리그 수와 같게 둔다.
  const countMirrors = jest.fn(async () => mirrorCount ?? tournaments.length);
  txClient.v1Tournament.updateMany = updateMany;
  txClient.v1Tournament.count = countMirrors;
  return {
    updateMany,
    txClient,
    prisma: {
      v1League: { findMany: jest.fn().mockResolvedValue(leagues) },
      v1Tournament: { findMany: readTournaments, updateMany, count: countMirrors },
      // **interactive 형만 받는다.** 배열형을 그대로 통과시키는 fake 를 두면 호출부가
      // 배열형으로 되돌아가도 테스트가 통과해서, 부분 커밋 결함이 다시 들어온다.
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        if (typeof fn !== 'function') {
          throw new TypeError('interactive $transaction 콜백이어야 한다 — 배열형은 단언이 롤백을 못 일으킨다');
        }
        // **롤백을 흉내낸다.** 콜백이 던지면 이 안에서 바뀐 행을 전부 되돌린다. 그래야
        // "단언이 트랜잭션 **안**에 있는가" 가 관측된다 — 밖에 있으면 부분 적용이 남는다.
        const snapshot = tournaments.map((row) => ({ ...row }));
        try {
          return await fn(txClient);
        } catch (error) {
          tournaments.length = 0;
          tournaments.push(...snapshot);
          throw error;
        }
      }),
    } as never,
  };
}

describe('backfillLeagueCompetitionDetails', () => {
  // ─── status 매핑 — D7 과 무관하게 "현재 의미" 를 옮긴다 ──────────────────────

  it.each([
    ['draft', 'draft'],
    ['active', 'in_progress'],
    ['completed', 'completed'],
  ])('state %s → status %s 로 옮긴다', async (state, expected) => {
    const { prisma, updateMany } = fakePrisma([league({ state })], [tournament()]);

    await backfillLeagueCompetitionDetails(prisma, { dryRun: false });

    expect(updateMany.mock.calls[0][0].data).toMatchObject({ status: expected });
  });

  it('open 은 어떤 리그 상태에서도 나오지 않는다 — 신청 단계는 오늘 존재하지 않는다', async () => {
    const states = ['draft', 'active', 'completed'];
    const written: unknown[] = [];
    for (const state of states) {
      const { prisma, updateMany } = fakePrisma([league({ state })], [tournament()]);
      await backfillLeagueCompetitionDetails(prisma, { dryRun: false });
      written.push(updateMany.mock.calls[0][0].data.status);
    }
    expect(written).not.toContain('open');
    expect(written).toEqual(['draft', 'in_progress', 'completed']);
  });

  it('날짜와 지역을 리그에서 그대로 옮긴다', async () => {
    const { prisma, updateMany } = fakePrisma([league()], [tournament()]);

    await backfillLeagueCompetitionDetails(prisma, { dryRun: false });

    expect(updateMany.mock.calls[0][0].data).toEqual({
      status: 'in_progress',
      scheduledAt: new Date('2026-03-01T00:00:00.000Z'),
      scheduledEndAt: new Date('2026-06-30T00:00:00.000Z'),
      regionId: 'region-1',
    });
  });

  // ─── 가드 ────────────────────────────────────────────────────────────────

  it('가드 1: 대회 행이 아예 없으면 missingTournaments 로 막는다', async () => {
    const { prisma, updateMany } = fakePrisma([league()], []);

    const error = await backfillLeagueCompetitionDetails(prisma, { dryRun: false }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(LeagueDetailBackfillBlockedError);
    const detail = (error as LeagueDetailBackfillBlockedError).detail;
    expect(detail.missingTournaments).toEqual([{ leagueId: 'lg-1' }]);
    expect(detail.kindMismatches).toEqual([]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('가드 1: id 는 있는데 종류가 리그가 아니면 missingTournaments 가 아니라 kindMismatches 다', async () => {
    // 두 경우의 조치가 정반대다 — 없으면 리그 시즌 백필을 먼저 돌리고, 종류가 다르면
    // 그 id 가 우리 것이 아니므로 멈추고 조사한다. 한 통에 담으면 운영자가 못 고른다.
    const { prisma, updateMany } = fakePrisma([league()], [tournament({ kind: 'regular_tournament' })]);

    const error = await backfillLeagueCompetitionDetails(prisma, { dryRun: false }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(LeagueDetailBackfillBlockedError);
    const detail = (error as LeagueDetailBackfillBlockedError).detail;
    expect(detail.kindMismatches).toEqual([{ leagueId: 'lg-1', kind: 'regular_tournament' }]);
    expect(detail.missingTournaments).toEqual([]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  // ─── dual-write 와의 상호작용 ───────────────────────────────────────────────
  // dual-write 가 배포된 뒤 새로 생긴 리그는 거울이 **처음부터 올바른 값**으로 만들어진다.
  // 그걸 "낯선 값" 으로 막으면 **리그 하나 때문에 백필 전체가 멈춘다.**

  it('이미 목표값과 같은 행은 막지 않고 건너뛴다 — dual-write 가 만든 거울', async () => {
    const alreadyCorrect = tournament({
      status: 'in_progress',
      scheduledAt: new Date('2026-03-01T00:00:00.000Z'),
      scheduledEndAt: new Date('2026-06-30T00:00:00.000Z'),
      regionId: 'region-1',
    });
    const { prisma, updateMany } = fakePrisma([league()], [alreadyCorrect]);

    const result = await backfillLeagueCompetitionDetails(prisma, { dryRun: false });

    expect(result).toEqual({ scanned: 1, skipped: 1, updated: 0, mirrorCount: 1, dryRun: false });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('값이 있지만 목표와 다르면 여전히 막는다 — 건너뛰기가 덮어쓰기 허용이 아니다', async () => {
    // 한 필드만 달라도 막아야 한다. 같은 것끼리만 건너뛴다.
    const different = tournament({
      status: 'in_progress',
      scheduledAt: new Date('2026-03-01T00:00:00.000Z'),
      scheduledEndAt: new Date('2026-06-30T00:00:00.000Z'),
      regionId: 'region-9',
    });
    const { prisma, updateMany } = fakePrisma([league()], [different]);

    const error = await backfillLeagueCompetitionDetails(prisma, { dryRun: false }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(LeagueDetailBackfillBlockedError);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('가드 2: 이미 값이 채워진 행이 있으면 덮어쓰지 않고 무엇이 찼는지 보고한다', async () => {
    const { prisma, updateMany } = fakePrisma(
      [league()],
      [tournament({ status: 'completed', regionId: 'region-9' })],
    );

    const error = await backfillLeagueCompetitionDetails(prisma, { dryRun: false }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(LeagueDetailBackfillBlockedError);
    // 어느 필드가 찼는지가 조치를 정한다 — "충돌했다" 보다 "무엇과 충돌했다" 가 필요하다.
    expect((error as LeagueDetailBackfillBlockedError).detail.alreadyFilled).toEqual([
      { leagueId: 'lg-1', filled: ['status', 'regionId'] },
    ]);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('개수가 안 맞으면 **부분 적용도 남지 않는다** — 단언이 트랜잭션 안에 있어야 한다', async () => {
    // 두 리그 중 하나만 매칭되게 만든다. 배열형 `$transaction` 이거나 단언이 트랜잭션 밖에
    // 있으면 **매칭된 한 행은 이미 커밋되고 종료 코드만 실패**가 된다 — 사용자 승인을 받아
    // 돌리는 쓰기에서 "실패했다는데 일부는 들어갔다" 는 승인자가 판단할 수 없는 상태다.
    // 둘 다 읽기 시점에는 깨끗하다(가드 통과). **읽은 뒤** lg-2 만 어긋나게 해서
    // 쓰기 시점의 `where` 가 안 맞게 만든다 — 가드로는 못 잡고 합계 단언만 잡는 상황이다.
    const rows = [tournament({ id: 'lg-1' }), tournament({ id: 'lg-2' })];
    const { prisma } = fakePrisma(
      [league({ id: 'lg-1' }), league({ id: 'lg-2' })],
      rows,
      (stored) => {
        const target = stored.find((row) => row.id === 'lg-2');
        if (target) target.status = 'completed';
      },
    );

    await expect(backfillLeagueCompetitionDetails(prisma, { dryRun: false })).rejects.toThrow(
      /계획 2 · 실제 1/,
    );

    // lg-1 은 매칭돼 한 번 바뀌었지만 롤백돼 원래대로여야 한다.
    expect(rows.find((row) => row.id === 'lg-1')).toMatchObject({
      status: 'draft',
      scheduledAt: null,
      regionId: null,
    });
  });

  it('쓰기 시점 경합: 읽은 뒤 누가 값을 채우면 덮어쓰지 않고 멈춘다', async () => {
    // 가드는 **트랜잭션 밖 스냅샷**이라 이 경합을 못 잡는다. 막는 것은 `updateMany` 의
    // `where` 에 들어간 가드 조건뿐이다 — 그게 빠지면 이 테스트가 red 가 된다.
    // (스텁으로 count 0 을 돌려주는 방식은 **단언만** 검증하고 `where` 는 검증하지 않는다.
    //  실제로 그렇게 썼다가 `where` 를 통째로 지우는 변이가 통과하는 것을 보고 고쳤다.)
    const { prisma, updateMany } = fakePrisma([league()], [tournament()], (stored) => {
      stored[0].status = 'completed';
      stored[0].regionId = 'region-9';
    });

    await expect(backfillLeagueCompetitionDetails(prisma, { dryRun: false })).rejects.toThrow(
      /계획 1 · 실제 0/,
    );
    // 호출은 됐지만 조건이 안 맞아 0행이 바뀐 것이다 — 아예 호출 안 된 것과 구분한다.
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('dry-run 은 쓰지 않는다 — 같은 입력에 --apply 면 쓴다', async () => {
    const dry = fakePrisma([league()], [tournament()]);
    const dryResult = await backfillLeagueCompetitionDetails(dry.prisma, { dryRun: true });
    expect(dry.updateMany).not.toHaveBeenCalled();
    expect(dryResult).toEqual({ scanned: 1, skipped: 0, updated: 0, mirrorCount: 1, dryRun: true });

    const applied = fakePrisma([league()], [tournament()]);
    const applyResult = await backfillLeagueCompetitionDetails(applied.prisma, { dryRun: false });
    expect(applied.updateMany).toHaveBeenCalledTimes(1);
    expect(applyResult).toEqual({ scanned: 1, skipped: 0, updated: 1, mirrorCount: 1, dryRun: false });
  });

  it('불변식: 거울 수가 리그 수와 다르면 실패한다 — dual-write 가 빠진 자리를 드러낸다', async () => {
    // updateMany 는 0행이어도 조용하다. 그 침묵을 여기서 개수로 깬다.
    const { prisma } = fakePrisma([league()], [tournament()], undefined, 0);

    await expect(backfillLeagueCompetitionDetails(prisma, { dryRun: false })).rejects.toThrow(
      /리그 1 · 거울 0/,
    );
  });
});
