import { HttpException } from '@nestjs/common';
import { V1GameResultRevisionState, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameActorScope, GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';

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
  fixtureC: '67000000-0000-4000-8000-000000000033',
  fixtureD: '67000000-0000-4000-8000-000000000034',
  fixtureE: '67000000-0000-4000-8000-000000000035',
  assignment: '67000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const staffAccess = new TournamentStaffAccessService(prisma);
const resultReview = new TournamentResultReviewService(prisma, staffAccess, new OperationAuditWriterService());

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

async function drainOutbox(): Promise<void> {
  const worker = new V1GameOperationsWorkerService(prisma);
  let guard = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await worker.processOne()) {
    guard += 1;
    if (guard > 50) throw new Error('assist-sync outbox drain guard exceeded');
  }
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
      { id: ids.fixtureC, tournamentId: ids.tournament, round: 'group', fixtureNumber: 3, competitionConfigVersionId: config.id },
      { id: ids.fixtureD, tournamentId: ids.tournament, round: 'group', fixtureNumber: 4, competitionConfigVersionId: config.id },
      { id: ids.fixtureE, tournamentId: ids.tournament, round: 'group', fixtureNumber: 5, competitionConfigVersionId: config.id },
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
  // Issue #376 follow-up: fixtureD's describe block below officializes a
  // revision (needs a real OFFICIAL revision to prove assignGoalAssist
  // refuses to touch it) through a TOURNAMENT_DIRECTOR actor -- the
  // officialize command gates that role behind this flag being 'on'
  // (`TournamentResultReviewService.withResultCommand`'s
  // DIRECTOR_OFFICIALIZE check), unlike the field_operator actor used for
  // every plain event/assist command elsewhere in this file.
  await prisma.v1GameOperationFlag.upsert({
    where: { key: 'DIRECTOR_OFFICIALIZE' },
    create: { key: 'DIRECTOR_OFFICIALIZE', value: 'on', ownerActor: 'platform_ops' },
    update: { value: 'on' },
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

/**
 * Issue #376 follow-up (alpha finding on fixture
 * 4439fb84-9117-4d9f-b103-b9abda4bfdd0; user decision after discovering
 * `v1_guard_result_participant_mutation` blocks writing
 * `v1_game_result_participants` for any non-DRAFT revision, SUBMITTED
 * included -- see `GamesService.syncAssistsIntoSubmittedRevision`'s doc
 * comment): attaching/detaching an assist AFTER `end` already derived the
 * SUBMITTED revision now supersedes that revision with a fresh,
 * assist-synced successor (`ASSIST_SYNC` purpose,
 * `games/core/revision-state-machine.ts`) -- the same supersede-then-submit
 * mechanism `supersedeAndSubmit`/`createResultCorrection` already use for
 * every other "SUBMITTED-adjacent content changed" case in this codebase,
 * rather than a new one.
 */
describe('assignGoalAssist supersedes a SUBMITTED revision with an assist-synced successor (issue #376 follow-up)', () => {
  let gameId: string;
  let homeSideId: string;
  let scorerId: string;
  let assistant1Id: string;
  let scorerBId: string;
  let assistantBId: string;
  let goal1EventId: string;
  let revision1Id: string;
  let revision1SubmittedAt: number;
  let revision2Id: string;

  beforeAll(async () => {
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({ where: { name: 'football-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixtureC,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Assist Sync Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Assist Sync Away' },
      ],
      participants: [
        { sourceParticipantId: 'sync-scorer', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Sync Scorer' },
        { sourceParticipantId: 'sync-assistant-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Sync Assistant 1' },
        { sourceParticipantId: 'sync-scorer-b', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Sync Scorer B' },
        { sourceParticipantId: 'sync-assistant-b', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Sync Assistant B' },
      ],
    };
    const actor: GameActorScope = { actorType: 'USER', actorUserId: ids.operator, role: 'field_operator', tournamentId: ids.tournament, fixtureId: ids.fixtureC };
    const created = await prisma.$transaction((tx) => service.createFromSourceInTransaction(tx, input, context(actor, 'assist-sync-source-create', input)));
    gameId = created.gameId;
    const persisted = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, include: { sides: true, participants: true } });
    homeSideId = persisted.sides.find((s) => s.sideKey === 'HOME')!.id;
    scorerId = persisted.participants.find((p) => p.displayNameSnapshot === 'Sync Scorer')!.id;
    assistant1Id = persisted.participants.find((p) => p.displayNameSnapshot === 'Sync Assistant 1')!.id;
    scorerBId = persisted.participants.find((p) => p.displayNameSnapshot === 'Sync Scorer B')!.id;
    assistantBId = persisted.participants.find((p) => p.displayNameSnapshot === 'Sync Assistant B')!.id;

    await prisma.v1GameLineup.updateMany({ where: { gameId, revision: 1 }, data: { state: 'SUBMITTED' } });

    const startVersion = await currentVersion(gameId);
    const startToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-sync-start', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'start', 'assist-sync-start', {
      expectedVersion: startVersion, clientCommandId: 'assist-sync-start', takeoverToken: startToken, occurredAt: new Date().toISOString(), payload: {},
    });

    // Goal 1: no assist yet at append time -- this is the event
    // assignGoalAssist amends below, and revision 1's participant this spec
    // proves gets kept in sync via a superseding successor.
    const goal1Version = await currentVersion(gameId);
    const goal1Token = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-sync-goal-1', lastSequence: 0 })).takeoverToken;
    const goal1 = await service.appendEvent(authUser(ids.operator), gameId, 'assist-sync-goal-1', {
      expectedVersion: goal1Version, clientEventId: 'assist-sync-goal-1', takeoverToken: goal1Token,
      type: 'GOAL' as never, sideId: homeSideId, participantId: scorerId,
      period: 1, clockMs: 1000, occurredAt: new Date().toISOString(), payload: {},
    });
    goal1EventId = goal1.event!.id;

    // Goal 2: scored+assisted while LIVE, then reversed while LIVE -- proves
    // the #391 reversesEventId filter still excludes it once
    // assignGoalAssist's resync (not deriveTournamentRevision's own
    // derivation) is what recomputes the successor revision below.
    const goal2Version = await currentVersion(gameId);
    const goal2Token = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-sync-goal-2', lastSequence: 0 })).takeoverToken;
    const goal2 = await service.appendEvent(authUser(ids.operator), gameId, 'assist-sync-goal-2', {
      expectedVersion: goal2Version, clientEventId: 'assist-sync-goal-2', takeoverToken: goal2Token,
      type: 'GOAL' as never, sideId: homeSideId, participantId: scorerBId, assistParticipantId: assistantBId,
      period: 1, clockMs: 1500, occurredAt: new Date().toISOString(), payload: {},
    });
    const reverseVersion = await currentVersion(gameId);
    const reverseToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-sync-reverse', lastSequence: 0 })).takeoverToken;
    await service.reverseEvent(authUser(ids.operator), gameId, goal2.event!.id, 'assist-sync-reverse', {
      expectedVersion: reverseVersion, clientEventId: 'assist-sync-reverse', takeoverToken: reverseToken, reason: '테스트용 되돌리기',
    });

    const endVersion = await currentVersion(gameId);
    const endToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-sync-end', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'end', 'assist-sync-end', {
      expectedVersion: endVersion, clientCommandId: 'assist-sync-end', takeoverToken: endToken, occurredAt: new Date().toISOString(), payload: {},
    });

    const revision = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId } });
    revision1Id = revision.id;
    revision1SubmittedAt = revision.submittedAt!.getTime();
    expect(revision.state).toBe(V1GameResultRevisionState.SUBMITTED);
    expect(revision.revision).toBe(1);

    // Materialize revision 1's review-SLA escalation rows (created async by
    // the worker) BEFORE the attach test below closes them -- so that test
    // proves a real close, not "there was never anything to close".
    await drainOutbox();
  });

  it('creates a new SUBMITTED successor revision with resynced assists when an assist is attached, matching the event-derived total, reversed goal still excluded, and closes/inherits the predecessor review SLA without resetting its due date', async () => {
    const predecessorEscalationsBefore = await prisma.v1ResultEscalation.findMany({ where: { resultRevisionId: revision1Id } });
    expect(predecessorEscalationsBefore.length).toBeGreaterThan(0);
    expect(predecessorEscalationsBefore.every((row) => row.status === 'PENDING')).toBe(true);
    const predecessorDueAtByKind = new Map(predecessorEscalationsBefore.map((row) => [row.kind, row.dueAt.getTime()]));

    const version = await currentVersion(gameId);
    const token = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-sync-attach', lastSequence: 0 })).takeoverToken;
    const result = await service.assignGoalAssist(authUser(ids.operator), gameId, goal1EventId, 'assist-sync-attach', {
      expectedVersion: version, clientEventId: 'assist-sync-attach', takeoverToken: token, assistParticipantId: assistant1Id,
    });

    expect(result.revisionAssistSync).not.toBeUndefined();
    expect(result.revisionAssistSync!.revision).toBe(2);
    expect(result.revisionAssistSync!.supersedesRevisionId).toBe(revision1Id);
    expect(result.revisionAssistSync!.participants).toEqual([
      { participantId: assistant1Id, assistsBefore: 0, assistsAfter: 1 },
    ]);
    revision2Id = result.revisionAssistSync!.revisionId;

    // The predecessor row is left completely untouched in content -- only
    // its SLA gets closed (checked below) -- while a fresh SUBMITTED
    // successor now supersedes it.
    const predecessorAfter = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: revision1Id } });
    expect(predecessorAfter.state).toBe(V1GameResultRevisionState.SUBMITTED);
    const predecessorParticipantsAfter = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: revision1Id } });
    expect(predecessorParticipantsAfter.every((row) => row.assists === 0)).toBe(true);

    const successor = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: revision2Id } });
    expect(successor.state).toBe(V1GameResultRevisionState.SUBMITTED);
    expect(successor.supersedesId).toBe(revision1Id);
    expect(successor.revision).toBe(2);
    // Review SLA clock does not reset -- same submittedAt as revision 1.
    expect(successor.submittedAt?.getTime()).toBe(revision1SubmittedAt);

    const successorParticipants = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: revision2Id } });
    const byParticipant = new Map(successorParticipants.map((row) => [row.participantId, row.assists]));
    expect(byParticipant.get(assistant1Id)).toBe(1);
    // The reversed goal 2's assist must stay excluded even though this
    // resync recomputed every participant's count from scratch -- issue
    // #391's `reversesEventId` filter, reused via
    // `aggregateGameParticipantStats` rather than a hand-rolled +1/-1.
    expect(byParticipant.get(assistantBId)).toBe(0);
    expect(byParticipant.get(scorerBId)).toBe(0);

    // Event-derived total assists must equal the successor's total assists
    // -- the exact "경기 세부 기록" vs "어시스트 미기입" warning-banner
    // mismatch reported in alpha.
    const events = await prisma.v1GameEvent.findMany({ where: { gameId } });
    const reversedIds = new Set(events.map((event) => event.reversesEventId).filter((id): id is string => id !== null));
    const eventAssistTotal = events.filter(
      (event) => event.type === 'GOAL' && !reversedIds.has(event.id) && event.assistParticipantId !== null,
    ).length;
    const successorAssistTotal = successorParticipants.reduce((sum, row) => sum + row.assists, 0);
    expect(successorAssistTotal).toBe(eventAssistTotal);
    expect(successorAssistTotal).toBe(1);

    // Mirrors apps/v1_web/src/lib/result-review-warnings.ts's
    // countMissingAssists(goals - assists): the warning banner reconciles
    // automatically on the fresh successor -- 1 surviving goal, 1 assist.
    const successorGoalTotal = successorParticipants.reduce((sum, row) => sum + row.goals, 0);
    expect(Math.max(0, successorGoalTotal - successorAssistTotal)).toBe(0);

    // Predecessor's review SLA is closed, not left open forever (would
    // otherwise permanently flag RESULT_REVIEW_OVERDUE on the ops board
    // even after the game is eventually resolved via the successor).
    const predecessorEscalationsAfter = await prisma.v1ResultEscalation.findMany({ where: { resultRevisionId: revision1Id } });
    expect(predecessorEscalationsAfter.every((row) => row.status === 'CLOSED')).toBe(true);

    // Draining the successor's own GAME_RESULT_SUBMITTED event proves SLA
    // continuity without reset: its escalation due dates equal the
    // predecessor's ORIGINAL due dates exactly (both derive from the same
    // preserved submittedAt).
    await drainOutbox();
    const successorEscalations = await prisma.v1ResultEscalation.findMany({ where: { resultRevisionId: revision2Id } });
    expect(successorEscalations.length).toBeGreaterThan(0);
    for (const row of successorEscalations) {
      expect(row.dueAt.getTime()).toBe(predecessorDueAtByKind.get(row.kind));
    }
  });

  it('chains a THIRD revision on detach (confirms repeated toggling grows the chain, as reported -- not mitigated, see doc comment) and still preserves the original submittedAt two hops later', async () => {
    const version = await currentVersion(gameId);
    const token = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'assist-sync-detach', lastSequence: 0 })).takeoverToken;
    const result = await service.assignGoalAssist(authUser(ids.operator), gameId, goal1EventId, 'assist-sync-detach', {
      expectedVersion: version, clientEventId: 'assist-sync-detach', takeoverToken: token, assistParticipantId: null,
    });

    expect(result.revisionAssistSync).not.toBeUndefined();
    expect(result.revisionAssistSync!.revision).toBe(3);
    expect(result.revisionAssistSync!.supersedesRevisionId).toBe(revision2Id);
    expect(result.revisionAssistSync!.participants).toEqual([
      { participantId: assistant1Id, assistsBefore: 1, assistsAfter: 0 },
    ]);
    const revision3Id = result.revisionAssistSync!.revisionId;

    // Two assist toggles => three total revisions for this game (1 original
    // + 2 syncs) -- the observed, unmitigated chaining fact.
    const allRevisions = await prisma.v1GameResultRevision.findMany({ where: { gameId }, orderBy: { revision: 'asc' } });
    expect(allRevisions.map((row) => row.revision)).toEqual([1, 2, 3]);
    expect(allRevisions.map((row) => row.state)).toEqual([
      V1GameResultRevisionState.SUBMITTED,
      V1GameResultRevisionState.SUBMITTED,
      V1GameResultRevisionState.SUBMITTED,
    ]);

    const successor = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: revision3Id } });
    // Still not reset, two supersessions later.
    expect(successor.submittedAt?.getTime()).toBe(revision1SubmittedAt);

    const successorParticipants = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: revision3Id } });
    const byParticipant = new Map(successorParticipants.map((row) => [row.participantId, row.assists]));
    expect(byParticipant.get(assistant1Id)).toBe(0);
    expect(successorParticipants.reduce((sum, row) => sum + row.assists, 0)).toBe(0);

    // Revision 2's SLA (materialized in the previous test) is also closed
    // now that revision 3 supersedes it in turn.
    const revision2EscalationsAfter = await prisma.v1ResultEscalation.findMany({ where: { resultRevisionId: revision2Id } });
    expect(revision2EscalationsAfter.every((row) => row.status === 'CLOSED')).toBe(true);
  });
});

/**
 * Issue #376 follow-up -- closing the stale-approval hole ASSIST_SYNC would
 * otherwise reopen: `syncAssistsIntoSubmittedRevision` never changes the
 * predecessor SUBMITTED revision's own `state` column (see its doc comment
 * for why no existing enum value honestly fits), so a stale reviewer view
 * (or a stale cached revisionId) could still successfully
 * `officializeResultRevision` the OLD, now-superseded revision and confirm
 * outdated assist data as official -- unless officialize itself refuses.
 * `TournamentResultReviewService.officializeResultRevision`'s STANDARD flow
 * now does exactly that.
 */
describe('officializeResultRevision refuses a SUBMITTED revision that ASSIST_SYNC has since superseded (issue #376 follow-up)', () => {
  let gameId: string;
  let homeSideId: string;
  let scorerId: string;
  let assistant1Id: string;
  let goalEventId: string;
  let staleRevisionId: string;
  let staleProjectionPreviewHash: string;

  beforeAll(async () => {
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({ where: { name: 'football-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixtureE,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Stale Officialize Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Stale Officialize Away' },
      ],
      participants: [
        { sourceParticipantId: 'stale-scorer', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Stale Scorer' },
        { sourceParticipantId: 'stale-assistant-1', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Stale Assistant 1' },
      ],
    };
    const actor: GameActorScope = { actorType: 'USER', actorUserId: ids.operator, role: 'field_operator', tournamentId: ids.tournament, fixtureId: ids.fixtureE };
    const created = await prisma.$transaction((tx) => service.createFromSourceInTransaction(tx, input, context(actor, 'stale-officialize-source-create', input)));
    gameId = created.gameId;
    const persisted = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, include: { sides: true, participants: true } });
    homeSideId = persisted.sides.find((s) => s.sideKey === 'HOME')!.id;
    scorerId = persisted.participants.find((p) => p.displayNameSnapshot === 'Stale Scorer')!.id;
    assistant1Id = persisted.participants.find((p) => p.displayNameSnapshot === 'Stale Assistant 1')!.id;

    await prisma.v1GameLineup.updateMany({ where: { gameId, revision: 1 }, data: { state: 'SUBMITTED' } });

    const startVersion = await currentVersion(gameId);
    const startToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'stale-officialize-start', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'start', 'stale-officialize-start', {
      expectedVersion: startVersion, clientCommandId: 'stale-officialize-start', takeoverToken: startToken, occurredAt: new Date().toISOString(), payload: {},
    });

    const goalVersion = await currentVersion(gameId);
    const goalToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'stale-officialize-goal', lastSequence: 0 })).takeoverToken;
    const goal = await service.appendEvent(authUser(ids.operator), gameId, 'stale-officialize-goal', {
      expectedVersion: goalVersion, clientEventId: 'stale-officialize-goal', takeoverToken: goalToken,
      type: 'GOAL' as never, sideId: homeSideId, participantId: scorerId,
      period: 1, clockMs: 1000, occurredAt: new Date().toISOString(), payload: {},
    });
    goalEventId = goal.event!.id;

    const endVersion = await currentVersion(gameId);
    const endToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'stale-officialize-end', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'end', 'stale-officialize-end', {
      expectedVersion: endVersion, clientCommandId: 'stale-officialize-end', takeoverToken: endToken, occurredAt: new Date().toISOString(), payload: {},
    });

    const staleRevision = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId } });
    staleRevisionId = staleRevision.id;
    // The hash a "stale reviewer view" would have computed from THIS
    // revision before an assist ever landed on it.
    staleProjectionPreviewHash = canonicalGameCommandPayloadHash({
      score: staleRevision.score,
      goalEvents: staleRevision.goalEvents,
      eventsHash: staleRevision.eventsHash,
      mvpParticipantId: staleRevision.mvpParticipantId,
    });

    // An assist lands after submission -- ASSIST_SYNC supersedes
    // staleRevisionId with a fresh successor, exactly like the alpha report.
    const assistVersion = await currentVersion(gameId);
    const assistToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'stale-officialize-attach', lastSequence: 0 })).takeoverToken;
    await service.assignGoalAssist(authUser(ids.operator), gameId, goalEventId, 'stale-officialize-attach', {
      expectedVersion: assistVersion, clientEventId: 'stale-officialize-attach', takeoverToken: assistToken, assistParticipantId: assistant1Id,
    });
  });

  it('rejects officializing the now-superseded stale revision, leaving it SUBMITTED and the game unofficial', async () => {
    const officializeVersion = await currentVersion(gameId);
    const failure = await captureFailure(() =>
      resultReview.officializeResultRevision(authUser(ids.operator), gameId, staleRevisionId, 'stale-officialize-confirm', {
        expectedVersion: officializeVersion,
        clientCommandId: 'stale-officialize-confirm',
        projectionPreviewHash: staleProjectionPreviewHash,
      }),
    );
    expectHttpCode(failure, 409, 'REVISION_MUST_BE_SUPERSEDED');

    const staleAfter = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: staleRevisionId } });
    expect(staleAfter.state).toBe(V1GameResultRevisionState.SUBMITTED);
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.currentOfficialRevisionId).toBeNull();
  });

  it('officializes the fresh successor normally', async () => {
    const successor = await prisma.v1GameResultRevision.findFirstOrThrow({
      where: { gameId, supersedesId: staleRevisionId },
    });
    const previewHash = canonicalGameCommandPayloadHash({
      score: successor.score,
      goalEvents: successor.goalEvents,
      eventsHash: successor.eventsHash,
      mvpParticipantId: successor.mvpParticipantId,
    });
    const officializeVersion = await currentVersion(gameId);
    const officialized = await resultReview.officializeResultRevision(authUser(ids.operator), gameId, successor.id, 'stale-officialize-successor', {
      expectedVersion: officializeVersion,
      clientCommandId: 'stale-officialize-successor',
      projectionPreviewHash: previewHash,
    });
    expect(officialized.revisionState).toBe(V1GameResultRevisionState.OFFICIAL);
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.currentOfficialRevisionId).toBe(successor.id);

    const officialParticipants = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: successor.id } });
    const byParticipant = new Map(officialParticipants.map((row) => [row.participantId, row.assists]));
    expect(byParticipant.get(assistant1Id)).toBe(1);
  });
});

/**
 * Issue #376 follow-up -- the user's explicit design decision: an OFFICIAL
 * revision is a CONFIRMED public result and must never be silently rewritten
 * (that would destroy the audit trail's meaning). `assignGoalAssist` refuses
 * the whole command up front when the game's `currentOfficialRevisionId`
 * currently points at an OFFICIAL revision, rather than quietly amending the
 * event while leaving the confirmed revision untouched (which would just
 * reproduce the original bug one state later, against a result already
 * presented as final).
 */
describe('assignGoalAssist rejects when the game already has an OFFICIAL revision (issue #376 follow-up)', () => {
  let gameId: string;
  let homeSideId: string;
  let scorerId: string;
  let assistant1Id: string;
  let goalEventId: string;
  let officialRevisionId: string;

  beforeAll(async () => {
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({ where: { name: 'football-v1', status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixtureD,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Official Block Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Official Block Away' },
      ],
      participants: [
        { sourceParticipantId: 'official-block-scorer', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Official Block Scorer' },
        { sourceParticipantId: 'official-block-assistant', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Official Block Assistant' },
      ],
    };
    const actor: GameActorScope = { actorType: 'USER', actorUserId: ids.operator, role: 'field_operator', tournamentId: ids.tournament, fixtureId: ids.fixtureD };
    const created = await prisma.$transaction((tx) => service.createFromSourceInTransaction(tx, input, context(actor, 'official-block-source-create', input)));
    gameId = created.gameId;
    const persisted = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, include: { sides: true, participants: true } });
    homeSideId = persisted.sides.find((s) => s.sideKey === 'HOME')!.id;
    scorerId = persisted.participants.find((p) => p.displayNameSnapshot === 'Official Block Scorer')!.id;
    assistant1Id = persisted.participants.find((p) => p.displayNameSnapshot === 'Official Block Assistant')!.id;

    await prisma.v1GameLineup.updateMany({ where: { gameId, revision: 1 }, data: { state: 'SUBMITTED' } });

    const startVersion = await currentVersion(gameId);
    const startToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'official-block-start', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'start', 'official-block-start', {
      expectedVersion: startVersion, clientCommandId: 'official-block-start', takeoverToken: startToken, occurredAt: new Date().toISOString(), payload: {},
    });

    const goalVersion = await currentVersion(gameId);
    const goalToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'official-block-goal', lastSequence: 0 })).takeoverToken;
    const goal = await service.appendEvent(authUser(ids.operator), gameId, 'official-block-goal', {
      expectedVersion: goalVersion, clientEventId: 'official-block-goal', takeoverToken: goalToken,
      type: 'GOAL' as never, sideId: homeSideId, participantId: scorerId,
      period: 1, clockMs: 1000, occurredAt: new Date().toISOString(), payload: {},
    });
    goalEventId = goal.event!.id;

    const endVersion = await currentVersion(gameId);
    const endToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'official-block-end', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'end', 'official-block-end', {
      expectedVersion: endVersion, clientCommandId: 'official-block-end', takeoverToken: endToken, occurredAt: new Date().toISOString(), payload: {},
    });

    const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId } });
    const officializeVersion = await currentVersion(gameId);
    const officialized = await resultReview.officializeResultRevision(authUser(ids.operator), gameId, submitted.id, 'official-block-officialize', {
      expectedVersion: officializeVersion,
      clientCommandId: 'official-block-officialize',
      projectionPreviewHash: canonicalGameCommandPayloadHash({
        score: submitted.score,
        goalEvents: submitted.goalEvents,
        eventsHash: submitted.eventsHash,
        mvpParticipantId: submitted.mvpParticipantId,
      }),
    });
    officialRevisionId = officialized.revisionId;
    expect(officialized.revisionState).toBe(V1GameResultRevisionState.OFFICIAL);
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.currentOfficialRevisionId).toBe(officialRevisionId);
  });

  it('refuses the assist command and leaves the event and the OFFICIAL revision untouched', async () => {
    const eventBefore = await prisma.v1GameEvent.findUniqueOrThrow({ where: { id: goalEventId } });
    expect(eventBefore.assistParticipantId).toBeNull();
    const revisionBefore = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: officialRevisionId } });
    const participantsBefore = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: officialRevisionId } });
    const versionBefore = await currentVersion(gameId);

    const token = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'official-block-attach', lastSequence: 0 })).takeoverToken;
    const failure = await captureFailure(() =>
      service.assignGoalAssist(authUser(ids.operator), gameId, goalEventId, 'official-block-attach', {
        expectedVersion: versionBefore, clientEventId: 'official-block-attach', takeoverToken: token, assistParticipantId: assistant1Id,
      }),
    );
    expectHttpCode(failure, 409, 'RESULT_ALREADY_OFFICIAL');

    const eventAfter = await prisma.v1GameEvent.findUniqueOrThrow({ where: { id: goalEventId } });
    expect(eventAfter.assistParticipantId).toBeNull();
    const revisionAfter = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: officialRevisionId } });
    expect(revisionAfter.state).toBe(V1GameResultRevisionState.OFFICIAL);
    expect(revisionAfter.updatedAt).toEqual(revisionBefore.updatedAt);
    const participantsAfter = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: officialRevisionId } });
    expect(participantsAfter).toEqual(participantsBefore);
    const versionAfter = await currentVersion(gameId);
    expect(versionAfter).toBe(versionBefore);
  });
});
