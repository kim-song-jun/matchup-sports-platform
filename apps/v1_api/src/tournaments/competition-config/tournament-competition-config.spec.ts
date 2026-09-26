import type { V1AuthUser } from '../../auth/v1-auth-user';
import { TournamentCompetitionConfig } from './tournament-competition-config';
import { kindAwareFindFirst } from '../../../test/helpers/kind-aware-find-first';

describe('TournamentCompetitionConfig', () => {
  const user = { id: 'admin-user-1' } as V1AuthUser;
  const updatedAt = new Date('2026-08-15T00:00:00.000Z');

  function setup(options: { recordedStandings?: number; startedGames?: number; existingPeriods?: { id: string; number: number }[] } = {}) {
    const tx = {
      v1Tournament: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        // CAS 갱신 직후 재조회가 `findUniqueOrThrow` → 대회 표면 헬퍼(`findFirst`)로
        // 바뀌었다. 호출 형태를 바꾸면 인라인 mock 이 조용히 안 따라온다(#863 에서 78건).
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'tournament-1', competitionConfigVersionId: 'config-old', updatedAt, sport: { code: 'futsal' } })
          .mockResolvedValue({ updatedAt: new Date('2026-08-15T00:01:00.000Z') }),
      },
      v1TeamMatch: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        count: jest.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValue(options.startedGames ?? 0),
      },
      v1TournamentStanding: { count: jest.fn().mockResolvedValueOnce(8).mockResolvedValueOnce(options.recordedStandings ?? 0) },
      v1Game: { updateMany: jest.fn().mockResolvedValue({ count: 3 }), findMany: jest.fn().mockResolvedValue(options.existingPeriods ? [{ id: 'game-1', periods: options.existingPeriods }] : []) },
      v1GamePeriod: { createMany: jest.fn(), deleteMany: jest.fn() },
      $executeRaw: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      v1Tournament: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tournament-1',
          competitionConfigVersionId: 'config-old',
          updatedAt,
          sport: { code: 'futsal' },
        }),
      },
      v1CompetitionConfigVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'config-five-a-side',
          sportCode: 'futsal',
          contentHash: 'a'.repeat(64),
          periods: [{ durationMinutes: 20 }, { durationMinutes: 20 }],
        }),
      },
      v1TeamMatch: {
        count: jest
          .fn()
          .mockResolvedValueOnce(3) // all fixtures
          .mockResolvedValueOnce(0) // completed fixtures
          .mockResolvedValueOnce(0) // canonical result revisions
          .mockResolvedValue(options.startedGames ?? 0),
      },
      v1TournamentStanding: {
        count: jest
          .fn()
          .mockResolvedValueOnce(8) // zero-value rows created by group assignment
          .mockResolvedValueOnce(options.recordedStandings ?? 0),
      },
      v1Game: { count: jest.fn().mockResolvedValue(options.startedGames ?? 0) },
      $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const adminContext = {
      getMutationAdmin: jest.fn().mockResolvedValue({ id: 'admin-1' }),
      logAdminAction: jest.fn().mockResolvedValue(undefined),
    };
    return {
      service: new TournamentCompetitionConfig(prisma as never, adminContext as never),
      prisma,
      tx,
    };
  }

  // **설정 CAS 갱신은 되돌릴 수 없다.** 봉쇄가 갱신 뒤에 오면 최악의 조합이 된다 —
  // 데이터는 이미 바뀌었는데 호출자는 404 를 받고, 재시도가 **또 갱신**한다.
  // 그래서 404 만 보지 않고 **`updateMany` 가 한 번도 안 불렸는지**를 함께 단언한다.
  it('리그 id 는 설정을 바꾸지 못한다 — 갱신이 일어나기 전에 막힌다', async () => {
    const { service, prisma, tx } = setup();
    prisma.v1Tournament.findFirst.mockImplementation(
      kindAwareFindFirst({
        id: 'league-1',
        kind: 'regular_league',
        competitionConfigVersionId: 'config-old',
        updatedAt,
        sport: { code: 'futsal' },
      }),
    );

    await expect(
      service.change(user, 'league-1', {
        competitionConfigVersionId: 'config-five-a-side',
        expectedVersion: updatedAt.toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code: 'TOURNAMENT_NOT_FOUND' } });

    // 셋 다 0회여야 한다 — 대회·픽스처·경기 어느 것도 리그 행을 향해 바뀌면 안 된다.
    expect(tx.v1Tournament.updateMany).not.toHaveBeenCalled();
    expect(tx.v1TeamMatch.updateMany).not.toHaveBeenCalled();
    expect(tx.v1Game.updateMany).not.toHaveBeenCalled();
  });

  it('allows a config change with fixtures and empty standings, and repoints untouched games', async () => {
    const { service, prisma, tx } = setup();

    const result = await service.change(user, 'tournament-1', {
      competitionConfigVersionId: 'config-five-a-side',
      expectedVersion: updatedAt.toISOString(),
    });

    expect(result).toMatchObject({
      changed: true,
      currentCompetitionConfigVersionId: 'config-five-a-side',
      impact: {
        fixtureCount: 3,
        completedFixtureCount: 0,
        standingCount: 8,
        requiresRecalculation: false,
      },
      confirmationRequired: false,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.v1TeamMatch.updateMany).toHaveBeenCalledWith({
      where: {
        tournamentId: 'tournament-1',
        leagueId: null,
        tournamentDetails: { isNot: null },
        status: { not: 'completed' },
        OR: [
          { game: null },
          { game: { is: { sourceType: 'TEAM_MATCH', state: 'SCHEDULED', lineups: { none: {} }, events: { none: {} }, resultRevisions: { none: {} }, periods: { none: { OR: [{ state: { not: 'SCHEDULED' } }, { startedAt: { not: null } }, { endedAt: { not: null } }, { pausedAt: { not: null } }] } } } } },
        ],
      },
      data: { competitionConfigVersionId: 'config-five-a-side' },
    });
    expect(tx.v1Game.updateMany).toHaveBeenCalledWith({
      where: {
        teamMatch: { is: { tournamentId: 'tournament-1', leagueId: null, tournamentDetails: { isNot: null }, status: { not: 'completed' } } },
        sourceType: 'TEAM_MATCH',
        state: 'SCHEDULED',
        lineups: { none: {} },
        events: { none: {} },
        resultRevisions: { none: {} },
        periods: { none: { OR: [{ state: { not: 'SCHEDULED' } }, { startedAt: { not: null } }, { endedAt: { not: null } }, { pausedAt: { not: null } }] } },
      },
      data: { competitionConfigVersionId: 'config-five-a-side' },
    });
  });

  it('does not mutate when a linked game already has lineup, event, result, or started state', async () => {
    const { service, prisma, tx } = setup({ startedGames: 1 });

    const result = await service.change(user, 'tournament-1', {
      competitionConfigVersionId: 'config-five-a-side',
      expectedVersion: updatedAt.toISOString(),
    });

    expect(result).toMatchObject({
      changed: false,
      impact: { requiresRecalculation: true },
      confirmationRequired: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.v1Tournament.updateMany).not.toHaveBeenCalled();
    expect(tx.v1TeamMatch.updateMany).not.toHaveBeenCalled();
  });

  it('treats non-zero standings as recorded competition data', async () => {
    const { service, prisma, tx } = setup({ recordedStandings: 1 });

    const result = await service.change(user, 'tournament-1', {
      competitionConfigVersionId: 'config-five-a-side',
      expectedVersion: updatedAt.toISOString(),
    });

    expect(result).toMatchObject({
      changed: false,
      impact: { standingCount: 8, requiresRecalculation: true },
      confirmationRequired: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.v1Tournament.updateMany).not.toHaveBeenCalled();
    expect(tx.v1TeamMatch.updateMany).not.toHaveBeenCalled();
  });

  it('adds missing scheduled periods without replacing existing period IDs', async () => {
    const { service, tx } = setup({ existingPeriods: [{ id: 'period-1', number: 1 }] });
    await service.change(user, 'tournament-1', {
      competitionConfigVersionId: 'config-five-a-side',
      expectedVersion: updatedAt.toISOString(),
    });
    expect(tx.v1GamePeriod.createMany).toHaveBeenCalledWith({ data: [{ gameId: 'game-1', number: 2 }] });
    expect(tx.v1GamePeriod.deleteMany).not.toHaveBeenCalled();
  });

  it('removes only excess unstarted scheduled periods', async () => {
    const { service, tx } = setup({ existingPeriods: [{ id: 'period-1', number: 1 }, { id: 'period-2', number: 2 }, { id: 'period-3', number: 3 }] });
    await service.change(user, 'tournament-1', {
      competitionConfigVersionId: 'config-five-a-side',
      expectedVersion: updatedAt.toISOString(),
    });
    expect(tx.v1GamePeriod.deleteMany).toHaveBeenCalledWith({ where: { gameId: 'game-1', number: { gt: 2 } } });
    expect(tx.v1GamePeriod.createMany).not.toHaveBeenCalled();
  });
});
