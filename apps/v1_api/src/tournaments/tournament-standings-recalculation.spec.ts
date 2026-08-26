/**
 * tournament-standings-recalculation.spec.ts
 *
 * Contract tests for the deploy-pipeline batch recalculation CLI's logic
 * module:
 *   - a tournament with a missing/invalid competition config is quarantined
 *     and never reaches $transaction (so one bad tournament can't fail the
 *     whole deploy step, matching the "quarantine, don't hard-fail" rule
 *     this deploy pipeline already applies to fixture-game-backfill)
 *   - a tournament with a valid config gets its group standings recomputed
 *     via the real calculateCompetitionStandings() (not a mocked
 *     calculation) — this is the actual bug fix under test: standings must
 *     come from real fixture results, not be faked
 *   - the tournament discovery query filters on deletedAt: null
 *
 * 관찰 가능한 동작(tx/prisma 호출 여부·인자)만 검증한다. Mock 자체를 검증하지 않는다.
 */
import { runTournamentStandingsRecalculation } from './tournament-standings-recalculation';
import { FOOTBALL_V1_CONFIG } from './competition-config/competition-config';

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    phase: 'group',
    groupTeams: [{ registrationId: 'reg-1' }, { registrationId: 'reg-2' }],
    fixtures: [
      {
        homeRegistrationId: 'reg-1',
        awayRegistrationId: 'reg-2',
        game: {
          currentOfficialRevision: { state: 'OFFICIAL', score: { home: 2, away: 1 } },
        },
        result: null,
      },
    ],
    ...overrides,
  };
}

function makePrisma(options: {
  tournamentIds: string[];
  tournamentsById: Record<string, unknown>;
  groupsByTournamentId: Record<string, unknown[]>;
}) {
  const tx = {
    v1TournamentStanding: { upsert: jest.fn().mockResolvedValue({}) },
    v1TournamentOverallStanding: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const prisma = {
    v1TournamentGroup: {
      findMany: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
        // Discovery call has `distinct`; per-tournament call has a concrete tournamentId.
        if (typeof where.tournamentId === 'string') {
          return Promise.resolve(options.groupsByTournamentId[where.tournamentId] ?? []);
        }
        return Promise.resolve(options.tournamentIds.map((id) => ({ tournamentId: id })));
      }),
    },
    v1Tournament: {
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        Promise.resolve(options.tournamentsById[where.id] ?? null),
      ),
    },
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(tx)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { prisma, tx };
}

describe('runTournamentStandingsRecalculation', () => {
  it('discovery query filters on deletedAt: null', async () => {
    const { prisma } = makePrisma({ tournamentIds: [], tournamentsById: {}, groupsByTournamentId: {} });

    await runTournamentStandingsRecalculation(prisma);

    expect(prisma.v1TournamentGroup.findMany).toHaveBeenCalledWith({
      where: { phase: 'group', tournament: { deletedAt: null } },
      select: { tournamentId: true },
      distinct: ['tournamentId'],
    });
  });

  it('tournament with no competition config (null) → quarantined, $transaction never called for it', async () => {
    const { prisma, tx } = makePrisma({
      tournamentIds: ['t-1'],
      tournamentsById: {
        't-1': { id: 't-1', deletedAt: null, competitionConfigVersionId: null, competitionConfig: null },
      },
      groupsByTournamentId: {},
    });

    const result = await runTournamentStandingsRecalculation(prisma);

    expect(result.quarantine).toEqual([
      { tournamentId: 't-1', reason: 'CONFIG_INVALID', detail: '경기 설정은 객체여야 해요.' },
    ]);
    expect(result.counts).toEqual({
      tournamentsScanned: 1,
      tournamentsRecalculated: 0,
      groupsRecalculated: 0,
      quarantined: 1,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it('tournament with a structurally invalid config → quarantined with the validator message, not thrown', async () => {
    const { prisma } = makePrisma({
      tournamentIds: ['t-1'],
      tournamentsById: {
        't-1': {
          id: 't-1',
          deletedAt: null,
          competitionConfigVersionId: 'cfg-1',
          competitionConfig: { ...FOOTBALL_V1_CONFIG, periods: [] },
        },
      },
      groupsByTournamentId: {},
    });

    const result = await runTournamentStandingsRecalculation(prisma);

    expect(result.quarantine).toEqual([
      { tournamentId: 't-1', reason: 'CONFIG_INVALID', detail: 'periods에는 유효한 경기 시간 구성이 필요해요.' },
    ]);
  });

  it('tournament with a valid config → real calculateCompetitionStandings() result is upserted, counts reflect the recalculation', async () => {
    const { prisma, tx } = makePrisma({
      tournamentIds: ['t-1'],
      tournamentsById: {
        't-1': {
          id: 't-1',
          deletedAt: null,
          competitionConfigVersionId: 'cfg-1',
          competitionConfig: FOOTBALL_V1_CONFIG,
        },
      },
      groupsByTournamentId: { 't-1': [groupRow()] },
    });

    const result = await runTournamentStandingsRecalculation(prisma);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const calls = (tx.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    expect(calls).toHaveLength(2);
    const winner = calls.find((c) => c[0].create.registrationId === 'reg-1')?.[0].create;
    const loser = calls.find((c) => c[0].create.registrationId === 'reg-2')?.[0].create;
    expect(winner).toMatchObject({ groupId: 'group-1', points: 3, wins: 1, losses: 0, position: 1 });
    expect(loser).toMatchObject({ groupId: 'group-1', points: 0, wins: 0, losses: 1, position: 2 });
    expect(result.counts).toEqual({
      tournamentsScanned: 1,
      tournamentsRecalculated: 1,
      groupsRecalculated: 1,
      quarantined: 0,
    });
    expect(result.quarantine).toEqual([]);

    // 불변식(§7.1): recalculateAndUpsertGroupStandings가 호출되는 경로는 같은 tx에서
    // recalculateAndUpsertOverallStandings도 호출해야 한다.
    const overallCalls = (tx.v1TournamentOverallStanding.upsert as jest.Mock).mock.calls;
    expect(overallCalls).toHaveLength(2);
    const overallWinner = overallCalls.find((c) => c[0].create.registrationId === 'reg-1')?.[0].create;
    expect(overallWinner).toMatchObject({ tournamentId: 't-1', points: 3, wins: 1, position: 1 });
  });

  it('a discovered tournament that no longer resolves (deleted between discovery and fetch) is skipped, not quarantined', async () => {
    const { prisma } = makePrisma({
      tournamentIds: ['t-1'],
      tournamentsById: {},
      groupsByTournamentId: {},
    });

    const result = await runTournamentStandingsRecalculation(prisma);

    expect(result.counts).toEqual({
      tournamentsScanned: 1,
      tournamentsRecalculated: 0,
      groupsRecalculated: 0,
      quarantined: 0,
    });
    expect(result.quarantine).toEqual([]);
  });
});
