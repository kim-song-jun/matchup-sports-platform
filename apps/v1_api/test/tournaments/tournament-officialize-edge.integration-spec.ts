import { HttpException } from '@nestjs/common';
import { Prisma, V1GameEventType, V1GameResultRevisionState, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';

// Task 22 gap G-3: the DIRECTOR_OFFICIALIZE 403-denial path did not leave a
// `V1OperationAudit` row, and the success-path audit did not carry the
// flag's decision-time `{ value, version }` snapshot. See
// `.github/tasks/22-tournament-result-review-officialize.md` T-C / G-3.
//
// Deliberately a separate spec + id namespace from
// `tournament-officialize.integration-spec.ts`: that suite is one
// sequential, expectedVersion-chained state-machine story and must not have
// negative/audit-focused cases interleaved into it (see that suite's own
// "Mock data strategy" note + this task's R-4).
const ids = {
  platformOps: '86000000-0000-4000-8000-000000000001',
  director: '86000000-0000-4000-8000-000000000002',
  sport: '86000000-0000-4000-8000-000000000010',
  region: '86000000-0000-4000-8000-000000000011',
  hostTeam: '86000000-0000-4000-8000-000000000020',
  opponentTeam: '86000000-0000-4000-8000-000000000021',
  tournament: '86000000-0000-4000-8000-000000000030',
  denialFixture: '86000000-0000-4000-8000-000000000040',
  successFixture: '86000000-0000-4000-8000-000000000041',
  directorAssignment: '86000000-0000-4000-8000-000000000060',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const staffAccess = new TournamentStaffAccessService(prisma);
const resultReview = new TournamentResultReviewService(prisma, staffAccess, new OperationAuditWriterService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task22g3.example.test`,
  accountStatus: 'active' as const,
  onboardingStatus: 'completed' as const,
});

function sourceContext(payload: unknown, commandId: string): GameCommandContext {
  return {
    actor: { actorType: 'USER', actorUserId: ids.platformOps, role: 'platform_ops' },
    expectedVersion: 0,
    durableCommandId: commandId,
    payloadHash: canonicalGameCommandPayloadHash(payload),
  };
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

async function grantTakeover(gameId: string, userId: string, seed: string): Promise<string> {
  const grant = await games.requestTakeover(authUser(userId), gameId, {
    clientInstanceId: `task22g3-${seed}-client`,
    lastSequence: 0,
  });
  return grant.takeoverToken;
}

async function buildTournamentGame(fixtureId: string): Promise<string> {
  const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
    where: { name: 'football-v1', status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
  const input: GameSourceCreationInput = {
    sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
    sourceId: fixtureId,
    competitionConfigVersionId: config.id,
    sides: [
      { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 22 G-3 Host' },
      { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 22 G-3 Opponent' },
    ],
    participants: [
      { sourceParticipantId: `host-player-${fixtureId}`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Host One' },
    ],
  };
  const created = await prisma.$transaction((tx) =>
    games.createFromSourceInTransaction(tx, input, sourceContext(input, `task22g3-source-${fixtureId}`)),
  );
  return created.gameId;
}

/** Drives SCHEDULED -> LIVE -> ENDED with one attributed home GOAL, producing
 * exactly one auto-derived SUBMITTED revision scored 1-0, then officializes
 * it as platform_ops so a director has a current-official revision to
 * attempt voiding. */
async function buildOfficialGame(fixtureId: string): Promise<{ gameId: string; officialRevisionId: string }> {
  const gameId = await buildTournamentGame(fixtureId);
  const home = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
  const scorer = await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId, sideId: home.id } });
  const startToken = await grantTakeover(gameId, ids.platformOps, `start-${gameId}`);
  await games.executeCommand(authUser(ids.platformOps), gameId, 'start', `task22g3-start-${gameId}`, {
    expectedVersion: 0,
    clientCommandId: `task22g3-start-${gameId}`,
    takeoverToken: startToken,
    occurredAt: new Date().toISOString(),
    payload: {},
  });
  const goalToken = await grantTakeover(gameId, ids.platformOps, `goal-${gameId}`);
  await games.appendEvent(authUser(ids.platformOps), gameId, `task22g3-goal-${gameId}`, {
    expectedVersion: 1,
    clientEventId: `task22g3-goal-${gameId}`,
    takeoverToken: goalToken,
    type: V1GameEventType.GOAL,
    sideId: home.id,
    participantId: scorer.id,
    period: 1,
    clockMs: 60_000,
    occurredAt: new Date().toISOString(),
    payload: {},
  });
  const endToken = await grantTakeover(gameId, ids.platformOps, `end-${gameId}`);
  await games.executeCommand(authUser(ids.platformOps), gameId, 'end', `task22g3-end-${gameId}`, {
    expectedVersion: 2,
    clientCommandId: `task22g3-end-${gameId}`,
    takeoverToken: endToken,
    occurredAt: new Date().toISOString(),
    payload: {},
  });
  const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId } });
  const previewHash = canonicalGameCommandPayloadHash({
    score: submitted.score,
    eventsHash: submitted.eventsHash,
    mvpParticipantId: submitted.mvpParticipantId,
  });
  const officialized = await resultReview.officializeResultRevision(
    authUser(ids.platformOps),
    gameId,
    submitted.id,
    `task22g3-officialize-${gameId}`,
    {
      expectedVersion: 3,
      clientCommandId: `task22g3-officialize-${gameId}`,
      projectionPreviewHash: previewHash,
    },
  );
  return { gameId, officialRevisionId: officialized.revisionId };
}

describe('Task 22 G-3: DIRECTOR_OFFICIALIZE denial audit + flag snapshot', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 22 G-3 integration verification');
    }
    await prisma.$connect();
    await prisma.v1User.createMany({
      data: [ids.platformOps, ids.director].map((id, index) => ({
        id,
        email: `task22g3-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'ops', status: 'active' },
    });
    await prisma.v1Sport.upsert({
      where: { code: 'football' },
      create: { id: ids.sport, code: 'football', name: 'Task 22 G-3 Football' },
      update: {},
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK22G3_REGION', name: 'Task 22 G-3 Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Task 22 G-3 Host' },
        { id: ids.opponentTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Task 22 G-3 Opponent' },
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: ids.sport, title: 'Task 22 G-3 tournament' },
    });
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    await prisma.v1TournamentFixture.createMany({
      data: [
        { id: ids.denialFixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, competitionConfigVersionId: config.id },
        { id: ids.successFixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 2, competitionConfigVersionId: config.id },
      ],
    });
    await prisma.v1TournamentStaffAssignment.create({
      data: {
        id: ids.directorAssignment,
        tournamentId: ids.tournament,
        userId: ids.director,
        role: 'TOURNAMENT_DIRECTOR',
        grantedByUserId: ids.platformOps,
      },
    });
    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'DIRECTOR_OFFICIALIZE' },
      create: { key: 'DIRECTOR_OFFICIALIZE', value: 'off', ownerActor: 'platform_ops' },
      update: { value: 'off' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('audits a denied director void attempt while DIRECTOR_OFFICIALIZE is off, with the flag snapshot and no state change', async () => {
    const { gameId, officialRevisionId } = await buildOfficialGame(ids.denialFixture);

    await prisma.v1GameOperationFlag.update({ where: { key: 'DIRECTOR_OFFICIALIZE' }, data: { value: 'off' } });
    const flagBeforeDenial = await prisma.v1GameOperationFlag.findUniqueOrThrow({
      where: { key: 'DIRECTOR_OFFICIALIZE' },
    });

    const gameBeforeDenial = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const denied = await captureFailure(() =>
      resultReview.voidResultRevision(authUser(ids.director), gameId, officialRevisionId, 'task22g3-void-denied', {
        expectedVersion: gameBeforeDenial.version,
        clientCommandId: 'task22g3-void-denied',
        reason: 'director attempts void while the gate is off',
      }),
    );
    expectHttpCode(denied, 403, 'DIRECTOR_OFFICIALIZE_DISABLED');

    // The game's pointer/version must be completely untouched by a denied attempt.
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.currentOfficialRevisionId).toBe(officialRevisionId);
    expect(game.version).toBe(gameBeforeDenial.version);

    const auditRows = await prisma.v1OperationAudit.findMany({
      where: { resourceType: 'GAME', resourceId: gameId, action: 'RESULT_REVISION_VOID_DENIED' },
    });
    expect(auditRows).toHaveLength(1);
    const audit = auditRows[0];
    // `V1OperationAudit.actorType` only distinguishes USER vs SYSTEM
    // (`V1OperationActorType` has no per-role variants); the actor's
    // tournament-scoped role and authorization subject are carried in the
    // `after` JSON payload instead (see the service's `withResultCommand`).
    expect(audit.actorType).toBe('USER');
    expect(audit.actorUserId).toBe(ids.director);
    expect(audit.tournamentId).toBe(ids.tournament);
    expect(audit.fixtureId).toBe(ids.denialFixture);
    expect(audit.after).toMatchObject({
      denied: true,
      code: 'DIRECTOR_OFFICIALIZE_DISABLED',
      actorRole: 'tournament_director',
      authorizationSubject: `assignment:${ids.directorAssignment}@0`,
      directorOfficializeFlag: { value: 'off', version: flagBeforeDenial.version },
    });
  });

  it('audits an allowed director void with the actor role, authorizationSubject, and flag value/version snapshot while the gate is on', async () => {
    const { gameId, officialRevisionId } = await buildOfficialGame(ids.successFixture);

    await prisma.v1GameOperationFlag.update({ where: { key: 'DIRECTOR_OFFICIALIZE' }, data: { value: 'on' } });
    const flagBeforeSuccess = await prisma.v1GameOperationFlag.findUniqueOrThrow({
      where: { key: 'DIRECTOR_OFFICIALIZE' },
    });

    const gameBeforeVoid = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    const voided = await resultReview.voidResultRevision(authUser(ids.director), gameId, officialRevisionId, 'task22g3-void-allowed', {
      expectedVersion: gameBeforeVoid.version,
      clientCommandId: 'task22g3-void-allowed',
      reason: 'director voids the result while the gate is on',
    });
    expect(voided.revisionState).toBe('VOID');

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.currentOfficialRevisionId).toBe(voided.revisionId);

    const auditRows = await prisma.v1OperationAudit.findMany({
      where: { resourceType: 'GAME', resourceId: gameId, action: 'RESULT_REVISION_VOID' },
    });
    expect(auditRows).toHaveLength(1);
    const audit = auditRows[0];
    expect(audit.actorType).toBe('USER');
    expect(audit.actorUserId).toBe(ids.director);
    expect(audit.tournamentId).toBe(ids.tournament);
    expect(audit.fixtureId).toBe(ids.successFixture);
    expect(audit.after).toMatchObject({
      revisionId: voided.revisionId,
      revisionState: 'VOID',
      actorRole: 'tournament_director',
      authorizationSubject: `assignment:${ids.directorAssignment}@0`,
      directorOfficializeFlag: { value: 'on', version: flagBeforeSuccess.version },
    });

    // Reaffirms the flag gate is not itself audited by this lane (Task 5's
    // ownership); only the gated result-review commands are.
    await prisma.v1GameOperationFlag.update({ where: { key: 'DIRECTOR_OFFICIALIZE' }, data: { value: 'off' } });
  });
});

// Task 22 T-B: fills the 6 remaining QA-scenario test gaps left after G-3
// (Q-16/Q-17 were covered incidentally by the two `it`s above). See
// `.github/tasks/22-tournament-result-review-officialize.md` T-B / G-4.
// Deliberately its own top-level describe with a fully self-contained id
// sub-range (`86000000-...0001{00-16}`) so it neither collides with nor
// depends on the G-3 fixtures above -- every helper below is re-declared
// (shadowed) inside this describe's own scope rather than reusing the
// module-level `ids`/`buildTournamentGame`/`sourceContext` from the G-3
// block, which are hard-wired to G-3's own team/actor ids. `prisma`,
// `games`, `staffAccess`, and `resultReview` (the module-level service
// instances) are reused as-is: reusing one PrismaService connection per
// spec *file* -- not per describe -- already matches how every other V1
// integration spec in this repo is structured.
describe('Task 22 T-B: QA scenario gap coverage (Q-02/04/07/08/11/13)', () => {
  const ids = {
    platformOps: '86000000-0000-4000-8000-000000000100',
    sport: '86000000-0000-4000-8000-000000000101',
    region: '86000000-0000-4000-8000-000000000102',
    hostTeam: '86000000-0000-4000-8000-000000000103',
    opponentTeam: '86000000-0000-4000-8000-000000000104',
    tournament: '86000000-0000-4000-8000-000000000105',
    fixtureQ02: '86000000-0000-4000-8000-000000000110',
    fixtureQ04: '86000000-0000-4000-8000-000000000111',
    fixtureQ07: '86000000-0000-4000-8000-000000000112',
    fixtureQ08: '86000000-0000-4000-8000-000000000113',
    fixtureQ11A: '86000000-0000-4000-8000-000000000114',
    fixtureQ11B: '86000000-0000-4000-8000-000000000115',
    fixtureQ13: '86000000-0000-4000-8000-000000000116',
  } as const;

  function sourceContext(payload: unknown, commandId: string): GameCommandContext {
    return {
      actor: { actorType: 'USER', actorUserId: ids.platformOps, role: 'platform_ops' },
      expectedVersion: 0,
      durableCommandId: commandId,
      payloadHash: canonicalGameCommandPayloadHash(payload),
    };
  }

  async function buildTournamentGame(fixtureId: string): Promise<string> {
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    const input: GameSourceCreationInput = {
      sourceType: V1GameSourceType.TOURNAMENT_FIXTURE,
      sourceId: fixtureId,
      competitionConfigVersionId: config.id,
      sides: [
        { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 22 T-B Host' },
        { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 22 T-B Opponent' },
      ],
      participants: [
        { sourceParticipantId: `host-player-${fixtureId}`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Host One' },
      ],
    };
    const created = await prisma.$transaction((tx) =>
      games.createFromSourceInTransaction(tx, input, sourceContext(input, `task22tb-source-${fixtureId}`)),
    );
    return created.gameId;
  }

  /** Drives SCHEDULED -> LIVE -> ENDED with one attributed home GOAL,
   * producing exactly one auto-derived SUBMITTED revision scored 1-0. */
  async function endGameWithHomeGoal(gameId: string): Promise<{ homeSideId: string; scorerId: string }> {
    const home = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
    const scorer = await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId, sideId: home.id } });
    const startToken = await grantTakeover(gameId, ids.platformOps, `start-${gameId}`);
    await games.executeCommand(authUser(ids.platformOps), gameId, 'start', `task22tb-start-${gameId}`, {
      expectedVersion: 0,
      clientCommandId: `task22tb-start-${gameId}`,
      takeoverToken: startToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    const goalToken = await grantTakeover(gameId, ids.platformOps, `goal-${gameId}`);
    await games.appendEvent(authUser(ids.platformOps), gameId, `task22tb-goal-${gameId}`, {
      expectedVersion: 1,
      clientEventId: `task22tb-goal-${gameId}`,
      takeoverToken: goalToken,
      type: V1GameEventType.GOAL,
      sideId: home.id,
      participantId: scorer.id,
      period: 1,
      clockMs: 60_000,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    const endToken = await grantTakeover(gameId, ids.platformOps, `end-${gameId}`);
    await games.executeCommand(authUser(ids.platformOps), gameId, 'end', `task22tb-end-${gameId}`, {
      expectedVersion: 2,
      clientCommandId: `task22tb-end-${gameId}`,
      takeoverToken: endToken,
      occurredAt: new Date().toISOString(),
      payload: {},
    });
    return { homeSideId: home.id, scorerId: scorer.id };
  }

  function previewHash(revision: { score: unknown; eventsHash: string; mvpParticipantId: string | null }): string {
    return canonicalGameCommandPayloadHash({
      score: revision.score,
      eventsHash: revision.eventsHash,
      mvpParticipantId: revision.mvpParticipantId,
    });
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 22 T-B integration verification');
    }
    await prisma.$connect();
    await prisma.v1User.create({
      data: { id: ids.platformOps, email: `${ids.platformOps}@task22tb.example.test`, accountStatus: 'active', onboardingStatus: 'completed' },
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'ops', status: 'active' },
    });
    // `where: { code: 'football' }` finds the row the earlier G-3 describe
    // in this same file already created and leaves it untouched -- Postgres
    // does NOT rewrite its id to `ids.sport` in that case. Every downstream
    // FK reference below must therefore use this upsert's *returned* row id
    // (whichever describe happened to create it first), not the `ids.sport`
    // literal.
    const sport = await prisma.v1Sport.upsert({
      where: { code: 'football' },
      create: { id: ids.sport, code: 'football', name: 'Task 22 T-B Football' },
      update: {},
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK22TB_REGION', name: 'Task 22 T-B Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.platformOps, sportId: sport.id, regionId: ids.region, name: 'Task 22 T-B Host' },
        { id: ids.opponentTeam, ownerUserId: ids.platformOps, sportId: sport.id, regionId: ids.region, name: 'Task 22 T-B Opponent' },
      ],
    });
    await prisma.v1Tournament.create({
      data: { id: ids.tournament, sportId: sport.id, title: 'Task 22 T-B tournament' },
    });
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    await prisma.v1TournamentFixture.createMany({
      data: [
        { id: ids.fixtureQ02, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, competitionConfigVersionId: config.id },
        { id: ids.fixtureQ04, tournamentId: ids.tournament, round: 'group', fixtureNumber: 2, competitionConfigVersionId: config.id },
        { id: ids.fixtureQ07, tournamentId: ids.tournament, round: 'group', fixtureNumber: 3, competitionConfigVersionId: config.id },
        { id: ids.fixtureQ08, tournamentId: ids.tournament, round: 'group', fixtureNumber: 4, competitionConfigVersionId: config.id },
        { id: ids.fixtureQ11A, tournamentId: ids.tournament, round: 'group', fixtureNumber: 5, competitionConfigVersionId: config.id },
        { id: ids.fixtureQ11B, tournamentId: ids.tournament, round: 'group', fixtureNumber: 6, competitionConfigVersionId: config.id },
        { id: ids.fixtureQ13, tournamentId: ids.tournament, round: 'group', fixtureNumber: 7, competitionConfigVersionId: config.id },
      ],
    });
    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'DIRECTOR_OFFICIALIZE' },
      create: { key: 'DIRECTOR_OFFICIALIZE', value: 'off', ownerActor: 'platform_ops' },
      update: { value: 'off' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Q-02: resubmits successfully from a SUPPLEMENT_REQUESTED base, not just a REJECTED one', async () => {
    const gameId = await buildTournamentGame(ids.fixtureQ02);
    const { homeSideId, scorerId } = await endGameWithHomeGoal(gameId);
    const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId } });
    expect(submitted.state).toBe(V1GameResultRevisionState.SUBMITTED);

    const supplementRequested = await resultReview.reviewDecision(
      authUser(ids.platformOps),
      gameId,
      submitted.id,
      'task22tb-q02-supplement',
      {
        expectedVersion: 3,
        clientCommandId: 'task22tb-q02-supplement',
        decision: 'request_supplement',
        reason: 'need a lineup card photo before this can be reviewed',
      },
    );
    expect(supplementRequested.revisionState).toBe(V1GameResultRevisionState.SUPPLEMENT_REQUESTED);

    const successor = await resultReview.supersedeAndSubmit(
      authUser(ids.platformOps),
      gameId,
      supplementRequested.revisionId,
      'task22tb-q02-resubmit',
      {
        expectedVersion: 4,
        clientCommandId: 'task22tb-q02-resubmit',
        score: { home: 1, away: 0 },
        actualParticipants: [
          {
            participantId: scorerId,
            sideId: homeSideId,
            started: true,
            goals: 1,
            cards: { yellow: 0, red: 0 },
            goalkeeper: false,
          },
        ],
        eventsHash: 'task22tb-q02-resubmitted-hash',
        reason: 'lineup card attached, resubmitting',
      },
    );
    expect(successor.revisionState).toBe(V1GameResultRevisionState.SUBMITTED);
    const successorRow = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: successor.revisionId } });
    expect(successorRow.supersedesId).toBe(supplementRequested.revisionId);
  });

  it('Q-04: an outbox unique-key collision deep inside a successful-looking mutate() rolls the whole successor back atomically', async () => {
    const gameId = await buildTournamentGame(ids.fixtureQ04);
    const { homeSideId, scorerId } = await endGameWithHomeGoal(gameId);
    const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId } });

    const rejected = await resultReview.reviewDecision(authUser(ids.platformOps), gameId, submitted.id, 'task22tb-q04-reject', {
      expectedVersion: 3,
      clientCommandId: 'task22tb-q04-reject',
      decision: 'reject',
      reason: 'lineup mismatch',
    });
    expect(rejected.revisionState).toBe(V1GameResultRevisionState.REJECTED);

    // Pre-occupy the exact `v1_outbox_events.business_key` the successor's
    // GAME_RESULT_SUBMITTED write will try to insert (revision 2 -- reject()
    // mutated revision 1 in place, so the next revision number is 2). This
    // is the *last* statement `supersedeAndSubmit`'s mutate() callback runs,
    // deep inside the same interactive transaction that already created the
    // successor DRAFT row, attached its participant, and bumped it to
    // SUBMITTED -- a genuine unique-constraint failure late in an otherwise
    // fully successful-looking mutation, not a mock/spy.
    await prisma.v1OutboxEvent.create({
      data: {
        businessKey: `game:${gameId}:revision:2:submitted`,
        aggregateType: 'GAME',
        aggregateId: gameId,
        type: 'GAME_RESULT_SUBMITTED',
        payload: {},
      },
    });

    const revisionCountBefore = await prisma.v1GameResultRevision.count({ where: { gameId } });
    const participantCountBefore = await prisma.v1GameResultParticipant.count({ where: { resultRevision: { gameId } } });
    const gameBefore = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });

    const collided = await captureFailure(() =>
      resultReview.supersedeAndSubmit(authUser(ids.platformOps), gameId, rejected.revisionId, 'task22tb-q04-resubmit', {
        expectedVersion: 4,
        clientCommandId: 'task22tb-q04-resubmit',
        score: { home: 1, away: 0 },
        actualParticipants: [
          {
            participantId: scorerId,
            sideId: homeSideId,
            started: true,
            goals: 1,
            cards: { yellow: 0, red: 0 },
            goalkeeper: false,
          },
        ],
        eventsHash: 'task22tb-q04-resubmitted-hash',
        reason: 'lineup confirmed, resubmitting',
      }),
    );
    expectHttpCode(collided, 409, 'COMMAND_CONCURRENCY_CONFLICT');

    // Nothing the mutate() callback wrote before the outbox insert survives:
    // no revision-2 row, no orphaned participant row, and the game's
    // version/pointer are exactly what they were before this attempt (not
    // bumped a second time).
    expect(await prisma.v1GameResultRevision.count({ where: { gameId } })).toBe(revisionCountBefore);
    expect(await prisma.v1GameResultRevision.findFirst({ where: { gameId, revision: 2 } })).toBeNull();
    expect(await prisma.v1GameResultParticipant.count({ where: { resultRevision: { gameId } } })).toBe(participantCountBefore);
    const gameAfter = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(gameAfter.version).toBe(gameBefore.version);
    expect(gameAfter.currentOfficialRevisionId).toBeNull();

    // The colliding outbox row planted above was only ever meant to make
    // ONE specific insert inside the mutate() transaction fail; it must not
    // linger as a real (permanently-failing, since its payload has no
    // revisionId) job for Q-13's worker to later stumble into and drain.
    await prisma.v1OutboxEvent.delete({
      where: { businessKey: `game:${gameId}:revision:2:submitted` },
    });
  });

  it('Q-07: a SUPPLEMENT_REQUESTED revision is terminal -- both reviewDecision and officialize retries are rejected', async () => {
    const gameId = await buildTournamentGame(ids.fixtureQ07);
    await endGameWithHomeGoal(gameId);
    const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId } });

    const supplementRequested = await resultReview.reviewDecision(
      authUser(ids.platformOps),
      gameId,
      submitted.id,
      'task22tb-q07-supplement',
      {
        expectedVersion: 3,
        clientCommandId: 'task22tb-q07-supplement',
        decision: 'request_supplement',
        reason: 'need a lineup card photo',
      },
    );
    expect(supplementRequested.revisionState).toBe(V1GameResultRevisionState.SUPPLEMENT_REQUESTED);

    const reviewRetry = await captureFailure(() =>
      resultReview.reviewDecision(authUser(ids.platformOps), gameId, submitted.id, 'task22tb-q07-review-retry', {
        expectedVersion: 4,
        clientCommandId: 'task22tb-q07-review-retry',
        decision: 'reject',
        reason: 'retried on a terminal supplement-requested revision',
      }),
    );
    expectHttpCode(reviewRetry, 409, 'TERMINAL_REVISION_IMMUTABLE');

    const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: submitted.id } });
    const officializeRetry = await captureFailure(() =>
      resultReview.officializeResultRevision(authUser(ids.platformOps), gameId, submitted.id, 'task22tb-q07-officialize-retry', {
        expectedVersion: 4,
        clientCommandId: 'task22tb-q07-officialize-retry',
        projectionPreviewHash: previewHash(revision),
      }),
    );
    expectHttpCode(officializeRetry, 409, 'TERMINAL_REVISION_IMMUTABLE');

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.version).toBe(4);
    expect(game.currentOfficialRevisionId).toBeNull();
  });

  it('Q-08: a directly-seeded CHANGE_REQUESTED revision (a team-match-only state in real traffic) is still rejected as terminal on the tournament route', async () => {
    const gameId = await buildTournamentGame(ids.fixtureQ08);
    // CHANGE_REQUESTED is only ever produced by GamesService.decideResultRevision
    // on the team-match axis; the tournament route this suite exercises has
    // no code path that reaches it. The revision-state-machine already lists
    // it as terminal (games/core/revision-state-machine.ts), so this is a
    // negative control seeded directly at the DB layer (a plain create() --
    // there is no BEFORE INSERT guard on v1_game_result_revisions, only
    // BEFORE UPDATE/DELETE) proving that inclusion actually fires on the
    // tournament route rather than being dead code.
    const seeded = await prisma.v1GameResultRevision.create({
      data: {
        gameId,
        revision: 1,
        state: V1GameResultRevisionState.CHANGE_REQUESTED,
        score: { home: 0, away: 0 },
        eventsHash: 'task22tb-q08-seeded-hash',
        createdByActorType: 'USER',
        createdByUserId: ids.platformOps,
        reason: 'seeded directly: CHANGE_REQUESTED has no reachable tournament-route producer',
      },
    });

    const reviewAttempt = await captureFailure(() =>
      resultReview.reviewDecision(authUser(ids.platformOps), gameId, seeded.id, 'task22tb-q08-review', {
        expectedVersion: 0,
        clientCommandId: 'task22tb-q08-review',
        decision: 'reject',
        reason: 'attempted review of a CHANGE_REQUESTED row',
      }),
    );
    expectHttpCode(reviewAttempt, 409, 'TERMINAL_REVISION_IMMUTABLE');

    const officializeAttempt = await captureFailure(() =>
      resultReview.officializeResultRevision(authUser(ids.platformOps), gameId, seeded.id, 'task22tb-q08-officialize', {
        expectedVersion: 0,
        clientCommandId: 'task22tb-q08-officialize',
        projectionPreviewHash: previewHash(seeded),
      }),
    );
    expectHttpCode(officializeAttempt, 409, 'TERMINAL_REVISION_IMMUTABLE');

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.version).toBe(0);
    expect(game.currentOfficialRevisionId).toBeNull();
    const revisionAfter = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(revisionAfter.state).toBe(V1GameResultRevisionState.CHANGE_REQUESTED);
  });

  it('Q-11: cross-game current-pointer and supersedes corruption is rejected by the composite FKs at the database layer', async () => {
    const gameAId = await buildTournamentGame(ids.fixtureQ11A);
    const submittedA = await (async () => {
      await endGameWithHomeGoal(gameAId);
      return prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId: gameAId } });
    })();
    const officialA = await resultReview.officializeResultRevision(
      authUser(ids.platformOps),
      gameAId,
      submittedA.id,
      'task22tb-q11-officialize-a',
      {
        expectedVersion: 3,
        clientCommandId: 'task22tb-q11-officialize-a',
        projectionPreviewHash: previewHash(submittedA),
      },
    );

    const gameBId = await buildTournamentGame(ids.fixtureQ11B);
    await endGameWithHomeGoal(gameBId);
    const submittedB = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId: gameBId } });

    // 1) current_official_revision_id corruption: point game A's pointer at
    // a revision that belongs to game B. `v1_games_current_revision_fk`
    // enforces (id, current_official_revision_id) -> (game_id, id) on
    // v1_game_result_revisions, so a plain Prisma update (no app code
    // involved) must be rejected by Postgres itself.
    const gameABefore = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameAId } });
    const pointerCorruption = await captureFailure(() =>
      prisma.v1Game.update({ where: { id: gameAId }, data: { currentOfficialRevisionId: submittedB.id } }),
    );
    expect(pointerCorruption).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((pointerCorruption as Prisma.PrismaClientKnownRequestError).code).toBe('P2003');
    const gameAAfter = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameAId } });
    expect(gameAAfter.currentOfficialRevisionId).toBe(gameABefore.currentOfficialRevisionId);
    expect(gameAAfter.currentOfficialRevisionId).toBe(officialA.revisionId);

    // 2) supersedes_id corruption: a DRAFT correction on game A must not be
    // able to point supersedesId at a revision from game B either.
    // `v1_result_revisions_supersedes_fk` enforces (game_id, supersedes_id)
    // -> (game_id, id) the same way. This targets a DRAFT row specifically
    // (not a terminal one) so `v1_block_terminal_revision_mutation` does not
    // intercept the update before the FK is ever evaluated -- this is
    // exclusively a test of the FK, not of the terminal-immutability
    // trigger already covered by Q-06/Q-07/Q-08/Q-09.
    const correctionDraft = await resultReview.createResultCorrection(authUser(ids.platformOps), gameAId, 'task22tb-q11-correction', {
      expectedVersion: 4,
      clientCommandId: 'task22tb-q11-correction',
      baseRevisionId: officialA.revisionId,
      reason: 'draft used only to exercise the supersedes FK',
      changes: {
        score: { home: 1, away: 0 },
        actualParticipants: [],
        eventsHash: 'task22tb-q11-correction-hash',
      },
    });
    const draftBefore = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: correctionDraft.revisionId } });
    expect(draftBefore.state).toBe(V1GameResultRevisionState.DRAFT);

    const supersedesCorruption = await captureFailure(() =>
      prisma.v1GameResultRevision.update({ where: { id: correctionDraft.revisionId }, data: { supersedesId: submittedB.id } }),
    );
    expect(supersedesCorruption).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((supersedesCorruption as Prisma.PrismaClientKnownRequestError).code).toBe('P2003');
    const draftAfter = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: correctionDraft.revisionId } });
    expect(draftAfter.supersedesId).toBe(draftBefore.supersedesId);
    expect(draftAfter.supersedesId).toBe(officialA.revisionId);
  });

  it('Q-13: a genuine projection-handler failure leaves the outbox row RETRY with incremented attempts and never touches the already-committed sync revision', async () => {
    const gameId = await buildTournamentGame(ids.fixtureQ13);
    await endGameWithHomeGoal(gameId);
    const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId } });
    expect(submitted.state).toBe(V1GameResultRevisionState.SUBMITTED);

    // Drain the real GAME_RESULT_SUBMITTED event 'end' already queued, so
    // the only outbox row left pending afterward is the one this test
    // injects below.
    const worker = new V1GameOperationsWorkerService(prisma);
    let drainGuard = 0;
    // eslint-disable-next-line no-await-in-loop
    while (await worker.processOne()) {
      drainGuard += 1;
      if (drainGuard > 50) throw new Error('Task 22 T-B Q-13 pre-drain guard exceeded');
    }

    // Inject a GAME_RESULT_OFFICIAL outbox event that references this
    // revision while it is still SUBMITTED (it is never officialized in
    // this test). This is not a mock or a spy: the real
    // GameResultOfficialProjectionService.handler's own
    // lockOfficialRevision() genuinely throws "... is not OFFICIAL" for
    // exactly this input -- the same production validation a stale or
    // corrupted outbox row would hit for real.
    const businessKey = `game:${gameId}:revision:${submitted.revision}:officialize-simulated-failure`;
    await prisma.v1OutboxEvent.create({
      data: {
        businessKey,
        aggregateType: 'GAME',
        aggregateId: gameId,
        revisionId: submitted.id,
        type: 'GAME_RESULT_OFFICIAL',
        payload: { revisionId: submitted.id },
        // Explicit, well-in-the-past `availableAt` rather than relying on
        // the column's `now()` default: claimOne() and this insert are two
        // separate statements/transactions, so leaving it to the DB default
        // makes "is this row claimable yet" a race against
        // `worker.processOne()`'s own immediately-following transaction's
        // CURRENT_TIMESTAMP. Pinning it in the past removes that race
        // entirely -- this test wants an already-due job, not one that
        // merely usually looks due.
        availableAt: new Date(Date.now() - 60_000),
      },
    });

    const processed = await worker.processOne();
    expect(processed).toBe(true);

    const outboxRow = await prisma.v1OutboxEvent.findUniqueOrThrow({ where: { businessKey } });
    expect(outboxRow.status).toBe('RETRY');
    expect(outboxRow.attempts).toBe(1);
    expect(outboxRow.lastError).not.toBeNull();
    expect(outboxRow.lastError).toContain('is not OFFICIAL');

    // The synchronous command boundary already committed this revision (and
    // the game's version) well before the worker ever ran -- the async
    // projection failure above must not have touched either: the sync
    // command boundary and the async projection worker are isolated failure
    // domains.
    const revisionAfter = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: submitted.id } });
    expect(revisionAfter.state).toBe(V1GameResultRevisionState.SUBMITTED);
    const gameAfter = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(gameAfter.currentOfficialRevisionId).toBeNull();
  });
});
