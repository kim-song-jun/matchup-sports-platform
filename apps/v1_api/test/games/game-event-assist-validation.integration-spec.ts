import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameActorScope, GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

const ids = {
  operator: '65000000-0000-4000-8000-000000000001',
  sport: '65000000-0000-4000-8000-000000000010',
  region: '65000000-0000-4000-8000-000000000011',
  hostTeam: '65000000-0000-4000-8000-000000000020',
  awayTeam: '65000000-0000-4000-8000-000000000021',
  tournament: '65000000-0000-4000-8000-000000000030',
  fixture: '65000000-0000-4000-8000-000000000031',
  assignment: '65000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task-assist.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function context(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
  return { actor, expectedVersion: 0, durableCommandId: commandId, payloadHash: canonicalGameCommandPayloadHash(payload) };
}

async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
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

describe('POST /games/:gameId/events — ASSIST_INVALID (T1-2)', () => {
  let gameId: string;
  let homeSideId: string;
  let scorerId: string;
  let homeTeammateId: string;
  let awayParticipantId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    await prisma.v1User.create({ data: { id: ids.operator, email: 'task-assist-operator@example.test', accountStatus: 'active', onboardingStatus: 'completed' } });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football-assist', name: 'Task Assist Football' } });
    await prisma.v1Region.create({ data: { id: ids.region, code: 'TASK_ASSIST_REGION', name: 'Task Assist Region', level: 1 } });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Assist Host' },
        { id: ids.awayTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Assist Away' },
      ],
    });
    await prisma.v1Tournament.create({ data: { id: ids.tournament, sportId: ids.sport, title: 'Task Assist Tournament', competitionConfigVersionId: config.id } });
    await prisma.v1TournamentFixture.create({ data: { id: ids.fixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, competitionConfigVersionId: config.id } });
    await prisma.v1TournamentStaffAssignment.create({
      data: { id: ids.assignment, tournamentId: ids.tournament, userId: ids.operator, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: ids.operator },
    });
    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'PUBLIC_LIVE' },
      create: { key: 'PUBLIC_LIVE', value: 'off', ownerActor: 'platform_ops' },
      update: {},
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Assist Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Assist Away' },
      ],
      participants: [
        { sourceParticipantId: 'home-scorer', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Scorer' },
        { sourceParticipantId: 'home-teammate', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Teammate' },
        { sourceParticipantId: 'away-player', sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away Player' },
      ],
    };
    const actor: GameActorScope = { actorType: 'USER', actorUserId: ids.operator, role: 'field_operator', tournamentId: ids.tournament, fixtureId: ids.fixture };
    const created = await prisma.$transaction((tx) => service.createFromSourceInTransaction(tx, input, context(actor, 'assist-source-create', input)));
    gameId = created.gameId;
    const persisted = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, include: { sides: true, participants: true } });
    homeSideId = persisted.sides.find((s) => s.sideKey === 'HOME')!.id;
    scorerId = persisted.participants.find((p) => p.displayNameSnapshot === 'Scorer')!.id;
    homeTeammateId = persisted.participants.find((p) => p.displayNameSnapshot === 'Teammate')!.id;
    awayParticipantId = persisted.participants.find((p) => p.displayNameSnapshot === 'Away Player')!.id;

    const startToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-client', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'start', 'assist-start', {
      expectedVersion: 0,
      clientCommandId: 'assist-start',
      takeoverToken: startToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function freshToken(seed: string) {
    return (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: seed, lastSequence: 0 })).takeoverToken;
  }

  it('rejects an assist attached to a non-GOAL event', async () => {
    const token = await freshToken('assist-non-goal');
    const failure = await captureFailure(() =>
      service.appendEvent(authUser(ids.operator), gameId, 'assist-non-goal', {
        expectedVersion: 1,
        clientEventId: 'assist-non-goal',
        takeoverToken: token,
        type: 'CARD' as never,
        sideId: homeSideId,
        participantId: scorerId,
        assistParticipantId: homeTeammateId,
        period: 1,
        clockMs: 1000,
        occurredAt: new Date().toISOString(),
        payload: { card: 'YELLOW' },
      }),
    );
    expectHttpCode(failure, 422, 'ASSIST_INVALID');
  });

  it('rejects a scorer crediting themself with the assist', async () => {
    const token = await freshToken('assist-self');
    const failure = await captureFailure(() =>
      service.appendEvent(authUser(ids.operator), gameId, 'assist-self', {
        expectedVersion: 1,
        clientEventId: 'assist-self',
        takeoverToken: token,
        type: 'GOAL' as never,
        sideId: homeSideId,
        participantId: scorerId,
        assistParticipantId: scorerId,
        period: 1,
        clockMs: 1000,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(failure, 422, 'ASSIST_INVALID');
  });

  it('rejects an assist participant from the other side', async () => {
    const token = await freshToken('assist-cross-side');
    const failure = await captureFailure(() =>
      service.appendEvent(authUser(ids.operator), gameId, 'assist-cross-side', {
        expectedVersion: 1,
        clientEventId: 'assist-cross-side',
        takeoverToken: token,
        type: 'GOAL' as never,
        sideId: homeSideId,
        participantId: scorerId,
        assistParticipantId: awayParticipantId,
        period: 1,
        clockMs: 1000,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(failure, 422, 'ASSIST_INVALID');
  });

  it('accepts a same-side, different-participant assist and persists assistParticipantId', async () => {
    const token = await freshToken('assist-valid');
    const appended = await service.appendEvent(authUser(ids.operator), gameId, 'assist-valid', {
      expectedVersion: 1,
      clientEventId: 'assist-valid',
      takeoverToken: token,
      type: 'GOAL' as never,
      sideId: homeSideId,
      participantId: scorerId,
      assistParticipantId: homeTeammateId,
      period: 1,
      clockMs: 1000,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    const stored = await prisma.v1GameEvent.findUniqueOrThrow({ where: { gameId_sequence: { gameId, sequence: appended.sequence } } });
    expect(stored.assistParticipantId).toBe(homeTeammateId);
  });
});
