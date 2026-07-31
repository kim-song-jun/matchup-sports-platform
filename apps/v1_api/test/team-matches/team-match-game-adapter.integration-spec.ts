import { HttpException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  V1GameEventType,
  V1GameSideKey,
  V1GameSourceType,
  V1GameState,
} from '@prisma/client';
import {
  canonicalGameCommandPayloadHash,
  GamesService,
} from '../../src/games/games.service';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { MutateTeamMatchDto } from '../../src/team-matches/dto/mutate-team-match.dto';
import { TeamMatchesService } from '../../src/team-matches/team-matches.service';

const ids = {
  hostUser: '62000000-0000-4000-8000-000000000001',
  opponentUser: '62000000-0000-4000-8000-000000000002',
  sport: '62000000-0000-4000-8000-000000000010',
  unsupportedSport: '62000000-0000-4000-8000-000000000012',
  region: '62000000-0000-4000-8000-000000000011',
  hostTeam: '62000000-0000-4000-8000-000000000020',
  opponentTeam: '62000000-0000-4000-8000-000000000021',
  unsupportedTeam: '62000000-0000-4000-8000-000000000022',
  pinnedTeamMatch: '62000000-0000-4000-8000-000000000030',
  application: '62000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma);
const notifications = {
  emitNotification: async () => undefined,
  emitToManyDeferred: () => undefined,
};
const authUser = (id: string) => ({
  id,
  email: `${id}@example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

async function captureFailure(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

function invokeCreate(
  service: TeamMatchesService,
  dto: MutateTeamMatchDto,
  durableCommandId: string,
) {
  return service.create(authUser(ids.hostUser), dto, durableCommandId);
}

describe('Task 6 L2 team-match Game adapter', () => {
  let teamMatches: TeamMatchesService;
  let moduleRef: TestingModule | undefined;
  let sportId: string;
  let unsupportedSportId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 6 L2 integration verification');
    }
    await prisma.$connect();
    await prisma.v1User.createMany({
      data: [
        {
          id: ids.hostUser,
          email: 'task6-l2-host@example.test',
          phone: '01062000001',
          accountStatus: 'active',
          onboardingStatus: 'completed',
        },
        {
          id: ids.opponentUser,
          email: 'task6-l2-opponent@example.test',
          phone: '01062000002',
          accountStatus: 'active',
          onboardingStatus: 'completed',
        },
      ],
    });
    await prisma.v1UserProfile.createMany({
      data: [
        {
          userId: ids.hostUser,
          nickname: 'L2 Host',
          displayName: 'L2 Host',
          realName: 'L2 Host Real',
          gender: 'male',
        },
        {
          userId: ids.opponentUser,
          nickname: 'L2 Opponent',
          displayName: 'L2 Opponent',
          realName: 'L2 Opponent Real',
          gender: 'female',
        },
      ],
    });
    const football = await prisma.v1Sport.upsert({
      where: { code: 'football' },
      update: {},
      create: { id: ids.sport, code: 'football', name: 'Task 6 L2 Football' },
      select: { id: true },
    });
    const unsupportedSport = await prisma.v1Sport.upsert({
      where: { code: 'basketball' },
      update: {},
      create: {
        id: ids.unsupportedSport,
        code: 'basketball',
        name: 'Task 6 L2 Unsupported',
      },
      select: { id: true },
    });
    sportId = football.id;
    unsupportedSportId = unsupportedSport.id;
    await prisma.v1Region.create({
      data: {
        id: ids.region,
        code: 'TASK6_L2_REGION',
        name: 'Task 6 L2 Region',
        level: 2,
      },
    });
    await prisma.v1Team.createMany({
      data: [
        {
          id: ids.hostTeam,
          ownerUserId: ids.hostUser,
          sportId,
          regionId: ids.region,
          name: 'Task 6 L2 Host',
        },
        {
          id: ids.opponentTeam,
          ownerUserId: ids.opponentUser,
          sportId,
          regionId: ids.region,
          name: 'Task 6 L2 Opponent',
        },
        {
          id: ids.unsupportedTeam,
          ownerUserId: ids.hostUser,
          sportId: unsupportedSportId,
          regionId: ids.region,
          name: 'Task 6 L2 Unsupported',
        },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        {
          teamId: ids.hostTeam,
          userId: ids.hostUser,
          role: 'owner',
          status: 'active',
        },
        {
          teamId: ids.opponentTeam,
          userId: ids.opponentUser,
          role: 'owner',
          status: 'active',
        },
        {
          teamId: ids.unsupportedTeam,
          userId: ids.hostUser,
          role: 'owner',
          status: 'active',
        },
      ],
    });
    moduleRef = await Test.createTestingModule({
      providers: [
        TeamMatchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: GamesService, useValue: games },
      ],
    }).compile();
    teamMatches = moduleRef.get(TeamMatchesService);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await prisma.$disconnect();
  });

  it('PIN: direct TeamMatch persistence keeps the Task 11 sport preset and has no implicit Game', async () => {
    const created = await prisma.v1TeamMatch.create({
      data: {
        id: ids.pinnedTeamMatch,
        hostTeamId: ids.hostTeam,
        createdByUserId: ids.hostUser,
        sportId,
        regionId: ids.region,
        title: 'Task 6 L2 pin baseline',
        placeName: 'Task 6 L2 ground',
        startAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    });
    const gameCount = await prisma.v1Game.count({
      where: { teamMatchId: created.id },
    });

    expect(created.competitionConfigVersionId).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(gameCount).toBe(0);
  });

  it('creates and replays one pinned TeamMatch/Game, rejects changed payload and rolls back missing config', async () => {
    const dto: MutateTeamMatchDto = {
      hostTeamId: ids.hostTeam,
      sportId,
      regionId: ids.region,
      title: 'Task 6 L2 adapter match',
      startsAt: '2026-09-02T00:00:00.000Z',
      manualPlaceName: 'Task 6 L2 arena',
    };
    const first = await invokeCreate(teamMatches, dto, 'task6-l2-create-command');
    const replay = await invokeCreate(teamMatches, dto, 'task6-l2-create-command');
    const teamMatchId = String(first.teamMatchId);
    const gameId = String(first.gameId);
    const persisted = await prisma.v1TeamMatch.findUniqueOrThrow({
      where: { id: teamMatchId },
      include: {
        game: {
          include: {
            sides: { orderBy: { sideKey: 'asc' } },
            participants: true,
          },
        },
      },
    });

    expect(replay).toEqual(first);
    expect(await prisma.v1TeamMatch.count({ where: { title: dto.title } })).toBe(1);
    expect(await prisma.v1Game.count({ where: { teamMatchId } })).toBe(1);
    expect(persisted.game?.id).toBe(gameId);
    expect(persisted.game?.competitionConfigVersionId).toBe(
      persisted.competitionConfigVersionId,
    );
    expect(persisted.game?.sides.map((side) => side.sideKey)).toEqual([
      'HOME',
      'AWAY',
    ]);
    expect(persisted.game?.participants).toHaveLength(1);

    const changedPayload = await captureFailure(() =>
      invokeCreate(
        teamMatches,
        { ...dto, title: 'Task 6 L2 changed payload' },
        'task6-l2-create-command',
      ),
    );
    expectHttpCode(changedPayload, 409, 'IDEMPOTENCY_PAYLOAD_CONFLICT');
    console.log('EXPECTED_FAILURE changed_payload=IDEMPOTENCY_PAYLOAD_CONFLICT');
    expect(
      await prisma.v1TeamMatch.count({
        where: { title: 'Task 6 L2 changed payload' },
      }),
    ).toBe(0);

    const missingConfig = await captureFailure(() =>
      invokeCreate(
        teamMatches,
        {
          ...dto,
          hostTeamId: ids.unsupportedTeam,
          sportId: unsupportedSportId,
          title: 'Task 6 L2 unsupported config',
        },
        'task6-l2-unsupported-command',
      ),
    );
    expectHttpCode(missingConfig, 409, 'COMPETITION_CONFIG_REQUIRED');
    console.log('EXPECTED_FAILURE missing_pin=COMPETITION_CONFIG_REQUIRED');
    expect(
      await prisma.v1TeamMatch.count({
        where: { title: 'Task 6 L2 unsupported config' },
      }),
    ).toBe(0);
    expect(await prisma.v1Game.count({ where: { teamMatchId } })).toBe(1);

    const interruptedTitle = 'Task 6 L2 interrupted source transaction';
    const interrupted = await captureFailure(() =>
      prisma.$transaction(async (tx) => {
        const source = await tx.v1TeamMatch.create({
          data: {
            hostTeamId: ids.hostTeam,
            createdByUserId: ids.hostUser,
            sportId,
            regionId: ids.region,
            title: interruptedTitle,
            placeName: 'Task 6 L2 rollback ground',
            startAt: new Date('2026-09-03T00:00:00.000Z'),
          },
        });
        await games.createFromSourceInTransaction(
          tx,
          {
            sourceType: V1GameSourceType.TEAM_MATCH,
            sourceId: source.id,
            competitionConfigVersionId: '',
            sides: [
              {
                sideKey: V1GameSideKey.HOME,
                teamId: ids.hostTeam,
                displayNameSnapshot: 'Task 6 L2 Host',
              },
              {
                sideKey: V1GameSideKey.AWAY,
                teamId: null,
                displayNameSnapshot: '상대 팀 미정',
              },
            ],
            participants: [],
          },
          {
            actor: {
              actorType: 'USER',
              actorUserId: ids.hostUser,
              role: 'team_owner',
              teamId: ids.hostTeam,
            },
            expectedVersion: 0,
            durableCommandId: 'task6-l2-interrupted-source',
            payloadHash: canonicalGameCommandPayloadHash({
              title: interruptedTitle,
            }),
          },
        );
      }),
    );
    expectHttpCode(interrupted, 409, 'COMPETITION_CONFIG_REQUIRED');
    expect(
      await prisma.v1TeamMatch.count({ where: { title: interruptedTitle } }),
    ).toBe(0);
    expect(
      await prisma.v1Game.count({
        where: { teamMatch: { title: interruptedTitle } },
      }),
    ).toBe(0);
    console.log('EXPECTED_FAILURE transaction_interruption=ROLLBACK_NO_ORPHAN');
  });

  it('hydrates the approved AWAY snapshot and atomically freezes a scorer result while ending the Game', async () => {
    const created = await prisma.v1TeamMatch.findFirstOrThrow({
      where: { title: 'Task 6 L2 adapter match' },
      include: { game: true },
    });
    await prisma.v1TeamMatchApplication.create({
      data: {
        id: ids.application,
        teamMatchId: created.id,
        applicantTeamId: ids.opponentTeam,
        appliedByUserId: ids.opponentUser,
        status: 'requested',
      },
    });
    await teamMatches.approveApplication(authUser(ids.hostUser), ids.application, {});

    const game = await prisma.v1Game.findUniqueOrThrow({
      where: { id: created.game?.id },
      include: {
        sides: { orderBy: { sideKey: 'asc' } },
        participants: { orderBy: { displayNameSnapshot: 'asc' } },
      },
    });
    const homeSide = game.sides.find((side) => side.sideKey === 'HOME');
    const awaySide = game.sides.find((side) => side.sideKey === 'AWAY');
    const hostParticipant = game.participants.find(
      (participant) => participant.sideId === homeSide?.id,
    );
    const opponentParticipant = game.participants.find(
      (participant) => participant.sideId === awaySide?.id,
    );
    expect(homeSide?.teamId).toBe(ids.hostTeam);
    expect(awaySide?.teamId).toBe(ids.opponentTeam);
    expect(hostParticipant).toBeDefined();
    expect(opponentParticipant).toBeDefined();

    const invalidParticipant = await captureFailure(() =>
      games.createResultRevision(authUser(ids.hostUser), game.id, 'invalid-participant', {
        expectedVersion: 0,
        clientCommandId: 'invalid-participant',
        score: { home: 0, away: 0 },
        actualParticipants: [
          {
            participantId: hostParticipant?.id ?? '',
            sideId: homeSide?.id ?? '',
            started: true,
            goals: 0,
            cards: { yellow: 0, red: 0 },
            goalkeeper: false,
          },
          {
            participantId: hostParticipant?.id ?? '',
            sideId: homeSide?.id ?? '',
            started: false,
            goals: 0,
            cards: { yellow: 0, red: 0 },
            goalkeeper: false,
          },
        ],
        eventsHash: 'invalid-participant-events',
      }),
    );
    expectHttpCode(invalidParticipant, 422, 'PARTICIPANT_INVALID');
    console.log('EXPECTED_FAILURE invalid_participant=PARTICIPANT_INVALID');
    expect(await prisma.v1GameResultRevision.count({ where: { gameId: game.id } })).toBe(0);

    await prisma.$transaction(async (tx) => {
      await tx.v1GameEvent.create({
        data: {
          gameId: game.id,
          sequence: 1,
          clientEventId: 'task6-l2-goal-event',
          payloadHash: 'a'.repeat(64),
          type: V1GameEventType.GOAL,
          sideId: homeSide?.id,
          participantId: hostParticipant?.id,
          period: 1,
          clockMs: 1_000,
          occurredAt: new Date('2026-09-02T00:01:00.000Z'),
          actorUserId: ids.hostUser,
          payload: { source: 'team-result-recorder' },
        },
      });
      await tx.v1Game.update({
        where: { id: game.id },
        data: { lastSequence: 1, version: { increment: 1 } },
      });
    });

    const genericCommand = await captureFailure(() =>
      games.executeCommand(authUser(ids.hostUser), game.id, 'start', 'team-start', {
        expectedVersion: 1,
        clientCommandId: 'team-start',
        takeoverToken: 'not-applicable',
        occurredAt: '2026-09-02T00:00:00.000Z',
        payload: {},
      }),
    );
    expectHttpCode(genericCommand, 409, 'TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN');

    const draft = await games.createResultRevision(
      authUser(ids.hostUser),
      game.id,
      'team-result-draft',
      {
        expectedVersion: 1,
        clientCommandId: 'team-result-draft',
        score: { home: 1, away: 0 },
        actualParticipants: [
          {
            participantId: hostParticipant?.id ?? '',
            sideId: homeSide?.id ?? '',
            started: true,
            goals: 1,
            cards: { yellow: 0, red: 0 },
            goalkeeper: false,
          },
          {
            participantId: opponentParticipant?.id ?? '',
            sideId: awaySide?.id ?? '',
            started: true,
            goals: 0,
            cards: { yellow: 0, red: 0 },
            goalkeeper: true,
          },
        ],
        eventsHash: 'task6-l2-one-goal',
      },
    );
    const submitted = await games.submitResultRevision(
      authUser(ids.hostUser),
      game.id,
      draft.revisionId,
      'team-result-submit',
      { expectedVersion: 2, clientCommandId: 'team-result-submit' },
    );
    const ended = await prisma.v1Game.findUniqueOrThrow({ where: { id: game.id } });
    const frozen = await prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: draft.revisionId },
      include: { resultParticipants: true },
    });

    expect(submitted.state).toBe(V1GameState.ENDED);
    expect(ended.state).toBe(V1GameState.ENDED);
    expect(frozen.state).toBe('SUBMITTED');
    expect(frozen.resultParticipants).toHaveLength(2);
    const terminalMutation = await captureFailure(() =>
      prisma.v1GameResultRevision.update({
        where: { id: frozen.id },
        data: { score: { home: 9, away: 9 } },
      }),
    );
    expect(String(terminalMutation)).toContain('submitted result content is frozen');
    console.log(
      'TASK6_L2=PASS team_match=1 game=1 pin_copy=1 replay_same=1 result_revision=1 game_ended=1',
    );
  });
});
