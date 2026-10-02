/**
 * tournament-standings-recalculation.spec.ts
 *
 * Contract tests for the deploy-pipeline batch recalculation CLI's logic
 * module:
 *   - a tournament with a missing/invalid competition config is quarantined
 *     inside its transaction (so one bad tournament can't fail the whole
 *     deploy step), with no standings writes
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
import { ConflictException } from '@nestjs/common';

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

function canonicalDetail(overrides: Record<string, unknown> = {}) {
  const teamMatchId = (overrides.teamMatchId as string | undefined) ?? 'tm-1';
  const { teamMatch: teamMatchOverride, ...detailOverrides } = overrides;
  const baseGame = {
    id: 'game-1',
    sourceType: 'TEAM_MATCH',
    teamMatchId,
    currentOfficialRevision: { state: 'OFFICIAL', score: { home: 2, away: 1 } },
    sides: [
      { id: 'side-home', sideKey: 'HOME' },
      { id: 'side-away', sideKey: 'AWAY' },
    ],
  };
  return {
    groupId: 'group-1',
    homeRegistrationId: 'reg-1',
    awayRegistrationId: 'reg-2',
    teamMatchId,
    ...detailOverrides,
    teamMatch: {
      id: teamMatchId,
      tournamentId: 't-1',
      leagueId: null,
      deletedAt: null,
      status: 'completed',
      game: baseGame,
      ...(teamMatchOverride as Record<string, unknown> | undefined),
    },
  };
}

function makePrisma(options: {
  tournamentIds: string[];
  tournamentsById: Record<string, unknown>;
  groupsByTournamentId: Record<string, unknown[]>;
  canonicalDetails?: unknown[];
}) {
  const findGroups = jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
    if (typeof where.tournamentId === 'string') {
      return Promise.resolve(options.groupsByTournamentId[where.tournamentId] ?? []);
    }
    return Promise.resolve(options.tournamentIds.map((id) => ({ tournamentId: id })));
  });
  const findTournament = jest.fn().mockImplementation((args: { where: Record<string, unknown> }) => {
    const clauses = (args.where.AND ?? [args.where]) as Array<Record<string, unknown>>;
    const id = clauses.find((clause) => 'id' in clause)?.id as string | undefined;
    return Promise.resolve(id === undefined ? null : (options.tournamentsById[id] ?? null));
  });
  const tx = {
    v1Tournament: { findFirst: findTournament },
    v1TournamentGroup: { findMany: findGroups },
    v1TournamentStanding: { upsert: jest.fn().mockResolvedValue({}) },
    v1TournamentOverallStanding: {
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    v1TournamentMatchDetails: {
      findMany: jest.fn().mockResolvedValue(options.canonicalDetails ?? []),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $queryRaw: jest.fn().mockResolvedValue([]),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const prisma = {
    v1TournamentGroup: {
      findMany: findGroups,
    },
    v1Tournament: {
      findFirst: findTournament,
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
      where: {
        phase: 'group',
        tournament: { deletedAt: null, OR: [{ kind: 'regular_tournament' }, { kind: null }] },
      },
      select: { tournamentId: true },
      distinct: ['tournamentId'],
    });
  });

  it('tournament with no competition config (null) → quarantined without standings writes', async () => {
    const { prisma, tx } = makePrisma({
      tournamentIds: ['t-1'],
      tournamentsById: {
        't-1': { id: 't-1', deletedAt: null, competitionConfigVersionId: null, competitionConfig: null },
      },
      groupsByTournamentId: {},
    });

    const result = await runTournamentStandingsRecalculation(prisma);

    expect(result.quarantine).toEqual([
      expect.objectContaining({ tournamentId: 't-1', reason: 'CONFIG_INVALID' }),
    ]);
    expect(result.counts).toEqual({
      tournamentsScanned: 1,
      tournamentsRecalculated: 0,
      groupsRecalculated: 0,
      quarantined: 1,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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

  it('missing canonical Game → canonical source quarantine with no standings writes', async () => {
    const { prisma, tx } = makePrisma({
      tournamentIds: ['t-1'],
      tournamentsById: {
        't-1': {
          id: 't-1', deletedAt: null, competitionConfigVersionId: 'cfg-1', competitionConfig: FOOTBALL_V1_CONFIG,
        },
      },
      groupsByTournamentId: { 't-1': [groupRow()] },
      canonicalDetails: [canonicalDetail({ teamMatch: {
        id: 'tm-missing', tournamentId: 't-1', leagueId: null, deletedAt: null, game: null,
      } })],
    });

    const result = await runTournamentStandingsRecalculation(prisma);

    expect(result.quarantine).toEqual([
      expect.objectContaining({ tournamentId: 't-1', reason: 'CANONICAL_SOURCE_INVALID' }),
    ]);
    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ['unexpected HTTP error', new ConflictException({ code: 'UNEXPECTED_SOURCE_FAILURE' })],
    ['concurrent source change', new ConflictException({ code: 'COMMAND_CONCURRENCY_CONFLICT' })],
  ])('%s propagates instead of being reported as a successful recalculation', async (_label, error) => {
    const { prisma, tx } = makePrisma({
      tournamentIds: ['t-1'],
      tournamentsById: {
        't-1': { id: 't-1', deletedAt: null, competitionConfigVersionId: 'cfg-1', competitionConfig: FOOTBALL_V1_CONFIG },
      },
      groupsByTournamentId: { 't-1': [groupRow()] },
      canonicalDetails: [canonicalDetail({ teamMatchId: 'tm-valid' })],
    });
    tx.$queryRaw.mockRejectedValueOnce(error);

    await expect(runTournamentStandingsRecalculation(prisma)).rejects.toBe(error);
    expect(tx.v1TournamentStanding.upsert).not.toHaveBeenCalled();
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
      canonicalDetails: [canonicalDetail({ teamMatchId: 'tm-valid', teamMatch: {
        id: 'tm-valid', tournamentId: 't-1', leagueId: null, deletedAt: null,
        game: { id: 'game-valid', sourceType: 'TEAM_MATCH', teamMatchId: 'tm-valid', currentOfficialRevision: { state: 'OFFICIAL', score: { home: 2, away: 1 } }, sides: [{ id: 'home', sideKey: 'HOME' }, { id: 'away', sideKey: 'AWAY' }] },
      } })],
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

  it('includes completed canonical TeamMatch/Details results when no legacy fixture exists', async () => {
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
      groupsByTournamentId: { 't-1': [groupRow({ fixtures: [] })] },
      canonicalDetails: [
        canonicalDetail({ teamMatchId: 'tm-1', teamMatch: {
          id: 'tm-1', tournamentId: 't-1', leagueId: null, deletedAt: null,
          game: { id: 'game-1', sourceType: 'TEAM_MATCH', teamMatchId: 'tm-1', currentOfficialRevision: { state: 'OFFICIAL', score: { home: 4, away: 2 } }, sides: [{ id: 'side-home', sideKey: 'HOME' }, { id: 'side-away', sideKey: 'AWAY' }] },
        } }),
      ],
    });

    await runTournamentStandingsRecalculation(prisma);

    const calls = (tx.v1TournamentStanding.upsert as jest.Mock).mock.calls;
    expect(calls.find((call) => call[0].create.registrationId === 'reg-1')?.[0].create).toMatchObject({
      points: 3,
      wins: 1,
      goalsFor: 4,
      goalsAgainst: 2,
    });
    expect(calls.find((call) => call[0].create.registrationId === 'reg-2')?.[0].create).toMatchObject({
      points: 0,
      losses: 1,
      goalsFor: 2,
      goalsAgainst: 4,
    });
  });

  it('uses canonical coordinates once when a dual-linked game moved to another group', async () => {
    const movedGame = {
      id: 'game-moved',
      currentOfficialRevision: { state: 'OFFICIAL', score: { home: 1, away: 0 } },
      sides: [
        { id: 'side-home', sideKey: 'HOME' },
        { id: 'side-away', sideKey: 'AWAY' },
      ],
    };
    const oldGroup = groupRow({
      id: 'group-old',
      fixtures: [{ homeRegistrationId: 'reg-1', awayRegistrationId: 'reg-2', game: movedGame, result: null }],
    });
    const newGroup = groupRow({
      id: 'group-new',
      groupTeams: [{ registrationId: 'reg-3' }, { registrationId: 'reg-4' }],
      fixtures: [],
    });
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
      groupsByTournamentId: { 't-1': [oldGroup, newGroup] },
      canonicalDetails: [
        canonicalDetail({ groupId: 'group-new', homeRegistrationId: 'reg-3', awayRegistrationId: 'reg-4', teamMatchId: 'tm-moved', teamMatch: {
          id: 'tm-moved', tournamentId: 't-1', leagueId: null, deletedAt: null,
          game: { ...movedGame, sourceType: 'TEAM_MATCH', teamMatchId: 'tm-moved', currentOfficialRevision: { state: 'OFFICIAL', score: { home: 4, away: 2 } } },
        } }),
      ],
    });

    await runTournamentStandingsRecalculation(prisma);

    const calls = (tx.v1TournamentStanding.upsert as jest.Mock).mock.calls.map((call) => call[0].create);
    expect(calls.find((standing) => standing.registrationId === 'reg-1')).toMatchObject({ points: 0, wins: 0, losses: 0 });
    expect(calls.find((standing) => standing.registrationId === 'reg-3')).toMatchObject({ points: 3, wins: 1, goalsFor: 4, goalsAgainst: 2 });
  });

  it('suppresses a completed legacy copy when canonical ownership is cancelled', async () => {
    const cancelledGame = {
      id: 'game-cancelled',
      currentOfficialRevision: { state: 'OFFICIAL', score: { home: 5, away: 0 } },
      sides: [
        { id: 'side-home', sideKey: 'HOME' },
        { id: 'side-away', sideKey: 'AWAY' },
      ],
    };
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
      groupsByTournamentId: {
        't-1': [groupRow({ fixtures: [{ homeRegistrationId: 'reg-1', awayRegistrationId: 'reg-2', game: cancelledGame, result: null }] })],
      },
      canonicalDetails: [
        canonicalDetail({ teamMatchId: 'tm-cancelled', teamMatch: {
          id: 'tm-cancelled', tournamentId: 't-1', leagueId: null, deletedAt: null, status: 'cancelled',
          game: { ...cancelledGame, sourceType: 'TEAM_MATCH', teamMatchId: 'tm-cancelled', currentOfficialRevision: { state: 'OFFICIAL', score: { home: 5, away: 0 } } },
        } }),
      ],
    });

    await runTournamentStandingsRecalculation(prisma);

    const calls = (tx.v1TournamentStanding.upsert as jest.Mock).mock.calls.map((call) => call[0].create);
    expect(calls.find((standing) => standing.registrationId === 'reg-1')).toMatchObject({ points: 0, wins: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
    expect(calls.find((standing) => standing.registrationId === 'reg-2')).toMatchObject({ points: 0, wins: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 });
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
