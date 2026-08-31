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
function fakePrisma(leagues: Row[], tournaments: Row[], onAfterRead?: (stored: Row[]) => void) {
  const updateMany = jest.fn((args: { where: Row; data: Row }) => {
    const row = tournaments.find((t) => t.id === args.where.id);
    const matches =
      row !== undefined &&
      Object.entries(args.where).every(([key, want]) => row[key] === want);
    return Promise.resolve({ count: matches ? 1 : 0 });
  });
  const readTournaments = jest.fn(async () => {
    // 읽기는 **스냅샷**이다 — 복사본을 준다. 그래야 읽은 뒤 저장된 행이 바뀌는 상황을
    // 흉내낼 수 있고, `updateMany` 의 `where` 가 그걸 막는지 검증할 수 있다.
    const snapshot = tournaments.map((row) => ({ ...row }));
    onAfterRead?.(tournaments);
    return snapshot;
  });
  return {
    updateMany,
    prisma: {
      v1League: { findMany: jest.fn().mockResolvedValue(leagues) },
      v1Tournament: { findMany: readTournaments, updateMany },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
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

  it('가드 1: 대회 행이 없거나 종류가 리그가 아니면 막는다', async () => {
    const { prisma, updateMany } = fakePrisma([league()], [tournament({ kind: 'regular_tournament' })]);

    const error = await backfillLeagueCompetitionDetails(prisma, { dryRun: false }).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(LeagueDetailBackfillBlockedError);
    expect((error as LeagueDetailBackfillBlockedError).detail.missingTournaments).toEqual([
      { leagueId: 'lg-1' },
    ]);
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
    expect(dryResult).toEqual({ scanned: 1, updated: 0, dryRun: true });

    const applied = fakePrisma([league()], [tournament()]);
    const applyResult = await backfillLeagueCompetitionDetails(applied.prisma, { dryRun: false });
    expect(applied.updateMany).toHaveBeenCalledTimes(1);
    expect(applyResult).toEqual({ scanned: 1, updated: 1, dryRun: false });
  });
});
