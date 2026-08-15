import type { V1AuthUser } from '../../auth/v1-auth-user';
import { TournamentCompetitionConfig } from './tournament-competition-config';

describe('TournamentCompetitionConfig', () => {
  const user = { id: 'admin-user-1' } as V1AuthUser;
  const updatedAt = new Date('2026-08-15T00:00:00.000Z');

  function setup(options: { recordedStandings?: number; startedGames?: number } = {}) {
    const tx = {
      v1Tournament: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ updatedAt: new Date('2026-08-15T00:01:00.000Z') }),
      },
      v1TournamentFixture: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      v1Game: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
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
        }),
      },
      v1TournamentFixture: {
        count: jest
          .fn()
          .mockResolvedValueOnce(3) // all fixtures
          .mockResolvedValueOnce(0) // completed fixtures
          .mockResolvedValueOnce(0), // legacy results
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
    expect(tx.v1Game.updateMany).toHaveBeenCalledWith({
      where: {
        tournamentFixture: { tournamentId: 'tournament-1', status: { not: 'completed' } },
        state: 'SCHEDULED',
        lineups: { none: {} },
        events: { none: {} },
        resultRevisions: { none: {} },
      },
      data: { competitionConfigVersionId: 'config-five-a-side' },
    });
  });

  it('does not mutate when a linked game already has lineup, event, result, or started state', async () => {
    const { service, prisma } = setup({ startedGames: 1 });

    const result = await service.change(user, 'tournament-1', {
      competitionConfigVersionId: 'config-five-a-side',
      expectedVersion: updatedAt.toISOString(),
    });

    expect(result).toMatchObject({
      changed: false,
      impact: { requiresRecalculation: true },
      confirmationRequired: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('treats non-zero standings as recorded competition data', async () => {
    const { service, prisma } = setup({ recordedStandings: 1 });

    const result = await service.change(user, 'tournament-1', {
      competitionConfigVersionId: 'config-five-a-side',
      expectedVersion: updatedAt.toISOString(),
    });

    expect(result).toMatchObject({
      changed: false,
      impact: { standingCount: 8, requiresRecalculation: true },
      confirmationRequired: true,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
