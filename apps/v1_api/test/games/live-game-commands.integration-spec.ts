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

const ids = {
  platformOps: '92000000-0000-4000-8000-000000000001',
  director: '92000000-0000-4000-8000-000000000002',
  fieldOperator: '92000000-0000-4000-8000-000000000003',
  sport: '92000000-0000-4000-8000-000000000010',
  region: '92000000-0000-4000-8000-000000000011',
  hostTeam: '92000000-0000-4000-8000-000000000020',
  opponentTeam: '92000000-0000-4000-8000-000000000021',
  tournament: '92000000-0000-4000-8000-000000000030',
  fixtureLive: '92000000-0000-4000-8000-000000000040',
  fixtureEnd: '92000000-0000-4000-8000-000000000041',
  fixtureRecovery: '92000000-0000-4000-8000-000000000042',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task20.example.test`,
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

async function grantTakeover(gameId: string, userId: string, clientInstanceId = 'task20-client') {
  return (
    await service.requestTakeover(authUser(userId), gameId, { clientInstanceId, lastSequence: 0 })
  ).takeoverToken;
}

describe('Task 20 live tournament commands, event validation, atomic result submission, and takeover safety', () => {
  let configId: string;
  let liveGameId: string;
  let liveHomeSideId: string;
  let liveHomeParticipantId: string;
  let fieldOperatorAssignmentId: string;

  async function createTournamentGame(fixtureId: string): Promise<{
    gameId: string;
    homeSideId: string;
    homeParticipantId: string;
  }> {
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: fixtureId,
      competitionConfigVersionId: configId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 20 Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 20 Opponent' },
      ],
      participants: [
        {
          sourceParticipantId: `${fixtureId}-home-player-1`,
          sideKey: V1GameSideKey.HOME,
          displayNameSnapshot: 'Task 20 Host Scorer',
        },
      ],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.director,
      role: 'tournament_director',
      tournamentId: ids.tournament,
      fixtureId,
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, sourceContext(actor, `task20-create-${fixtureId}`, input)),
    );
    const home = await prisma.v1GameSide.findFirstOrThrow({
      where: { gameId: created.gameId, sideKey: V1GameSideKey.HOME },
    });
    const homeParticipant = await prisma.v1GameParticipant.findFirstOrThrow({
      where: { gameId: created.gameId, sideId: home.id },
    });
    return { gameId: created.gameId, homeSideId: home.id, homeParticipantId: homeParticipant.id };
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 20 live-command integration suite');
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

    await prisma.v1User.createMany({
      data: [ids.platformOps, ids.director, ids.fieldOperator].map((id, index) => ({
        id,
        email: `task20-actor-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'ops', status: 'active' },
    });
    // The code must be one the DB actually supports: v1_competition_config_for_sport()
    // (migration 20260729000200) maps only soccer/football/futsal and otherwise raises
    // COMPETITION_CONFIG_SPORT_UNSUPPORTED, which fires the moment a Tournament or TeamMatch is
    // created against this sport. Sibling game suites use the same shared code with a per-suite name.
    await prisma.v1Sport.create({
      data: { id: ids.sport, code: 'football', name: 'Task 20 Football' },
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK20_REGION', name: 'Task 20 Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.director, sportId: ids.sport, regionId: ids.region, name: 'Task 20 Host' },
        {
          id: ids.opponentTeam,
          ownerUserId: ids.director,
          sportId: ids.sport,
          regionId: ids.region,
          name: 'Task 20 Opponent',
        },
      ],
    });
    await prisma.v1Tournament.create({
      data: {
        id: ids.tournament,
        sportId: ids.sport,
        title: 'Task 20 tournament',
        competitionConfigVersionId: configId,
      },
    });
    await prisma.v1TournamentFixture.createMany({
      data: [ids.fixtureLive, ids.fixtureEnd, ids.fixtureRecovery].map((id, index) => ({
        id,
        tournamentId: ids.tournament,
        round: 'group',
        fixtureNumber: index + 1,
        competitionConfigVersionId: configId,
      })),
    });
    await prisma.v1TournamentStaffAssignment.create({
      data: {
        id: '92000000-0000-4000-8000-000000000050',
        tournamentId: ids.tournament,
        userId: ids.director,
        role: 'TOURNAMENT_DIRECTOR',
        grantedByUserId: ids.director,
      },
    });
    await prisma.$transaction(async (tx) => {
      const assignment = await tx.v1TournamentStaffAssignment.create({
        data: {
          tournamentId: ids.tournament,
          userId: ids.fieldOperator,
          role: 'FIELD_OPERATOR',
          grantedByUserId: ids.director,
        },
      });
      fieldOperatorAssignmentId = assignment.id;
      await tx.v1TournamentStaffFixtureScope.createMany({
        data: [ids.fixtureLive, ids.fixtureEnd, ids.fixtureRecovery].map((fixtureId) => ({
          assignmentId: assignment.id,
          fixtureId,
        })),
      });
    });

    const live = await createTournamentGame(ids.fixtureLive);
    liveGameId = live.gameId;
    liveHomeSideId = live.homeSideId;
    liveHomeParticipantId = live.homeParticipantId;

    const startToken = await grantTakeover(liveGameId, ids.director);
    await service.executeCommand(authUser(ids.director), liveGameId, 'start', 'task20-live-start', {
      expectedVersion: 0,
      clientCommandId: 'task20-live-start',
      takeoverToken: startToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('grants an exclusive takeover token; a fresh grant supersedes and invalidates the prior token everywhere it is used', async () => {
    const holderA = await service.requestTakeover(authUser(ids.director), liveGameId, {
      clientInstanceId: 'client-a',
      lastSequence: 0,
    });
    expect(holderA.takeoverToken).toMatch(/^[a-f0-9]{64}$/);

    let game = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    const usedFirstToken = await service.appendEvent(authUser(ids.director), liveGameId, 'task20-takeover-a', {
      expectedVersion: game.version,
      clientEventId: 'task20-takeover-a',
      takeoverToken: holderA.takeoverToken,
      type: V1GameEventType.PERIOD_START,
      sideId: liveHomeSideId,
      period: 1,
      clockMs: 0,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    expect(usedFirstToken.replayed).toBe(false);

    // A fresh grant for the same game supersedes holderA's token, even though
    // holderA never explicitly released it.
    const holderB = await service.requestTakeover(authUser(ids.director), liveGameId, {
      clientInstanceId: 'client-b',
      lastSequence: usedFirstToken.sequence,
    });
    expect(holderB.takeoverToken).not.toBe(holderA.takeoverToken);

    game = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    const deniedWithStaleToken = await captureFailure(() =>
      service.appendEvent(authUser(ids.director), liveGameId, 'task20-takeover-a-stale', {
        expectedVersion: game.version,
        clientEventId: 'task20-takeover-a-stale',
        takeoverToken: holderA.takeoverToken,
        type: V1GameEventType.PERIOD_START,
        sideId: liveHomeSideId,
        period: 1,
        clockMs: 0,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(deniedWithStaleToken, 403, 'TAKEOVER_TOKEN_EXPIRED');
    expect(
      await prisma.v1GameEvent.count({ where: { gameId: liveGameId, clientEventId: 'task20-takeover-a-stale' } }),
    ).toBe(0);

    const usedFreshToken = await service.appendEvent(authUser(ids.director), liveGameId, 'task20-takeover-b', {
      expectedVersion: game.version,
      clientEventId: 'task20-takeover-b',
      takeoverToken: holderB.takeoverToken,
      type: V1GameEventType.PERIOD_START,
      sideId: liveHomeSideId,
      period: 1,
      clockMs: 0,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    expect(usedFreshToken.replayed).toBe(false);
  });

  it('renews a held token within the window, rejects renewal from a mismatched client instance, and lets a reacquired grant recover after an offline gap', async () => {
    const held = await service.requestTakeover(authUser(ids.director), liveGameId, {
      clientInstanceId: 'renew-client',
      lastSequence: 0,
    });

    const wrongClient = await captureFailure(() =>
      service.renewTakeover(authUser(ids.director), liveGameId, {
        takeoverToken: held.takeoverToken,
        clientInstanceId: 'a-different-client',
      }),
    );
    expectHttpCode(wrongClient, 403, 'TAKEOVER_TOKEN_EXPIRED');

    const renewed = await service.renewTakeover(authUser(ids.director), liveGameId, {
      takeoverToken: held.takeoverToken,
      clientInstanceId: 'renew-client',
    });
    expect(renewed.takeoverToken).toBe(held.takeoverToken);

    // Simulate an offline gap that outlasted the token: a stale grant no
    // longer authorizes commands, but the operator can reacquire a fresh one
    // (matching the offline-rebase reacquire flow) and continue.
    const reacquired = await service.requestTakeover(authUser(ids.director), liveGameId, {
      clientInstanceId: 'renew-client',
      lastSequence: 0,
    });
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    const deniedStale = await captureFailure(() =>
      service.appendEvent(authUser(ids.director), liveGameId, 'task20-reacquire-stale', {
        expectedVersion: game.version,
        clientEventId: 'task20-reacquire-stale',
        takeoverToken: held.takeoverToken,
        type: V1GameEventType.PERIOD_START,
        sideId: liveHomeSideId,
        period: 1,
        clockMs: 0,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(deniedStale, 403, 'TAKEOVER_TOKEN_EXPIRED');
    const rebased = await service.appendEvent(authUser(ids.director), liveGameId, 'task20-reacquire-fresh', {
      expectedVersion: game.version,
      clientEventId: 'task20-reacquire-fresh',
      takeoverToken: reacquired.takeoverToken,
      type: V1GameEventType.PERIOD_START,
      sideId: liveHomeSideId,
      period: 1,
      clockMs: 0,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    expect(rebased.replayed).toBe(false);
  });

  it("a platform_ops actor's takeover token is subject-scoped to platform_ops, independent of any tournament-staff assignment row", async () => {
    const grant = await service.requestTakeover(authUser(ids.platformOps), liveGameId, {
      clientInstanceId: 'ops-client',
      lastSequence: 0,
    });
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    const appended = await service.appendEvent(authUser(ids.platformOps), liveGameId, 'task20-ops-token', {
      expectedVersion: game.version,
      clientEventId: 'task20-ops-token',
      takeoverToken: grant.takeoverToken,
      type: V1GameEventType.PERIOD_START,
      sideId: liveHomeSideId,
      period: 1,
      clockMs: 0,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    expect(appended.replayed).toBe(false);
    const persisted = await prisma.v1GameEvent.findUniqueOrThrow({
      where: { gameId_clientEventId: { gameId: liveGameId, clientEventId: 'task20-ops-token' } },
    });
    expect(persisted.actorUserId).toBe(ids.platformOps);

    // The director's own token (a different authorization subject) cannot be
    // reused to satisfy platform_ops's command, and vice versa -- each
    // exclusive holder must present its own grant.
    const directorToken = await grantTakeover(liveGameId, ids.director);
    // Re-read the version: the successful append above bumped it, and withCommand evaluates the
    // optimistic-concurrency check BEFORE requireTakeover. Reusing the stale `game.version` here
    // answered 409 VERSION_CONFLICT and the subject-scoping guard this test exists to prove was
    // never reached.
    const afterOpsAppend = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    const crossSubject = await captureFailure(() =>
      service.appendEvent(authUser(ids.platformOps), liveGameId, 'task20-cross-subject', {
        expectedVersion: afterOpsAppend.version,
        clientEventId: 'task20-cross-subject',
        takeoverToken: directorToken,
        type: V1GameEventType.PERIOD_START,
        sideId: liveHomeSideId,
        period: 1,
        clockMs: 0,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(crossSubject, 403, 'TAKEOVER_TOKEN_EXPIRED');
  });

  it('rejects an event whose occurredAt drifts from server time by more than 30 seconds with 422 CLOCK_DRIFT', async () => {
    const token = await grantTakeover(liveGameId, ids.director);
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    const denied = await captureFailure(() =>
      service.appendEvent(authUser(ids.director), liveGameId, 'task20-clock-drift', {
        expectedVersion: game.version,
        clientEventId: 'task20-clock-drift',
        takeoverToken: token,
        type: V1GameEventType.PERIOD_START,
        sideId: liveHomeSideId,
        period: 1,
        clockMs: 0,
        occurredAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(denied, 422, 'CLOCK_DRIFT');
    expect(
      await prisma.v1GameEvent.count({ where: { gameId: liveGameId, clientEventId: 'task20-clock-drift' } }),
    ).toBe(0);
    expect((await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } })).version).toBe(game.version);
  });

  it('rejects a goal event missing a scorer under the tournament required-scorer policy with 422 SCORER_REQUIRED', async () => {
    const token = await grantTakeover(liveGameId, ids.director);
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    const denied = await captureFailure(() =>
      service.appendEvent(authUser(ids.director), liveGameId, 'task20-missing-scorer', {
        expectedVersion: game.version,
        clientEventId: 'task20-missing-scorer',
        takeoverToken: token,
        type: V1GameEventType.GOAL,
        sideId: liveHomeSideId,
        period: 1,
        clockMs: 0,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(denied, 422, 'SCORER_REQUIRED');
    expect(
      await prisma.v1GameEvent.count({ where: { gameId: liveGameId, clientEventId: 'task20-missing-scorer' } }),
    ).toBe(0);

    // The same goal WITH a scorer participant is accepted.
    const withScorer = await service.appendEvent(authUser(ids.director), liveGameId, 'task20-with-scorer', {
      expectedVersion: game.version,
      clientEventId: 'task20-with-scorer',
      takeoverToken: token,
      type: V1GameEventType.GOAL,
      sideId: liveHomeSideId,
      participantId: liveHomeParticipantId,
      period: 1,
      clockMs: 0,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    expect(withScorer.replayed).toBe(false);
  });

  it('rejects an event whose period regresses behind an already-recorded period with 409 PERIOD_ALREADY_ENDED', async () => {
    const advanceToken = await grantTakeover(liveGameId, ids.director);
    let game = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    // T1-0: period 2 must actually be LIVE (via next-period) before it can
    // receive any event -- appending a PERIOD_START marker directly used to
    // be how this suite advanced "the current period" for EVENT_LATE
    // purposes, but that bypassed V1GamePeriod.state entirely (see the T1-0
    // design doc's §2.8 diagnosis). This is the real transition now.
    await service.executeCommand(authUser(ids.director), liveGameId, 'next-period', 'task20-period-2-advance-command', {
      expectedVersion: game.version,
      clientCommandId: 'task20-period-2-advance-command',
      takeoverToken: advanceToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    game = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    await service.appendEvent(authUser(ids.director), liveGameId, 'task20-period-2-advance', {
      expectedVersion: game.version,
      clientEventId: 'task20-period-2-advance',
      takeoverToken: advanceToken,
      type: V1GameEventType.PERIOD_START,
      sideId: liveHomeSideId,
      period: 2,
      clockMs: 0,
      occurredAt: new Date().toISOString(),
      payload: {},
    });

    const lateToken = await grantTakeover(liveGameId, ids.director);
    game = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    const denied = await captureFailure(() =>
      service.appendEvent(authUser(ids.director), liveGameId, 'task20-late-period-1', {
        expectedVersion: game.version,
        clientEventId: 'task20-late-period-1',
        takeoverToken: lateToken,
        type: V1GameEventType.PERIOD_START,
        sideId: liveHomeSideId,
        period: 1,
        clockMs: 0,
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    // T1-0: period 1 is now genuinely V1GamePeriodState.ENDED (closed by the
    // next-period transition above), which is a stronger, more specific
    // signal than the old event-history-derived EVENT_LATE heuristic --
    // assertEventReferences's period-state gate rejects it first.
    expectHttpCode(denied, 409, 'PERIOD_ALREADY_ENDED');
    expect(
      await prisma.v1GameEvent.count({ where: { gameId: liveGameId, clientEventId: 'task20-late-period-1' } }),
    ).toBe(0);
  });

  it('reverses an event exactly once; a second reversal attempt on the same target is rejected with 409 EVENT_ALREADY_REVERSED', async () => {
    const appendToken = await grantTakeover(liveGameId, ids.director);
    let game = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    const goal = await service.appendEvent(authUser(ids.director), liveGameId, 'task20-reversal-target', {
      expectedVersion: game.version,
      clientEventId: 'task20-reversal-target',
      takeoverToken: appendToken,
      type: V1GameEventType.GOAL,
      sideId: liveHomeSideId,
      participantId: liveHomeParticipantId,
      period: 2,
      clockMs: 0,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    const targetEvent = await prisma.v1GameEvent.findUniqueOrThrow({
      where: { gameId_clientEventId: { gameId: liveGameId, clientEventId: 'task20-reversal-target' } },
    });

    const reverseTokenA = await grantTakeover(liveGameId, ids.director);
    game = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    const reversed = await service.reverseEvent(
      authUser(ids.director),
      liveGameId,
      targetEvent.id,
      'task20-reverse-once',
      {
        expectedVersion: game.version,
        clientEventId: 'task20-reverse-once',
        takeoverToken: reverseTokenA,
        reason: 'incorrect scorer recorded',
      },
    );
    expect(reversed.sequence).toBe(goal.sequence + 1);

    const reverseTokenB = await grantTakeover(liveGameId, ids.director);
    game = await prisma.v1Game.findUniqueOrThrow({ where: { id: liveGameId } });
    const secondReversal = await captureFailure(() =>
      service.reverseEvent(authUser(ids.director), liveGameId, targetEvent.id, 'task20-reverse-twice', {
        expectedVersion: game.version,
        clientEventId: 'task20-reverse-twice',
        takeoverToken: reverseTokenB,
        reason: 'attempted double reversal',
      }),
    );
    expectHttpCode(secondReversal, 409, 'EVENT_ALREADY_REVERSED');
  });

  it('tournament end atomically derives and submits exactly one result revision, and result-recovery is not required afterward', async () => {
    const end = await createTournamentGame(ids.fixtureEnd);

    const startToken = await grantTakeover(end.gameId, ids.director);
    await service.executeCommand(authUser(ids.director), end.gameId, 'start', 'task20-end-start', {
      expectedVersion: 0,
      clientCommandId: 'task20-end-start',
      takeoverToken: startToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });

    const goalToken = await grantTakeover(end.gameId, ids.director);
    let game = await prisma.v1Game.findUniqueOrThrow({ where: { id: end.gameId } });
    await service.appendEvent(authUser(ids.director), end.gameId, 'task20-end-goal', {
      expectedVersion: game.version,
      clientEventId: 'task20-end-goal',
      takeoverToken: goalToken,
      type: V1GameEventType.GOAL,
      sideId: end.homeSideId,
      participantId: end.homeParticipantId,
      period: 1,
      clockMs: 0,
      occurredAt: new Date().toISOString(),
      payload: {},
    });

    const endToken = await grantTakeover(end.gameId, ids.director);
    game = await prisma.v1Game.findUniqueOrThrow({ where: { id: end.gameId } });
    const endResult = await service.executeCommand(authUser(ids.director), end.gameId, 'end', 'task20-end-command', {
      expectedVersion: game.version,
      clientCommandId: 'task20-end-command',
      takeoverToken: endToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    expect(endResult).toEqual(
      expect.objectContaining({ state: V1GameState.ENDED, revisionState: 'SUBMITTED' }),
    );
    const revisions = await prisma.v1GameResultRevision.findMany({ where: { gameId: end.gameId } });
    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.score).toEqual({ home: 1, away: 0 });

    // Normal end already derived+submitted the result; recovery is now moot.
    const recoveryToken = await grantTakeover(end.gameId, ids.director);
    game = await prisma.v1Game.findUniqueOrThrow({ where: { id: end.gameId } });
    const recoveryDenied = await captureFailure(() =>
      service.resultRecoveryDeriveAndSubmit(authUser(ids.director), end.gameId, 'task20-end-recovery-moot', {
        expectedVersion: game.version,
        clientCommandId: 'task20-end-recovery-moot',
        takeoverToken: recoveryToken,
        eventsHash: 'irrelevant',
        reason: 'should be moot',
      }),
    );
    expectHttpCode(recoveryDenied, 409, 'RESULT_RECOVERY_NOT_REQUIRED');
  });

  it('recovers a missing result revision for a pre-existing ended-without-revision tournament fixture, denies field_operator, and is idempotent', async () => {
    const recovery = await createTournamentGame(ids.fixtureRecovery);

    // Simulate the literal pre-existing drift this route exists for: the game
    // reached ENDED (e.g. by a legacy/out-of-band path) with zero result
    // revisions -- never through this service's own end command.
    await prisma.v1Game.update({
      where: { id: recovery.gameId },
      data: { state: V1GameState.ENDED, version: { increment: 1 } },
    });
    expect(await prisma.v1GameResultRevision.count({ where: { gameId: recovery.gameId } })).toBe(0);

    const fieldOperatorToken = await grantTakeover(recovery.gameId, ids.fieldOperator);
    let game = await prisma.v1Game.findUniqueOrThrow({ where: { id: recovery.gameId } });
    const deniedForFieldOperator = await captureFailure(() =>
      service.resultRecoveryDeriveAndSubmit(authUser(ids.fieldOperator), recovery.gameId, 'task20-recovery-denied', {
        expectedVersion: game.version,
        clientCommandId: 'task20-recovery-denied',
        takeoverToken: fieldOperatorToken,
        eventsHash: 'irrelevant',
        reason: 'field operator should not recover results',
      }),
    );
    expectHttpCode(deniedForFieldOperator, 403, 'PERMISSION_DENIED');
    expect(await prisma.v1GameResultRevision.count({ where: { gameId: recovery.gameId } })).toBe(0);

    const directorToken = await grantTakeover(recovery.gameId, ids.director);
    game = await prisma.v1Game.findUniqueOrThrow({ where: { id: recovery.gameId } });
    const recovered = await service.resultRecoveryDeriveAndSubmit(authUser(ids.director), recovery.gameId, 'task20-recovery-submit', {
      expectedVersion: game.version,
      clientCommandId: 'task20-recovery-submit',
      takeoverToken: directorToken,
      eventsHash: 'recovered-events',
      reason: 'recovering ended-without-revision drift',
    });
    expect(recovered).toEqual(expect.objectContaining({ revisionState: 'SUBMITTED', replayed: false }));
    expect(await prisma.v1GameResultRevision.count({ where: { gameId: recovery.gameId } })).toBe(1);

    const replay = await service.resultRecoveryDeriveAndSubmit(authUser(ids.director), recovery.gameId, 'task20-recovery-submit', {
      expectedVersion: game.version,
      clientCommandId: 'task20-recovery-submit',
      takeoverToken: directorToken,
      eventsHash: 'recovered-events',
      reason: 'recovering ended-without-revision drift',
    });
    expect(replay).toEqual({ ...recovered, replayed: true });
    expect(await prisma.v1GameResultRevision.count({ where: { gameId: recovery.gameId } })).toBe(1);
  });

  it("revoking a field_operator's assignment immediately blocks a new takeover request, without waiting for any prior grant to expire", async () => {
    await prisma.v1TournamentStaffAssignment.update({
      where: { id: fieldOperatorAssignmentId },
      data: { revokedAt: new Date(), version: { increment: 1 } },
    });
    const denied = await captureFailure(() =>
      service.requestTakeover(authUser(ids.fieldOperator), liveGameId, {
        clientInstanceId: 'revoked-client',
        lastSequence: 0,
      }),
    );
    expectHttpCode(denied, 403, 'PERMISSION_DENIED');
  });
});

describe('TEAM_MATCH sourced games allow lifecycle commands other than end, host-only (D-20/B6)', () => {
  const tmIds = {
    hostUser: '94000000-0000-4000-8000-000000000001',
    opponentUser: '94000000-0000-4000-8000-000000000002',
    sport: '94000000-0000-4000-8000-000000000010',
    region: '94000000-0000-4000-8000-000000000011',
    hostTeam: '94000000-0000-4000-8000-000000000020',
    opponentTeam: '94000000-0000-4000-8000-000000000021',
    teamMatch: '94000000-0000-4000-8000-000000000030',
  } as const;
  let tmConfigId: string;
  let tmGameId: string;

  beforeAll(async () => {
    const config = await prisma.v1CompetitionConfigVersion.findFirst({
      where: { name: 'futsal-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    if (config === null) {
      throw new Error('Task 11 futsal-v1 preset is required');
    }
    tmConfigId = config.id;

    await prisma.v1User.createMany({
      data: [tmIds.hostUser, tmIds.opponentUser].map((id, index) => ({
        id,
        email: `task-t3-tm-command-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1Sport.create({
      data: { id: tmIds.sport, code: 'futsal', name: 'T3 TEAM_MATCH Command Futsal' },
    });
    await prisma.v1Region.create({
      data: { id: tmIds.region, code: 'T3_TM_COMMAND_REGION', name: 'T3 TEAM_MATCH Command Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: tmIds.hostTeam, ownerUserId: tmIds.hostUser, sportId: tmIds.sport, regionId: tmIds.region, name: 'T3 TM Command Host' },
        { id: tmIds.opponentTeam, ownerUserId: tmIds.opponentUser, sportId: tmIds.sport, regionId: tmIds.region, name: 'T3 TM Command Opponent' },
      ],
    });
    await prisma.v1TeamMembership.createMany({
      data: [
        { teamId: tmIds.hostTeam, userId: tmIds.hostUser, role: 'manager', status: 'active' },
        { teamId: tmIds.opponentTeam, userId: tmIds.opponentUser, role: 'manager', status: 'active' },
      ],
    });
    await prisma.v1TeamMatch.create({
      data: {
        id: tmIds.teamMatch,
        hostTeamId: tmIds.hostTeam,
        createdByUserId: tmIds.hostUser,
        sportId: tmIds.sport,
        regionId: tmIds.region,
        title: 'T3 TEAM_MATCH command gate match',
        placeName: 'T3 futsal court',
        startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        approvedApplicantTeamId: tmIds.opponentTeam,
        competitionConfigVersionId: tmConfigId,
      },
    });

    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TEAM_MATCH,
      sourceId: tmIds.teamMatch,
      competitionConfigVersionId: tmConfigId,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: tmIds.hostTeam, displayNameSnapshot: 'T3 TM Command Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: tmIds.opponentTeam, displayNameSnapshot: 'T3 TM Command Opponent' },
      ],
      participants: [],
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(
        tx,
        input,
        sourceContext(
          { actorType: 'USER', actorUserId: tmIds.hostUser, role: 'team_owner' },
          'task-t3-tm-command-source-create',
          input,
        ),
      ),
    );
    tmGameId = created.gameId;
  });

  // BLOCKED (T1-1 범위): resolveActor의 TEAM_MATCH team_result_submit/tournament_command
  // 병합 분기(이 파일이 수정하지 않는 범위)가 TEAM_MATCH 액터에 authorizationSubject를
  // 채우지 않아 requestTakeover가 호스트에게도 항상 403 PERMISSION_DENIED를 던진다.
  // 실측: 이 스텝에서 위 두 diff만 적용한 상태로 재실행하면 "still refuses end"·
  // "rejects start from opponent"는 PASS하고 이 테스트만 여전히 403으로 실패한다 —
  // resolveActor가 반환하는 TEAM_MATCH 호스트 액터 객체(위 diff가 만드는 return문,
  // 그리고 event_append/event_reverse 분기)에 authorizationSubject 필드 자체가
  // 없기 때문. 해소하려면 그 return 객체들에
  // `authorizationSubject: \`team_manager:${userId}@${hostMembership!.updatedAt.getTime()}\``
  // 같은 필드를 추가해야 하는데, 이건 T1-1(이벤트 기록 경로의 authorization
  // 완성)의 범위이지 이 트랙(T3)이 소유하지 않는다. it.skip으로 표시하고
  // 나머지 Task는 계속 진행한다 — Task 10(팀매치 콘솔)만 이 의존성 때문에 멈춘다.
  it.skip('accepts "start" from the host manager and stamps period 1 LIVE/startedAt', async () => {
    // 선행조건: 이 호출이 403 PERMISSION_DENIED 또는 TAKEOVER_TOKEN_EXPIRED로 실패하면,
    // resolveActor의 TEAM_MATCH team_result_submit/tournament_command 병합 분기(바로
    // 아래 Step 3에서 고치는 위치)가 아직 authorizationSubject를 채우지 않은 것이다 —
    // 이건 이 트랙이 소유하지 않는 별도 T1-1 범위(결정 문단 5)다. 그 경우
    // `BLOCKED: resolveActor의 TEAM_MATCH team_result_submit/tournament_command
    // 병합 분기(games.service.ts, 이 Task Step 3이 수정한 블록)가 authorizationSubject를
    // 채우지 않아 requestTakeover/executeCommand가 호스트에게도 항상 403/
    // TAKEOVER_TOKEN_EXPIRED를 던진다`를 보고하고 이 테스트만 `it.skip`으로 표시한 채
    // 나머지 Task는 계속 진행한다 — Task 10만 이 의존성 때문에 멈춘다(Task 10 Step 0).
    const startToken = (
      await service.requestTakeover(authUser(tmIds.hostUser), tmGameId, {
        clientInstanceId: 'task-t3-tm-command-client',
        lastSequence: 0,
      })
    ).takeoverToken;
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: tmGameId } });
    const result = await service.executeCommand(
      authUser(tmIds.hostUser),
      tmGameId,
      'start',
      'task-t3-tm-command-start-1',
      {
        expectedVersion: game.version,
        clientCommandId: 'task-t3-tm-command-start-1',
        takeoverToken: startToken,
        occurredAt: new Date().toISOString(),
        payload: {},
      },
    );
    expect(result.state).toBe('LIVE');
    const period1 = await prisma.v1GamePeriod.findFirstOrThrow({ where: { gameId: tmGameId, number: 1 } });
    expect(period1.state).toBe('LIVE');
    expect(period1.startedAt).not.toBeNull();
  });

  it('still refuses "end" for a TEAM_MATCH game with 409 TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN', async () => {
    // 'end'는 게임 상태 전이 로직(requireTakeover 포함)에 닿기 전에 커맨드 게이트에서
    // 즉시 막히므로 유효한 takeoverToken이 필요 없다 — 아무 비어있지 않은 문자열로도
    // 충분하다는 것 자체가 "이 가드가 requireTakeover보다 먼저 실행된다"는 계약의 증거다.
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: tmGameId } });
    const error = await captureFailure(() =>
      service.executeCommand(authUser(tmIds.hostUser), tmGameId, 'end', 'task-t3-tm-command-end-1', {
        expectedVersion: game.version,
        clientCommandId: 'task-t3-tm-command-end-1',
        takeoverToken: 'end-attempt-token',
        occurredAt: new Date().toISOString(),
        payload: {},
      }),
    );
    expectHttpCode(error, 409, 'TEAM_MATCH_GENERIC_COMMAND_FORBIDDEN');
  });

  it('D-20/B6: rejects "start" from the opponent manager with 403 PERMISSION_DENIED — resolveActor denies before any token is even checked', async () => {
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: tmGameId } });
    const error = await captureFailure(() =>
      service.executeCommand(
        authUser(tmIds.opponentUser),
        tmGameId,
        'start',
        'task-t3-tm-command-opponent-start-1',
        {
          expectedVersion: game.version,
          clientCommandId: 'task-t3-tm-command-opponent-start-1',
          // 상대팀 매니저는 유효한 takeoverToken을 발급받을 방법이 없다(같은 이유로
          // requestTakeover도 거부된다) — 여기 어떤 문자열을 넣어도 resolveActor가
          // 토큰을 보기 전에 forbidden을 던진다는 것 자체가 이 테스트의 핵심 증명이다.
          takeoverToken: 'opponent-cannot-obtain-a-real-token',
          occurredAt: new Date().toISOString(),
          payload: {},
        },
      ),
    );
    expectHttpCode(error, 403, 'PERMISSION_DENIED');
  });
});
