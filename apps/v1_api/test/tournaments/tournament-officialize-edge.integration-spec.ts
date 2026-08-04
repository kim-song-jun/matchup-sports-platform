import { HttpException } from '@nestjs/common';
import { V1GameEventType, V1GameSideKey, V1GameSourceType } from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
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
