import { HttpException } from '@nestjs/common';
import {
  V1GameEventType,
  V1GameResultRevisionState,
  V1GameSideKey,
  V1GameSourceType,
} from '@prisma/client';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GameTakeoverService } from '../../src/games/game-takeover.service';
import { GamesService, canonicalGameCommandPayloadHash } from '../../src/games/games.service';
import type { GameCommandContext, GameSourceCreationInput } from '../../src/games/games.types';
import { PrismaService } from '../../src/prisma/prisma.service';
import { V1GameOperationsWorkerService } from '../../src/jobs/v1-game-operations-worker.service';
import { TournamentStaffAccessService } from '../../src/tournaments/staff/tournament-staff-access.service';
import { TournamentResultReviewService } from '../../src/tournament-operations/results/tournament-result-review.service';

// Task 22: tournament result review, officialize, correction, and void.
// Fixture setup mirrors the shared code that most other V1 integration
// suites already seed, but with a suite-local `name` on the competition
// config to avoid cross-suite drift (per the shared V1Sport/COMPETITION
// CONFIG fixture trap: `v1_competition_config_for_sport()` only maps
// soccer/football/futsal, so this suite reuses the shared `football` code).
const ids = {
  platformOps: '85000000-0000-4000-8000-000000000001',
  director: '85000000-0000-4000-8000-000000000002',
  outsideDirector: '85000000-0000-4000-8000-000000000003',
  sport: '85000000-0000-4000-8000-000000000010',
  region: '85000000-0000-4000-8000-000000000011',
  hostTeam: '85000000-0000-4000-8000-000000000020',
  opponentTeam: '85000000-0000-4000-8000-000000000021',
  tournament: '85000000-0000-4000-8000-000000000030',
  otherTournament: '85000000-0000-4000-8000-000000000031',
  sourceFixture: '85000000-0000-4000-8000-000000000040',
  targetFixture: '85000000-0000-4000-8000-000000000041',
  conflictSourceFixture: '85000000-0000-4000-8000-000000000042',
  conflictTargetFixture: '85000000-0000-4000-8000-000000000043',
  directorGateFixtureA: '85000000-0000-4000-8000-000000000044',
  directorGateFixtureB: '85000000-0000-4000-8000-000000000045',
  hostRegistration: '85000000-0000-4000-8000-000000000050',
  opponentRegistration: '85000000-0000-4000-8000-000000000051',
  directorAssignment: '85000000-0000-4000-8000-000000000060',
  outsideDirectorAssignment: '85000000-0000-4000-8000-000000000061',
} as const;

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService(), new GameTakeoverService());
const staffAccess = new TournamentStaffAccessService(prisma);
const resultReview = new TournamentResultReviewService(prisma, staffAccess, new OperationAuditWriterService());

const authUser = (id: string) => ({
  id,
  email: `${id}@task22.example.test`,
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

async function revisionCount(gameId: string): Promise<number> {
  return prisma.v1GameResultRevision.count({ where: { gameId } });
}

async function grantTakeover(gameId: string, userId: string, seed: string): Promise<string> {
  const grant = await games.requestTakeover(authUser(userId), gameId, {
    clientInstanceId: `task22-${seed}-client`,
    lastSequence: 0,
  });
  return grant.takeoverToken;
}

async function drainOutbox(): Promise<void> {
  const worker = new V1GameOperationsWorkerService(prisma);
  let guard = 0;
  // eslint-disable-next-line no-await-in-loop
  while (await worker.processOne()) {
    guard += 1;
    if (guard > 50) throw new Error('Task 22 outbox drain guard exceeded');
  }
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
      { sideKey: V1GameSideKey.HOME, teamId: ids.hostTeam, displayNameSnapshot: 'Task 22 Host' },
      { sideKey: V1GameSideKey.AWAY, teamId: ids.opponentTeam, displayNameSnapshot: 'Task 22 Opponent' },
    ],
    participants: [
      { sourceParticipantId: `host-player-${fixtureId}`, sideKey: V1GameSideKey.HOME, displayNameSnapshot: 'Host One' },
    ],
  };
  const created = await prisma.$transaction((tx) =>
    games.createFromSourceInTransaction(tx, input, sourceContext(input, `task22-source-${fixtureId}`)),
  );
  return created.gameId;
}

/** Drives SCHEDULED -> LIVE -> ENDED with one attributed home GOAL,
 * producing exactly one auto-derived SUBMITTED revision scored 1-0.
 * football-v1's tournamentScorerPolicy is 'required', so the goal must
 * carry a real participantId or the append itself is rejected. */
async function endWithOneHomeGoal(gameId: string): Promise<{ homeSideId: string; scorerId: string }> {
  const home = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.HOME } });
  const away = await prisma.v1GameSide.findFirstOrThrow({ where: { gameId, sideKey: V1GameSideKey.AWAY } });
  const scorer = await prisma.v1GameParticipant.findFirstOrThrow({ where: { gameId, sideId: home.id } });
  // GamesService.assertLineupsSubmittedForStart requires a SUBMITTED/LOCKED
  // lineup on every side before `start` is allowed. createFromSourceInTransaction
  // already creates a DRAFT revision-1 lineup per side at game creation, so
  // flip those straight to SUBMITTED here (bypassing
  // GamesService.saveLineup/submitLineup) rather than routing through the
  // command path and perturbing every expectedVersion literal that follows
  // `start` in this file. This helper only cares about driving the lifecycle
  // to ENDED with one goal, not roster content or command versioning.
  await prisma.v1GameLineup.updateMany({
    where: { gameId, sideId: { in: [home.id, away.id] }, revision: 1 },
    data: { state: 'SUBMITTED' },
  });
  const startToken = await grantTakeover(gameId, ids.platformOps, `start-${gameId}`);
  await games.executeCommand(authUser(ids.platformOps), gameId, 'start', `task22-start-${gameId}`, {
    expectedVersion: 0,
    clientCommandId: `task22-start-${gameId}`,
    takeoverToken: startToken,
    occurredAt: new Date().toISOString(),
    payload: {},
  });
  const goalToken = await grantTakeover(gameId, ids.platformOps, `goal-${gameId}`);
  await games.appendEvent(authUser(ids.platformOps), gameId, `task22-goal-${gameId}`, {
    expectedVersion: 1,
    clientEventId: `task22-goal-${gameId}`,
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
  await games.executeCommand(authUser(ids.platformOps), gameId, 'end', `task22-end-${gameId}`, {
    expectedVersion: 2,
    clientCommandId: `task22-end-${gameId}`,
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

describe('Task 22 tournament result review, officialize, correction, and void', () => {
  let gameId: string;
  let homeSideId: string;
  let scorerId: string;
  let rejectedRevisionId: string;
  let resubmittedRevisionId: string;
  let officialRevisionId: string;
  let correctionRevisionId: string;
  let correctionOfficialId: string;
  let voidRevisionId: string;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for the Task 22 integration verification');
    }
    await prisma.$connect();
    await prisma.v1User.createMany({
      data: [ids.platformOps, ids.director, ids.outsideDirector].map((id, index) => ({
        id,
        email: `task22-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
      })),
    });
    await prisma.v1AdminUser.create({
      data: { userId: ids.platformOps, adminRole: 'ops', status: 'active' },
    });
    await prisma.v1Sport.upsert({
      where: { code: 'football' },
      create: { id: ids.sport, code: 'football', name: 'Task 22 Football' },
      update: {},
    });
    await prisma.v1Region.create({
      data: { id: ids.region, code: 'TASK22_REGION', name: 'Task 22 Region', level: 1 },
    });
    await prisma.v1Team.createMany({
      data: [
        { id: ids.hostTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Task 22 Host' },
        { id: ids.opponentTeam, ownerUserId: ids.platformOps, sportId: ids.sport, regionId: ids.region, name: 'Task 22 Opponent' },
      ],
    });
    await prisma.v1Tournament.createMany({
      data: [
        { id: ids.tournament, sportId: ids.sport, title: 'Task 22 tournament' },
        { id: ids.otherTournament, sportId: ids.sport, title: 'Task 22 other tournament' },
      ],
    });
    const config = await prisma.v1CompetitionConfigVersion.findFirstOrThrow({
      where: { name: 'football-v1', status: 'ACTIVE' },
      orderBy: { version: 'desc' },
    });
    await prisma.v1TournamentFixture.createMany({
      data: [
        { id: ids.sourceFixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 1, competitionConfigVersionId: config.id },
        { id: ids.targetFixture, tournamentId: ids.tournament, round: 'semi', fixtureNumber: 1, competitionConfigVersionId: config.id },
        { id: ids.conflictSourceFixture, tournamentId: ids.tournament, round: 'group', fixtureNumber: 2, competitionConfigVersionId: config.id },
        {
          id: ids.conflictTargetFixture,
          tournamentId: ids.tournament,
          round: 'semi',
          fixtureNumber: 2,
          competitionConfigVersionId: config.id,
          status: 'in_progress',
        },
        { id: ids.directorGateFixtureA, tournamentId: ids.tournament, round: 'group', fixtureNumber: 3, competitionConfigVersionId: config.id },
        { id: ids.directorGateFixtureB, tournamentId: ids.tournament, round: 'group', fixtureNumber: 4, competitionConfigVersionId: config.id },
      ],
    });
    await prisma.v1TournamentRegistration.createMany({
      data: [
        { id: ids.hostRegistration, tournamentId: ids.tournament, teamId: ids.hostTeam, appliedByUserId: ids.platformOps, status: 'confirmed' },
        { id: ids.opponentRegistration, tournamentId: ids.tournament, teamId: ids.opponentTeam, appliedByUserId: ids.platformOps, status: 'confirmed' },
      ],
    });
    await prisma.v1TournamentFixture.update({
      where: { id: ids.sourceFixture },
      data: { homeRegistrationId: ids.hostRegistration, awayRegistrationId: ids.opponentRegistration },
    });
    await prisma.v1TournamentFixture.update({
      where: { id: ids.conflictSourceFixture },
      data: { homeRegistrationId: ids.hostRegistration, awayRegistrationId: ids.opponentRegistration },
    });
    await prisma.v1TournamentFixtureAdvancementEdge.create({
      data: {
        tournamentId: ids.tournament,
        sourceFixtureId: ids.sourceFixture,
        sourceOutcome: 'WINNER',
        targetFixtureId: ids.targetFixture,
        targetSide: 'HOME',
      },
    });
    await prisma.v1TournamentFixtureAdvancementEdge.create({
      data: {
        tournamentId: ids.tournament,
        sourceFixtureId: ids.conflictSourceFixture,
        sourceOutcome: 'WINNER',
        targetFixtureId: ids.conflictTargetFixture,
        targetSide: 'HOME',
      },
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
    await prisma.v1TournamentStaffAssignment.create({
      data: {
        id: ids.outsideDirectorAssignment,
        tournamentId: ids.otherTournament,
        userId: ids.outsideDirector,
        role: 'TOURNAMENT_DIRECTOR',
        grantedByUserId: ids.platformOps,
      },
    });
    await prisma.v1GameOperationFlag.upsert({
      where: { key: 'DIRECTOR_OFFICIALIZE' },
      create: { key: 'DIRECTOR_OFFICIALIZE', value: 'off', ownerActor: 'platform_ops' },
      update: { value: 'off' },
    });

    gameId = await buildTournamentGame(ids.sourceFixture);
    const ended = await endWithOneHomeGoal(gameId);
    homeSideId = ended.homeSideId;
    scorerId = ended.scorerId;
    // Materialize the GAME_RESULT_SUBMITTED escalation rows (created async by
    // the worker, not synchronously by 'end') before the first review test
    // asserts closeReviewSla actually closed real PENDING rows.
    await drainOutbox();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects the submitted revision, closes its SLA, and rejects any further review of the terminal row', async () => {
    const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId } });
    expect(submitted.state).toBe(V1GameResultRevisionState.SUBMITTED);

    // wrong-base supersede-and-submit while still SUBMITTED writes zero rows.
    const before = await revisionCount(gameId);
    const wrongBase = await captureFailure(() =>
      resultReview.supersedeAndSubmit(authUser(ids.platformOps), gameId, submitted.id, 'task22-wrong-base', {
        expectedVersion: 3,
        clientCommandId: 'task22-wrong-base',
        score: { home: 1, away: 0 },
        // 실제 참가자를 담는다. 이 테스트가 노리는 것은 "base가 아직 SUBMITTED라
        // 재제출이 거부된다"는 것뿐이고 참가자와는 무관하지만, 빈 배열을 남겨 두면
        // "참가자 없는 결과가 정상 입력"이라는 잘못된 선례가 된다 — 빈
        // actualParticipants는 그 경기의 개인기록을 0행으로 만드는 결함이다.
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
        eventsHash: 'wrong-base',
        reason: 'attempted before any review decision',
      }),
    );
    expectHttpCode(wrongBase, 409, 'RESULT_RESUBMISSION_NOT_ALLOWED');
    expect(await revisionCount(gameId)).toBe(before);

    const rejected = await resultReview.reviewDecision(authUser(ids.platformOps), gameId, submitted.id, 'task22-reject', {
      expectedVersion: 3,
      clientCommandId: 'task22-reject',
      decision: 'reject',
      reason: 'missing lineup confirmation',
    });
    expect(rejected.revisionState).toBe(V1GameResultRevisionState.REJECTED);
    rejectedRevisionId = rejected.revisionId;

    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.currentOfficialRevisionId).toBeNull();
    const escalations = await prisma.v1ResultEscalation.findMany({ where: { resultRevisionId: submitted.id } });
    expect(escalations.length).toBeGreaterThan(0);
    expect(escalations.every((row) => row.status === 'CLOSED')).toBe(true);

    const rejectAgain = await captureFailure(() =>
      resultReview.reviewDecision(authUser(ids.platformOps), gameId, submitted.id, 'task22-reject-again', {
        expectedVersion: 4,
        clientCommandId: 'task22-reject-again',
        decision: 'reject',
        reason: 'retried on a terminal revision',
      }),
    );
    expectHttpCode(rejectAgain, 409, 'TERMINAL_REVISION_IMMUTABLE');

    await drainOutbox();
  });

  it('supersedes the rejected revision with a fresh submitted successor and a fresh review SLA', async () => {
    const successor = await resultReview.supersedeAndSubmit(
      authUser(ids.platformOps),
      gameId,
      rejectedRevisionId,
      'task22-supersede',
      {
        expectedVersion: 4,
        clientCommandId: 'task22-supersede',
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
        eventsHash: 'resubmitted-hash',
        reason: 'lineup confirmed, resubmitting',
      },
    );
    expect(successor.revisionState).toBe(V1GameResultRevisionState.SUBMITTED);
    resubmittedRevisionId = successor.revisionId;

    const outbox = await prisma.v1OutboxEvent.findFirst({
      where: { businessKey: `game:${gameId}:revision:${successor.revision}:submitted` },
    });
    expect(outbox).not.toBeNull();
    const escalations = await prisma.v1ResultEscalation.findMany({
      where: { resultRevisionId: resubmittedRevisionId },
    });
    // A fresh SLA is created lazily by the worker once it processes the
    // GAME_RESULT_SUBMITTED event, not synchronously by the API command.
    expect(escalations.length).toBe(0);
    await drainOutbox();
    const escalationsAfterDrain = await prisma.v1ResultEscalation.findMany({
      where: { resultRevisionId: resubmittedRevisionId },
    });
    expect(escalationsAfterDrain.length).toBe(2);
  });

  it('rejects officialize with a stale/wrong projection preview hash before touching state', async () => {
    const before = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: resubmittedRevisionId } });
    const mismatch = await captureFailure(() =>
      resultReview.officializeResultRevision(authUser(ids.platformOps), gameId, resubmittedRevisionId, 'task22-officialize-mismatch', {
        expectedVersion: 5,
        clientCommandId: 'task22-officialize-mismatch',
        projectionPreviewHash: 'not-the-real-hash',
      }),
    );
    expectHttpCode(mismatch, 409, 'PROJECTION_PREVIEW_MISMATCH');
    const after = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: resubmittedRevisionId } });
    expect(after.state).toBe(before.state);
  });

  it('officializes the resubmitted revision and rejects a duplicate officialize of the now-terminal row', async () => {
    const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: resubmittedRevisionId } });
    const officialized = await resultReview.officializeResultRevision(
      authUser(ids.platformOps),
      gameId,
      resubmittedRevisionId,
      'task22-officialize',
      {
        expectedVersion: 5,
        clientCommandId: 'task22-officialize',
        projectionPreviewHash: previewHash(revision),
      },
    );
    expect(officialized.revisionState).toBe(V1GameResultRevisionState.OFFICIAL);
    officialRevisionId = officialized.revisionId;
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.currentOfficialRevisionId).toBe(officialRevisionId);

    await drainOutbox();
    const target = await prisma.v1TournamentFixture.findUniqueOrThrow({ where: { id: ids.targetFixture } });
    expect(target.homeRegistrationId).toBe(ids.hostRegistration);

    const duplicate = await captureFailure(() =>
      resultReview.officializeResultRevision(authUser(ids.platformOps), gameId, officialRevisionId, 'task22-officialize-again', {
        expectedVersion: 6,
        clientCommandId: 'task22-officialize-again',
        projectionPreviewHash: previewHash(revision),
      }),
    );
    expectHttpCode(duplicate, 409, 'TERMINAL_REVISION_IMMUTABLE');
  });

  it('creates a correction that leaves the prior official pointer authoritative, then officializes it and swaps the pointer', async () => {
    const before = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(before.currentOfficialRevisionId).toBe(officialRevisionId);

    const correction = await resultReview.createResultCorrection(authUser(ids.platformOps), gameId, 'task22-correction', {
      expectedVersion: 6,
      clientCommandId: 'task22-correction',
      baseRevisionId: officialRevisionId,
      reason: 'scorer misattributed',
      changes: {
        score: { home: 1, away: 0 },
        // 정정의 요지가 "득점자 오기입"(reason)이므로 정정본에는 올바른 득점자가
        // 들어 있어야 한다. `previewHash`는 score + eventsHash + mvpParticipantId만
        // 해싱하므로 참가자를 채워도 아래 officialize의 해시 검증에는 영향이 없다.
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
        eventsHash: 'corrected-hash',
      },
    });
    expect(correction.revisionState).toBe(V1GameResultRevisionState.DRAFT);
    correctionRevisionId = correction.revisionId;

    // Creation alone must not move the pointer.
    const afterCreate = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(afterCreate.currentOfficialRevisionId).toBe(officialRevisionId);

    const draft = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: correctionRevisionId } });
    const officialized = await resultReview.officializeResultRevision(
      authUser(ids.platformOps),
      gameId,
      correctionRevisionId,
      'task22-correction-officialize',
      {
        expectedVersion: 7,
        clientCommandId: 'task22-correction-officialize',
        projectionPreviewHash: previewHash(draft),
      },
    );
    expect(officialized.revisionState).toBe(V1GameResultRevisionState.OFFICIAL);
    correctionOfficialId = officialized.revisionId;
    const afterOfficialize = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(afterOfficialize.currentOfficialRevisionId).toBe(correctionOfficialId);
    await drainOutbox();
  });

  it('rejects a correction whose baseRevisionId is stale (state OFFICIAL but no longer the current pointer) with zero new rows', async () => {
    // `officialRevisionId` is still stored with state OFFICIAL (that column
    // never changes once set), but the correction above already moved the
    // game's *current* pointer to `correctionOfficialId`. This is exactly
    // the defect this test guards: a check that only looked at
    // `base.state === OFFICIAL` would wrongly accept `officialRevisionId`
    // here even though it is no longer the game's current official revision.
    const stale = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: officialRevisionId } });
    expect(stale.state).toBe(V1GameResultRevisionState.OFFICIAL);
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.currentOfficialRevisionId).not.toBe(officialRevisionId);

    const before = await revisionCount(gameId);
    const rejected = await captureFailure(() =>
      resultReview.createResultCorrection(authUser(ids.platformOps), gameId, 'task22-stale-correction', {
        expectedVersion: game.version,
        clientCommandId: 'task22-stale-correction',
        baseRevisionId: officialRevisionId,
        reason: 'attempted correction against a stale official pointer',
        changes: {
          score: { home: 9, away: 9 },
          // stale base 검사(`REVISION_MUST_BE_SUPERSEDED`)가 참가자 검증보다 먼저
          // 걸리므로 결과는 같지만, 빈 배열을 남겨 두면 "참가자 없는 정정이 정상
          // 입력"으로 읽히는 가짜 픽스처가 된다.
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
          eventsHash: 'stale-correction-hash',
        },
      }),
    );
    expectHttpCode(rejected, 409, 'REVISION_MUST_BE_SUPERSEDED');
    expect(await revisionCount(gameId)).toBe(before);
  });

  it('voids the current official revision, closes its SLA, and rejects a duplicate void', async () => {
    const voided = await resultReview.voidResultRevision(authUser(ids.platformOps), gameId, correctionOfficialId, 'task22-void', {
      expectedVersion: 8,
      clientCommandId: 'task22-void',
      reason: 'result void due to protest upheld',
    });
    expect(voided.revisionState).toBe(V1GameResultRevisionState.VOID);
    voidRevisionId = voided.revisionId;
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.currentOfficialRevisionId).toBe(voidRevisionId);

    const voidAgain = await captureFailure(() =>
      resultReview.voidResultRevision(authUser(ids.platformOps), gameId, voidRevisionId, 'task22-void-again', {
        expectedVersion: 9,
        clientCommandId: 'task22-void-again',
        reason: 'retried on an already-void pointer',
      }),
    );
    expectHttpCode(voidAgain, 409, 'REVISION_MUST_BE_SUPERSEDED');

    await drainOutbox();
    const cache = await prisma.$queryRaw<Array<{ isCurrent: boolean }>>`
      SELECT is_current AS "isCurrent" FROM v1_game_official_result_cache WHERE game_id = ${gameId}
    `;
    expect(cache.every((row) => row.isCurrent === false)).toBe(true);
    const target = await prisma.v1TournamentFixture.findUniqueOrThrow({ where: { id: ids.targetFixture } });
    expect(target.homeRegistrationId).toBeNull();
  });

  it('blocks void with 409 NEXT_FIXTURE_CONFLICT when the downstream bracket fixture already advanced past scheduled', async () => {
    const conflictGameId = await buildTournamentGame(ids.conflictSourceFixture);
    await endWithOneHomeGoal(conflictGameId);
    const submitted = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId: conflictGameId } });
    const officialized = await resultReview.officializeResultRevision(
      authUser(ids.platformOps),
      conflictGameId,
      submitted.id,
      'task22-conflict-officialize',
      {
        expectedVersion: 3,
        clientCommandId: 'task22-conflict-officialize',
        projectionPreviewHash: previewHash(submitted),
      },
    );
    const before = await revisionCount(conflictGameId);
    const blocked = await captureFailure(() =>
      resultReview.voidResultRevision(authUser(ids.platformOps), conflictGameId, officialized.revisionId, 'task22-conflict-void', {
        expectedVersion: 4,
        clientCommandId: 'task22-conflict-void',
        reason: 'attempted void past a locked downstream fixture',
      }),
    );
    expectHttpCode(blocked, 409, 'NEXT_FIXTURE_CONFLICT');
    expect(await revisionCount(conflictGameId)).toBe(before);
    const game = await prisma.v1Game.findUniqueOrThrow({ where: { id: conflictGameId } });
    expect(game.currentOfficialRevisionId).toBe(officialized.revisionId);
  });

  it('gates tournament_director officialize behind DIRECTOR_OFFICIALIZE and re-checks it live on every call', async () => {
    const gateGameIdA = await buildTournamentGame(ids.directorGateFixtureA);
    await endWithOneHomeGoal(gateGameIdA);
    const submittedA = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId: gateGameIdA } });

    // off -> deny
    const deniedOff = await captureFailure(() =>
      resultReview.officializeResultRevision(authUser(ids.director), gateGameIdA, submittedA.id, 'task22-director-off', {
        expectedVersion: 3,
        clientCommandId: 'task22-director-off',
        projectionPreviewHash: previewHash(submittedA),
      }),
    );
    expectHttpCode(deniedOff, 403, 'DIRECTOR_OFFICIALIZE_DISABLED');

    // on -> allow
    await prisma.v1GameOperationFlag.update({ where: { key: 'DIRECTOR_OFFICIALIZE' }, data: { value: 'on' } });
    const allowed = await resultReview.officializeResultRevision(authUser(ids.director), gateGameIdA, submittedA.id, 'task22-director-on', {
      expectedVersion: 3,
      clientCommandId: 'task22-director-on',
      projectionPreviewHash: previewHash(submittedA),
    });
    expect(allowed.revisionState).toBe(V1GameResultRevisionState.OFFICIAL);

    // rollback to off -> deny again, on a *different* fresh revision.
    await prisma.v1GameOperationFlag.update({ where: { key: 'DIRECTOR_OFFICIALIZE' }, data: { value: 'off' } });
    const gateGameIdB = await buildTournamentGame(ids.directorGateFixtureB);
    await endWithOneHomeGoal(gateGameIdB);
    const submittedB = await prisma.v1GameResultRevision.findFirstOrThrow({ where: { gameId: gateGameIdB } });
    const deniedAgain = await captureFailure(() =>
      resultReview.officializeResultRevision(authUser(ids.director), gateGameIdB, submittedB.id, 'task22-director-off-again', {
        expectedVersion: 3,
        clientCommandId: 'task22-director-off-again',
        projectionPreviewHash: previewHash(submittedB),
      }),
    );
    expectHttpCode(deniedAgain, 403, 'DIRECTOR_OFFICIALIZE_DISABLED');

    // A director scoped to a different tournament is denied outright, flag
    // state notwithstanding.
    await prisma.v1GameOperationFlag.update({ where: { key: 'DIRECTOR_OFFICIALIZE' }, data: { value: 'on' } });
    const unauthorized = await captureFailure(() =>
      resultReview.officializeResultRevision(authUser(ids.outsideDirector), gateGameIdB, submittedB.id, 'task22-outside-director', {
        expectedVersion: 3,
        clientCommandId: 'task22-outside-director',
        projectionPreviewHash: previewHash(submittedB),
      }),
    );
    expectHttpCode(unauthorized, 403, 'STAFF_SCOPE_DENIED');
    await prisma.v1GameOperationFlag.update({ where: { key: 'DIRECTOR_OFFICIALIZE' }, data: { value: 'off' } });
  });
});
