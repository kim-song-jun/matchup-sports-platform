import { Prisma, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type {
  GameActorScope,
  GameCommandContext,
  GameSourceCreationInput,
} from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FOOTBALL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config.presets';

/**
 * Issue #392 — `deriveTournamentRevision`'s `missingScorer` field (the
 * operations-board "득점자 미기재" warning) used to be computed with a bare
 * `events.some((event) => event.type === GOAL && event.participantId ===
 * null)`, with no `reversesEventId` filter at all -- unlike its two sibling
 * derivations in the same file (`scoreFromEvents`, `resultInvariantInput`)
 * and unlike the goal/card/foul/assist per-participant loop
 * (`aggregateGameParticipantStats`) that issue #376 already fixed for the
 * exact same class of bug. A GOAL event recorded without a scorer and then
 * reversed (mis-tap corrected, wrong event undone via `reverseEvent`) kept
 * tripping the warning forever even though the live event stream no longer
 * contained any scorer-less goal.
 *
 * The fix reuses `aggregateGameParticipantStats`'s own `reversedIds` set to
 * derive `missingScorer` too (moved ahead of the revision `create()` call so
 * both can share the one aggregation pass), instead of introducing a third,
 * independent reversed-event computation in the same file.
 *
 * These specs need `result.tournamentScorerPolicy: 'optional'` on the
 * game's competition config, NOT the seeded `football-v1` preset
 * (`competition-config.presets.ts`'s `FOOTBALL_V1_CONFIG.result
 * .tournamentScorerPolicy` is `'required'`) -- under `'required'`,
 * `GamesService.assertEventReferences` (`games.service.ts`, `SCORER_
 * REQUIRED`) rejects a scorer-less GOAL at append time for any
 * TOURNAMENT_FIXTURE game, so the scorer-less-goal shape this bug is about
 * could never even reach the event stream to exercise the fixed code path.
 * A dedicated config version cloned from the football-v1 preset with that
 * one field flipped to `'optional'` is created directly below (mirroring
 * how `CompetitionConfigRegistry.createVersion()` lets an admin pin a
 * tournament to a non-default policy in production).
 */

const ids = {
  operator: '68000000-0000-4000-8000-000000000001',
  sport: '68000000-0000-4000-8000-000000000010',
  region: '68000000-0000-4000-8000-000000000011',
  hostTeam: '68000000-0000-4000-8000-000000000020',
  awayTeam: '68000000-0000-4000-8000-000000000021',
  competitionConfigVersion: '68000000-0000-4000-8000-000000000031',
  tournament: '68000000-0000-4000-8000-000000000030',
  fixtureReversedExcluded: '68000000-0000-4000-8000-000000000033',
  fixtureUnreversedRemains: '68000000-0000-4000-8000-000000000034',
  assignment: '68000000-0000-4000-8000-000000000040',
} as const;

const prisma = new PrismaService();
const service = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task-missing-scorer.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function context(actor: GameActorScope, commandId: string, payload: unknown): GameCommandContext {
  return {
    actor,
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  await prisma.$connect();
  await prisma.v1User.create({
    data: {
      id: ids.operator,
      email: 'task-missing-scorer-operator@example.test',
      accountStatus: 'active',
      onboardingStatus: 'completed',
    },
  });
  await prisma.v1Sport.create({
    data: { id: ids.sport, code: 'football-missing-scorer', name: 'Task Missing Scorer Football' },
  });
  await prisma.v1Region.create({
    data: { id: ids.region, code: 'TASK_MISSING_SCORER_REGION', name: 'Task Missing Scorer Region', level: 1 },
  });
  await prisma.v1Team.createMany({
    data: [
      { id: ids.hostTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Missing Scorer Host' },
      { id: ids.awayTeam, ownerUserId: ids.operator, sportId: ids.sport, regionId: ids.region, name: 'Missing Scorer Away' },
    ],
  });
  // See the file-level doc comment: football-v1's tournamentScorerPolicy is
  // 'required', which blocks a scorer-less GOAL at append time -- these
  // specs need 'optional' instead, so they get their own config version
  // rather than reusing the shared football-v1 preset.
  const config = await prisma.v1CompetitionConfigVersion.create({
    data: {
      id: ids.competitionConfigVersion,
      sportCode: 'football-missing-scorer',
      name: 'football-v1-issue392-optional-scorer',
      version: 1,
      status: 'ACTIVE',
      periods: FOOTBALL_V1_CONFIG.periods as unknown as Prisma.InputJsonValue,
      events: FOOTBALL_V1_CONFIG.events as unknown as Prisma.InputJsonValue,
      lineup: FOOTBALL_V1_CONFIG.lineup as unknown as Prisma.InputJsonValue,
      result: {
        ...FOOTBALL_V1_CONFIG.result,
        tournamentScorerPolicy: 'optional',
      } as unknown as Prisma.InputJsonValue,
      tieBreak: FOOTBALL_V1_CONFIG.tieBreak as unknown as Prisma.InputJsonValue,
      visibility: FOOTBALL_V1_CONFIG.visibility as unknown as Prisma.InputJsonValue,
      contentHash: 'issue-392-optional-tournament-scorer-policy-config',
    },
  });
  await prisma.v1Tournament.create({
    data: { id: ids.tournament, sportId: ids.sport, title: 'Task Missing Scorer Tournament', competitionConfigVersionId: config.id },
  });
  await prisma.v1TournamentFixture.createMany({
    data: [
      { id: ids.fixtureReversedExcluded, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, competitionConfigVersionId: config.id },
      { id: ids.fixtureUnreversedRemains, tournamentId: ids.tournament, round: 'group', fixtureNumber: 2, competitionConfigVersionId: config.id },
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

describe('deriveTournamentRevision — missingScorer excludes reversed goals (issue #392)', () => {
  let gameId: string;
  let scorerId: string;

  beforeAll(async () => {
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixtureReversedExcluded,
      competitionConfigVersionId: ids.competitionConfigVersion,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Missing Scorer Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Missing Scorer Away' },
      ],
      participants: [
        { sourceParticipantId: 'reversed-case-scorer', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Valid Scorer' },
      ],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.operator,
      role: 'field_operator',
      tournamentId: ids.tournament,
      fixtureId: ids.fixtureReversedExcluded,
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, context(actor, 'missing-scorer-reversed-source-create', input)),
    );
    gameId = created.gameId;
    const persisted = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, include: { sides: true, participants: true } });
    const homeSideId = persisted.sides.find((s) => s.sideKey === 'HOME')!.id;
    scorerId = persisted.participants.find((p) => p.displayNameSnapshot === 'Valid Scorer')!.id;

    await prisma.v1GameLineup.updateMany({ where: { gameId, revision: 1 }, data: { state: 'SUBMITTED' } });

    const startToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'ms-reversed-start', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'start', 'ms-reversed-start', {
      expectedVersion: 0, clientCommandId: 'ms-reversed-start', takeoverToken: startToken, occurredAt: new Date().toISOString(), payload: {},
    });

    // A valid, scored GOAL -- must survive and keep counting toward the
    // official score/participant tally.
    const validGoalToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'ms-reversed-goal-valid', lastSequence: 0 })).takeoverToken;
    await service.appendEvent(authUser(ids.operator), gameId, 'ms-reversed-goal-valid', {
      expectedVersion: 1, clientEventId: 'ms-reversed-goal-valid', takeoverToken: validGoalToken,
      type: 'GOAL' as never, sideId: homeSideId, participantId: scorerId,
      period: 1, clockMs: 1000, occurredAt: new Date().toISOString(), payload: {},
    });

    // A scorer-less GOAL (no `participantId` at all) -- appendable because
    // `AppendGameEventDto.participantId` is `@IsOptional()` and
    // `validateEventShape` only requires a participant for CARD/FOUL, not
    // GOAL. This is exactly the shape that used to trip `missingScorer`
    // forever once reversed below.
    const noScorerGoalToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'ms-reversed-goal-noscorer', lastSequence: 0 })).takeoverToken;
    const noScorerGoal = await service.appendEvent(authUser(ids.operator), gameId, 'ms-reversed-goal-noscorer', {
      expectedVersion: 2, clientEventId: 'ms-reversed-goal-noscorer', takeoverToken: noScorerGoalToken,
      type: 'GOAL' as never, sideId: homeSideId,
      period: 1, clockMs: 1500, occurredAt: new Date().toISOString(), payload: {},
    });

    const reverseToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'ms-reversed-reverse', lastSequence: 0 })).takeoverToken;
    await service.reverseEvent(authUser(ids.operator), gameId, noScorerGoal.event!.id, 'ms-reversed-reverse', {
      expectedVersion: 3, clientEventId: 'ms-reversed-reverse', takeoverToken: reverseToken, reason: '오심 취소',
    });

    const endToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'ms-reversed-end', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'end', 'ms-reversed-end', {
      expectedVersion: 4, clientCommandId: 'ms-reversed-end', takeoverToken: endToken, occurredAt: new Date().toISOString(), payload: {},
    });
  });

  it('judges missingScorer only on the surviving valid goal -- the reversed scorer-less goal is excluded', async () => {
    const revision = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId }, orderBy: { revision: 'desc' } });

    expect(revision.missingScorer).toBe(false);

    // The reversed scorer-less goal must not leak into the score either --
    // confirms the assertion above is actually driven by "only the valid
    // goal survives", not some unrelated fluke.
    const score = revision.score as { home: number; away: number };
    expect(score.home).toBe(1);
    const rows = await prisma.v1GameResultParticipant.findMany({ where: { resultRevisionId: revision.id } });
    expect(rows.find((row) => row.participantId === scorerId)).toEqual(expect.objectContaining({ goals: 1 }));
  });
});

describe('deriveTournamentRevision — missingScorer stays true for an un-reversed scorer-less goal (issue #392)', () => {
  let gameId: string;

  beforeAll(async () => {
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: ids.fixtureUnreversedRemains,
      competitionConfigVersionId: ids.competitionConfigVersion,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Missing Scorer Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.awayTeam, displayNameSnapshot: 'Missing Scorer Away' },
      ],
      participants: [
        { sourceParticipantId: 'remains-case-scorer', sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Valid Scorer 2' },
      ],
    };
    const actor: GameActorScope = {
      actorType: 'USER',
      actorUserId: ids.operator,
      role: 'field_operator',
      tournamentId: ids.tournament,
      fixtureId: ids.fixtureUnreversedRemains,
    };
    const created = await prisma.$transaction((tx) =>
      service.createFromSourceInTransaction(tx, input, context(actor, 'missing-scorer-remains-source-create', input)),
    );
    gameId = created.gameId;
    const persisted = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId }, include: { sides: true, participants: true } });
    const homeSideId = persisted.sides.find((s) => s.sideKey === 'HOME')!.id;
    const scorerId = persisted.participants.find((p) => p.displayNameSnapshot === 'Valid Scorer 2')!.id;

    await prisma.v1GameLineup.updateMany({ where: { gameId, revision: 1 }, data: { state: 'SUBMITTED' } });

    const startToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'ms-remains-start', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'start', 'ms-remains-start', {
      expectedVersion: 0, clientCommandId: 'ms-remains-start', takeoverToken: startToken, occurredAt: new Date().toISOString(), payload: {},
    });

    const validGoalToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'ms-remains-goal-valid', lastSequence: 0 })).takeoverToken;
    await service.appendEvent(authUser(ids.operator), gameId, 'ms-remains-goal-valid', {
      expectedVersion: 1, clientEventId: 'ms-remains-goal-valid', takeoverToken: validGoalToken,
      type: 'GOAL' as never, sideId: homeSideId, participantId: scorerId,
      period: 1, clockMs: 1000, occurredAt: new Date().toISOString(), payload: {},
    });

    // A scorer-less GOAL that is NEVER reversed -- must keep the
    // "득점자 미기재" warning on.
    const noScorerGoalToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'ms-remains-goal-noscorer', lastSequence: 0 })).takeoverToken;
    await service.appendEvent(authUser(ids.operator), gameId, 'ms-remains-goal-noscorer', {
      expectedVersion: 2, clientEventId: 'ms-remains-goal-noscorer', takeoverToken: noScorerGoalToken,
      type: 'GOAL' as never, sideId: homeSideId,
      period: 1, clockMs: 1500, occurredAt: new Date().toISOString(), payload: {},
    });

    const endToken = (await service.requestTakeover(authUser(ids.operator), gameId, { clientInstanceId: 'ms-remains-end', lastSequence: 0 })).takeoverToken;
    await service.executeCommand(authUser(ids.operator), gameId, 'end', 'ms-remains-end', {
      expectedVersion: 3, clientCommandId: 'ms-remains-end', takeoverToken: endToken, occurredAt: new Date().toISOString(), payload: {},
    });
  });

  it('keeps missingScorer true when an un-reversed scorer-less goal is still live', async () => {
    const revision = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId }, orderBy: { revision: 'desc' } });
    expect(revision.missingScorer).toBe(true);
  });
});
