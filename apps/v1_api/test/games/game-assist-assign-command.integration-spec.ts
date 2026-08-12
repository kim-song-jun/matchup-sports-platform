import { HttpException } from '@nestjs/common';
import { V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameActorScope, GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Issue #376 — `GamesService.assignGoalAssist` (new atomic command) replaces
 * the old "reverseEvent the GOAL, then submitEvent a new one with
 * assistParticipantId set" two-step flow the operate console used to run.
 * These specs cover the two things the brief and the user's design decision
 * both call out explicitly:
 *  1. the command mutates the original GOAL in place -- no event count
 *     growth, and the usual ASSIST_INVALID/EVENT_ALREADY_REVERSED guards
 *     from the append-time validation still hold -- plus idempotent replay.
 *  2. `deriveTournamentRevision`'s goal/assist aggregation now excludes
 *     reversed events (it used to have no filter at all, unlike its two
 *     sibling functions in the same file), so a reversed GOAL's
 *     scorer/assist no longer double-counts against the official result.
 */

const ids = {
  operator: '67000000-0000-4000-8000-000000000001',
  sport: '67000000-0000-4000-8000-000000000010',
  region: '67000000-0000-4000-8000-000000000011',
  hostTeam: '67000000-0000-4000-8000-000000000020',
  awayTeam: '67000000-0000-4000-8000-000000000021',
  tournament: '67000000-0000-4000-8000-000000000030',
  fixtureA: '67000000-0000-4000-8000-000000000031',
  fixtureB: '67000000-0000-4000-8000-000000000032',
  assignment: '67000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task-assist-assign.example.test`,
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

async function currentVersion(gameId: string): Promise<number> {
  const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, select: { version: true } });
  return game.version;
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await prisma.$connect();
  await prisma.v1User.create({ data: { id: ids.operator, email: 'task-assist-assign-operator@example.test', accountStatus: 'active', onboardingStatus: 'completed' } });
  await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football-assist-assign', name: 'Task Assist Assign Football' } });
  await prisma.v1Region.create({ data: { id: ids.region, code: 'TASK_ASSIST_ASSIGN_REGION', name: 'Task Assist Assign Region', level: 1 } });
  await prisma.v1Team.createMany({
    data: [
      { id: ids.hostTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Assist Assign Host' },
      { id: ids.awayTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Assist Assign Away' },
    ],
  });
  const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({ where: { name: 'football-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
  await prisma.v1Tournament.create({ data: { id: ids.tournament, sportId: ids.sport, title: 'Task Assist Assign Tournament', competitionConfigVersionId: config.id } });
  await prisma.v1TournamentFixture.createMany({
    data: [
      { id: ids.fixtureA, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, competitionConfigVersionId: config.id },
      { id: ids.fixtureB, tournamentId: ids.tournament, round: 'group', fixtureNumber: 2, competitionConfigVersionId: config.id },
    ],
  });
  await prisma.v1TournamentStaffAssignment.create({
    data: { id: ids.assignment, tournamentId: ids.tournament, userId: ids.operator, role: 'TOURNAMENT_DIRECTOR', grantedByUserId: ids.operator },
  });
  await prisma.v1GameOperationFlag.upsert({
    where: { key: 'PUBLIC_LIVE' },
    create: { key: 'PUBLIC_LIVE', value: 'off', ownerActor: 'platform_ops' },
    update: {},
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GamesService.assignGoalAssist — atomic in-place assist (issue #376)', () => {
  let gameId: string;
  let homeSideId: string;
  let scorerId: string;
  let teammateId: string;
  let awayParticipantId: string;
  let goalEventId: string;
  let goalSequence: number;
  let foulEventId: string;
  let reversedGoalEventId: string;

  beforeAll(async () => {
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({ where: { name: 'football-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixtureA,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Assist Assign Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Assist Assign Away' },
      ],
      participants: [
        { sourceParticipantId: 'assign-scorer', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Scorer' },
        { sourceParticipantId: 'assign-teammate', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Teammate' },
        { sourceParticipantId: 'assign-away', sideKey: V1GameSideKey.AWAY, displayNameSnapshot: 'Away Player' },
      ],
    };
    const actor: GameActorScope = { actorType: 'USER', actorUserId: ids.operator, role: 'field_operator', tournamentId: ids.tournament, fixtureId: ids.fixtureA };
    const created = await prisma.$transaction((tx) => service.createFromSourceInTransaction(tx, input, context(actor, 'assist-assign-source-create', input)));
    gameId = created.gameId;
    const persisted = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, include: { sides: true, participants: true } });
    homeSideId = persisted.sides.find((s) => s.sideKey === 'HOME')!.id;
    scorerId = persisted.participants.find((p) => p.displayNameSnapshot === 'Scorer')!.id;
    teammateId = persisted.participants.find((p) => p.displayNameSnapshot === 'Teammate')!.id;
    awayParticipantId = persisted.participants.find((p) => p.displayNameSnapshot === 'Away Player')!.id;

    await prisma.v1GameLineup.updateMany({ where: { gameId, revision: 1 }, data: { state: 'SUBMITTED' } });

    const startToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-assign-start', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'start', 'assist-assign-start', {
      expectedVersion: 0, clientCommandId: 'assist-assign-start', takeoverToken: startToken, occurredAt: new Date().toISOString(), payload: {},
    });

    const goalToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-assign-goal', lastSequence: 0 })).takeoverToken;
    const goal = await service.appendEvent(authUser(ids.operator), gameId, 'assist-assign-goal', {
      expectedVersion: 1, clientEventId: 'assist-assign-goal', takeoverToken: goalToken,
      type: 'GOAL' as never, sideId: homeSideId, participantId: scorerId,
      period: 1, clockMs: 1000, occurredAt: new Date().toISOString(), payload: {},
    });
    goalEventId = goal.event!.id;
    goalSequence = goal.sequence;

    const foulToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-assign-foul', lastSequence: 0 })).takeoverToken;
    const foul = await service.appendEvent(authUser(ids.operator), gameId, 'assist-assign-foul', {
      expectedVersion: 2, clientEventId: 'assist-assign-foul', takeoverToken: foulToken,
      type: 'FOUL' as never, sideId: homeSideId, participantId: teammateId,
      period: 1, clockMs: 1500, occurredAt: new Date().toISOString(), payload: {},
    });
    foulEventId = foul.event!.id;

    const secondGoalToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-assign-goal-2', lastSequence: 0 })).takeoverToken;
    const secondGoal = await service.appendEvent(authUser(ids.operator), gameId, 'assist-assign-goal-2', {
      expectedVersion: 3, clientEventId: 'assist-assign-goal-2', takeoverToken: secondGoalToken,
      type: 'GOAL' as never, sideId: homeSideId, participantId: scorerId,
      period: 1, clockMs: 2000, occurredAt: new Date().toISOString(), payload: {},
    });
    reversedGoalEventId = secondGoal.event!.id;

    const reverseToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-assign-reverse', lastSequence: 0 })).takeoverToken;
    await service.reverseEvent(authUser(ids.operator), gameId, reversedGoalEventId, 'assist-assign-reverse', {
      expectedVersion: 4, clientEventId: 'assist-assign-reverse', takeoverToken: reverseToken, reason: '테스트용 되돌리기',
    });
  });

  it('rejects an assist participant from the other side', async () => {
    const token = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assign-cross-side', lastSequence: 0 })).takeoverToken;
    const version = await currentVersion(gameId);
    const failure = await captureFailure(() =>
      service.assignGoalAssist(authUser(ids.operator), gameId, goalEventId, 'assign-cross-side', {
        expectedVersion: version, clientEventId: 'assign-cross-side', takeoverToken: token, assistParticipantId: awayParticipantId,
      }),
    );
    expectHttpCode(failure, 422, 'ASSIST_INVALID');
  });

  it('rejects the scorer crediting themself with the assist', async () => {
    const token = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assign-self', lastSequence: 0 })).takeoverToken;
    const version = await currentVersion(gameId);
    const failure = await captureFailure(() =>
      service.assignGoalAssist(authUser(ids.operator), gameId, goalEventId, 'assign-self', {
        expectedVersion: version, clientEventId: 'assign-self', takeoverToken: token, assistParticipantId: scorerId,
      }),
    );
    expectHttpCode(failure, 422, 'ASSIST_INVALID');
  });

  it('rejects attaching an assist to a non-GOAL event', async () => {
    const token = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assign-non-goal', lastSequence: 0 })).takeoverToken;
    const version = await currentVersion(gameId);
    const failure = await captureFailure(() =>
      service.assignGoalAssist(authUser(ids.operator), gameId, foulEventId, 'assign-non-goal', {
        expectedVersion: version, clientEventId: 'assign-non-goal', takeoverToken: token, assistParticipantId: teammateId,
      }),
    );
    expectHttpCode(failure, 422, 'ASSIST_INVALID');
  });

  it('rejects amending an already-reversed GOAL', async () => {
    const token = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assign-reversed', lastSequence: 0 })).takeoverToken;
    const version = await currentVersion(gameId);
    const failure = await captureFailure(() =>
      service.assignGoalAssist(authUser(ids.operator), gameId, reversedGoalEventId, 'assign-reversed', {
        expectedVersion: version, clientEventId: 'assign-reversed', takeoverToken: token, assistParticipantId: teammateId,
      }),
    );
    expectHttpCode(failure, 409, 'EVENT_ALREADY_REVERSED');
  });

  it('attaches the assist in place without creating a new event, and a retried Idempotency-Key does not double-apply', async () => {
    const eventCountBefore = await prisma.v1GameEvent.count({ where: { gameId } });
    const token = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assign-valid', lastSequence: 0 })).takeoverToken;
    const version = await currentVersion(gameId);
    const dto = {
      expectedVersion: version,
      clientEventId: 'assign-valid',
      takeoverToken: token,
      assistParticipantId: teammateId,
    };

    const first = await service.assignGoalAssist(authUser(ids.operator), gameId, goalEventId, 'assign-valid', dto);
    expect(first.replayed).toBe(false);
    expect(first.version).toBe(version + 1);
    expect(first.sequence).toBe(goalSequence);
    expect(first.event?.assistParticipantId).toBe(teammateId);

    const eventCountAfter = await prisma.v1GameEvent.count({ where: { gameId } });
    expect(eventCountAfter).toBe(eventCountBefore);

    const stored = await prisma.v1GameEvent.findUniqueOrThrow({ where: { id: goalEventId } });
    expect(stored.assistParticipantId).toBe(teammateId);
    expect(stored.type).toBe('GOAL');

    // Retry with the exact same Idempotency-Key + body (as a client retry
    // after a dropped response would send) must replay the cached response
    // instead of re-applying the mutation a second time.
    const second = await service.assignGoalAssist(authUser(ids.operator), gameId, goalEventId, 'assign-valid', dto);
    expect(second.replayed).toBe(true);
    expect(second.version).toBe(version + 1);

    const versionAfterRetry = await currentVersion(gameId);
    expect(versionAfterRetry).toBe(version + 1);
    const eventCountAfterRetry = await prisma.v1GameEvent.count({ where: { gameId } });
    expect(eventCountAfterRetry).toBe(eventCountBefore);
  });
});

describe('deriveTournamentRevision — excludes reversed goals/assists from the official result (issue #376)', () => {
  let gameId: string;
  let scorerAId: string;
  let assistAId: string;
  let scorerBId: string;
  let assistBId: string;

  beforeAll(async () => {
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({ where: { name: 'football-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixtureB,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Assist Assign Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Assist Assign Away' },
      ],
      participants: [
        { sourceParticipantId: 'derive-scorer-a', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Scorer A' },
        { sourceParticipantId: 'derive-assist-a', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Assist A' },
        { sourceParticipantId: 'derive-scorer-b', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Scorer B' },
        { sourceParticipantId: 'derive-assist-b', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Assist B' },
      ],
    };
    const actor: GameActorScope = { actorType: 'USER', actorUserId: ids.operator, role: 'field_operator', tournamentId: ids.tournament, fixtureId: ids.fixtureB };
    const created = await prisma.$transaction((tx) => service.createFromSourceInTransaction(tx, input, context(actor, 'derive-source-create', input)));
    gameId = created.gameId;
    const persisted = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, include: { sides: true, participants: true } });
    const homeSideId = persisted.sides.find((s) => s.sideKey === 'HOME')!.id;
    scorerAId = persisted.participants.find((p) => p.displayNameSnapshot === 'Scorer A')!.id;
    assistAId = persisted.participants.find((p) => p.displayNameSnapshot === 'Assist A')!.id;
    scorerBId = persisted.participants.find((p) => p.displayNameSnapshot === 'Scorer B')!.id;
    assistBId = persisted.participants.find((p) => p.displayNameSnapshot === 'Assist B')!.id;

    await prisma.v1GameLineup.updateMany({ where: { gameId, revision: 1 }, data: { state: 'SUBMITTED' } });

    const startToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'derive-start', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'start', 'derive-start', {
      expectedVersion: 0, clientCommandId: 'derive-start', takeoverToken: startToken, occurredAt: new Date().toISOString(), payload: {},
    });

    const goalAToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'derive-goal-a', lastSequence: 0 })).takeoverToken;
    const goalA = await service.appendEvent(authUser(ids.operator), gameId, 'derive-goal-a', {
      expectedVersion: 1, clientEventId: 'derive-goal-a', takeoverToken: goalAToken,
      type: 'GOAL' as never, sideId: homeSideId, participantId: scorerAId, assistParticipantId: assistAId,
      period: 1, clockMs: 1000, occurredAt: new Date().toISOString(), payload: {},
    });

    const reverseToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'derive-reverse', lastSequence: 0 })).takeoverToken;
    await service.reverseEvent(authUser(ids.operator), gameId, goalA.event!.id, 'derive-reverse', {
      expectedVersion: 2, clientEventId: 'derive-reverse', takeoverToken: reverseToken, reason: '오심 취소',
    });

    const goalBToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'derive-goal-b', lastSequence: 0 })).takeoverToken;
    await service.appendEvent(authUser(ids.operator), gameId, 'derive-goal-b', {
      expectedVersion: 3, clientEventId: 'derive-goal-b', takeoverToken: goalBToken,
      type: 'GOAL' as never, sideId: homeSideId, participantId: scorerBId, assistParticipantId: assistBId,
      period: 1, clockMs: 2000, occurredAt: new Date().toISOString(), payload: {},
    });

    const endToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'derive-end', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'end', 'derive-end', {
      expectedVersion: 4, clientCommandId: 'derive-end', takeoverToken: endToken, occurredAt: new Date().toISOString(), payload: {},
    });
  });

  it('counts only the surviving goal/assist and matches the score total (reversed goal excluded)', async () => {
    const revision = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId }, orderBy: { revision: 'desc' } });
    const rows = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: revision.id } });
    const byParticipant = new Map(rows.map((row) => [row.participantId, row]));

    expect(byParticipant.get(scorerAId)).toEqual(expect.objectContaining({ goals: 0, assists: 0 }));
    expect(byParticipant.get(assistAId)).toEqual(expect.objectContaining({ goals: 0, assists: 0 }));
    expect(byParticipant.get(scorerBId)).toEqual(expect.objectContaining({ goals: 1, assists: 0 }));
    expect(byParticipant.get(assistBId)).toEqual(expect.objectContaining({ goals: 0, assists: 1 }));

    // The per-participant goal sum must equal the score-derived total --
    // before the fix, the reversed goal still counted in
    // deriveTournamentRevision's loop (goals: 1+1=2) while scoreFromEvents
    // (which already filtered reversed events) reported home: 1, so this
    // exact equality is what was broken.
    const totalParticipantGoals = rows.reduce((sum, row) => sum + row.goals, 0);
    const score = revision.score as { home: number; away: number };
    expect(totalParticipantGoals).toBe(score.home);
    expect(score.home).toBe(1);
  });
});
