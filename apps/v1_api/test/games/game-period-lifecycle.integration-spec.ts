import { HttpException } from '@nestjs/common';
import { V1GameEventType, V1GameSideKey, V1GameSourceType, V1GameState } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type {
  GameActorScope,
  GameCommandContext,
  GameSourceCreationInput,
} from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * T1-0 — this is a live-defect fix, not a new feature (design doc §2.8).
 * Before this PR: `start` never touches `V1GamePeriod`, so `startedAt` stays
 * null forever, and nothing ever closes a period either. The console then
 * falls back to `Date.now()` and every captured event freezes at clockMs≈0
 * regardless of which period it claims to be in. This suite proves the DB
 * rows themselves now carry real, distinct period/clockMs values.
 */
const ids = {
  director: '65000000-0000-4000-8000-000000000001',
  sport: '65000000-0000-4000-8000-000000000010',
  region: '65000000-0000-4000-8000-000000000011',
  hostTeam: '65000000-0000-4000-8000-000000000020',
  opponentTeam: '65000000-0000-4000-8000-000000000021',
  tournament: '65000000-0000-4000-8000-000000000030',
  fixture: '65000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task-t1-0.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function sourceContext(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
  return {
    actor,
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

function expectHttpCode(error: unknown, status: number, code: string) {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  expect(exception.getStatus()).toBe(status);
  expect(exception.getResponse()).toEqual(expect.objectContaining({ code }));
}

async function captureFailure(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to fail');
}

describe('T1-0 period lifecycle — start/next_period/end drive V1GamePeriod, not a Date.now() fallback', () => {
  let configId: string;
  let gameId: string;
  let homeSideId: string;
  let homeParticipantId: string;
  let takeoverToken: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the T1-0 period-lifecycle integration suite');
    }
    await prisma.$connect();
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('The migrated football-v1 competition preset is required');
    }
    configId = config.id;

    await prisma.v1User.create({
      data: {
        id: ids.director,
        email: 't1-0-director@example.test',
        accountStatus: 'active',
        onboardingStatus: 'completed',
      },
    });
    await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football', name: 'T1-0 Football' } });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'T1_0_REGION', name: 'T1-0 Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.director, sportId: ids.sport, regionId: ids.region, name: 'T1-0 Host' },
        {
          id: ids.opponentTeam,
          ownerUserId: ids.director,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'T1-0 Opponent',
        },
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'T1-0 tournament', competitionConfigVersionId: configId },
    });
    await prisma.v1TournamentFixture.create({
      data: {
        id: ids.fixture,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: 1,
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1TournamentStaffAssignment.create({
      data: {
        tournamentId: ids.tournament,
        userId: ids.director,
        role: 'TOURNAMENT_DIRECTOR',
        grantedByUserId: ids.director,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixture,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'T1-0 Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'T1-0 Opponent' },
      ],
      participants: [
        { sourceParticipantId: 't1-0-home-player-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'T1-0 Scorer' },
      ],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.director,
      role: 'tournament_director',
      tournamentId: ids.tournament,
      fixtureId: ids.fixture,
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, sourceContext(actor, 't1-0-create', input)),
    );
    gameId = created.gameId;
    const home = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
    homeSideId = home.id;
    const homeParticipant = await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId, sideId: home.id } });
    homeParticipantId = homeParticipant.id;
    // GamesService.assertLineupsSubmittedForStart requires a SUBMITTED/LOCKED
    // lineup on every side before `start` is allowed. createFromSourceInTransaction
    // already creates a DRAFT revision-1 lineup per side at game creation, so
    // flip those straight to SUBMITTED (bypassing
    // GamesService.saveLineup/submitLineup, which would consume `version`).
    await prisma.v1GameLineup.updateMany({
      where: { gameId, revision: 1 },
      data: { state: 'SUBMITTED' },
    });
    takeoverToken = (
      await service.requestTakeover(authUser(ids.director), gameId, { clientInstanceId: 't1-0-client', lastSequence: 0 })
    ).takeoverToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('start opens period 1 LIVE with a real startedAt — not left SCHEDULED forever', async () => {
    const before = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(before).toHaveLength(2);
    expect(before.every((period) => period.state === 'SCHEDULED' && period.startedAt === null)).toBe(true);

    await service.executeCommand(authUser(ids.director), gameId, 'start', 't1-0-start', {
      expectedVersion: 0,
      clientCommandId: 't1-0-start',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });

    const after = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(after[0]).toEqual(expect.objectContaining({ number: 1, state: 'LIVE' }));
    expect(after[0].startedAt).not.toBeNull();
    expect(after[1]).toEqual(expect.objectContaining({ number: 2, state: 'SCHEDULED', startedAt: null }));
  });

  it('rejects an event on period 2 before it has started (409 PERIOD_NOT_STARTED)', async () => {
    const rejected = await captureFailure(() =>
      service.appendEvent(authUser(ids.director), gameId, 't1-0-early-p2', {
        expectedVersion: 1,
        clientEventId: 't1-0-early-p2',
        takeoverToken,
        type: V1GameEventType.GOAL,
        sideId: homeSideId,
        participantId: homeParticipantId,
        period: 2,
        clockMs: 0,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(rejected, 409, 'PERIOD_NOT_STARTED');
  });

  it('records two goals across next_period at two distinct, real, nonzero clock times — the exit proof', async () => {
    // The test derives clockMs from the period's own `startedAt` exactly the
    // way the console's `freezeCapture()` does, instead of a hardcoded
    // literal — that is what makes this a genuine regression proof rather
    // than an assertion on a value the test itself invented.
    const period1 = await prisma.v1GamePeriod.findFirstOrThrow({ where: { gameId, number: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const clockMs1 = Date.now() - period1.startedAt!.getTime();

    const firstGoal = await service.appendEvent(authUser(ids.director), gameId, 't1-0-goal-1', {
      expectedVersion: 1,
      clientEventId: 't1-0-goal-1',
      takeoverToken,
      type: V1GameEventType.GOAL,
      sideId: homeSideId,
      participantId: homeParticipantId,
      period: 1,
      clockMs: clockMs1,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    expect(firstGoal.sequence).toBe(1);

    await service.executeCommand(authUser(ids.director), gameId, 'next-period', 't1-0-next-period', {
      expectedVersion: 2,
      clientCommandId: 't1-0-next-period',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });

    const periodsAfterNext = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(periodsAfterNext[0]).toEqual(expect.objectContaining({ number: 1, state: 'ENDED' }));
    expect(periodsAfterNext[0].endedAt).not.toBeNull();
    expect(periodsAfterNext[1]).toEqual(expect.objectContaining({ number: 2, state: 'LIVE' }));
    expect(periodsAfterNext[1].startedAt).not.toBeNull();

    const period2 = periodsAfterNext[1];
    await new Promise((resolve) => setTimeout(resolve, 20));
    const clockMs2 = Date.now() - period2.startedAt!.getTime();

    const secondGoal = await service.appendEvent(authUser(ids.director), gameId, 't1-0-goal-2', {
      expectedVersion: 3,
      clientEventId: 't1-0-goal-2',
      takeoverToken,
      type: V1GameEventType.GOAL,
      sideId: homeSideId,
      participantId: homeParticipantId,
      period: 2,
      clockMs: clockMs2,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    expect(secondGoal.sequence).toBe(2);

    // *** Exit proof (design doc §T1-0): read the persisted rows directly. ***
    const persistedEvents = await prisma.v1GameEvent.findMany({
      where: { gameId, type: V1GameEventType.GOAL },
      orderBy: { sequence: 'asc' },
    });
    expect(persistedEvents).toHaveLength(2);
    expect(persistedEvents[0].period).toBe(1);
    expect(persistedEvents[1].period).toBe(2);
    expect(persistedEvents[0].clockMs).toBeGreaterThan(0);
    expect(persistedEvents[1].clockMs).toBeGreaterThan(0);
    expect(persistedEvents[0].clockMs).not.toBe(persistedEvents[1].clockMs);
  });

  it('rejects a late event on the now-ended period 1 (409 PERIOD_ALREADY_ENDED)', async () => {
    const rejected = await captureFailure(() =>
      service.appendEvent(authUser(ids.director), gameId, 't1-0-late-p1', {
        expectedVersion: 4,
        clientEventId: 't1-0-late-p1',
        takeoverToken,
        type: V1GameEventType.GOAL,
        sideId: homeSideId,
        participantId: homeParticipantId,
        period: 1,
        clockMs: 0,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(rejected, 409, 'PERIOD_ALREADY_ENDED');
  });

  it('rejects next_period once there is no next period (409 NO_NEXT_PERIOD)', async () => {
    const rejected = await captureFailure(() =>
      service.executeCommand(authUser(ids.director), gameId, 'next-period', 't1-0-no-next', {
        expectedVersion: 4,
        clientCommandId: 't1-0-no-next',
        takeoverToken,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(rejected, 409, 'NO_NEXT_PERIOD');
  });

  it('end closes the still-LIVE period 2', async () => {
    await service.executeCommand(authUser(ids.director), gameId, 'end', 't1-0-end', {
      expectedVersion: 4,
      clientCommandId: 't1-0-end',
      takeoverToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    const finalPeriods = await prisma.v1GamePeriod.findMany({ where: { gameId }, orderBy: { number: 'asc' } });
    expect(finalPeriods.every((period) => period.state === 'ENDED' && period.endedAt !== null)).toBe(true);
  });
});
