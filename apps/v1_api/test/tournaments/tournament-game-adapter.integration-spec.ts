import { ConflictException } from '@nestjs/common';
import { V1CompetitionConfigStatus, V1GameSideKey } from '@prisma/client';
import { AdminContextService } from '../../src/common/admin-context.service';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService } from '../../src/games/games.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import { FOOTBALL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config';
import { runCompetitionConfigContractPhaseBackfill } from '../../src/tournaments/competition-config/competition-config-backfill';

const ids = {
  user: '66000000-0000-4000-8000-000000000001',
  admin: '66000000-0000-4000-8000-000000000002',
  sport: '66000000-0000-4000-8000-000000000003',
  region: '66000000-0000-4000-8000-000000000004',
  homeTeam: '66000000-0000-4000-8000-000000000005',
  awayTeam: '66000000-0000-4000-8000-000000000006',
  tournament: '66000000-0000-4000-8000-000000000007',
  invalidTournament: '66000000-0000-4000-8000-000000000008',
  group: '66000000-0000-4000-8000-000000000009',
  homeRegistration: '66000000-0000-4000-8000-000000000010',
  awayRegistration: '66000000-0000-4000-8000-000000000011',
  homePlayer: '66000000-0000-4000-8000-000000000012',
  awayPlayer: '66000000-0000-4000-8000-000000000013',
  retiredConfig: '66000000-0000-4000-8000-000000000014',
} as const;

const authUser = {
  id: ids.user,
  email: 'task6-l3@example.test',
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
};

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const adminContext = new AdminContextService(prisma);
const bracket = new TournamentBracketService(prisma, adminContext, games);

async function captureFailure(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

describe('Task 6 L3 tournament fixture Game adapter', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 6 L3 integration verification');
    }
    await prisma.$connect();
    await prisma.v1User.create({
      data: {
        id: ids.user,
        email: authUser.email,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1AdminUser.create({
      data: { id: ids.admin, userId: ids.user, adminRole: 'owner', status: 'active' },
    });
    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'soccer', name: 'Task 6 L3 Football' },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'task6-l3-region', name: 'Task 6 L3 Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        {
          id: ids.homeTeam,
          ownerUserId: ids.user,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Task 6 Home',
        },
        {
          id: ids.awayTeam,
          ownerUserId: ids.user,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Task 6 Away',
        },
      ],
    });
    await prisma.v1CompetitionConfigVersion.create({
      data: {
        id: ids.retiredConfig,
        sportCode: 'football',
        name: 'task6-l3-retired',
        version: 1,
        status: V1CompetitionConfigStatus.RETIRED,
        periods: FOOTBALL_V1_CONFIG.periods,
        events: FOOTBALL_V1_CONFIG.events,
        lineup: FOOTBALL_V1_CONFIG.lineup,
        result: FOOTBALL_V1_CONFIG.result,
        tieBreak: FOOTBALL_V1_CONFIG.tieBreak,
        visibility: FOOTBALL_V1_CONFIG.visibility,
        contentHash: 'task6-l3-retired-config',
      },
    });
    await prisma.v1Tournament.createMany({
      data: [
        {
          id: ids.tournament,
          sportId: ids.sport,
          title: 'Task 6 L3 Tournament',
          status: 'in_progress',
        },
        {
          id: ids.invalidTournament,
          sportId: ids.sport,
          title: 'Task 6 L3 Invalid Pin Tournament',
          status: 'in_progress',
          competitionConfigVersionId: ids.retiredConfig,
        },
      ],
    });
    // ids.tournament above is created without an explicit
    // competitionConfigVersionId — the v1_pin_tournament_competition_config
    // trigger used to fill it in automatically (soccer -> the seeded
    // football-v1 config), but that trigger is part of the deferred
    // contract-phase migration; see
    // docs/ops/task9-competition-config-contract-phase.md. Run the same
    // production backfill CLI here (idempotent) so this fixture's tournament
    // ends up pinned exactly the way it will be in production once the
    // backfill CLI has run. ids.invalidTournament is deliberately left
    // pinned to the explicit RETIRED config above — the backfill only fills
    // in NULL values, so it will not touch that row.
    await runCompetitionConfigContractPhaseBackfill(prisma);
    await prisma.v1TournamentGroup.create({
      data: { id: ids.group, tournamentId: ids.tournament, name: 'A', phase: 'group' },
    });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        {
          id: ids.homeRegistration,
          tournamentId: ids.tournament,
          teamId: ids.homeTeam,
          appliedByUserId: ids.user,
          status: 'confirmed',
        },
        {
          id: ids.awayRegistration,
          tournamentId: ids.tournament,
          teamId: ids.awayTeam,
          appliedByUserId: ids.user,
          status: 'confirmed',
        },
      ],
    });
    await prisma.v1TournamentPlayer.createMany({
      data: [
        {
          id: ids.homePlayer,
          registrationId: ids.homeRegistration,
          userId: ids.user,
          realName: 'Home Player',
          eligibilityStatus: 'non_pro',
        },
        {
          id: ids.awayPlayer,
          registrationId: ids.awayRegistration,
          userId: ids.user,
          realName: 'Away Player',
          eligibilityStatus: 'non_pro',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates one pinned Game atomically and replays the durable fixture command', async () => {
    const request = {
      groupId: ids.group,
      round: 'group_a',
      fixtureNumber: 41,
      homeRegistrationId: ids.homeRegistration,
      awayRegistrationId: ids.awayRegistration,
      venue: 'Court A',
    };
    const [first, replay] = await Promise.all([
      bracket.createFixture(authUser, ids.tournament, request),
      bracket.createFixture(authUser, ids.tournament, request),
    ]);
    const fixture = await prisma.v1TournamentFixture.findUniqueOrThrow({
      where: { id: first.id },
      include: {
        game: {
          include: {
            sides: { orderBy: { sideKey: 'asc' } },
            participants: { orderBy: { displayNameSnapshot: 'asc' } },
          },
        },
      },
    });

    expect(replay.id).toBe(first.id);
    expect(fixture.game).not.toBeNull();
    expect(fixture.game?.competitionConfigVersionId).toBe(fixture.competitionConfigVersionId);
    expect(fixture.game?.sides).toHaveLength(2);
    expect(fixture.game?.sides).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sideKey: V1GameSideKey.AWAY,
        teamId: ids.awayTeam,
        displayNameSnapshot: 'Task 6 Away',
      }),
      expect.objectContaining({
        sideKey: V1GameSideKey.HOME,
        teamId: ids.homeTeam,
        displayNameSnapshot: 'Task 6 Home',
      }),
    ]));
    expect(fixture.game?.participants.map((participant) => participant.displayNameSnapshot)).toEqual([
      'Away Player',
      'Home Player',
    ]);
    expect(
      await prisma.v1TournamentFixture.count({
        where: { tournamentId: ids.tournament, round: 'group_a', fixtureNumber: 41 },
      }),
    ).toBe(1);

    const changedPayload = await captureFailure(() =>
      bracket.createFixture(authUser, ids.tournament, { ...request, venue: 'Court B' }),
    );
    expect(changedPayload).toBeInstanceOf(ConflictException);
    expect((changedPayload as ConflictException).getStatus()).toBe(409);
    expect(changedPayload).toMatchObject({ response: { code: 'COMMAND_IDEMPOTENCY_PAYLOAD_REUSE' } });
  });

  it('rolls back the fixture when its tournament pin is not active', async () => {
    const failure = await captureFailure(() =>
      bracket.createFixture(authUser, ids.invalidTournament, {
        round: 'group_a',
        fixtureNumber: 42,
      }),
    );

    expect(failure).toBeInstanceOf(ConflictException);
    expect((failure as ConflictException).getStatus()).toBe(409);
    expect(failure).toMatchObject({ response: { code: 'COMPETITION_CONFIG_REQUIRED' } });
    expect(
      await prisma.v1TournamentFixture.count({
        where: { tournamentId: ids.invalidTournament, fixtureNumber: 42 },
      }),
    ).toBe(0);
    expect(await prisma.v1Game.count({ where: { tournamentFixture: { tournamentId: ids.invalidTournament } } })).toBe(0);
  });

  it('rejects generic result create/delete without legacy rows, revisions, or events', async () => {
    const fixture = await prisma.v1TournamentFixture.findFirstOrThrow({
      where: { tournamentId: ids.tournament, round: 'group_a', fixtureNumber: 41 },
      include: { game: true },
    });
    const createFailure = await captureFailure(() =>
      bracket.recordResult(authUser, fixture.id, { homeScore: 1, awayScore: 0 }),
    );
    const deleteFailure = await captureFailure(() =>
      bracket.deleteFixtureResult(authUser, fixture.id),
    );

    expect(createFailure).toBeInstanceOf(ConflictException);
    expect((createFailure as ConflictException).getStatus()).toBe(409);
    expect(createFailure).toMatchObject({ response: { code: 'TOURNAMENT_RESULT_DERIVED_ONLY' } });
    expect(deleteFailure).toBeInstanceOf(ConflictException);
    expect((deleteFailure as ConflictException).getStatus()).toBe(409);
    expect(deleteFailure).toMatchObject({ response: { code: 'TOURNAMENT_RESULT_DERIVED_ONLY' } });
    expect(await prisma.v1TournamentFixtureResult.count({ where: { fixtureId: fixture.id } })).toBe(0);
    expect(await prisma.v1GameResultRevision.count({ where: { gameId: fixture.game!.id } })).toBe(0);
    expect(await prisma.v1GameEvent.count({ where: { gameId: fixture.game!.id } })).toBe(0);
    console.log(
      'TASK6_L3=PASS fixture=1 game=1 pin_copy=1 replay_same=1 generic_result_rejected=1 drafts=0',
    );
  });
});
