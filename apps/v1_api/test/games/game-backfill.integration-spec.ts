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

  it('Task 10 RED live operation flags route exposes GET PATCH tuple and pre-latch compare kill-switch', async () => {
    const gate = writeCompareToLegacyGate();
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
      await prisma.v1GameCutoverEpoch.upsert({
        where: { id: 'game-cutover' },
        create: { id: 'game-cutover', version: 0, writeMode: 'legacy' },
        update: {
          version: 0,
          writeMode: 'legacy',
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
      const killSwitch = await request(app.getHttpServer())
        .patch('/api/v1/tournament-ops/operation-flags/GAME_READ')
        .set('x-v1-user-id', ids.user)
        .set('idempotency-key', 'task-10-compare-legacy-kill-switch')
        .send({
          expectedVersion: 1,
          value: 'legacy',
          gateBundlePath: gate.path,
          gateBundleHash: gate.sha256,
          reason: 'Task 10 pre-latch compare-read kill-switch',
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
        timestamp: expect.any(String),
      });
      expect(killSwitch.status).toBe(200);
      expect(killSwitch.body).toEqual({
        status: 'success',
        data: {
          key: 'GAME_READ',
          value: 'legacy',
          version: 2,
          ownerActor: 'platform_ops',
          updatedByUserId: ids.user,
          rollbackValue: 'compare',
          updatedAt: expect.any(String),
        },
        timestamp: expect.any(String),
      });
      await expect(
        prisma.v1GameCutoverEpoch.findUniqueOrThrow({ where: { id: 'game-cutover' } }),
      ).resolves.toMatchObject({
        firstNewWriteAt: null,
        firstNewWriteResourceId: null,
      });
    } finally {
      gate.cleanup();
    }
  });
});

function writeCompareToLegacyGate() {
  const gateRoot = resolveGameOperationGateRoot();
  const attemptId = randomUUID();
  const attemptRoot = join(gateRoot, `task10-${attemptId}`);
  const baselineSHA = 'a'.repeat(40);
  const candidateSHA = 'b'.repeat(40);
  const planSHA = 'c'.repeat(64);
  mkdirSync(attemptRoot, { recursive: true, mode: 0o700 });

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
  const transition = 'GAME_READ:compare->legacy';
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
    key: 'GAME_READ',
    from: { value: 'compare', version: 1 },
    to: { value: 'legacy', version: 2 },
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
