import { NotFoundException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request = require('supertest');
import { AdminContextService } from '../../src/common/admin-context.service';
import { resolveGameOperationGateRoot } from '../../src/config/game-operation-flags';
import type { GamesService } from '../../src/games/games.service';
import type { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TeamMatchesService } from '../../src/team-matches/team-matches.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { FOOTBALL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config';
import { TournamentBracketService } from '../../src/tournaments/tournament-bracket.service';
import type {
  GameBackfillCompareResult,
  GameBackfillRunResult,
} from '../fixtures/game-backfill.fixture';
import { createV1IntegrationApp } from '../integration/integration-app';
import {
  gameBackfillFixture,
} from '../fixtures/game-backfill.fixture';

const prisma = new PrismaClient();
const ids = gameBackfillFixture.ids;
const timestamps = gameBackfillFixture.timestamps;

type GameBackfillBoundary = {
  runGameResultBackfill(
    client: PrismaClient,
    input: { mode: 'dry-run' | 'apply' },
  ): Promise<GameBackfillRunResult>;
  compareGameResultReads(client: PrismaClient): Promise<GameBackfillCompareResult>;
};

function loadFutureMigrationBoundary(): GameBackfillBoundary {
  const loaded: unknown = require('../../src/games/migration');
  if (typeof loaded !== 'object' || loaded === null) {
    throw new Error('Task 10 migration boundary must export an object');
  }
  const candidate = loaded as Partial<GameBackfillBoundary>;
  if (
    typeof candidate.runGameResultBackfill !== 'function' ||
    typeof candidate.compareGameResultReads !== 'function'
  ) {
    throw new Error(
      'Task 10 migration boundary must export runGameResultBackfill and compareGameResultReads',
    );
  }
  return candidate as GameBackfillBoundary;
}

async function seedTask10Sources() {
  await prisma.v1User.create({
    data: {
      id: ids.user,
      email: 'task-10-backfill@example.test',
      onboardingStatus: 'completed',
      phoneVerifiedAt: timestamps.created,
      createdAt: timestamps.created,
    },
  });
  await prisma.v1AdminUser.create({
    data: { id: ids.admin, userId: ids.user, adminRole: 'ops', createdAt: timestamps.created },
  });
  await prisma.v1Sport.create({
    data: { id: ids.sport, code: 'football', name: 'Football', createdAt: timestamps.created },
  });
  await prisma.v1Region.create({
    data: {
      id: ids.region,
      code: 'TASK_10_DISTRICT',
      name: 'Task 10 District',
      level: 2,
      createdAt: timestamps.created,
    },
  });
  await prisma.v1CompetitionConfigVersion.create({
    data: {
      id: ids.competitionConfigVersion,
      sportCode: 'football',
      name: 'task10-football-v1',
      version: 1,
      status: 'ACTIVE',
      periods: FOOTBALL_V1_CONFIG.periods,
      events: FOOTBALL_V1_CONFIG.events,
      lineup: FOOTBALL_V1_CONFIG.lineup,
      result: FOOTBALL_V1_CONFIG.result,
      tieBreak: FOOTBALL_V1_CONFIG.tieBreak,
      visibility: FOOTBALL_V1_CONFIG.visibility,
      contentHash: 'task-10-exact-competition-config-version',
      createdAt: timestamps.created,
    },
  });
  await prisma.v1Team.createMany({
    data: [
      {
        id: ids.homeTeam,
        ownerUserId: ids.user,
        sportId: ids.sport,
        regionId: ids.region,
        name: 'Task 10 Home',
        createdAt: timestamps.created,
      },
      {
        id: ids.awayTeam,
        ownerUserId: ids.user,
        sportId: ids.sport,
        regionId: ids.region,
        name: 'Task 10 Away',
        createdAt: timestamps.created,
      },
    ],
  });
  await prisma.v1Tournament.create({
    data: {
      id: ids.tournament,
      sportId: ids.sport,
      title: 'Task 10 Tournament',
      competitionConfigVersionId: ids.competitionConfigVersion,
      createdAt: timestamps.created,
    },
  });
  await prisma.v1TournamentRegistration.createMany({
    data: [
      {
        id: ids.homeRegistration,
        tournamentId: ids.tournament,
        teamId: ids.homeTeam,
        appliedByUserId: ids.user,
        status: 'confirmed',
        createdAt: timestamps.created,
      },
      {
        id: ids.awayRegistration,
        tournamentId: ids.tournament,
        teamId: ids.awayTeam,
        appliedByUserId: ids.user,
        status: 'confirmed',
        createdAt: timestamps.created,
      },
    ],
  });

  const commonFixture = {
    tournamentId: ids.tournament,
    round: 'group',
    homeRegistrationId: ids.homeRegistration,
    awayRegistrationId: ids.awayRegistration,
    status: 'completed' as const,
    competitionConfigVersionId: ids.competitionConfigVersion,
    createdAt: timestamps.created,
  };
  await prisma.v1TournamentFixture.createMany({
    data: [
      { ...commonFixture, id: ids.validFixture, fixtureNumber: 1 },
      { ...commonFixture, id: ids.corruptFixture, fixtureNumber: 2 },
      { ...commonFixture, id: ids.importedFixture, fixtureNumber: 3 },
    ],
  });
  await prisma.v1TournamentFixtureResult.createMany({
    data: [
      {
        id: ids.validFixtureResult,
        fixtureId: ids.validFixture,
        homeScore: 3,
        awayScore: 1,
        note: 'official legacy result',
        recordedAt: timestamps.tournamentRecorded,
        createdAt: timestamps.tournamentRecorded,
        updatedAt: timestamps.tournamentRecorded,
      },
      {
        id: ids.corruptFixtureResult,
        fixtureId: ids.corruptFixture,
        homeScore: -1,
        awayScore: 2,
        note: 'negative score is corrupt',
        recordedAt: timestamps.tournamentRecorded,
        createdAt: timestamps.tournamentRecorded,
        updatedAt: timestamps.tournamentRecorded,
      },
      {
        id: ids.importedFixtureResult,
        fixtureId: ids.importedFixture,
        homeScore: 2,
        awayScore: 0,
        note: 'already imported',
        recordedAt: timestamps.tournamentRecorded,
        createdAt: timestamps.tournamentRecorded,
        updatedAt: timestamps.tournamentRecorded,
      },
    ],
  });
  await prisma.v1TournamentFixtureGoal.createMany({
    data: [
      {
        id: ids.validHomeGoal,
        fixtureResultId: ids.validFixtureResult,
        team: 'home',
        playerName: 'Legacy Home Nine',
        minute: 12,
        createdAt: timestamps.tournamentRecorded,
      },
      {
        id: ids.validAwayGoal,
        fixtureResultId: ids.validFixtureResult,
        team: 'away',
        playerName: 'Legacy Away Seven',
        minute: 54,
        createdAt: new Date(timestamps.tournamentRecorded.getTime() + 1),
      },
    ],
  });
  await prisma.v1TeamMatch.createMany({
    data: [
      {
        id: ids.completedTeamMatch,
        hostTeamId: ids.homeTeam,
        createdByUserId: ids.user,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Completed without a legacy score',
        placeName: 'Task 10 Ground',
        startAt: new Date('2026-07-11T08:45:00.000Z'),
        endAt: timestamps.teamMatchCompleted,
        status: 'completed',
        completedAt: timestamps.teamMatchCompleted,
        competitionConfigVersionId: ids.competitionConfigVersion,
        createdAt: timestamps.created,
      },
      {
        id: ids.deletedTeamMatch,
        hostTeamId: ids.homeTeam,
        createdByUserId: ids.user,
        sportId: ids.sport,
        regionId: ids.region,
        title: 'Deleted completed source',
        placeName: 'Task 10 Ground',
        startAt: new Date('2026-07-12T10:00:00.000Z'),
        endAt: timestamps.deleted,
        status: 'completed',
        completedAt: timestamps.deleted,
        deletedAt: timestamps.deleted,
        competitionConfigVersionId: ids.competitionConfigVersion,
        createdAt: timestamps.created,
      },
    ],
  });

  await prisma.v1Game.create({
    data: {
      id: ids.importedGame,
      sourceType: 'TOURNAMENT_FIXTURE',
      tournamentFixtureId: ids.importedFixture,
      state: 'ENDED',
      version: 1,
      competitionConfigVersionId: ids.competitionConfigVersion,
      createdAt: timestamps.tournamentRecorded,
      sides: {
        create: [
          {
            id: ids.importedHomeSide,
            sideKey: 'HOME',
            teamId: ids.homeTeam,
            displayNameSnapshot: 'Task 10 Home',
          },
          {
            id: ids.importedAwaySide,
            sideKey: 'AWAY',
            teamId: ids.awayTeam,
            displayNameSnapshot: 'Task 10 Away',
          },
        ],
      },
      resultRevisions: {
        create: {
          id: ids.importedRevision,
          revision: 1,
          state: 'OFFICIAL',
          score: {
            regulation: { home: 2, away: 0 },
            penalty: null,
            goals: [],
            incomplete: false,
            provenance: 'TOURNAMENT_FIXTURE_RESULT',
          },
          eventsHash: 'legacy:no-reconstructable-goals',
          missingScorer: false,
          createdByActorType: 'SYSTEM',
          createdBySystemActor: 'GAME_BACKFILL',
          submittedAt: timestamps.tournamentRecorded,
          officialAt: timestamps.tournamentRecorded,
          createdAt: timestamps.tournamentRecorded,
        },
      },
    },
  });
  await prisma.v1Game.update({
    where: { id: ids.importedGame },
    data: { currentOfficialRevisionId: ids.importedRevision },
  });
}

describe('Task 10 legacy result migration contract', () => {
  let app: INestApplication;
  let cleanupApp: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 10 integration verification');
    }
    await prisma.$connect();
    await seedTask10Sources();
    ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
    const terms = app.get(ManagedTermsRuntimeService);
    const requiredDocumentIds = (await terms.currentSignupTerms()).items
      .filter((item) => item.requirement === 'required')
      .map((item) => item.documentId);
    await terms.acceptSignupTerms(ids.user, requiredDocumentIds);
  });

  afterAll(async () => {
    await cleanupApp?.();
    await prisma.$disconnect();
  });

  it('Task 10 PIN preserves official tournament score, ordered goals, source time, and config pin', async () => {
    const servicePrisma = prisma as unknown as PrismaService;
    const service = new TournamentBracketService(
      servicePrisma,
      new AdminContextService(servicePrisma),
      undefined as unknown as GamesService,
    );

    const bracket = await service.getBracket(
      { id: ids.user, email: 'task-10-backfill@example.test', accountStatus: 'active', onboardingStatus: 'not_started' },
      ids.tournament,
    );
    const fixture = bracket.fixtures.find((candidate) => candidate.id === ids.validFixture);

    expect(fixture?.result).toEqual(gameBackfillFixture.expected.bracketResult);
    const pinnedSource = await prisma.v1TournamentFixture.findUniqueOrThrow({
      where: { id: ids.validFixture },
      select: { competitionConfigVersionId: true },
    });
    expect(pinnedSource).toEqual({
      competitionConfigVersionId: ids.competitionConfigVersion,
    });
  });

  it('Task 10 PIN preserves completed-without-score as partial and hides a deleted source', async () => {
    const service = new TeamMatchesService(
      prisma as unknown as PrismaService,
      undefined as unknown as NotificationsService,
      undefined as unknown as GamesService,
    );

    await expect(service.detail(null, ids.completedTeamMatch)).resolves.toEqual({
      ...gameBackfillFixture.expected.completedTeamMatchDetail,
      hostTeam: {
        ...gameBackfillFixture.expected.completedTeamMatchDetail.hostTeam,
        trustState: 'sample',
      },
    });
    const deletedError = await service.detail(null, ids.deletedTeamMatch).catch((error: unknown) => error);
    expect(deletedError).toBeInstanceOf(NotFoundException);
    expect((deletedError as NotFoundException).getResponse()).toEqual({
      code: 'NOT_FOUND_OR_ARCHIVED',
      message: 'Team match was not found',
    });

    const sourceRows = await prisma.v1TeamMatch.findMany({
      where: { id: { in: [ids.completedTeamMatch, ids.deletedTeamMatch] } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        status: true,
        completedAt: true,
        deletedAt: true,
        competitionConfigVersionId: true,
      },
    });
    expect(sourceRows).toEqual([
      {
        id: ids.completedTeamMatch,
        status: 'completed',
        completedAt: timestamps.teamMatchCompleted,
        deletedAt: null,
        competitionConfigVersionId: ids.competitionConfigVersion,
      },
      {
        id: ids.deletedTeamMatch,
        status: 'completed',
        completedAt: timestamps.deleted,
        deletedAt: timestamps.deleted,
        competitionConfigVersionId: ids.competitionConfigVersion,
      },
    ]);
  });

  it('Task 10 RED requires deterministic dry-run/apply, quarantine, provenance, and idempotency', async () => {
    const migration = loadFutureMigrationBoundary();
    const dryRun = await migration.runGameResultBackfill(prisma, { mode: 'dry-run' });
    expect(dryRun).toEqual({
      counts: gameBackfillFixture.expected.sourceCounts,
      populationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      inserted: gameBackfillFixture.expected.firstInsertCount,
      quarantine: gameBackfillFixture.expected.quarantine,
    });
    expect(await prisma.v1Game.count()).toBe(1);

    const applied = await migration.runGameResultBackfill(prisma, { mode: 'apply' });
    expect(applied).toEqual({ ...dryRun, inserted: gameBackfillFixture.expected.firstInsertCount });

    const valid = await prisma.v1Game.findUniqueOrThrow({
      where: { tournamentFixtureId: ids.validFixture },
      select: {
        id: true,
        sourceType: true,
        state: true,
        competitionConfigVersionId: true,
        currentOfficialRevisionId: true,
        sides: {
          orderBy: { sideKey: 'asc' },
          select: { sideKey: true, teamId: true, displayNameSnapshot: true },
        },
        resultRevisions: {
          select: {
            id: true,
            revision: true,
            state: true,
            score: true,
            createdByActorType: true,
            createdByUserId: true,
            createdBySystemActor: true,
            submittedAt: true,
            officialAt: true,
          },
        },
        _count: { select: { events: true, participants: true } },
      },
    });
    expect(valid).toEqual({
      id: expect.any(String),
      sourceType: 'TOURNAMENT_FIXTURE',
      state: 'ENDED',
      competitionConfigVersionId: ids.competitionConfigVersion,
      currentOfficialRevisionId: valid.resultRevisions[0]?.id,
      // HOME before AWAY: sideKey is the V1GameSideKey enum, and PostgreSQL
      // orders enum columns by DECLARATION order (schema.prisma declares
      // HOME then AWAY), not alphabetically. `orderBy: { sideKey: 'asc' }`
      // above therefore yields HOME first regardless of insertion order.
      sides: [
        { sideKey: 'HOME', teamId: ids.homeTeam, displayNameSnapshot: 'Task 10 Home' },
        { sideKey: 'AWAY', teamId: ids.awayTeam, displayNameSnapshot: 'Task 10 Away' },
      ],
      resultRevisions: [
        {
          id: expect.any(String),
          revision: 1,
          state: 'OFFICIAL',
          score: gameBackfillFixture.expected.validScore,
          createdByActorType: 'SYSTEM',
          createdByUserId: null,
          createdBySystemActor: 'GAME_BACKFILL',
          submittedAt: timestamps.tournamentRecorded,
          officialAt: timestamps.tournamentRecorded,
        },
      ],
      _count: { events: 0, participants: 0 },
    });

    const partial = await prisma.v1Game.findUniqueOrThrow({
      where: { teamMatchId: ids.completedTeamMatch },
      select: {
        id: true,
        sourceType: true,
        state: true,
        competitionConfigVersionId: true,
        currentOfficialRevisionId: true,
        resultRevisions: {
          select: {
            id: true,
            revision: true,
            state: true,
            score: true,
            createdByActorType: true,
            createdByUserId: true,
            createdBySystemActor: true,
            submittedAt: true,
            officialAt: true,
          },
        },
        _count: { select: { events: true, participants: true } },
      },
    });
    expect(partial).toEqual({
      id: expect.any(String),
      sourceType: 'TEAM_MATCH',
      state: 'ENDED',
      competitionConfigVersionId: ids.competitionConfigVersion,
      currentOfficialRevisionId: partial.resultRevisions[0]?.id,
      resultRevisions: [
        {
          id: expect.any(String),
          revision: 1,
          state: 'OFFICIAL',
          score: gameBackfillFixture.expected.partialScore,
          createdByActorType: 'SYSTEM',
          createdByUserId: null,
          createdBySystemActor: 'GAME_BACKFILL',
          submittedAt: timestamps.teamMatchCompleted,
          officialAt: timestamps.teamMatchCompleted,
        },
      ],
      _count: { events: 0, participants: 0 },
    });
    expect(await prisma.v1Game.findUnique({ where: { tournamentFixtureId: ids.corruptFixture } })).toBeNull();
    expect(await prisma.v1Game.findUnique({ where: { teamMatchId: ids.deletedTeamMatch } })).toBeNull();

    const secondApply = await migration.runGameResultBackfill(prisma, { mode: 'apply' });
    expect(secondApply).toEqual({ ...applied, inserted: gameBackfillFixture.expected.secondInsertCount });
    expect(await prisma.v1Game.count()).toBe(3);
  });

  it('Task 10 RED blocks compare-read on an exact entity, revision, and field mismatch', async () => {
    const migration = loadFutureMigrationBoundary();
    const baseline = await migration.compareGameResultReads(prisma);
    const inventory = await migration.runGameResultBackfill(prisma, { mode: 'dry-run' });
    expect(baseline).toEqual({
      counts: {
        sourceRows: 5,
        compared: 3,
        matched: 3,
        mismatched: 0,
        partial: 1,
        quarantined: 2,
      },
      populationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      mismatches: [],
    });
    expect(baseline.populationHash).toBe(inventory.populationHash);

    const validGame = await prisma.v1Game.findUniqueOrThrow({
      where: { tournamentFixtureId: ids.validFixture },
      select: { id: true },
    });

    await prisma.v1GameResultRevision.create({
      data: {
        id: ids.mismatchRevision,
        gameId: validGame.id,
        revision: 2,
        state: 'OFFICIAL',
        score: {
          ...gameBackfillFixture.expected.validScore,
          regulation: { home: 4, away: 1 },
        },
        eventsHash: 'task-10-injected-mismatch',
        missingScorer: false,
        createdByActorType: 'SYSTEM',
        createdBySystemActor: 'GAME_BACKFILL',
        submittedAt: timestamps.tournamentRecorded,
        officialAt: timestamps.tournamentRecorded,
        createdAt: timestamps.tournamentRecorded,
      },
    });
    await prisma.v1Game.update({
      where: { id: validGame.id },
      data: { currentOfficialRevisionId: ids.mismatchRevision },
    });

    const mismatch = await migration.compareGameResultReads(prisma);
    expect(mismatch).toEqual({
      counts: {
        sourceRows: 5,
        compared: 3,
        matched: 2,
        mismatched: 1,
        partial: 1,
        quarantined: 2,
      },
      populationHash: baseline.populationHash,
      mismatches: [
        {
          entityType: 'TOURNAMENT_FIXTURE',
          entityId: ids.validFixture,
          revisionId: ids.mismatchRevision,
          field: 'score.regulation.home',
          legacy: 3,
          projected: 4,
        },
      ],
    });
  });

  it('Task 10 RED live operation flags route exposes GET PATCH tuple and pre-latch authority rollback kill-switch', async () => {
    // Pre-latch rollout state: GAME_WRITE already promoted to 'new' (writes go
    // to the new path) while GAME_READ is still 'compare' (dual-read window).
    // No write has landed on the new path yet (v1_game_cutover_epochs.first_new_write_at
    // is null), so this is exactly the window in which a kill-switch must be
    // able to roll BOTH authorities back atomically before the epoch latches.
    const gate = writeAuthorityRollbackGate();
    try {
      await prisma.v1GameOperationFlag.upsert({
        where: { key: 'GAME_READ' },
        create: {
          key: 'GAME_READ',
          value: 'compare',
          version: 1,
          ownerActor: 'platform_ops',
          // Must mirror the update branch: the suite truncates before each
          // run, so this is the branch that actually executes. Omitting
          // rollbackValue here left the row null and the GET assertion below
          // (rollbackValue: 'legacy') could never hold.
          rollbackValue: 'legacy',
        },
        update: {
          value: 'compare',
          version: 1,
          ownerActor: 'platform_ops',
          updatedByUserId: null,
          rollbackValue: 'legacy',
        },
      });
      await prisma.v1GameOperationFlag.upsert({
        where: { key: 'GAME_WRITE' },
        create: {
          key: 'GAME_WRITE',
          value: 'new',
          version: 1,
          ownerActor: 'platform_ops',
          // GAME_WRITE moved forward FROM 'legacy', same seeding convention
          // as GAME_READ above.
          rollbackValue: 'legacy',
        },
        update: {
          value: 'new',
          version: 1,
          ownerActor: 'platform_ops',
          updatedByUserId: null,
          rollbackValue: 'legacy',
        },
      });
      await prisma.v1GameCutoverEpoch.upsert({
        where: { id: 'game-cutover' },
        create: { id: 'game-cutover', version: 0, writeMode: 'new' },
        update: {
          version: 0,
          writeMode: 'new',
          firstNewWriteAt: null,
          firstNewWriteResourceId: null,
        },
      });

      const getFlag = await request(app.getHttpServer())
        .get('/api/v1/tournament-ops/operation-flags/GAME_READ')
        .set('x-v1-user-id', ids.user);
      const tupleRoute = await request(app.getHttpServer())
        .post('/api/v1/tournament-ops/operation-flags/tuple-transition')
        .set('x-v1-user-id', ids.user)
        .set('idempotency-key', 'task-10-tuple-route-contract')
        .send({});
      // The single-flag PATCH path is a deliberate Task 7/8 safety invariant:
      // GameOperationFlagsService.patchFlag's assertSingleTransition
      // unconditionally rejects rolling GAME_READ backward outside the
      // tuple-transition endpoint (apps/v1_api/src/config/game-operation-flags.ts
      // ~L903-936), because rolling read authority back while write authority
      // is still 'new' would desynchronize the two. This must stay a 409, not
      // a 200 -- the gate bundle fields below are never read by production
      // since the rejection happens before gate verification.
      const singleFlagAttempt = await request(app.getHttpServer())
        .patch('/api/v1/tournament-ops/operation-flags/GAME_READ')
        .set('x-v1-user-id', ids.user)
        .set('idempotency-key', 'task-10-single-flag-rollback-rejected')
        .send({
          expectedVersion: 1,
          value: 'legacy',
          gateBundlePath: '/dev/null',
          gateBundleHash: 'f'.repeat(64),
          reason: 'Attempting an unsafe single-flag rollback',
        });
      const authorityRollback = await request(app.getHttpServer())
        .post('/api/v1/tournament-ops/operation-flags/tuple-transition')
        .set('x-v1-user-id', ids.user)
        .set('idempotency-key', 'task-10-authority-rollback-kill-switch')
        .send({
          expectedVersions: { GAME_READ: 1, GAME_WRITE: 1 },
          transitions: [
            { key: 'GAME_READ', from: 'compare', to: 'legacy' },
            { key: 'GAME_WRITE', from: 'new', to: 'legacy' },
          ],
          gateBundlePath: gate.path,
          gateBundleHash: gate.sha256,
          reason: 'Task 10 pre-latch authority rollback kill-switch',
        });

      expect(getFlag.status).toBe(200);
      expect(getFlag.body).toEqual({
        status: 'success',
        data: {
          key: 'GAME_READ',
          value: 'compare',
          version: 1,
          ownerActor: 'platform_ops',
          updatedByUserId: null,
          rollbackValue: 'legacy',
          updatedAt: expect.any(String),
        },
        timestamp: expect.any(String),
      });
      expect(tupleRoute.status).toBe(400);
      expect(tupleRoute.body).toEqual({
        status: 'error',
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: '입력값을 다시 확인해 주세요.',
        details: expect.any(Array),
        // HttpExceptionFilter puts `requestId: request.id` on every error
        // envelope. pino-http assigns the default numeric request id (no
        // custom genReqId is configured), so this is a number, not a string.
        // The success envelope has no such field, which is why the assertions
        // above and below do not carry it.
        requestId: expect.any(Number),
        timestamp: expect.any(String),
      });
      expect(singleFlagAttempt.status).toBe(409);
      expect(singleFlagAttempt.body).toEqual({
        status: 'error',
        statusCode: 409,
        code: 'TUPLE_TRANSITION_REQUIRED',
        message: 'Read/write authority rollback requires tuple-transition',
        details: null,
        requestId: expect.any(Number),
        timestamp: expect.any(String),
      });
      // The rejected single-flag attempt must not have mutated anything.
      await expect(
        prisma.v1GameOperationFlag.findUniqueOrThrow({ where: { key: 'GAME_READ' } }),
      ).resolves.toMatchObject({ value: 'compare', version: 1, rollbackValue: 'legacy' });

      // @Post('tuple-transition') carries no @HttpCode override, so Nest's
      // POST default (201 Created) applies -- unlike the PATCH endpoint,
      // which defaults to 200.
      expect(authorityRollback.status).toBe(201);
      expect(authorityRollback.body).toEqual({
        status: 'success',
        data: {
          // GameOperationFlagsService.tupleTransition sorts both the
          // normalized transitions and the final `updated` array by key, so
          // GAME_READ always precedes GAME_WRITE regardless of request order.
          flags: [
            {
              key: 'GAME_READ',
              value: 'legacy',
              version: 2,
              ownerActor: 'platform_ops',
              updatedByUserId: ids.user,
              rollbackValue: 'compare',
              updatedAt: expect.any(String),
            },
            {
              key: 'GAME_WRITE',
              value: 'legacy',
              version: 2,
              ownerActor: 'platform_ops',
              updatedByUserId: ids.user,
              rollbackValue: 'new',
              updatedAt: expect.any(String),
            },
          ],
          cutoverEpochVersion: 1,
        },
        timestamp: expect.any(String),
      });

      // Post-rollback state, persisted (not just echoed in the response):
      // both authorities are back to legacy, versions bumped, rollback
      // values recorded, and -- the entire point of "pre-latch" -- the
      // cutover epoch never saw a first new write, so it rolled back cleanly.
      await expect(
        prisma.v1GameOperationFlag.findUniqueOrThrow({ where: { key: 'GAME_READ' } }),
      ).resolves.toMatchObject({ value: 'legacy', version: 2, rollbackValue: 'compare' });
      await expect(
        prisma.v1GameOperationFlag.findUniqueOrThrow({ where: { key: 'GAME_WRITE' } }),
      ).resolves.toMatchObject({ value: 'legacy', version: 2, rollbackValue: 'new' });
      await expect(
        prisma.v1GameCutoverEpoch.findUniqueOrThrow({ where: { id: 'game-cutover' } }),
      ).resolves.toMatchObject({
        version: 1,
        writeMode: 'legacy',
        firstNewWriteAt: null,
        firstNewWriteResourceId: null,
      });
    } finally {
      gate.cleanup();
    }
  });
});

// Builds a Phase C gate bundle for the atomic GAME_READ+GAME_WRITE tuple
// rollback (the only route production allows for rolling read authority
// backward once write authority has moved off 'legacy' -- see
// GameOperationFlagsService.tupleTransition and assertSingleTransition in
// apps/v1_api/src/config/game-operation-flags.ts). Mirrors the previous
// single-flag gate builder's shape (verifyGateBundle's `kind: 'tuple'`
// branch), but with tupleKeys/fromTuple/toTuple instead of key/from/to.
function writeAuthorityRollbackGate() {
  const gateRoot = resolveGameOperationGateRoot();
  const attemptId = randomUUID();
  const attemptRoot = join(gateRoot, `task10-tuple-${attemptId}`);
  const baselineSHA = 'a'.repeat(40);
  const candidateSHA = 'b'.repeat(40);
  const planSHA = 'c'.repeat(64);
  mkdirSync(attemptRoot, { recursive: true, mode: 0o700 });

  // requiredGatesFor('C', { kind: 'tuple', tupleKeys: ['GAME_READ', 'GAME_WRITE'], ... })
  // resolves to exactly V10 and V25 for this pair (GAME_WRITE always needs
  // both; GAME_READ needs both too since compare->legacy is not the
  // legacy->compare fast path) -- the same prerequisite set the prior
  // single-flag compare->legacy gate needed.
  const prerequisites = ['V10', 'V25'].map((gateId, index) => {
    const path = join(attemptRoot, `receipt-${index}-C-${gateId}.json`);
    const receipt = immutableJson(path, {
      schemaVersion: 1,
      gateId,
      phase: 'C',
      commandId: gateId,
      attemptId,
      baselineSHA,
      candidateSHA,
      planSHA,
      verdict: 'accepted',
      createdAt: '2026-08-03T00:00:00.000Z',
    });
    return {
      gateId,
      phase: 'C',
      commandId: gateId,
      path: receipt.path,
      sha256: receipt.sha256,
      verdict: 'accepted',
    };
  });
  const tupleKeys = ['GAME_READ', 'GAME_WRITE'];
  const transition = 'GAME_READ+GAME_WRITE:pre-latch-authority-rollback';
  const path = join(
    gateRoot,
    `flag-gate-${attemptId}-C-${transition.replace(/[^A-Za-z0-9._-]+/g, '-')}.json`,
  );
  const bundle = immutableJson(path, {
    schemaVersion: 1,
    phase: 'C',
    attemptId,
    baselineSHA,
    candidateSHA,
    planSHA,
    transition,
    tupleKeys,
    fromTuple: {
      GAME_READ: { value: 'compare', version: 1 },
      GAME_WRITE: { value: 'new', version: 1 },
    },
    toTuple: {
      GAME_READ: { value: 'legacy', version: 2 },
      GAME_WRITE: { value: 'legacy', version: 2 },
    },
    prerequisites,
    createdAt: '2026-08-03T00:00:00.000Z',
  });
  return {
    ...bundle,
    cleanup: () => {
      chmodSync(bundle.path, 0o600);
      rmSync(bundle.path, { force: true });
      rmSync(attemptRoot, { recursive: true, force: true });
    },
  };
}

function immutableJson(path: string, value: unknown) {
  const bytes = Buffer.from(canonicalJson(value));
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o444 });
  return {
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('Task 10 gate fixture is not JSON serializable');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}
