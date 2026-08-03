import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import request = require('supertest');
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import {
  GAME_OPERATION_RETRY_DELAYS_MS,
  type GameOperationClaim,
  V1GameOperationsWorkerService,
} from '../../src/jobs/v1-game-operations-worker.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ManagedTermsRuntimeService } from '../../src/terms/managed-terms-runtime.service';
import { FOOTBALL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config';
import { createV1IntegrationApp } from '../integration/integration-app';

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService());
const runId = randomUUID();
const prefix = `task9:${runId}`;
let tournamentOutboxId = '';
const DIAGNOSTIC_WORKER_TIMEOUT_MS = 5_000;

const ids = {
  hostUser: '79000000-0000-4000-8000-000000000001',
  opponentUser: '79000000-0000-4000-8000-000000000002',
  linkedUser: '79000000-0000-4000-8000-000000000003',
  supportUser: '79000000-0000-4000-8000-000000000004',
  opsUser: '79000000-0000-4000-8000-000000000005',
  sport: '79000000-0000-4000-8000-000000000010',
  region: '79000000-0000-4000-8000-000000000011',
  config: '79000000-0000-4000-8000-000000000012',
  hostTeam: '79000000-0000-4000-8000-000000000020',
  opponentTeam: '79000000-0000-4000-8000-000000000021',
  match: '79000000-0000-4000-8000-000000000030',
  game: '79000000-0000-4000-8000-000000000031',
  homeSide: '79000000-0000-4000-8000-000000000032',
  awaySide: '79000000-0000-4000-8000-000000000033',
  lineup: '79000000-0000-4000-8000-000000000034',
  linkedParticipant: '79000000-0000-4000-8000-000000000035',
  guestParticipant: '79000000-0000-4000-8000-000000000036',
  link: '79000000-0000-4000-8000-000000000037',
  consent: '79000000-0000-4000-8000-000000000038',
  revision: '79000000-0000-4000-8000-000000000039',
  slaRevision: '79000000-0000-4000-8000-00000000003a',
  tournament: '79000000-0000-4000-8000-000000000040',
  otherTournament: '79000000-0000-4000-8000-000000000041',
  hostRegistration: '79000000-0000-4000-8000-000000000042',
  opponentRegistration: '79000000-0000-4000-8000-000000000043',
  sourceFixture: '79000000-0000-4000-8000-000000000044',
  targetFixture: '79000000-0000-4000-8000-000000000045',
  otherTournamentFixture: '79000000-0000-4000-8000-000000000046',
  loserTargetFixture: '79000000-0000-4000-8000-00000000004f',
  tournamentGame: '79000000-0000-4000-8000-000000000047',
  tournamentHomeSide: '79000000-0000-4000-8000-000000000048',
  tournamentAwaySide: '79000000-0000-4000-8000-000000000049',
  tournamentRevision: '79000000-0000-4000-8000-00000000004a',
  terminalSupersededRevision: '79000000-0000-4000-8000-00000000004b',
  terminalApprovedRevision: '79000000-0000-4000-8000-00000000004c',
  terminalChangeRequestedRevision: '79000000-0000-4000-8000-00000000004d',
  terminalCancelledRevision: '79000000-0000-4000-8000-00000000004e',
  deliveryLaterA: '79000000-0000-4000-8000-000000000051',
  deliveryLaterB: '79000000-0000-4000-8000-000000000052',
  deliveryOlder: '79000000-0000-4000-8000-000000000053',
  bracketDeliveryA: '79000000-0000-4000-8000-000000000054',
  bracketDeliveryB: '79000000-0000-4000-8000-000000000055',
  bracketConflictDelivery: '79000000-0000-4000-8000-000000000056',
  lane4Revision: '79000000-0000-4000-8000-000000000057',
  lane4HostTeam: '79000000-0000-4000-8000-000000000060',
  lane4OpponentTeam: '79000000-0000-4000-8000-000000000061',
  lane4Match: '79000000-0000-4000-8000-000000000062',
  lane4Game: '79000000-0000-4000-8000-000000000063',
  lane4HomeSide: '79000000-0000-4000-8000-000000000064',
  lane4AwaySide: '79000000-0000-4000-8000-000000000065',
  lane4TerminalApprovedRevision: '79000000-0000-4000-8000-000000000067',
  lane4Lineup: '79000000-0000-4000-8000-00000000006a',
  lane4Participant: '79000000-0000-4000-8000-00000000006b',
  lane4DirectorAssignment: '79000000-0000-4000-8000-00000000006c',
  lane4SubmittedReplay: '79000000-0000-4000-8000-00000000006d',
} as const;

class DiagnosticGameOperationsWorker extends V1GameOperationsWorkerService {
  readonly claims: GameOperationClaim[] = [];

  override async claimOne(): Promise<GameOperationClaim | null> {
    const claim = await super.claimOne();
    if (claim) this.claims.push({ ...claim });
    return claim;
  }
}

describe('Task 9 game projection real-database contract', () => {
  let officialOutboxId = '';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 9 isolated integration verification');
    }
    await prisma.$connect();
    await createFixture();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('[PIN] official decision transaction creates exactly one GAME_RESULT_OFFICIAL event with the frozen business key', async () => {
    const result = await games.decideResultRevision(
      authUser(ids.opponentUser),
      ids.game,
      ids.revision,
      `${prefix}:approve`,
      {
        expectedVersion: 0,
        clientCommandId: `${prefix}:approve`,
        decision: 'approve',
      },
    );

    const replay = await games.decideResultRevision(
      authUser(ids.opponentUser),
      ids.game,
      ids.revision,
      `${prefix}:approve`,
      {
        expectedVersion: 0,
        clientCommandId: `${prefix}:approve`,
        decision: 'approve',
      },
    );
    const events = await prisma.v1OutboxEvent.findMany({
      where: { aggregateId: ids.game, type: 'GAME_RESULT_OFFICIAL' },
    });

    expect(result).toMatchObject({ revisionState: 'OFFICIAL', replayed: false });
    expect(replay).toMatchObject({ revisionState: 'OFFICIAL', replayed: true });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      businessKey: `game:${ids.game}:revision:1:approve`,
      aggregateType: 'GAME',
      aggregateId: ids.game,
      revisionId: ids.revision,
      type: 'GAME_RESULT_OFFICIAL',
      status: 'PENDING',
    });
    officialOutboxId = events[0].id;
    await prisma.v1OutboxEvent.update({
      where: { id: officialOutboxId },
      data: { status: 'COMPLETED', version: { increment: 1 } },
    });
  });

  it('[PIN] generic worker preserves one-winner lease CAS, exact retry, and poison semantics', async () => {
    const raceJob = await insertOutbox('worker-race', 0);
    const first = auditWorker();
    const second = auditWorker();
    expect((await Promise.all([first.processOne(), second.processOne()])).sort()).toEqual([false, true]);
    expect(await outboxState(raceJob)).toMatchObject({ status: 'COMPLETED', attempts: 1, version: 2 });

    const retryJob = await insertOutbox('worker-retry', 0);
    const retryWorker = auditWorker();
    const retryClaim = await retryWorker.claimOne();
    expect(retryClaim?.id).toBe(retryJob);
    expect(await retryWorker.fail(retryClaim!, new Error('retry-observable'))).toBe('RETRY');
    const retryState = await outboxState(retryJob);
    expect(retryState.status).toBe('RETRY');
    expect(Math.round(retryState.availableAt.getTime() - retryState.updatedAt.getTime())).toBe(
      GAME_OPERATION_RETRY_DELAYS_MS[0],
    );

    const poisonJob = await insertOutbox('worker-poison', 5);
    const poisonClaim = await retryWorker.claimOne();
    expect(poisonClaim?.id).toBe(poisonJob);
    expect(await retryWorker.fail(poisonClaim!, new Error('poison-observable'))).toBe('POISONED');
    expect(await outboxState(poisonJob)).toMatchObject({
      status: 'POISONED',
      attempts: 6,
      version: 2,
      leaseOwner: null,
      leaseUntil: null,
      lastError: 'Error: poison-observable',
    });

    const takeoverJob = await insertOutbox('worker-expired-takeover', 0);
    const expiredOwner = auditWorker();
    const takeoverOwner = auditWorker();
    const expiredClaim = await expiredOwner.claimOne();
    expect(expiredClaim?.id).toBe(takeoverJob);
    await prisma.$executeRaw`
      UPDATE v1_outbox_events
      SET lease_until = CURRENT_TIMESTAMP - INTERVAL '1 second',
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${takeoverJob}
        AND version = ${expiredClaim!.version}
    `;
    const takeoverClaim = await takeoverOwner.claimOne();
    expect(takeoverClaim).toMatchObject({ id: takeoverJob, attempts: 2 });
    await expect(expiredOwner.complete(expiredClaim!)).resolves.toBe(false);
    await expect(takeoverOwner.complete(takeoverClaim!)).resolves.toBe(true);
  });

  describe('Task 9 Lane 1 catalog RED contract', () => {
    it('[RED-L1] visibility enum contains HIDDEN and OFFICIAL_ONLY', async () => {
      const labels = await prisma.$queryRaw<Array<{ enumLabel: string }>>`
        SELECT enum_value.enumlabel AS "enumLabel"
        FROM pg_enum AS enum_value
        INNER JOIN pg_type AS enum_type ON enum_type.oid = enum_value.enumtypid
        INNER JOIN pg_namespace AS enum_namespace ON enum_namespace.oid = enum_type.typnamespace
        WHERE enum_namespace.nspname = current_schema()
          AND enum_type.typname = 'V1VisibilityMode'
        ORDER BY enum_value.enumsortorder ASC
      `;
      const values = labels.map(({ enumLabel }) => enumLabel);

      expect({
        hidden: values.includes('HIDDEN'),
        officialOnly: values.includes('OFFICIAL_ONLY'),
      }).toEqual({ hidden: true, officialOnly: true });
    });

    it('[RED-L1] immutable official fact catalog exists', async () => {
      const catalog = await prisma.$queryRaw<Array<{ tableName: string; relationKind: string }>>`
        SELECT relation.relname AS "tableName", relation.relkind::text AS "relationKind"
        FROM pg_class AS relation
        INNER JOIN pg_namespace AS relation_namespace ON relation_namespace.oid = relation.relnamespace
        WHERE relation_namespace.nspname = current_schema()
          AND relation.relname = 'v1_game_official_facts'
      `;

      expect(catalog).toEqual([{ tableName: 'v1_game_official_facts', relationKind: 'r' }]);
    });

    it('[RED-L1] normalized bracket edge catalog and constraints exist', async () => {
      const catalog = await prisma.$queryRaw<Array<{ tableName: string; relationKind: string }>>`
        SELECT relation.relname AS "tableName", relation.relkind::text AS "relationKind"
        FROM pg_class AS relation
        INNER JOIN pg_namespace AS relation_namespace ON relation_namespace.oid = relation.relnamespace
        WHERE relation_namespace.nspname = current_schema()
          AND relation.relname = 'v1_tournament_fixture_advancement_edges'
      `;

      expect(catalog).toEqual([
        { tableName: 'v1_tournament_fixture_advancement_edges', relationKind: 'r' },
      ]);

      const constraints = await prisma.$queryRaw<Array<{ constraintName: string; constraintType: string }>>`
        SELECT constraint_row.conname AS "constraintName", constraint_row.contype::text AS "constraintType"
        FROM pg_constraint AS constraint_row
        INNER JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
        INNER JOIN pg_namespace AS relation_namespace ON relation_namespace.oid = relation.relnamespace
        WHERE relation_namespace.nspname = current_schema()
          AND relation.relname = 'v1_tournament_fixture_advancement_edges'
        ORDER BY constraint_row.conname ASC
      `;
      const constraintNames = new Set(constraints.map(({ constraintName }) => constraintName));

      expect({
        sourceOutcomeUnique: constraintNames.has('v1_fixture_advancement_source_outcome_key'),
        targetSideUnique: constraintNames.has('v1_fixture_advancement_target_side_key'),
        sourceFixtureForeignKey: constraintNames.has('v1_fixture_advancement_source_fk'),
        targetFixtureForeignKey: constraintNames.has('v1_fixture_advancement_target_fk'),
      }).toEqual({
        sourceOutcomeUnique: true,
        targetSideUnique: true,
        sourceFixtureForeignKey: true,
        targetFixtureForeignKey: true,
      });
    });
  });

  describe('Task 9 Lane 2 real worker RED contracts', () => {
    it('[RED-L2] official duplicate and reordered deliveries complete once without regressing applied team or tournament surfaces', async () => {
      const deliveryIds = await insertDuplicateOfficialDeliveries();
      const worker = productionWorker();
      const processed = [
        await worker.processOne(),
      ];
      const cacheAfterFirst = await publicCacheSnapshot(ids.game);
      processed.push(
        await worker.processOne(),
        await worker.processOne(),
      );

      const [events, factCount, watermarks, cacheAfterDuplicates, officialRevision] = await Promise.all([
        prisma.v1OutboxEvent.findMany({
          where: { id: { in: deliveryIds } },
          orderBy: { availableAt: 'asc' },
          select: {
            id: true,
            businessKey: true,
            revisionId: true,
            payload: true,
            status: true,
            attempts: true,
            lastError: true,
          },
        }),
        futureFactCount('v1_game_official_facts', ids.revision),
        prisma.v1ProjectionWatermark.findMany({
          where: {
            revisionId: ids.revision,
            OR: [
              { projection: 'TEAM_RECORD', entityType: 'TEAM', entityId: ids.hostTeam },
              { projection: 'TOURNAMENT_RESULT', entityType: 'TOURNAMENT', entityId: ids.tournament },
            ],
          },
          orderBy: [{ entityType: 'asc' }, { entityId: 'asc' }],
          select: { projection: true, entityType: true, entityId: true, revisionId: true, status: true },
        }),
        publicCacheSnapshot(ids.game),
        prisma.v1GameResultRevision.findUniqueOrThrow({
          where: { id: ids.revision },
          select: { officialAt: true },
        }),
      ]);

      const canonicalPayload = {
        gameId: ids.game,
        revisionId: ids.revision,
        revision: 1,
        sourceType: 'TEAM_MATCH',
        tournamentId: null,
        homeTeamId: ids.hostTeam,
        awayTeamId: ids.opponentTeam,
        score: { home: 2, away: 1 },
        eventsHash: 'official-source-hash',
        officialAt: officialRevision.officialAt!.toISOString(),
        visibility: 'HIDDEN',
      };
      const expectedCache = {
        tableExists: true,
        rows: [{
          revisionId: ids.revision,
          gameId: ids.game,
          tournamentId: null,
          revision: 1,
          visibility: 'HIDDEN',
          isCurrent: true,
          sourceHash: 'official-source-hash',
          payloadHash: createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex'),
          canonicalPayload,
          cachedAt: cacheAfterFirst.rows[0]?.cachedAt,
          updatedAt: cacheAfterFirst.rows[0]?.updatedAt,
        }],
        currentCount: 1,
      };
      process.stdout.write(`TASK9_PUBLIC_CACHE_IDEMPOTENCY=${JSON.stringify({
        afterFirst: cacheAfterFirst,
        afterDuplicateAndReordered: cacheAfterDuplicates,
      })}\n`);

      expect({
        processed,
        events,
        factCount,
        watermarks,
        cacheAfterFirst,
        cacheAfterDuplicates,
      }).toEqual({
        processed: [true, true, true],
        events: [
          {
            id: ids.deliveryLaterA,
            businessKey: `${prefix}:official-delivery:later-a`,
            revisionId: ids.revision,
            payload: { revisionId: ids.revision, deliveredSequence: 2 },
            status: 'COMPLETED',
            attempts: 1,
            lastError: null,
          },
          {
            id: ids.deliveryLaterB,
            businessKey: `${prefix}:official-delivery:later-b`,
            revisionId: ids.revision,
            payload: { revisionId: ids.revision, deliveredSequence: 2 },
            status: 'COMPLETED',
            attempts: 1,
            lastError: null,
          },
          {
            id: ids.deliveryOlder,
            businessKey: `${prefix}:official-delivery:older`,
            revisionId: ids.revision,
            payload: { revisionId: ids.revision, deliveredSequence: 1 },
            status: 'COMPLETED',
            attempts: 1,
            lastError: null,
          },
        ],
        factCount: 1,
        watermarks: [
          {
            projection: 'TEAM_RECORD',
            entityType: 'TEAM',
            entityId: ids.hostTeam,
            revisionId: ids.revision,
            status: 'APPLIED',
          },
          {
            projection: 'TOURNAMENT_RESULT',
            entityType: 'TOURNAMENT',
            entityId: ids.tournament,
            revisionId: ids.revision,
            status: 'APPLIED',
          },
        ],
        cacheAfterFirst: expectedCache,
        cacheAfterDuplicates: expectedCache,
      });
    });

    it('[RED-L2] malformed official payload poisons with a projection error and never writes a current watermark', async () => {
      const [beforeFactCount, beforeWatermarks, beforeCache] = await Promise.all([
        futureFactCount('v1_game_official_facts', ids.revision),
        prisma.v1ProjectionWatermark.findMany({
          where: { revisionId: ids.revision },
          orderBy: [{ projection: 'asc' }, { entityType: 'asc' }, { entityId: 'asc' }],
          select: {
            projection: true,
            entityType: true,
            entityId: true,
            revisionId: true,
            sourceHash: true,
            status: true,
          },
        }),
        publicCacheSnapshot(ids.game),
      ]);
      await resetOfficialDelivery(officialOutboxId, { revisionId: '' }, 5);
      const processed = await productionWorker().processOne();
      const [event, afterFactCount, afterWatermarks, afterCache] = await Promise.all([
        outboxState(officialOutboxId),
        futureFactCount('v1_game_official_facts', ids.revision),
        prisma.v1ProjectionWatermark.findMany({
          where: { revisionId: ids.revision },
          orderBy: [{ projection: 'asc' }, { entityType: 'asc' }, { entityId: 'asc' }],
          select: {
            projection: true,
            entityType: true,
            entityId: true,
            revisionId: true,
            sourceHash: true,
            status: true,
          },
        }),
        publicCacheSnapshot(ids.game),
      ]);

      expect(afterFactCount).toBe(beforeFactCount);
      expect(afterWatermarks).toEqual(beforeWatermarks);
      expect(afterCache).toEqual(beforeCache);
      process.stdout.write(`TASK9_PUBLIC_CACHE_MALFORMED_ROLLBACK=${JSON.stringify({
        before: beforeCache,
        after: afterCache,
      })}\n`);
      expect({
        processed,
        event: { status: event.status, attempts: event.attempts, lastError: event.lastError },
      }).toEqual({
        processed: true,
        event: {
          status: 'POISONED',
          attempts: 6,
          lastError: 'Error: GAME_RESULT_OFFICIAL payload requires a non-empty revisionId',
        },
      });
    });

    it('[RED-L2] official facts reproduce UTC-year tournament and lifetime team totals without personal identity rows', async () => {
      await resetOfficialDelivery(officialOutboxId);
      await resetOfficialDelivery(tournamentOutboxId);
      const worker = productionWorker();
      const processed = [await worker.processOne(), await worker.processOne()];
      const [teamMatchFacts, tournamentFacts, totals, personalRows, tournamentCache] = await Promise.all([
        futureFactCount('v1_game_official_facts', ids.revision),
        futureFactCount('v1_game_official_facts', ids.tournamentRevision),
        officialTeamTotals(ids.hostTeam, 2026, ids.tournament),
        prisma.v1ProjectionWatermark.count({
          where: {
            revisionId: { in: [ids.revision, ids.tournamentRevision] },
            OR: [
              { projection: 'USER_RECORD' },
              { projection: 'PENDING_IDENTITY' },
              { entityType: 'USER' },
              { entityType: 'PARTICIPANT' },
            ],
          },
        }),
        publicCacheSnapshot(ids.tournamentGame),
      ]);

      expect({
        processed,
        facts: teamMatchFacts + tournamentFacts,
        totals,
        personalRows,
        officialOnlyCache: {
          tableExists: tournamentCache.tableExists,
          currentCount: tournamentCache.currentCount,
          visibility: tournamentCache.rows[0]?.visibility,
          revisionId: tournamentCache.rows[0]?.revisionId,
        },
      }).toEqual({
        processed: [true, true],
        facts: 2,
        totals: {
          calendarYear: { played: 2, won: 2, drawn: 0, lost: 0 },
          tournament: { played: 1, won: 1, drawn: 0, lost: 0 },
          lifetime: { played: 2, won: 2, drawn: 0, lost: 0 },
        },
        personalRows: 0,
        officialOnlyCache: {
          tableExists: true,
          currentCount: 1,
          visibility: 'OFFICIAL_ONLY',
          revisionId: ids.tournamentRevision,
        },
      });
    });

    it('[RED-L3] normalized WINNER and LOSER edges advance locked target sides once and fail closed on an occupied side', async () => {
      await insertBracketEdges([
        {
          tournamentId: ids.tournament,
          sourceFixtureId: ids.sourceFixture,
          sourceOutcome: 'WINNER',
          targetFixtureId: ids.targetFixture,
          targetSide: 'HOME',
        },
        {
          tournamentId: ids.tournament,
          sourceFixtureId: ids.sourceFixture,
          sourceOutcome: 'LOSER',
          targetFixtureId: ids.loserTargetFixture,
          targetSide: 'AWAY',
        },
      ]);
      const duplicateSideConstraint = await capturePrismaFailure(() =>
        insertBracketEdges([
          {
            tournamentId: ids.tournament,
            sourceFixtureId: ids.loserTargetFixture,
            sourceOutcome: 'WINNER',
            targetFixtureId: ids.targetFixture,
            targetSide: 'HOME',
          },
        ]),
      );
      const crossTournamentConstraint = await capturePrismaFailure(() =>
        insertBracketEdges([
          {
            tournamentId: ids.tournament,
            sourceFixtureId: ids.loserTargetFixture,
            sourceOutcome: 'WINNER',
            targetFixtureId: ids.otherTournamentFixture,
            targetSide: 'AWAY',
          },
        ]),
      );

      await resetOfficialDelivery(tournamentOutboxId);
      const before = await bracketProjectionSnapshot();
      const firstProcessed = await productionWorker().processOne();
      await insertBracketOfficialDeliveries([ids.bracketDeliveryA, ids.bracketDeliveryB]);
      const duplicateProcessed = await Promise.all([
        productionWorker().processOne(),
        productionWorker().processOne(),
      ]);
      const afterDuplicates = await bracketProjectionSnapshot();

      await prisma.v1TournamentFixture.update({
        where: { id: ids.targetFixture },
        data: { homeRegistrationId: ids.opponentRegistration, awayRegistrationId: null },
      });
      await prisma.v1TournamentFixture.update({
        where: { id: ids.loserTargetFixture },
        data: { homeRegistrationId: null, awayRegistrationId: null },
      });
      const beforeConflictProjection = await projectionTransactionSnapshot(ids.tournamentRevision);
      const beforeConflictStandings = await tournamentStandingSnapshot();
      await insertBracketOfficialDeliveries([ids.bracketConflictDelivery], 5);
      const conflictProcessed = await productionWorker().processOne();
      const [afterConflict, conflictOutbox, afterConflictProjection, afterConflictStandings] = await Promise.all([
        bracketProjectionSnapshot(),
        outboxState(ids.bracketConflictDelivery),
        projectionTransactionSnapshot(ids.tournamentRevision),
        tournamentStandingSnapshot(),
      ]);

      const observable = {
        edgeCount: await bracketEdgeCount(ids.sourceFixture),
        constraints: {
          duplicateSide: duplicateSideConstraint,
          crossTournament: crossTournamentConstraint,
        },
        before,
        firstProcessed,
        duplicateProcessed,
        afterDuplicates,
        conflictProcessed,
        conflictOutbox: {
          status: conflictOutbox.status,
          attempts: conflictOutbox.attempts,
          lastError: conflictOutbox.lastError,
          leaseOwner: conflictOutbox.leaseOwner,
          leaseUntil: conflictOutbox.leaseUntil,
        },
        afterConflict,
        conflictRollback: {
          projectionUnchanged: JSON.stringify(afterConflictProjection) === JSON.stringify(beforeConflictProjection),
          standingsUnchanged: JSON.stringify(afterConflictStandings) === JSON.stringify(beforeConflictStandings),
        },
      };
      process.stdout.write(`TASK9_RED_L3_DB_OBSERVABLE=${JSON.stringify(observable)}\n`);

      expect(observable).toEqual({
        edgeCount: 2,
        constraints: {
          duplicateSide: { code: 'P2010', databaseCode: '23505' },
          crossTournament: { code: 'P2010', databaseCode: '23503' },
        },
        before: {
          winnerTarget: { homeRegistrationId: null, awayRegistrationId: null },
          loserTarget: { homeRegistrationId: null, awayRegistrationId: null },
        },
        firstProcessed: true,
        duplicateProcessed: [true, true],
        afterDuplicates: {
          winnerTarget: { homeRegistrationId: ids.hostRegistration, awayRegistrationId: null },
          loserTarget: { homeRegistrationId: null, awayRegistrationId: ids.opponentRegistration },
        },
        conflictProcessed: true,
        conflictOutbox: {
          status: 'POISONED',
          attempts: 6,
          lastError: 'Error: BRACKET_TARGET_SIDE_CONFLICT',
          leaseOwner: null,
          leaseUntil: null,
        },
        afterConflict: {
          winnerTarget: { homeRegistrationId: ids.opponentRegistration, awayRegistrationId: null },
          loserTarget: { homeRegistrationId: null, awayRegistrationId: null },
        },
        conflictRollback: {
          projectionUnchanged: true,
          standingsUnchanged: true,
        },
      });
    });

    it('[RED-L4] actual result submission is delivered once to the current reviewer and never exposes pending facts publicly', async () => {
      const frozenSubmittedAt = new Date('2026-08-01T00:00:00.000Z');
      const sharedBefore = await sharedFixtureSnapshot();
      await games.submitResultRevision(
        authUser(ids.hostUser),
        ids.lane4Game,
        ids.lane4Revision,
        `${prefix}:lane4-submit`,
        { expectedVersion: 0, clientCommandId: `${prefix}:lane4-submit` },
      );
      await prisma.v1GameResultRevision.update({
        where: { id: ids.lane4Revision },
        data: { submittedAt: frozenSubmittedAt },
      });
      const submitted = await prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: ids.lane4Revision } });
      const outbox = await prisma.v1OutboxEvent.findUniqueOrThrow({
        where: { businessKey: `game:${ids.lane4Game}:revision:1:submitted` },
      });
      let processed = false;
      let delivery: Awaited<ReturnType<typeof outboxState>>;
      try {
        const diagnostic = await processExactOutboxEvent(outbox.id, 'lane4-submitted');
        processed = diagnostic.processed;
        delivery = await outboxState(outbox.id);
      } finally {
        await isolateLane4Outbox([outbox.id]);
        await assertNoWorkerResidue('lane4-submitted');
      }
      const isolatedDelivery = await outboxState(outbox.id);
      const reviewerNotifications = await prisma.v1Notification.findMany({
        where: { recipientUserId: ids.opponentUser, targetType: 'team_match', targetId: ids.lane4Match },
        select: { recipientUserId: true, targetType: true, targetId: true },
      });
      const pendingPublicFacts = await futureFactCount('v1_game_official_facts', ids.lane4Revision);
      const sharedAfter = await sharedFixtureSnapshot();
      process.stdout.write(`TASK9_RED_L4_SUBMITTED=${JSON.stringify({
        outboxId: outbox.id,
        observedStatus: delivery!.status,
        observedAttempts: delivery!.attempts,
        observedLastError: delivery!.lastError,
        isolatedStatus: isolatedDelivery.status,
        submittedAt: submitted.submittedAt?.toISOString(),
        sharedFixtureUnchanged: JSON.stringify(sharedAfter) === JSON.stringify(sharedBefore),
      })}\n`);

      expect(sharedAfter).toEqual(sharedBefore);
      expect({
        submitted: { state: submitted.state, submittedAt: submitted.submittedAt?.toISOString() },
        outboxType: outbox.type,
        processed,
        delivery: { status: delivery!.status, attempts: delivery!.attempts, lastError: delivery!.lastError },
        reviewerNotifications,
        pendingPublicFacts,
      }).toEqual({
        submitted: { state: 'SUBMITTED', submittedAt: frozenSubmittedAt.toISOString() },
        outboxType: 'GAME_RESULT_SUBMITTED',
        processed: true,
        delivery: { status: 'COMPLETED', attempts: 1, lastError: null },
        reviewerNotifications: [
          { recipientUserId: ids.opponentUser, targetType: 'team_match', targetId: ids.lane4Match },
        ],
        pendingPublicFacts: 0,
      });
    });

    it('[RED-L2] reconciliation repairs an injected aggregate mismatch with an audit and writes APPLIED watermark last', async () => {
      await resetOfficialDelivery(officialOutboxId);
      await ensureInjectedMismatch();
      await ensureInjectedCacheMismatch(ids.game, ids.revision);
      const processed = await productionWorker().processOne();
      const repaired = await prisma.v1ProjectionWatermark.findFirst({
        where: { projection: 'TEAM_RECORD', entityType: 'TEAM', entityId: ids.hostTeam },
      });
      const repairAudits = await prisma.v1OperationAudit.findMany({
        where: { resourceId: ids.revision, action: 'GAME_PROJECTION_REPAIRED' },
        select: { createdAt: true },
      });
      const [event, cache] = await Promise.all([
        outboxState(officialOutboxId),
        publicCacheSnapshot(ids.game),
      ]);
      process.stdout.write(`TASK9_PUBLIC_CACHE_RECONCILIATION=${JSON.stringify({
        eventStatus: event.status,
        repairAuditCount: repairAudits.length,
        cache,
      })}\n`);

      expect({
        processed,
        eventStatus: event.status,
        repaired: repaired
          ? { sourceHash: repaired.sourceHash, status: repaired.status }
          : null,
        repairAuditCount: repairAudits.length,
        cacheCurrent:
          cache.tableExists &&
          cache.currentCount === 1 &&
          cache.rows[0]?.revisionId === ids.revision &&
          cache.rows[0].sourceHash === 'official-source-hash' &&
          cache.rows[0].visibility === 'HIDDEN',
        watermarkWrittenLast:
          repaired !== null &&
          repairAudits.length === 1 &&
          repaired.projectedAt.getTime() >= repairAudits[0].createdAt.getTime(),
      }).toEqual({
        processed: true,
        eventStatus: 'COMPLETED',
        repaired: { sourceHash: 'official-source-hash', status: 'APPLIED' },
        repairAuditCount: 1,
        cacheCurrent: true,
        watermarkWrittenLast: true,
      });
    });

    it('[RED-L2] watermark trigger interruption rolls back fact aggregate audit writes and leaves the outbox retryable', async () => {
      await resetOfficialDelivery(officialOutboxId);
      const before = await projectionTransactionSnapshot(ids.revision);
      await installWatermarkFailureTrigger();
      let processed = false;
      let event: Awaited<ReturnType<typeof outboxState>>;
      let after: Awaited<ReturnType<typeof projectionTransactionSnapshot>>;
      try {
        const diagnostic = await processExactOutboxEvent(
          officialOutboxId,
          'lane2-watermark-trigger',
          { triggerMayExist: true },
        );
        processed = diagnostic.processed;
        event = await outboxState(officialOutboxId);
        after = await projectionTransactionSnapshot(ids.revision);
      } finally {
        await removeWatermarkFailureTrigger();
        await assertNoWorkerResidue('lane2-watermark-trigger');
      }
      process.stdout.write(`TASK9_PUBLIC_CACHE_TRANSACTION_ROLLBACK=${JSON.stringify({
        status: event!.status,
        cacheBefore: before.publicCache,
        cacheAfter: after!.publicCache,
      })}\n`);

      expect({
        processed,
        event: { status: event!.status, lastError: event!.lastError },
        before,
        after: after!,
      }).toEqual({
        processed: true,
        event: { status: 'RETRY', lastError: 'Error: TASK9_L2_WATERMARK_TRIGGER' },
        before,
        after: before,
      });
    });

    it('[RED-L4] frozen +24h/+48h worker reruns materialize one reviewer reminder and one actor-neutral ops queue item', async () => {
      const submittedAt = new Date('2026-08-01T00:00:00.000Z');
      const sharedBefore = await sharedFixtureSnapshot();
      await prisma.$executeRaw`
        UPDATE v1_game_result_revisions
        SET state = 'SUBMITTED', submitted_at = ${submittedAt}, official_at = NULL
        WHERE id = ${ids.lane4Revision}
      `;
      const outbox = await prisma.v1OutboxEvent.findUniqueOrThrow({
        where: { businessKey: `game:${ids.lane4Game}:revision:1:submitted` },
      });
      await prisma.v1TeamMembership.update({
        where: { teamId_userId: { teamId: ids.lane4OpponentTeam, userId: ids.opponentUser } },
        data: { status: 'removed', removedByUserId: ids.opsUser, leftAt: new Date('2026-08-02T00:00:00.000Z') },
      });
      await prisma.v1Team.update({ where: { id: ids.lane4OpponentTeam }, data: { ownerUserId: ids.supportUser } });
      await prisma.v1TeamMembership.create({
        data: { teamId: ids.lane4OpponentTeam, userId: ids.supportUser, role: 'manager', status: 'active' },
      });
      await resetOfficialDelivery(outbox.id, { revisionId: ids.lane4Revision });
      let delivery: Awaited<ReturnType<typeof outboxState>>;
      let diagnostic: ExactWorkerDiagnostic;
      try {
        diagnostic = await processExactOutboxEvent(outbox.id, 'lane4-due');
        delivery = await outboxState(outbox.id);
      } finally {
        await isolateLane4Outbox([outbox.id]);
        await assertNoWorkerResidue('lane4-due');
      }
      const rows = await prisma.v1ResultEscalation.findMany({
        where: { resultRevisionId: ids.lane4Revision },
        orderBy: { kind: 'asc' },
        select: { id: true, kind: true, status: true, dueAt: true, ackByUserId: true, resolvedByUserId: true },
      });
      const personalPendingIdentity = rows.filter(
        (row) => row.ackByUserId !== null || row.resolvedByUserId !== null,
      ).length;
      const recipientDeliveries = await prisma.v1Notification.groupBy({
        by: ['recipientUserId'],
        where: {
          recipientUserId: { in: [ids.opponentUser, ids.supportUser] },
          targetType: 'team_match',
          targetId: ids.lane4Match,
        },
        _count: { _all: true },
        orderBy: { recipientUserId: 'asc' },
      });
      const sharedAfter = await sharedFixtureSnapshot();
      process.stdout.write(`TASK9_RED_L4_DUE=${JSON.stringify({
        resultRevisionId: ids.lane4Revision,
        submittedAt: submittedAt.toISOString(),
        worker: {
          claimedId: diagnostic!.claimed.id,
          durationMs: diagnostic!.durationMs,
          deadlineOutcome: diagnostic!.deadlineOutcome,
          deliveryStatus: delivery!.status,
        },
        escalationRows: rows.map((row) => ({ id: row.id, kind: row.kind, dueAt: row.dueAt.toISOString() })),
        recipientDeliveries: recipientDeliveries.map((delivery) => ({
          recipientUserId: delivery.recipientUserId,
          count: delivery._count._all,
        })),
        sharedFixtureUnchanged: JSON.stringify(sharedAfter) === JSON.stringify(sharedBefore),
      })}\n`);

      expect(sharedAfter).toEqual(sharedBefore);
      expect({
        submittedDeliveryStatus: delivery!.status,
        rows: rows.map((row) => ({
          kind: row.kind,
          status: row.status,
          dueAt: row.dueAt.toISOString(),
        })),
        stableEscalationIdentity: new Set(rows.filter((row) => row.kind === 'ESCALATION').map((row) => row.id)).size,
        personalPendingIdentity,
        recipientDeliveries: recipientDeliveries.map((delivery) => ({
          recipientUserId: delivery.recipientUserId,
          count: delivery._count._all,
        })),
      }).toEqual({
        submittedDeliveryStatus: 'COMPLETED',
        rows: [
          { kind: 'ESCALATION', status: 'PENDING', dueAt: '2026-08-03T00:00:00.000Z' },
          { kind: 'REMINDER', status: 'PENDING', dueAt: '2026-08-02T00:00:00.000Z' },
        ],
        stableEscalationIdentity: 1,
        personalPendingIdentity: 0,
        recipientDeliveries: [
          { recipientUserId: ids.opponentUser, count: 1 },
          { recipientUserId: ids.supportUser, count: 1 },
        ],
      });
    });

    it('[RED-L4] terminal official delivery closes prior reminder and escalation rows without recreating either', async () => {
      const sharedBefore = await sharedFixtureSnapshot();
      const revisionId = ids.lane4TerminalApprovedRevision;
      await seedEscalationRows(revisionId);
      const decision = await games.decideResultRevision(
        authUser(ids.supportUser),
        ids.lane4Game,
        revisionId,
        `${prefix}:lane4-terminal-approve`,
        {
          expectedVersion: 1,
          clientCommandId: `${prefix}:lane4-terminal-approve`,
          decision: 'approve',
        },
      );
      const event = await prisma.v1OutboxEvent.findUniqueOrThrow({
        where: { businessKey: `game:${ids.lane4Game}:revision:3:approve` },
      });
      const terminalUpdateBefore = await prisma.$transaction((tx) =>
        postgresTransactionGraph('terminal-available-at:before', tx),
      );
      try {
        await prisma.v1OutboxEvent.update({
          where: { id: event.id },
          data: {
            availableAt: new Date('2000-01-01T00:00:00.000Z'),
            version: { increment: 1 },
          },
        });
      } catch (error: unknown) {
        const terminalUpdateAfter = await prisma.$transaction((tx) =>
          postgresTransactionGraph('terminal-available-at:after-error', tx),
        );
        process.stdout.write(`TASK9_P2034_DIAGNOSTIC=${JSON.stringify({
          boundary: 'terminal-available-at',
          eventId: event.id,
          error: prismaErrorDiagnostic(error),
          before: terminalUpdateBefore,
          after: terminalUpdateAfter,
        })}\n`);
        throw error;
      }
      let delivery: Awaited<ReturnType<typeof outboxState>>;
      let rows: Awaited<ReturnType<typeof prisma.v1ResultEscalation.findMany>>;
      let revision: Awaited<ReturnType<typeof prisma.v1GameResultRevision.findUniqueOrThrow>>;
      let game: Awaited<ReturnType<typeof prisma.v1Game.findUniqueOrThrow>>;
      let projection: Awaited<ReturnType<typeof projectionTransactionSnapshot>>;
      try {
        await processExactOutboxEvent(event.id, 'lane4-terminal:approved');
        [rows, delivery, revision, game, projection] = await Promise.all([
          prisma.v1ResultEscalation.findMany({
            where: { resultRevisionId: revisionId },
            orderBy: { kind: 'asc' },
          }),
          outboxState(event.id),
          prisma.v1GameResultRevision.findUniqueOrThrow({ where: { id: revisionId } }),
          prisma.v1Game.findUniqueOrThrow({ where: { id: ids.lane4Game } }),
          projectionTransactionSnapshot(revisionId),
        ]);
      } finally {
        await isolateLane4Outbox([event.id]);
        await assertNoWorkerResidue('lane4-terminal:approved');
      }
      const sharedAfter = await sharedFixtureSnapshot();
      process.stdout.write(`TASK9_RED_L4_TERMINAL=${JSON.stringify({
        decision,
        revision: { id: revision!.id, state: revision!.state, officialAt: revision!.officialAt },
        game: {
          version: game!.version,
          currentOfficialRevisionId: game!.currentOfficialRevisionId,
        },
        event: {
          id: event.id,
          businessKey: event.businessKey,
          type: event.type,
          status: delivery!.status,
          attempts: delivery!.attempts,
          lastError: delivery!.lastError,
        },
        projection,
        escalation: {
          open: rows!.filter((row) => row.status === 'PENDING' || row.status === 'ACKNOWLEDGED').length,
          statuses: rows!.map((row) => row.status),
          reasons: rows!.map((row) => row.reason),
        },
        sharedFixtureUnchanged: JSON.stringify(sharedAfter) === JSON.stringify(sharedBefore),
      })}\n`);

      expect(sharedAfter).toEqual(sharedBefore);
      expect({
        decision,
        revision: { state: revision!.state, official: revision!.officialAt !== null },
        game: { version: game!.version, currentOfficialRevisionId: game!.currentOfficialRevisionId },
        event: { status: delivery!.status, attempts: delivery!.attempts, lastError: delivery!.lastError },
        projection: {
          officialFacts: projection!.officialFacts,
          hasAppliedWatermark: projection!.watermarks.some(({ status }) => status === 'APPLIED'),
        },
        escalation: {
          open: rows!.filter((row) => row.status === 'PENDING' || row.status === 'ACKNOWLEDGED').length,
          statuses: rows!.map((row) => row.status),
          reasons: rows!.map((row) => row.reason),
        },
      }).toEqual({
        decision: expect.objectContaining({ revisionId, revisionState: 'OFFICIAL', replayed: false }),
        revision: { state: 'OFFICIAL', official: true },
        game: { version: 2, currentOfficialRevisionId: revisionId },
        event: { status: 'COMPLETED', attempts: 1, lastError: null },
        projection: { officialFacts: 1, hasAppliedWatermark: true },
        escalation: {
          open: 0,
          statuses: ['CLOSED', 'CLOSED'],
          reasons: ['approved', 'approved'],
        },
      });
    });

    it('[RED-L4] submitted-event replay preserves one result-scoped queue identity and actor-neutral pending rows', async () => {
      const sharedBefore = await sharedFixtureSnapshot();
      const event = await prisma.v1OutboxEvent.create({
        data: {
          id: ids.lane4SubmittedReplay,
          businessKey: `${prefix}:lane4-submitted-replay`,
          aggregateType: 'GAME',
          aggregateId: ids.lane4Game,
          revisionId: ids.lane4Revision,
          type: 'GAME_RESULT_SUBMITTED',
          payload: { gameId: ids.lane4Game, revisionId: ids.lane4Revision },
          availableAt: new Date('2000-01-01T00:00:00.000Z'),
        },
      });
      let delivery: Awaited<ReturnType<typeof outboxState>>;
      try {
        await processExactOutboxEvent(event.id, 'lane4-submitted-replay');
        delivery = await outboxState(event.id);
      } finally {
        await isolateLane4Outbox([event.id]);
        await assertNoWorkerResidue('lane4-submitted-replay');
      }
      const rows = await prisma.v1ResultEscalation.findMany({
        where: { resultRevisionId: ids.lane4Revision },
        orderBy: { kind: 'asc' },
        select: { kind: true, status: true, ackByUserId: true, resolvedByUserId: true },
      });
      const sharedAfter = await sharedFixtureSnapshot();
      process.stdout.write(`TASK9_RED_L4_REPLAY=${JSON.stringify({
        delivery: { status: delivery!.status, attempts: delivery!.attempts, lastError: delivery!.lastError },
        rows,
        sharedFixtureUnchanged: JSON.stringify(sharedAfter) === JSON.stringify(sharedBefore),
      })}\n`);

      expect(sharedAfter).toEqual(sharedBefore);
      expect({
        delivery: { status: delivery!.status, attempts: delivery!.attempts, lastError: delivery!.lastError },
        rows,
      }).toEqual({
        delivery: { status: 'COMPLETED', attempts: 1, lastError: null },
        rows: [
          { kind: 'ESCALATION', status: 'PENDING', ackByUserId: null, resolvedByUserId: null },
          { kind: 'REMINDER', status: 'PENDING', ackByUserId: null, resolvedByUserId: null },
        ],
      });
    });

    it('[RED-R7] escalation HTTP boundaries reject malformed UUIDs and absent idempotency keys without changing state', async () => {
      await seedEscalationRows(ids.tournamentRevision);
      const rows = await prisma.v1ResultEscalation.findMany({
        where: { resultRevisionId: ids.tournamentRevision },
        orderBy: { kind: 'asc' },
        select: { id: true, kind: true },
      });
      const [reminder, escalation] = rows;
      if (reminder === undefined || escalation === undefined) {
        throw new Error('Task 9 R7 fixture must create reminder and escalation rows');
      }
      if (reminder.kind !== 'ESCALATION' || escalation.kind !== 'REMINDER') {
        throw new Error('Task 9 R7 fixture must order ESCALATION then REMINDER');
      }

      let app: INestApplication | undefined;
      let cleanupApp: (() => Promise<void>) | undefined;
      try {
        ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
        const termsService = app.get(ManagedTermsRuntimeService);
        const requiredDocumentIds = (await termsService.currentSignupTerms()).items
          .filter((item) => item.requirement === 'required')
          .map((item) => item.documentId);
        await Promise.all([
          termsService.acceptSignupTerms(ids.supportUser, requiredDocumentIds),
          termsService.acceptSignupTerms(ids.opsUser, requiredDocumentIds),
        ]);
        await assertR7FixturePreconditions(requiredDocumentIds);
        const route = (escalationId: string, action: 'ack' | 'resolve') =>
          `/api/v1/tournament-ops/tournaments/${ids.tournament}/escalations/${escalationId}/${action}`;
        const beforeBoundary = await escalationMutationSnapshot([reminder.id, escalation.id]);

        const malformedTournament = await request(app.getHttpServer())
          .get(`/api/v1/tournament-ops/tournaments/not-a-uuid/escalations`)
          .set('x-v1-user-id', ids.supportUser);
        const malformedEscalation = await request(app.getHttpServer())
          .post(route('not-a-uuid', 'ack'))
          .set('x-v1-user-id', ids.supportUser)
          .set('idempotency-key', `${prefix}:r7-malformed`)
          .send({ expectedVersion: 0, reason: 'R7 malformed escalation identifier' });
        const missingHeader = await request(app.getHttpServer())
          .post(route(escalation.id, 'ack'))
          .set('x-v1-user-id', ids.supportUser)
          .send({ expectedVersion: 0, reason: 'R7 reviewer acknowledgement' });
        const blankHeader = await request(app.getHttpServer())
          .post(route(reminder.id, 'resolve'))
          .set('x-v1-user-id', ids.opsUser)
          .set('idempotency-key', '   ')
          .send({ expectedVersion: 0, reason: 'R7 operations resolution' });
        const afterBoundary = await escalationMutationSnapshot([reminder.id, escalation.id]);

        const first = await request(app.getHttpServer())
          .post(route(escalation.id, 'ack'))
          .set('x-v1-user-id', ids.supportUser)
          .set('idempotency-key', `${prefix}:r7-ack`)
          .send({ expectedVersion: 0, reason: 'R7 reviewer acknowledgement' });
        const replay = await request(app.getHttpServer())
          .post(route(escalation.id, 'ack'))
          .set('x-v1-user-id', ids.supportUser)
          .set('idempotency-key', `${prefix}:r7-ack`)
          .send({ expectedVersion: 0, reason: 'R7 reviewer acknowledgement' });
        const payloadConflict = await request(app.getHttpServer())
          .post(route(escalation.id, 'ack'))
          .set('x-v1-user-id', ids.supportUser)
          .set('idempotency-key', `${prefix}:r7-ack`)
          .send({ expectedVersion: 0, reason: 'R7 changed payload' });
        const staleVersion = await request(app.getHttpServer())
          .post(route(escalation.id, 'ack'))
          .set('x-v1-user-id', ids.supportUser)
          .set('idempotency-key', `${prefix}:r7-stale`)
          .send({ expectedVersion: 0, reason: 'R7 stale version' });
        const resolved = await request(app.getHttpServer())
          .post(route(reminder.id, 'resolve'))
          .set('x-v1-user-id', ids.opsUser)
          .set('idempotency-key', `${prefix}:r7-resolve`)
          .send({ expectedVersion: 0, reason: 'R7 operations resolution' });
        const afterValid = await escalationMutationSnapshot([reminder.id, escalation.id]);

        process.stdout.write(`TASK9_R7_HTTP=${JSON.stringify({
          malformedTournament: { status: malformedTournament.status, body: malformedTournament.body },
          malformedEscalation: { status: malformedEscalation.status, body: malformedEscalation.body },
          missingHeader: { status: missingHeader.status, body: missingHeader.body },
          blankHeader: { status: blankHeader.status, body: blankHeader.body },
          first: { status: first.status, body: first.body },
          replay: { status: replay.status, body: replay.body },
          payloadConflict: { status: payloadConflict.status, body: payloadConflict.body },
          staleVersion: { status: staleVersion.status, body: staleVersion.body },
          resolved: { status: resolved.status, body: resolved.body },
        })}\n`);
        const observable = {
          malformedTournament: malformedTournament.status,
          malformedEscalation: malformedEscalation.status,
          missingHeader: missingHeader.status,
          blankHeader: blankHeader.status,
          boundaryUnchanged: afterBoundary,
          first: { status: first.status, replayed: first.body.data?.replayed },
          replay: { status: replay.status, replayed: replay.body.data?.replayed },
          payloadConflict: { status: payloadConflict.status, code: payloadConflict.body.code },
          staleVersion: { status: staleVersion.status, code: staleVersion.body.code },
          resolved: { status: resolved.status, replayed: resolved.body.data?.replayed },
          afterValid,
        };
        process.stdout.write(`TASK9_R7_BOUNDARY=${JSON.stringify(observable)}\n`);

        expect(observable).toEqual({
          malformedTournament: 422,
          malformedEscalation: 422,
          missingHeader: 422,
          blankHeader: 422,
          boundaryUnchanged: beforeBoundary,
          first: { status: 200, replayed: false },
          replay: { status: 200, replayed: true },
          payloadConflict: { status: 409, code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' },
          staleVersion: { status: 409, code: 'ESCALATION_VERSION_CONFLICT' },
          resolved: { status: 200, replayed: false },
          afterValid: {
            rows: [
              {
                id: reminder.id,
                status: 'RESOLVED',
                version: 1,
                ackByUserId: null,
                resolvedByUserId: ids.opsUser,
                reason: 'R7 operations resolution',
              },
              {
                id: escalation.id,
                status: 'ACKNOWLEDGED',
                version: 1,
                ackByUserId: ids.supportUser,
                resolvedByUserId: null,
                reason: 'R7 reviewer acknowledgement',
              },
            ],
            auditCount: 2,
            idempotencyCount: 2,
          },
        });
      } finally {
        await cleanupApp?.();
      }
    });

    it('[RED-AC6] global platform_ops queue lists, details, acknowledges, resolves, and audits due escalations across tournaments', async () => {
      await cleanupR7EscalationArtifacts();
      const primary = await createAc6EscalationFixture(ids.tournamentGame, 'global-primary');
      const otherTournamentGameId = randomUUID();
      await prisma.v1Game.create({
        data: {
          id: otherTournamentGameId,
          sourceType: 'TOURNAMENT_FIXTURE',
          tournamentFixtureId: ids.otherTournamentFixture,
          state: 'ENDED',
          version: 0,
          competitionConfigVersionId: ids.config,
        },
      });
      const secondary = await createAc6EscalationFixture(otherTournamentGameId, 'global-secondary');

      let app: INestApplication | undefined;
      let cleanupApp: (() => Promise<void>) | undefined;
      try {
        ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
        await acceptAc6SignupTerms(app, [ids.opsUser]);

        const queueRoute = '/api/v1/tournament-ops/escalations';
        const list = await request(app.getHttpServer())
          .get(queueRoute)
          .set('x-v1-user-id', ids.opsUser);
        const primaryDetail = await request(app.getHttpServer())
          .get(`${queueRoute}/${primary.escalationId}`)
          .set('x-v1-user-id', ids.opsUser);
        const acknowledged = await request(app.getHttpServer())
          .post(`${queueRoute}/${primary.escalationId}/ack`)
          .set('x-v1-user-id', ids.opsUser)
          .set('idempotency-key', `${prefix}:ac6-global-ack`)
          .send({ expectedVersion: 0, reason: 'AC6 global queue acknowledgement' });
        const resolved = await request(app.getHttpServer())
          .post(`${queueRoute}/${secondary.escalationId}/resolve`)
          .set('x-v1-user-id', ids.opsUser)
          .set('idempotency-key', `${prefix}:ac6-global-resolve`)
          .send({ expectedVersion: 0, reason: 'AC6 global queue resolution' });
        const audits = await prisma.v1OperationAudit.findMany({
          where: {
            resourceType: 'RESULT_ESCALATION',
            resourceId: { in: [primary.escalationId, secondary.escalationId] },
          },
          orderBy: { resourceId: 'asc' },
          select: { action: true, resourceId: true, tournamentId: true },
        });

        const observable = {
          list: {
            status: list.status,
            escalationIds: (list.body.data?.items ?? []).map((item: { id: string }) => item.id).sort(),
          },
          detail: { status: primaryDetail.status, id: primaryDetail.body.data?.id },
          acknowledged: { status: acknowledged.status, state: acknowledged.body.data?.status },
          resolved: { status: resolved.status, state: resolved.body.data?.status },
          audits,
        };
        process.stdout.write(`TASK9_AC6_GLOBAL_QUEUE=${JSON.stringify(observable)}\n`);

        expect(observable).toEqual({
          list: {
            status: 200,
            escalationIds: [primary.escalationId, secondary.escalationId].sort(),
          },
          detail: { status: 200, id: primary.escalationId },
          acknowledged: { status: 200, state: 'ACKNOWLEDGED' },
          resolved: { status: 200, state: 'RESOLVED' },
          audits: [
            {
              action: 'RESULT_ESCALATION_ACKNOWLEDGED',
              resourceId: primary.escalationId,
              tournamentId: ids.tournament,
            },
            {
              action: 'RESULT_ESCALATION_RESOLVED',
              resourceId: secondary.escalationId,
              tournamentId: ids.otherTournament,
            },
          ].sort((left, right) => left.resourceId.localeCompare(right.resourceId)),
        });
      } finally {
        await cleanupApp?.();
      }
    });

    it('[RED-AC6] escalation queue rejects wrong role, kind, tournament, and future-due rows without mutation', async () => {
      const due = await createAc6EscalationFixture(ids.tournamentGame, 'denial-due');
      const future = await createAc6EscalationFixture(ids.tournamentGame, 'denial-future', 60_000);

      let app: INestApplication | undefined;
      let cleanupApp: (() => Promise<void>) | undefined;
      try {
        ({ app, cleanup: cleanupApp } = await createV1IntegrationApp());
        await acceptAc6SignupTerms(app, [ids.supportUser, ids.opsUser]);

        const route = (tournamentId: string, escalationId: string) =>
          `/api/v1/tournament-ops/tournaments/${tournamentId}/escalations/${escalationId}`;
        const before = await escalationMutationSnapshot([
          due.reminderId,
          due.escalationId,
          future.reminderId,
          future.escalationId,
        ]);
        const reviewerResolve = await request(app.getHttpServer())
          .post(`${route(ids.tournament, due.escalationId)}/resolve`)
          .set('x-v1-user-id', ids.supportUser)
          .set('idempotency-key', `${prefix}:ac6-wrong-role`)
          .send({ expectedVersion: 0, reason: 'AC6 reviewer cannot resolve an ops escalation' });
        const wrongKind = await request(app.getHttpServer())
          .get(route(ids.tournament, due.reminderId))
          .set('x-v1-user-id', ids.opsUser);
        const wrongTournament = await request(app.getHttpServer())
          .get(route(ids.otherTournament, due.escalationId))
          .set('x-v1-user-id', ids.opsUser);
        const futureDue = await request(app.getHttpServer())
          .get(route(ids.tournament, future.escalationId))
          .set('x-v1-user-id', ids.opsUser);
        const after = await escalationMutationSnapshot([
          due.reminderId,
          due.escalationId,
          future.reminderId,
          future.escalationId,
        ]);
        const observable = {
          reviewerResolve: { status: reviewerResolve.status, code: reviewerResolve.body.code },
          wrongKind: { status: wrongKind.status, code: wrongKind.body.code },
          wrongTournament: { status: wrongTournament.status, code: wrongTournament.body.code },
          futureDue: { status: futureDue.status, code: futureDue.body.code },
          unchanged: after,
        };
        process.stdout.write(`TASK9_AC6_DENIALS=${JSON.stringify(observable)}\n`);

        expect(observable).toEqual({
          reviewerResolve: { status: 403, code: 'ESCALATION_SCOPE_DENIED' },
          wrongKind: { status: 404, code: 'RESULT_ESCALATION_NOT_FOUND' },
          wrongTournament: { status: 404, code: 'RESULT_ESCALATION_NOT_FOUND' },
          futureDue: { status: 404, code: 'RESULT_ESCALATION_NOT_FOUND' },
          unchanged: before,
        });
      } finally {
        await cleanupApp?.();
      }
    });

    it('[RED-AC6] reassignment preserves escalation identity while the next reminder reaches only the newly eligible reviewer', async () => {
      const fixture = await createAc6ReassignmentFixture();
      let submittedDelivery: ExactWorkerDiagnostic | undefined;
      let reminderDelivery: ExactWorkerDiagnostic | undefined;
      try {
        submittedDelivery = await processExactOutboxEvent(fixture.submittedOutboxId, 'ac6-reassignment-submitted');
        const before = await ac6ReassignmentObservation(fixture);

        await prisma.v1Team.update({
          where: { id: fixture.reviewerTeamId },
          data: { ownerUserId: ids.opponentUser },
        });
        await prisma.v1TeamMembership.create({
          data: {
            teamId: fixture.reviewerTeamId,
            userId: ids.opponentUser,
            role: 'owner',
            status: 'active',
          },
        });
        await resetOfficialDelivery(fixture.reminderOutboxId, { revisionId: fixture.revisionId });
        reminderDelivery = await processExactOutboxEvent(fixture.reminderOutboxId, 'ac6-reassignment-reminder');
        const after = await ac6ReassignmentObservation(fixture);
        const observable = {
          submitted: { status: submittedDelivery.after.event.status, processed: submittedDelivery.processed },
          reminder: { status: reminderDelivery.after.event.status, processed: reminderDelivery.processed },
          before,
          after,
        };
        process.stdout.write(`TASK9_AC6_REASSIGNMENT=${JSON.stringify(observable)}\n`);

        expect(observable).toEqual({
          submitted: { status: 'COMPLETED', processed: true },
          reminder: { status: 'COMPLETED', processed: true },
          before: {
            escalationId: before.escalationId,
            deliveries: [{ recipientUserId: ids.supportUser, count: 1 }],
          },
          after: {
            escalationId: before.escalationId,
            deliveries: [
              { recipientUserId: ids.opponentUser, count: 1 },
              { recipientUserId: ids.supportUser, count: 1 },
            ],
          },
        });
      } finally {
        await isolateLane4Outbox([fixture.submittedOutboxId, fixture.reminderOutboxId]);
        await assertNoWorkerResidue('ac6-reassignment');
      }
    });
  });
});

async function createFixture(): Promise<void> {
  await prisma.v1User.createMany({
    data: [ids.hostUser, ids.opponentUser, ids.linkedUser, ids.supportUser, ids.opsUser].map(
      (id, index) => ({
        id,
        email: `task9-${index}@example.test`,
        accountStatus: 'active',
        onboardingStatus: 'completed',
        phoneVerifiedAt:
          id === ids.supportUser || id === ids.opsUser
            ? new Date('2026-08-01T00:00:00.000Z')
            : null,
      }),
    ),
  });
  await prisma.v1AdminUser.createMany({
    data: [
      { userId: ids.supportUser, adminRole: 'support', status: 'active' },
      { userId: ids.opsUser, adminRole: 'ops', status: 'active' },
    ],
  });
  await prisma.v1Sport.create({ data: { id: ids.sport, code: 'football', name: 'Task 9 Football' } });
  await prisma.v1Region.create({
    data: { id: ids.region, code: `TASK9_${runId.replaceAll('-', '')}`, name: 'Task 9 Region', level: 1 },
  });
  await prisma.v1CompetitionConfigVersion.create({
    data: {
      id: ids.config,
      sportCode: 'football',
      name: `task9-${runId}`,
      version: 1,
      status: 'ACTIVE',
      periods: FOOTBALL_V1_CONFIG.periods,
      events: FOOTBALL_V1_CONFIG.events,
      lineup: FOOTBALL_V1_CONFIG.lineup,
      result: FOOTBALL_V1_CONFIG.result,
      tieBreak: FOOTBALL_V1_CONFIG.tieBreak,
      visibility: FOOTBALL_V1_CONFIG.visibility,
      contentHash: `${prefix}:config`,
    },
  });
  await prisma.v1Team.createMany({
    data: [
      { id: ids.hostTeam, ownerUserId: ids.hostUser, sportId: ids.sport, regionId: ids.region, name: 'Task 9 Host' },
      { id: ids.opponentTeam, ownerUserId: ids.opponentUser, sportId: ids.sport, regionId: ids.region, name: 'Task 9 Opponent' },
    ],
  });
  await prisma.v1TeamMembership.createMany({
    data: [
      { teamId: ids.hostTeam, userId: ids.hostUser, role: 'owner', status: 'active' },
      { teamId: ids.opponentTeam, userId: ids.opponentUser, role: 'owner', status: 'active' },
    ],
  });
  await prisma.v1TeamMatch.create({
    data: {
      id: ids.match,
      hostTeamId: ids.hostTeam,
      approvedApplicantTeamId: ids.opponentTeam,
      createdByUserId: ids.hostUser,
      sportId: ids.sport,
      regionId: ids.region,
      title: 'Task 9 official result',
      placeName: 'Task 9 ground',
      startAt: new Date('2026-08-01T00:00:00.000Z'),
      competitionConfigVersionId: ids.config,
    },
  });
  await prisma.v1Game.create({
    data: {
      id: ids.game,
      sourceType: 'TEAM_MATCH',
      teamMatchId: ids.match,
      state: 'ENDED',
      version: 0,
      competitionConfigVersionId: ids.config,
    },
  });
  await prisma.v1GameVisibilityPolicy.create({
    data: { gameId: ids.game, mode: 'HIDDEN' },
  });
  await prisma.v1GameSide.createMany({
    data: [
      { id: ids.homeSide, gameId: ids.game, sideKey: 'HOME', teamId: ids.hostTeam, displayNameSnapshot: 'Task 9 Host' },
      { id: ids.awaySide, gameId: ids.game, sideKey: 'AWAY', teamId: ids.opponentTeam, displayNameSnapshot: 'Task 9 Opponent' },
    ],
  });
  await prisma.v1GameLineup.create({
    data: { id: ids.lineup, gameId: ids.game, sideId: ids.homeSide, revision: 1, state: 'LOCKED' },
  });
  await prisma.v1GameParticipant.createMany({
    data: [
      { id: ids.linkedParticipant, gameId: ids.game, sideId: ids.homeSide, lineupId: ids.lineup, displayNameSnapshot: 'Linked Player' },
      { id: ids.guestParticipant, gameId: ids.game, sideId: ids.homeSide, lineupId: ids.lineup, displayNameSnapshot: 'Guest Player' },
    ],
  });
  await prisma.v1ParticipantIdentityLinkCurrent.create({
    data: { participantId: ids.linkedParticipant, linkId: ids.link, userId: ids.linkedUser, version: 1, effectiveFrom: new Date('2026-07-31T00:00:00.000Z') },
  });
  await prisma.v1ParticipantConsentSnapshot.create({
    data: { id: ids.consent, participantId: ids.linkedParticipant, linkId: ids.link, consentVersion: 1, state: 'GRANTED', effectiveAt: new Date('2026-07-31T00:00:00.000Z'), policyHash: 'task9-policy', actorUserId: ids.linkedUser },
  });
  await prisma.v1GameResultRevision.create({
    data: {
      id: ids.revision,
      gameId: ids.game,
      revision: 1,
      state: 'DRAFT',
      score: { home: 2, away: 1 },
      eventsHash: 'official-source-hash',
      createdByActorType: 'USER',
      createdByUserId: ids.hostUser,
      submittedAt: new Date('2026-08-01T00:00:00.000Z'),
      resultParticipants: {
        create: [
          { participantId: ids.linkedParticipant, sideId: ids.homeSide, started: true, goals: 2, cards: { yellow: 0, red: 0 } },
          { participantId: ids.guestParticipant, sideId: ids.homeSide, started: false, goals: 0, cards: { yellow: 0, red: 0 } },
        ],
      },
    },
  });
  await prisma.v1GameResultRevision.update({
    where: { id: ids.revision },
    data: { state: 'SUBMITTED' },
  });
  await prisma.v1GameResultRevision.create({
    data: {
      id: ids.slaRevision,
      gameId: ids.game,
      revision: 2,
      state: 'DRAFT',
      score: { home: 0, away: 0 },
      eventsHash: 'sla-source-hash',
      createdByActorType: 'USER',
      createdByUserId: ids.hostUser,
      submittedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
  });
  await prisma.v1GameResultRevision.update({
    where: { id: ids.slaRevision },
    data: { state: 'SUBMITTED' },
  });

  await prisma.v1Tournament.createMany({
    data: [
      {
        id: ids.tournament,
        sportId: ids.sport,
        title: 'Task 9 Tournament',
        status: 'in_progress',
        competitionConfigVersionId: ids.config,
      },
      {
        id: ids.otherTournament,
        sportId: ids.sport,
        title: 'Task 9 Other Tournament',
        status: 'in_progress',
        competitionConfigVersionId: ids.config,
      },
    ],
  });
  await prisma.v1TournamentRegistration.createMany({
    data: [
      {
        id: ids.hostRegistration,
        tournamentId: ids.tournament,
        teamId: ids.hostTeam,
        appliedByUserId: ids.hostUser,
        status: 'confirmed',
      },
      {
        id: ids.opponentRegistration,
        tournamentId: ids.tournament,
        teamId: ids.opponentTeam,
        appliedByUserId: ids.opponentUser,
        status: 'confirmed',
      },
    ],
  });
  await prisma.v1TournamentFixture.createMany({
    data: [
      {
        id: ids.sourceFixture,
        tournamentId: ids.tournament,
        round: 'semi_final',
        fixtureNumber: 1,
        homeRegistrationId: ids.hostRegistration,
        awayRegistrationId: ids.opponentRegistration,
        status: 'completed',
        competitionConfigVersionId: ids.config,
      },
      {
        id: ids.targetFixture,
        tournamentId: ids.tournament,
        round: 'final',
        fixtureNumber: 2,
        competitionConfigVersionId: ids.config,
      },
      {
        id: ids.loserTargetFixture,
        tournamentId: ids.tournament,
        round: 'placement',
        fixtureNumber: 3,
        competitionConfigVersionId: ids.config,
      },
      {
        id: ids.otherTournamentFixture,
        tournamentId: ids.otherTournament,
        round: 'final',
        fixtureNumber: 1,
        competitionConfigVersionId: ids.config,
      },
    ],
  });
  await prisma.v1Game.create({
    data: {
      id: ids.tournamentGame,
      sourceType: 'TOURNAMENT_FIXTURE',
      tournamentFixtureId: ids.sourceFixture,
      state: 'ENDED',
      version: 0,
      competitionConfigVersionId: ids.config,
    },
  });
  await prisma.v1GameVisibilityPolicy.create({
    data: { gameId: ids.tournamentGame, mode: 'OFFICIAL_ONLY' },
  });
  await prisma.v1GameSide.createMany({
    data: [
      {
        id: ids.tournamentHomeSide,
        gameId: ids.tournamentGame,
        sideKey: 'HOME',
        teamId: ids.hostTeam,
        displayNameSnapshot: 'Task 9 Host',
      },
      {
        id: ids.tournamentAwaySide,
        gameId: ids.tournamentGame,
        sideKey: 'AWAY',
        teamId: ids.opponentTeam,
        displayNameSnapshot: 'Task 9 Opponent',
      },
    ],
  });
  await prisma.v1GameResultRevision.create({
    data: {
      id: ids.tournamentRevision,
      gameId: ids.tournamentGame,
      revision: 1,
      state: 'OFFICIAL',
      score: { home: 3, away: 1 },
      eventsHash: 'tournament-official-source-hash',
      createdByActorType: 'SYSTEM',
      createdBySystemActor: 'TASK9_RED_FIXTURE',
      submittedAt: new Date('2026-08-01T02:00:00.000Z'),
      officialAt: new Date('2026-08-01T03:00:00.000Z'),
    },
  });
  await prisma.v1Game.update({
    where: { id: ids.tournamentGame },
    data: { currentOfficialRevisionId: ids.tournamentRevision },
  });
  const tournamentOutbox = await prisma.v1OutboxEvent.create({
    data: {
      businessKey: `game:${ids.tournamentGame}:revision:1:official`,
      aggregateType: 'GAME',
      aggregateId: ids.tournamentGame,
      revisionId: ids.tournamentRevision,
      type: 'GAME_RESULT_OFFICIAL',
      payload: { gameId: ids.tournamentGame, revisionId: ids.tournamentRevision },
      status: 'COMPLETED',
      availableAt: new Date('2000-01-01T00:00:00.000Z'),
    },
  });
  tournamentOutboxId = tournamentOutbox.id;

  await prisma.v1GameResultRevision.createMany({
    data: [
      { id: ids.terminalSupersededRevision, revision: 3, eventsHash: 'terminal-superseded', reason: 'superseded' },
      { id: ids.terminalApprovedRevision, revision: 4, eventsHash: 'terminal-approved', reason: 'approved' },
      {
        id: ids.terminalChangeRequestedRevision,
        revision: 5,
        eventsHash: 'terminal-change-requested',
        reason: 'change_requested',
      },
      { id: ids.terminalCancelledRevision, revision: 6, eventsHash: 'terminal-cancelled', reason: 'cancelled' },
    ].map((revision) => ({
      ...revision,
      gameId: ids.game,
      state: 'SUBMITTED' as const,
      score: { home: 0, away: 0 },
      createdByActorType: 'SYSTEM' as const,
      createdBySystemActor: 'TASK9_RED_FIXTURE',
      submittedAt: new Date('2026-08-01T00:00:00.000Z'),
    })),
  });

  await prisma.v1Team.createMany({
    data: [
      {
        id: ids.lane4HostTeam,
        ownerUserId: ids.hostUser,
        sportId: ids.sport,
        regionId: ids.region,
        name: 'Task 9 Lane 4 Host',
      },
      {
        id: ids.lane4OpponentTeam,
        ownerUserId: ids.opponentUser,
        sportId: ids.sport,
        regionId: ids.region,
        name: 'Task 9 Lane 4 Opponent',
      },
    ],
  });
  await prisma.v1TeamMembership.createMany({
    data: [
      { teamId: ids.lane4HostTeam, userId: ids.hostUser, role: 'owner', status: 'active' },
      { teamId: ids.lane4OpponentTeam, userId: ids.opponentUser, role: 'owner', status: 'active' },
    ],
  });
  await prisma.v1TeamMatch.create({
    data: {
      id: ids.lane4Match,
      hostTeamId: ids.lane4HostTeam,
      // Task 16: result submit now requires a real matched opponent (see
      // GamesService.assertTeamMatchMatched) — status must agree with
      // approvedApplicantTeamId exactly as the real approve-application flow leaves it.
      status: 'matched',
      approvedApplicantTeamId: ids.lane4OpponentTeam,
      createdByUserId: ids.hostUser,
      sportId: ids.sport,
      regionId: ids.region,
      title: 'Task 9 Lane 4 result escalation',
      placeName: 'Task 9 Lane 4 ground',
      startAt: new Date('2026-08-01T00:00:00.000Z'),
      competitionConfigVersionId: ids.config,
    },
  });
  await prisma.v1Game.create({
    data: {
      id: ids.lane4Game,
      sourceType: 'TEAM_MATCH',
      teamMatchId: ids.lane4Match,
      state: 'SCHEDULED',
      version: 0,
      competitionConfigVersionId: ids.config,
    },
  });
  await prisma.v1GameSide.createMany({
    data: [
      {
        id: ids.lane4HomeSide,
        gameId: ids.lane4Game,
        sideKey: 'HOME',
        teamId: ids.lane4HostTeam,
        displayNameSnapshot: 'Task 9 Lane 4 Host',
      },
      {
        id: ids.lane4AwaySide,
        gameId: ids.lane4Game,
        sideKey: 'AWAY',
        teamId: ids.lane4OpponentTeam,
        displayNameSnapshot: 'Task 9 Lane 4 Opponent',
      },
    ],
  });
  await prisma.v1GameLineup.create({
    data: {
      id: ids.lane4Lineup,
      gameId: ids.lane4Game,
      sideId: ids.lane4HomeSide,
      revision: 1,
      state: 'LOCKED',
    },
  });
  await prisma.v1GameParticipant.create({
    data: {
      id: ids.lane4Participant,
      gameId: ids.lane4Game,
      sideId: ids.lane4HomeSide,
      lineupId: ids.lane4Lineup,
      displayNameSnapshot: 'Task 9 Lane 4 Player',
    },
  });
  await prisma.v1GameResultRevision.create({
    data: {
      id: ids.lane4Revision,
      gameId: ids.lane4Game,
      revision: 1,
      state: 'DRAFT',
      score: { home: 1, away: 0 },
      eventsHash: 'lane4-submitted-source-hash',
      createdByActorType: 'USER',
      createdByUserId: ids.hostUser,
      resultParticipants: {
        create: {
          participantId: ids.lane4Participant,
          sideId: ids.lane4HomeSide,
          started: true,
          goals: 1,
          cards: { yellow: 0, red: 0 },
        },
      },
    },
  });
  await prisma.v1GameResultRevision.createMany({
    data: [
      { id: ids.lane4TerminalApprovedRevision, revision: 3, eventsHash: 'lane4-terminal-approved', reason: 'approved' },
    ].map((revision) => ({
      ...revision,
      gameId: ids.lane4Game,
      state: 'SUBMITTED' as const,
      score: { home: 0, away: 0 },
      createdByActorType: 'SYSTEM' as const,
      createdBySystemActor: 'TASK9_LANE4_RED_FIXTURE',
      submittedAt: new Date('2026-08-01T00:00:00.000Z'),
    })),
  });
  await prisma.v1TournamentStaffAssignment.create({
    data: {
      id: ids.lane4DirectorAssignment,
      tournamentId: ids.tournament,
      userId: ids.supportUser,
      role: 'TOURNAMENT_DIRECTOR',
      grantedByUserId: ids.opsUser,
    },
  });
}

function authUser(id: string) {
  return { id, email: `${id}@example.test`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
}

function auditWorker(): V1GameOperationsWorkerService {
  const worker = new V1GameOperationsWorkerService(prisma);
  worker.registerDurableAuditHandler('TASK9_PIN_WORKER');
  return worker;
}

function productionWorker(): DiagnosticGameOperationsWorker {
  const worker = new DiagnosticGameOperationsWorker(prisma, DIAGNOSTIC_WORKER_TIMEOUT_MS);
  worker.registerDurableAuditHandler('GAME_OPERATION_FLAG_CHANGED');
  worker.registerDurableAuditHandler('GAME_OPERATION_JOB_REQUEUED');
  return worker;
}

type PostgresTransactionGraph = {
  label: string;
  current: {
    pid: number;
    applicationName: string;
    transactionId: string | null;
  };
  activities: Array<{
    pid: number;
    applicationName: string;
    state: string | null;
    transactionId: string | null;
    transactionAgeMs: number | null;
    waitEventType: string | null;
    waitEvent: string | null;
    blockingPids: number[];
    query: string;
  }>;
  locks: Array<{
    pid: number;
    applicationName: string;
    lockType: string;
    relation: string | null;
    page: number | null;
    tuple: number | null;
    transactionId: string | null;
    virtualTransactionId: string | null;
    mode: string;
    granted: boolean;
    fastpath: boolean;
    blockingPids: number[];
  }>;
};

async function postgresTransactionGraph(
  label: string,
  tx: Prisma.TransactionClient,
): Promise<PostgresTransactionGraph> {
  const [currentRows, activities, locks] = await Promise.all([
    tx.$queryRaw<Array<{ pid: number; applicationName: string; transactionId: string | null }>>`
      SELECT
        pg_backend_pid() AS pid,
        current_setting('application_name') AS "applicationName",
        txid_current_if_assigned()::text AS "transactionId"
    `,
    tx.$queryRaw<PostgresTransactionGraph['activities']>`
      SELECT
        activity.pid,
        activity.application_name AS "applicationName",
        activity.state,
        activity.backend_xid::text AS "transactionId",
        CASE
          WHEN activity.xact_start IS NULL THEN NULL
          ELSE (EXTRACT(EPOCH FROM (clock_timestamp() - activity.xact_start)) * 1000)::float8
        END AS "transactionAgeMs",
        activity.wait_event_type AS "waitEventType",
        activity.wait_event AS "waitEvent",
        pg_blocking_pids(activity.pid) AS "blockingPids",
        LEFT(activity.query, 500) AS query
      FROM pg_stat_activity AS activity
      WHERE activity.datname = current_database()
      ORDER BY activity.pid ASC
    `,
    tx.$queryRaw<PostgresTransactionGraph['locks']>`
      SELECT
        lock_row.pid,
        activity.application_name AS "applicationName",
        lock_row.locktype AS "lockType",
        relation.relname AS relation,
        lock_row.page,
        lock_row.tuple,
        lock_row.transactionid::text AS "transactionId",
        lock_row.virtualxid::text AS "virtualTransactionId",
        lock_row.mode,
        lock_row.granted,
        lock_row.fastpath,
        pg_blocking_pids(lock_row.pid) AS "blockingPids"
      FROM pg_locks AS lock_row
      LEFT JOIN pg_class AS relation ON relation.oid = lock_row.relation
      LEFT JOIN pg_stat_activity AS activity ON activity.pid = lock_row.pid
      WHERE lock_row.database = (SELECT oid FROM pg_database WHERE datname = current_database())
         OR lock_row.locktype IN ('transactionid', 'virtualxid')
      ORDER BY lock_row.pid ASC, lock_row.locktype ASC, relation.relname ASC NULLS LAST,
               lock_row.page ASC NULLS LAST, lock_row.tuple ASC NULLS LAST, lock_row.mode ASC
    `,
  ]);
  const current = currentRows[0];
  if (!current) throw new Error(`TASK9_POSTGRES_DIAGNOSTIC_MISSING_CURRENT:${label}`);
  return { label, current, activities, locks };
}

function prismaErrorDiagnostic(error: unknown): {
  name: string;
  code: string | null;
  message: string;
  meta: unknown;
} {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return { name: error.name, code: error.code, message: error.message, meta: error.meta ?? null };
  }
  if (error instanceof Error) {
    return { name: error.name, code: null, message: error.message, meta: null };
  }
  return { name: 'UnknownError', code: null, message: String(error), meta: null };
}

function elapsed(startedAt: number): number {
  return Number((performance.now() - startedAt).toFixed(3));
}

type WorkerDatabaseDiagnostics = {
  event: Awaited<ReturnType<typeof outboxState>>;
  activities: Array<{
    pid: number;
    state: string | null;
    waitEventType: string | null;
    waitEvent: string | null;
    query: string;
  }>;
  locks: Array<{ pid: number; relation: string; mode: string; granted: boolean }>;
  triggerExists: boolean;
  ownedProcessing: number;
};

type ExactWorkerDiagnostic = {
  label: string;
  expected: { id: string; businessKey: string; type: string; version: number };
  claimed: { id: string; businessKey: string; type: string; version: number };
  processed: boolean;
  durationMs: number;
  deadlineMs: number;
  deadlineOutcome: 'settled' | 'handler-deadline';
  before: WorkerDatabaseDiagnostics;
  during: WorkerDatabaseDiagnostics;
  after: WorkerDatabaseDiagnostics;
  metrics: Awaited<ReturnType<DiagnosticGameOperationsWorker['getMetrics']>>;
};

async function processExactOutboxEvent(
  outboxEventId: string,
  label: string,
  options: { triggerMayExist?: boolean } = {},
): Promise<ExactWorkerDiagnostic> {
  const settlementTimeline: Array<{ phase: string; elapsedMs: number }> = [];
  const helperStartedAt = performance.now();
  let quarantineBeforeUpdate: PostgresTransactionGraph | null = null;
  let quarantined: {
    expected: { id: string; businessKey: string; type: string; version: number };
    rows: Array<{ id: string; availableAt: Date }>;
  };
  try {
    quarantined = await prisma.$transaction(async (tx) => {
      settlementTimeline.push({ phase: 'quarantine-transaction-started', elapsedMs: elapsed(helperStartedAt) });
    const expectedRows = await tx.$queryRaw<Array<{
      id: string;
      businessKey: string;
      type: string;
      version: number;
    }>>`
      SELECT id, business_key AS "businessKey", type, version
      FROM v1_outbox_events
      WHERE id = ${outboxEventId}
        AND status IN ('PENDING', 'RETRY')
        AND available_at <= CURRENT_TIMESTAMP
        AND (lease_until IS NULL OR lease_until <= CURRENT_TIMESTAMP)
      FOR UPDATE
    `;
    const expected = expectedRows[0];
    if (!expected) throw new Error(`TASK9_DIAGNOSTIC_EXPECTED_EVENT_NOT_CLAIMABLE:${label}:${outboxEventId}`);

    const rows = await tx.$queryRaw<Array<{ id: string; availableAt: Date }>>`
      SELECT id, available_at AS "availableAt"
      FROM v1_outbox_events
      WHERE id <> ${outboxEventId}
        AND status IN ('PENDING', 'RETRY')
        AND available_at <= CURRENT_TIMESTAMP
        AND (
          business_key LIKE ${`${prefix}%`}
          OR aggregate_id IN (${ids.game}, ${ids.tournamentGame}, ${ids.lane4Game})
        )
      ORDER BY id ASC
      FOR UPDATE
    `;
    if (rows.length > 0) {
      quarantineBeforeUpdate = await postgresTransactionGraph(`${label}:quarantine-before-update`, tx);
      await tx.v1OutboxEvent.updateMany({
        where: { id: { in: rows.map(({ id }) => id) } },
        data: {
          availableAt: new Date('2098-01-01T00:00:00.000Z'),
          version: { increment: 1 },
        },
      });
    }
    const eligible = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM v1_outbox_events
      WHERE status IN ('PENDING', 'RETRY')
        AND available_at <= CURRENT_TIMESTAMP
        AND (lease_until IS NULL OR lease_until <= CURRENT_TIMESTAMP)
      ORDER BY available_at ASC, created_at ASC, id ASC
    `;
    if (eligible.length !== 1 || eligible[0].id !== outboxEventId) {
      throw new Error(`TASK9_DIAGNOSTIC_CROSS_CLAIM:${label}:${eligible.map(({ id }) => id).join(',')}`);
    }
    return { expected, rows };
    });
    settlementTimeline.push({ phase: 'quarantine-transaction-committed', elapsedMs: elapsed(helperStartedAt) });
  } catch (error: unknown) {
    const after = await prisma.$transaction((tx) =>
      postgresTransactionGraph(`${label}:quarantine-after-error`, tx),
    );
    process.stdout.write(`TASK9_P2034_DIAGNOSTIC=${JSON.stringify({
      boundary: 'quarantine-update',
      label,
      outboxEventId,
      error: prismaErrorDiagnostic(error),
      before: quarantineBeforeUpdate,
      after,
      settlementTimeline,
    })}\n`);
    throw error;
  }

  const worker = productionWorker();
  const before = await workerDatabaseDiagnostics(outboxEventId);
  const startedAt = performance.now();
  let processPromise: Promise<boolean> | null = null;
  let processed = false;
  let during: WorkerDatabaseDiagnostics | null = null;
  let failure: unknown;
  try {
    processPromise = worker.processOne();
    settlementTimeline.push({ phase: 'worker-process-promise-created', elapsedMs: elapsed(helperStartedAt) });
    during = await workerDatabaseDiagnostics(outboxEventId);
    processed = await processPromise;
    settlementTimeline.push({ phase: 'worker-process-promise-settled', elapsedMs: elapsed(helperStartedAt) });
  } catch (error: unknown) {
    failure = error;
  } finally {
    if (processPromise) await processPromise.catch(() => false);
    settlementTimeline.push({ phase: 'worker-process-promise-finally-awaited', elapsedMs: elapsed(helperStartedAt) });
    await worker.shutdown(1_000);
    settlementTimeline.push({ phase: 'worker-shutdown-settled', elapsedMs: elapsed(helperStartedAt) });
    if (quarantined.rows.length > 0) {
      await prisma.$transaction(
        quarantined.rows.map((row) => prisma.v1OutboxEvent.update({
          where: { id: row.id },
          data: {
            availableAt: row.availableAt,
            version: { increment: 1 },
          },
        })),
      );
      settlementTimeline.push({ phase: 'quarantine-restore-committed', elapsedMs: elapsed(helperStartedAt) });
    }
  }
  const durationMs = Number((performance.now() - startedAt).toFixed(3));
  const after = await workerDatabaseDiagnostics(outboxEventId);
  const claimed = worker.claims[0];
  const metrics = await worker.getMetrics();
  const diagnostic: ExactWorkerDiagnostic = {
    label,
    expected: quarantined.expected,
    claimed: claimed
      ? { id: claimed.id, businessKey: claimed.businessKey, type: claimed.type, version: claimed.version }
      : { id: '', businessKey: '', type: '', version: -1 },
    processed,
    durationMs,
    deadlineMs: DIAGNOSTIC_WORKER_TIMEOUT_MS,
    deadlineOutcome: after.event.lastError?.includes('Handler deadline exceeded')
      ? 'handler-deadline'
      : 'settled',
    before,
    during: during ?? before,
    after,
    metrics,
  };
  process.stdout.write(`TASK9_WORKER_DIAGNOSTIC=${JSON.stringify({ ...diagnostic, settlementTimeline })}\n`);

  if (failure) throw failure;
  if (!claimed || claimed.id !== outboxEventId) {
    throw new Error(`TASK9_DIAGNOSTIC_CLAIM_MISMATCH:${label}:${claimed?.id ?? 'none'}`);
  }
  if (after.ownedProcessing !== 0 || after.event.status === 'PROCESSING' || metrics.active !== 0) {
    throw new Error(`TASK9_DIAGNOSTIC_WORKER_RESIDUE:${label}`);
  }
  if (!options.triggerMayExist && after.triggerExists) {
    throw new Error(`TASK9_DIAGNOSTIC_TRIGGER_RESIDUE:${label}`);
  }
  return diagnostic;
}

async function workerDatabaseDiagnostics(outboxEventId: string): Promise<WorkerDatabaseDiagnostics> {
  const [event, activities, locks, triggerRows, processingRows] = await Promise.all([
    outboxState(outboxEventId),
    prisma.$queryRaw<WorkerDatabaseDiagnostics['activities']>`
      SELECT
        pid,
        state,
        wait_event_type AS "waitEventType",
        wait_event AS "waitEvent",
        LEFT(query, 240) AS query
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state <> 'idle'
      ORDER BY pid ASC
    `,
    prisma.$queryRaw<WorkerDatabaseDiagnostics['locks']>`
      SELECT
        lock_row.pid,
        COALESCE(relation.relname, '') AS relation,
        lock_row.mode,
        lock_row.granted
      FROM pg_locks AS lock_row
      LEFT JOIN pg_class AS relation ON relation.oid = lock_row.relation
      WHERE lock_row.database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND lock_row.pid <> pg_backend_pid()
        AND (
          relation.relname IN ('v1_outbox_events', 'v1_projection_watermarks')
          OR lock_row.granted = false
        )
      ORDER BY lock_row.pid ASC, relation ASC, lock_row.mode ASC
    `,
    prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'task9_l2_fail_watermark_insert'
          AND NOT tgisinternal
      ) AS exists
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM v1_outbox_events
      WHERE status = 'PROCESSING'
        AND (
          business_key LIKE ${`${prefix}%`}
          OR aggregate_id IN (${ids.game}, ${ids.tournamentGame}, ${ids.lane4Game})
        )
    `,
  ]);
  return {
    event,
    activities,
    locks,
    triggerExists: triggerRows[0]?.exists === true,
    ownedProcessing: processingRows[0]?.count ?? 0,
  };
}

async function assertNoWorkerResidue(label: string): Promise<void> {
  const [triggerRows, processingRows, waitingLocks] = await Promise.all([
    prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'task9_l2_fail_watermark_insert' AND NOT tgisinternal
      ) AS exists
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM v1_outbox_events WHERE status = 'PROCESSING'
    `,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM pg_locks
      WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database())
        AND granted = false
    `,
  ]);
  const observable = {
    label,
    triggerExists: triggerRows[0]?.exists === true,
    processing: processingRows[0]?.count ?? 0,
    waitingLocks: waitingLocks[0]?.count ?? 0,
  };
  process.stdout.write(`TASK9_WORKER_CLEANUP=${JSON.stringify(observable)}\n`);
  expect(observable).toEqual({ label, triggerExists: false, processing: 0, waitingLocks: 0 });
}

async function resetOfficialDelivery(
  outboxEventId: string,
  payload?: { revisionId: string },
  attempts = 0,
): Promise<void> {
  const event = await prisma.v1OutboxEvent.findUniqueOrThrow({
    where: { id: outboxEventId },
    select: { revisionId: true },
  });
  await prisma.v1OutboxEvent.update({
    where: { id: outboxEventId },
    data: {
      status: 'PENDING',
      attempts,
      availableAt: new Date('2000-01-01T00:00:00.000Z'),
      leaseOwner: null,
      leaseUntil: null,
      lastError: null,
      payload: payload ?? { revisionId: event.revisionId ?? '' },
      version: { increment: 1 },
    },
  });
}

async function insertDuplicateOfficialDeliveries(): Promise<string[]> {
  const deliveries = [
    {
      id: ids.deliveryLaterA,
      businessKey: `${prefix}:official-delivery:later-a`,
      deliveredSequence: 2,
      availableAt: new Date('2000-01-01T00:00:00.000Z'),
    },
    {
      id: ids.deliveryLaterB,
      businessKey: `${prefix}:official-delivery:later-b`,
      deliveredSequence: 2,
      availableAt: new Date('2000-01-01T00:00:01.000Z'),
    },
    {
      id: ids.deliveryOlder,
      businessKey: `${prefix}:official-delivery:older`,
      deliveredSequence: 1,
      availableAt: new Date('2000-01-01T00:00:02.000Z'),
    },
  ];
  await prisma.v1OutboxEvent.createMany({
    data: deliveries.map((delivery) => ({
      id: delivery.id,
      businessKey: delivery.businessKey,
      aggregateType: 'GAME',
      aggregateId: ids.game,
      revisionId: ids.revision,
      type: 'GAME_RESULT_OFFICIAL',
      payload: { revisionId: ids.revision, deliveredSequence: delivery.deliveredSequence },
      availableAt: delivery.availableAt,
    })),
  });
  return deliveries.map(({ id }) => id);
}

async function officialTeamTotals(teamId: string, utcYear: number, tournamentId: string) {
  const rows = await prisma.$queryRaw<Array<{
    calendarPlayed: bigint;
    calendarWon: bigint;
    calendarDrawn: bigint;
    calendarLost: bigint;
    tournamentPlayed: bigint;
    tournamentWon: bigint;
    tournamentDrawn: bigint;
    tournamentLost: bigint;
    lifetimePlayed: bigint;
    lifetimeWon: bigint;
    lifetimeDrawn: bigint;
    lifetimeLost: bigint;
  }>>`
    SELECT
      COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM official_at)::int = ${utcYear})::bigint AS "calendarPlayed",
      COUNT(*) FILTER (
        WHERE EXTRACT(YEAR FROM official_at)::int = ${utcYear}
          AND ((home_team_id = ${teamId} AND home_score > away_score) OR (away_team_id = ${teamId} AND away_score > home_score))
      )::bigint AS "calendarWon",
      COUNT(*) FILTER (WHERE EXTRACT(YEAR FROM official_at)::int = ${utcYear} AND home_score = away_score)::bigint AS "calendarDrawn",
      COUNT(*) FILTER (
        WHERE EXTRACT(YEAR FROM official_at)::int = ${utcYear}
          AND ((home_team_id = ${teamId} AND home_score < away_score) OR (away_team_id = ${teamId} AND away_score < home_score))
      )::bigint AS "calendarLost",
      COUNT(*) FILTER (WHERE tournament_id = ${tournamentId})::bigint AS "tournamentPlayed",
      COUNT(*) FILTER (
        WHERE tournament_id = ${tournamentId}
          AND ((home_team_id = ${teamId} AND home_score > away_score) OR (away_team_id = ${teamId} AND away_score > home_score))
      )::bigint AS "tournamentWon",
      COUNT(*) FILTER (WHERE tournament_id = ${tournamentId} AND home_score = away_score)::bigint AS "tournamentDrawn",
      COUNT(*) FILTER (
        WHERE tournament_id = ${tournamentId}
          AND ((home_team_id = ${teamId} AND home_score < away_score) OR (away_team_id = ${teamId} AND away_score < home_score))
      )::bigint AS "tournamentLost",
      COUNT(*)::bigint AS "lifetimePlayed",
      COUNT(*) FILTER (
        WHERE (home_team_id = ${teamId} AND home_score > away_score) OR (away_team_id = ${teamId} AND away_score > home_score)
      )::bigint AS "lifetimeWon",
      COUNT(*) FILTER (WHERE home_score = away_score)::bigint AS "lifetimeDrawn",
      COUNT(*) FILTER (
        WHERE (home_team_id = ${teamId} AND home_score < away_score) OR (away_team_id = ${teamId} AND away_score < home_score)
      )::bigint AS "lifetimeLost"
    FROM v1_game_official_facts
    WHERE home_team_id = ${teamId} OR away_team_id = ${teamId}
  `;
  const totals = rows[0];
  return {
    calendarYear: {
      played: Number(totals.calendarPlayed),
      won: Number(totals.calendarWon),
      drawn: Number(totals.calendarDrawn),
      lost: Number(totals.calendarLost),
    },
    tournament: {
      played: Number(totals.tournamentPlayed),
      won: Number(totals.tournamentWon),
      drawn: Number(totals.tournamentDrawn),
      lost: Number(totals.tournamentLost),
    },
    lifetime: {
      played: Number(totals.lifetimePlayed),
      won: Number(totals.lifetimeWon),
      drawn: Number(totals.lifetimeDrawn),
      lost: Number(totals.lifetimeLost),
    },
  };
}

async function ensureInjectedMismatch(): Promise<void> {
  await prisma.v1ProjectionWatermark.upsert({
    where: {
      projection_entityType_entityId: {
        projection: 'TEAM_RECORD',
        entityType: 'TEAM',
        entityId: ids.hostTeam,
      },
    },
    create: {
      projection: 'TEAM_RECORD',
      entityType: 'TEAM',
      entityId: ids.hostTeam,
      revisionId: ids.revision,
      sourceHash: 'injected-mismatch',
      status: 'FAILED',
    },
    update: {
      revisionId: ids.revision,
      sourceHash: 'injected-mismatch',
      status: 'FAILED',
    },
  });
}

async function installWatermarkFailureTrigger(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION task9_l2_fail_watermark_insert() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'TASK9_L2_WATERMARK_TRIGGER';
    END $$
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER task9_l2_fail_watermark_insert
    BEFORE INSERT OR UPDATE ON v1_projection_watermarks
    FOR EACH ROW EXECUTE FUNCTION task9_l2_fail_watermark_insert()
  `);
}

async function removeWatermarkFailureTrigger(): Promise<void> {
  await prisma.$executeRawUnsafe(
    'DROP TRIGGER IF EXISTS task9_l2_fail_watermark_insert ON v1_projection_watermarks',
  );
  await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS task9_l2_fail_watermark_insert()');
}

async function insertOutbox(label: string, attempts: number): Promise<string> {
  const id = randomUUID();
  await prisma.v1OutboxEvent.create({
    data: {
      id,
      businessKey: `${prefix}:${label}`,
      aggregateType: 'TASK9_PIN',
      aggregateId: ids.game,
      type: 'TASK9_PIN_WORKER',
      payload: { label },
      attempts,
      availableAt: new Date('2000-01-01T00:00:00.000Z'),
    },
  });
  return id;
}

async function outboxState(id: string) {
  return prisma.v1OutboxEvent.findUniqueOrThrow({
    where: { id },
    select: {
      status: true,
      attempts: true,
      version: true,
      leaseOwner: true,
      leaseUntil: true,
      availableAt: true,
      updatedAt: true,
      lastError: true,
    },
  });
}

async function sharedFixtureSnapshot() {
  const [game, opponentTeam, opponentMembership, officialEvents, watermarks] = await Promise.all([
    prisma.v1Game.findUniqueOrThrow({
      where: { id: ids.game },
      select: { state: true, version: true, currentOfficialRevisionId: true },
    }),
    prisma.v1Team.findUniqueOrThrow({
      where: { id: ids.opponentTeam },
      select: { ownerUserId: true },
    }),
    prisma.v1TeamMembership.findUniqueOrThrow({
      where: { teamId_userId: { teamId: ids.opponentTeam, userId: ids.opponentUser } },
      select: { role: true, status: true, leftAt: true, removedByUserId: true },
    }),
    prisma.v1OutboxEvent.findMany({
      where: { aggregateId: ids.game, type: 'GAME_RESULT_OFFICIAL' },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        status: true,
        attempts: true,
        version: true,
        lastError: true,
        availableAt: true,
        leaseOwner: true,
        leaseUntil: true,
      },
    }),
    prisma.v1ProjectionWatermark.findMany({
      where: { revisionId: ids.revision },
      orderBy: [{ projection: 'asc' }, { entityType: 'asc' }, { entityId: 'asc' }],
      select: {
        projection: true,
        entityType: true,
        entityId: true,
        revisionId: true,
        sourceHash: true,
        status: true,
        projectedAt: true,
      },
    }),
  ]);
  return { game, opponentTeam, opponentMembership, officialEvents, watermarks };
}

async function seedEscalationRows(revisionId: string): Promise<void> {
  const databaseNow = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
  const now = databaseNow[0]?.now;
  if (now === undefined) {
    throw new Error('Task 9 escalation fixture requires database CURRENT_TIMESTAMP');
  }
  await Promise.all([
    prisma.v1ResultEscalation.upsert({
      where: { resultRevisionId_kind: { resultRevisionId: revisionId, kind: 'REMINDER' } },
      create: { resultRevisionId: revisionId, kind: 'REMINDER', dueAt: new Date(now.getTime() - 2_000) },
      update: { status: 'PENDING', version: 0, ackByUserId: null, resolvedByUserId: null, reason: null },
    }),
    prisma.v1ResultEscalation.upsert({
      where: { resultRevisionId_kind: { resultRevisionId: revisionId, kind: 'ESCALATION' } },
      create: { resultRevisionId: revisionId, kind: 'ESCALATION', dueAt: new Date(now.getTime() - 1_000) },
      update: { status: 'PENDING', version: 0, ackByUserId: null, resolvedByUserId: null, reason: null },
    }),
  ]);
}

async function cleanupR7EscalationArtifacts(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.v1ResultEscalation.findMany({
      where: {
        resultRevisionId: ids.tournamentRevision,
        kind: { in: ['ESCALATION', 'REMINDER'] },
      },
      select: { id: true },
    });
    const escalationIds = rows.map(({ id }) => id);
    if (escalationIds.length === 0) return;

    await tx.v1IdempotencyRecord.deleteMany({
      where: { resourceType: 'RESULT_ESCALATION', resourceId: { in: escalationIds } },
    });
    await tx.v1ResultEscalation.deleteMany({ where: { id: { in: escalationIds } } });
  });
}

async function createAc6EscalationFixture(
  gameId: string,
  label: string,
  dueOffsetMs = -1_000,
): Promise<{ revisionId: string; reminderId: string; escalationId: string }> {
  const revisionId = randomUUID();
  const [revisionAggregate, databaseNow] = await Promise.all([
    prisma.v1GameResultRevision.aggregate({ where: { gameId }, _max: { revision: true } }),
    prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`,
  ]);
  const now = databaseNow[0]?.now;
  if (now === undefined) {
    throw new Error(`Task 9 AC6 fixture requires database CURRENT_TIMESTAMP: ${label}`);
  }
  const reminderId = randomUUID();
  const escalationId = randomUUID();
  await prisma.v1GameResultRevision.create({
    data: {
      id: revisionId,
      gameId,
      revision: (revisionAggregate._max.revision ?? 0) + 1,
      state: 'SUBMITTED',
      score: { home: 0, away: 0 },
      eventsHash: `${prefix}:ac6:${label}:${revisionId}`,
      createdByActorType: 'SYSTEM',
      createdBySystemActor: 'TASK9_AC6_RED_FIXTURE',
      submittedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
  });
  await prisma.v1ResultEscalation.createMany({
    data: [
      {
        id: reminderId,
        resultRevisionId: revisionId,
        kind: 'REMINDER',
        dueAt: new Date(now.getTime() + dueOffsetMs),
      },
      {
        id: escalationId,
        resultRevisionId: revisionId,
        kind: 'ESCALATION',
        dueAt: new Date(now.getTime() + dueOffsetMs),
      },
    ],
  });
  return { revisionId, reminderId, escalationId };
}

async function acceptAc6SignupTerms(app: INestApplication, userIds: readonly string[]): Promise<void> {
  const termsService = app.get(ManagedTermsRuntimeService);
  const documentIds = (await termsService.currentSignupTerms()).items
    .filter((item) => item.requirement === 'required')
    .map((item) => item.documentId);
  if (documentIds.length === 0) {
    throw new Error('Task 9 AC6 fixture requires at least one required signup term');
  }
  await Promise.all(userIds.map((userId) => termsService.acceptSignupTerms(userId, documentIds)));
}

async function createAc6ReassignmentFixture(): Promise<{
  reviewerTeamId: string;
  teamMatchId: string;
  gameId: string;
  revisionId: string;
  submittedOutboxId: string;
  reminderOutboxId: string;
}> {
  const reviewerTeamId = randomUUID();
  const teamMatchId = randomUUID();
  const gameId = randomUUID();
  const revisionId = randomUUID();
  const submittedOutboxId = randomUUID();
  const reminderOutboxId = randomUUID();
  await prisma.v1Team.create({
    data: {
      id: reviewerTeamId,
      ownerUserId: ids.supportUser,
      sportId: ids.sport,
      regionId: ids.region,
      name: `Task 9 AC6 reviewer ${runId}`,
    },
  });
  await prisma.v1TeamMembership.create({
    data: { teamId: reviewerTeamId, userId: ids.supportUser, role: 'owner', status: 'active' },
  });
  await prisma.v1TeamMatch.create({
    data: {
      id: teamMatchId,
      hostTeamId: ids.lane4HostTeam,
      approvedApplicantTeamId: reviewerTeamId,
      createdByUserId: ids.hostUser,
      sportId: ids.sport,
      regionId: ids.region,
      title: `Task 9 AC6 reassignment ${runId}`,
      placeName: 'Task 9 AC6 test ground',
      startAt: new Date('2026-08-01T00:00:00.000Z'),
      competitionConfigVersionId: ids.config,
    },
  });
  await prisma.v1Game.create({
    data: {
      id: gameId,
      sourceType: 'TEAM_MATCH',
      teamMatchId,
      state: 'ENDED',
      version: 0,
      competitionConfigVersionId: ids.config,
    },
  });
  await prisma.v1GameResultRevision.create({
    data: {
      id: revisionId,
      gameId,
      revision: 1,
      state: 'SUBMITTED',
      score: { home: 0, away: 0 },
      eventsHash: `${prefix}:ac6:reassignment:${revisionId}`,
      createdByActorType: 'SYSTEM',
      createdBySystemActor: 'TASK9_AC6_RED_FIXTURE',
      submittedAt: new Date('2098-01-01T00:00:00.000Z'),
    },
  });
  await prisma.v1OutboxEvent.create({
    data: {
      id: submittedOutboxId,
      businessKey: `${prefix}:ac6:reassignment:submitted`,
      aggregateType: 'GAME',
      aggregateId: gameId,
      revisionId,
      type: 'GAME_RESULT_SUBMITTED',
      payload: { gameId, revisionId },
      availableAt: new Date('2000-01-01T00:00:00.000Z'),
    },
  });
  await prisma.v1OutboxEvent.create({
    data: {
      id: reminderOutboxId,
      businessKey: `${prefix}:ac6:reassignment:reminder`,
      aggregateType: 'GAME',
      aggregateId: gameId,
      revisionId,
      type: 'GAME_RESULT_REVIEW_REMINDER',
      payload: { gameId, revisionId },
      availableAt: new Date('2099-01-01T00:00:00.000Z'),
    },
  });
  return { reviewerTeamId, teamMatchId, gameId, revisionId, submittedOutboxId, reminderOutboxId };
}

async function ac6ReassignmentObservation(fixture: {
  teamMatchId: string;
  revisionId: string;
}): Promise<{
  escalationId: string;
  deliveries: Array<{ recipientUserId: string; count: number }>;
}> {
  const [escalation, deliveries] = await Promise.all([
    prisma.v1ResultEscalation.findUniqueOrThrow({
      where: { resultRevisionId_kind: { resultRevisionId: fixture.revisionId, kind: 'ESCALATION' } },
      select: { id: true },
    }),
    prisma.v1Notification.groupBy({
      by: ['recipientUserId'],
      where: {
        recipientUserId: { in: [ids.supportUser, ids.opponentUser] },
        targetType: 'team_match',
        targetId: fixture.teamMatchId,
      },
      _count: { _all: true },
      orderBy: { recipientUserId: 'asc' },
    }),
  ]);
  return {
    escalationId: escalation.id,
    deliveries: deliveries.map((delivery) => ({
      recipientUserId: delivery.recipientUserId,
      count: delivery._count._all,
    })),
  };
}

async function assertR7FixturePreconditions(requiredDocumentIds: readonly string[]): Promise<void> {
  const [revision, users, staffAssignment, platformOps, rows, terms] = await Promise.all([
    prisma.v1GameResultRevision.findUniqueOrThrow({
      where: { id: ids.tournamentRevision },
      select: {
        id: true,
        gameId: true,
        game: {
          select: {
            id: true,
            sourceType: true,
            tournamentFixture: {
              select: {
                id: true,
                tournamentId: true,
                tournament: { select: { id: true } },
              },
            },
          },
        },
      },
    }),
    prisma.v1User.findMany({
      where: { id: { in: [ids.supportUser, ids.opsUser] } },
      orderBy: { id: 'asc' },
      select: { id: true, accountStatus: true, onboardingStatus: true, phoneVerifiedAt: true },
    }),
    prisma.v1TournamentStaffAssignment.findUniqueOrThrow({
      where: { id: ids.lane4DirectorAssignment },
      select: { tournamentId: true, userId: true, role: true, revokedAt: true, expiresAt: true },
    }),
    prisma.v1AdminUser.findUniqueOrThrow({
      where: { userId: ids.opsUser },
      select: { adminRole: true, status: true, revokedAt: true },
    }),
    prisma.v1ResultEscalation.findMany({
      where: { resultRevisionId: ids.tournamentRevision },
      orderBy: { kind: 'asc' },
      select: { kind: true, status: true, version: true, dueAt: true },
    }),
    prisma.v1ManagedTermsConsentEvent.findMany({
      where: {
        userId: { in: [ids.supportUser, ids.opsUser] },
        context: 'signup',
        documentId: { in: [...requiredDocumentIds] },
        decision: 'accepted',
      },
      select: { userId: true, documentId: true, decision: true },
    }),
  ]);
  const databaseNow = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT CURRENT_TIMESTAMP AS now`;
  const now = databaseNow[0]?.now;
  if (now === undefined) {
    throw new Error('Task 9 R7 prerequisite assertion requires database CURRENT_TIMESTAMP');
  }

  expect(requiredDocumentIds.length).toBeGreaterThan(0);
  expect(revision).toEqual({
    id: ids.tournamentRevision,
    gameId: ids.tournamentGame,
    game: {
      id: ids.tournamentGame,
      sourceType: 'TOURNAMENT_FIXTURE',
      tournamentFixture: {
        id: ids.sourceFixture,
        tournamentId: ids.tournament,
        tournament: { id: ids.tournament },
      },
    },
  });
  expect(users).toEqual([
    {
      id: ids.supportUser,
      accountStatus: 'active',
      onboardingStatus: 'completed',
      phoneVerifiedAt: expect.any(Date),
    },
    {
      id: ids.opsUser,
      accountStatus: 'active',
      onboardingStatus: 'completed',
      phoneVerifiedAt: expect.any(Date),
    },
  ]);
  expect(staffAssignment).toEqual({
    tournamentId: ids.tournament,
    userId: ids.supportUser,
    role: 'TOURNAMENT_DIRECTOR',
    revokedAt: null,
    expiresAt: null,
  });
  expect(platformOps).toEqual({ adminRole: 'ops', status: 'active', revokedAt: null });
  expect(rows).toHaveLength(2);
  expect(rows).toEqual([
    { kind: 'ESCALATION', status: 'PENDING', version: 0, dueAt: expect.any(Date) },
    { kind: 'REMINDER', status: 'PENDING', version: 0, dueAt: expect.any(Date) },
  ]);
  expect(rows.every((row) => row.dueAt <= now)).toBe(true);
  expect(terms).toHaveLength(requiredDocumentIds.length * 2);
}

async function escalationMutationSnapshot(escalationIds: readonly string[]) {
  const [rows, auditCount, idempotencyCount] = await Promise.all([
    prisma.v1ResultEscalation.findMany({
      where: { id: { in: [...escalationIds] } },
      orderBy: { kind: 'asc' },
      select: { id: true, status: true, version: true, ackByUserId: true, resolvedByUserId: true, reason: true },
    }),
    prisma.v1OperationAudit.count({
      where: { resourceType: 'RESULT_ESCALATION', resourceId: { in: [...escalationIds] } },
    }),
    prisma.v1IdempotencyRecord.count({
      where: { resourceType: 'RESULT_ESCALATION', resourceId: { in: [...escalationIds] } },
    }),
  ]);
  return { rows, auditCount, idempotencyCount };
}

async function seedDiagnosticWatermarks(): Promise<void> {
  await Promise.all([
    prisma.v1ProjectionWatermark.upsert({
      where: {
        projection_entityType_entityId: {
          projection: 'TASK9_DIAGNOSTIC_PENDING',
          entityType: 'TEAM',
          entityId: ids.hostTeam,
        },
      },
      create: {
        projection: 'TASK9_DIAGNOSTIC_PENDING',
        entityType: 'TEAM',
        entityId: ids.hostTeam,
        revisionId: ids.revision,
        sourceHash: 'pending-observable',
        status: 'PENDING',
      },
      update: { status: 'PENDING', revisionId: ids.revision, sourceHash: 'pending-observable' },
    }),
    prisma.v1ProjectionWatermark.upsert({
      where: {
        projection_entityType_entityId: {
          projection: 'TASK9_DIAGNOSTIC_FAILED',
          entityType: 'TEAM',
          entityId: ids.hostTeam,
        },
      },
      create: {
        projection: 'TASK9_DIAGNOSTIC_FAILED',
        entityType: 'TEAM',
        entityId: ids.hostTeam,
        revisionId: ids.revision,
        sourceHash: 'failed-observable',
        status: 'FAILED',
      },
      update: { status: 'FAILED', revisionId: ids.revision, sourceHash: 'failed-observable' },
    }),
  ]);
}

type FutureFactTable = 'v1_game_official_facts' | 'v1_team_record_facts';

async function futureFactCount(table: FutureFactTable, revisionId: string): Promise<number> {
  const tableExists = await futureTableExists(table);
  if (!tableExists) return 0;
  const rows = table === 'v1_game_official_facts'
    ? await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM v1_game_official_facts
        WHERE revision_id = ${revisionId}
      `
    : await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM v1_team_record_facts
        WHERE revision_id = ${revisionId}
      `;
  return Number(rows[0]?.count ?? 0n);
}

async function bracketEdgeCount(sourceFixtureId: string): Promise<number> {
  if (!(await futureTableExists('v1_tournament_fixture_advancement_edges'))) return 0;
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM v1_tournament_fixture_advancement_edges
    WHERE source_fixture_id = ${sourceFixtureId}
  `;
  return Number(rows[0]?.count ?? 0n);
}

async function bracketProjectionSnapshot(): Promise<{
  winnerTarget: { homeRegistrationId: string | null; awayRegistrationId: string | null };
  loserTarget: { homeRegistrationId: string | null; awayRegistrationId: string | null };
}> {
  const fixtures = await prisma.v1TournamentFixture.findMany({
    where: { id: { in: [ids.targetFixture, ids.loserTargetFixture] } },
    orderBy: { id: 'asc' },
    select: { id: true, homeRegistrationId: true, awayRegistrationId: true },
  });
  const winnerTarget = fixtures.find(({ id }) => id === ids.targetFixture);
  const loserTarget = fixtures.find(({ id }) => id === ids.loserTargetFixture);
  if (!winnerTarget || !loserTarget) {
    throw new Error('Task 9 Lane 3 target fixtures are required');
  }
  return {
    winnerTarget: {
      homeRegistrationId: winnerTarget.homeRegistrationId,
      awayRegistrationId: winnerTarget.awayRegistrationId,
    },
    loserTarget: {
      homeRegistrationId: loserTarget.homeRegistrationId,
      awayRegistrationId: loserTarget.awayRegistrationId,
    },
  };
}

type BracketEdgeInput = {
  tournamentId: string;
  sourceFixtureId: string;
  sourceOutcome: 'WINNER' | 'LOSER';
  targetFixtureId: string;
  targetSide: 'HOME' | 'AWAY';
};

async function insertBracketEdges(edges: readonly BracketEdgeInput[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    for (const edge of edges) {
      await tx.$executeRaw`
        INSERT INTO v1_tournament_fixture_advancement_edges (
          id,
          tournament_id,
          source_fixture_id,
          source_outcome,
          target_fixture_id,
          target_side,
          created_at
        ) VALUES (
          ${randomUUID()},
          ${edge.tournamentId},
          ${edge.sourceFixtureId},
          ${edge.sourceOutcome}::"V1FixtureAdvancementOutcome",
          ${edge.targetFixtureId},
          ${edge.targetSide}::"V1FixtureTargetSide",
          CURRENT_TIMESTAMP
        )
      `;
    }
  });
}

async function insertBracketOfficialDeliveries(idsToInsert: readonly string[], attempts = 0): Promise<void> {
  await prisma.v1OutboxEvent.createMany({
    data: idsToInsert.map((id, index) => ({
      id,
      businessKey: `${prefix}:bracket-delivery:${id}`,
      aggregateType: 'GAME',
      aggregateId: ids.tournamentGame,
      revisionId: ids.tournamentRevision,
      type: 'GAME_RESULT_OFFICIAL',
      payload: { revisionId: ids.tournamentRevision, deliveredSequence: index + 2 },
      attempts,
      availableAt: new Date('2000-01-01T00:00:00.000Z'),
    })),
  });
}

async function tournamentStandingSnapshot(): Promise<Array<{
  groupId: string;
  registrationId: string;
  wins: number;
  draws: number;
  losses: number;
  points: number;
}>> {
  return prisma.v1TournamentStanding.findMany({
    where: { group: { tournamentId: ids.tournament } },
    orderBy: [{ groupId: 'asc' }, { registrationId: 'asc' }],
    select: {
      groupId: true,
      registrationId: true,
      wins: true,
      draws: true,
      losses: true,
      points: true,
    },
  });
}

async function capturePrismaFailure(
  operation: () => Promise<unknown>,
): Promise<{ code: string; databaseCode: string | null }> {
  try {
    await operation();
    return { code: 'MISLEADING_SUCCESS', databaseCode: null };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        code: error.code,
        databaseCode:
          error.meta !== undefined && typeof error.meta.code === 'string'
            ? error.meta.code
            : null,
      };
    }
    throw error;
  }
}

async function futureTableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS exists
  `;
  return rows[0]?.exists === true;
}

type PublicCacheSnapshot = {
  tableExists: boolean;
  rows: Array<{
    revisionId: string;
    gameId: string;
    tournamentId: string | null;
    revision: number;
    visibility: string;
    isCurrent: boolean;
    sourceHash: string;
    payloadHash: string;
    canonicalPayload: Prisma.JsonValue;
    cachedAt: Date;
    updatedAt: Date;
  }>;
  currentCount: number;
};

async function publicCacheSnapshot(gameId: string): Promise<PublicCacheSnapshot> {
  if (!(await futureTableExists('v1_game_official_result_cache'))) {
    return { tableExists: false, rows: [], currentCount: 0 };
  }
  const rows = await prisma.$queryRaw<PublicCacheSnapshot['rows']>`
    SELECT
      revision_id AS "revisionId",
      game_id AS "gameId",
      tournament_id AS "tournamentId",
      revision,
      visibility_mode::text AS visibility,
      is_current AS "isCurrent",
      source_hash AS "sourceHash",
      payload_hash AS "payloadHash",
      canonical_payload AS "canonicalPayload",
      cached_at AS "cachedAt",
      updated_at AS "updatedAt"
    FROM v1_game_official_result_cache
    WHERE game_id = ${gameId}
    ORDER BY revision ASC
  `;
  return {
    tableExists: true,
    rows,
    currentCount: rows.filter(({ isCurrent }) => isCurrent).length,
  };
}

async function ensureInjectedCacheMismatch(gameId: string, revisionId: string): Promise<void> {
  if (!(await futureTableExists('v1_game_official_result_cache'))) return;
  await prisma.$executeRaw`
    UPDATE v1_game_official_result_cache
    SET canonical_payload = '{"corrupt":true}'::jsonb,
        payload_hash = ${'0'.repeat(64)},
        source_hash = 'corrupt-source-hash',
        visibility_mode = 'LIVE'::"V1VisibilityMode",
        updated_at = CURRENT_TIMESTAMP
    WHERE game_id = ${gameId}
      AND revision_id = ${revisionId}
  `;
}

async function projectionTransactionSnapshot(revisionId: string): Promise<{
  officialFacts: number;
  teamFacts: number;
  repairAudits: number;
  watermarks: Array<{ projection: string; entityType: string; entityId: string; sourceHash: string; status: string }>;
  publicCache: PublicCacheSnapshot;
}> {
  const revision = await prisma.v1GameResultRevision.findUniqueOrThrow({
    where: { id: revisionId },
    select: { gameId: true },
  });
  const [officialFacts, teamFacts, repairAudits, watermarks, publicCache] = await Promise.all([
    futureFactCount('v1_game_official_facts', revisionId),
    futureFactCount('v1_team_record_facts', revisionId),
    prisma.v1OperationAudit.count({
      where: { resourceId: revisionId, action: 'GAME_PROJECTION_REPAIRED' },
    }),
    prisma.v1ProjectionWatermark.findMany({
      where: { revisionId },
      orderBy: [{ projection: 'asc' }, { entityType: 'asc' }, { entityId: 'asc' }],
      select: {
        projection: true,
        entityType: true,
        entityId: true,
        sourceHash: true,
        status: true,
      },
    }),
    publicCacheSnapshot(revision.gameId),
  ]);
  return { officialFacts, teamFacts, repairAudits, watermarks, publicCache };
}

async function isolateLane4Outbox(outboxEventIds: readonly string[]): Promise<void> {
  await prisma.v1OutboxEvent.updateMany({
    where: {
      id: { in: [...outboxEventIds] },
      status: { in: ['PENDING', 'RETRY', 'PROCESSING'] },
    },
    data: {
      status: 'COMPLETED',
      leaseOwner: null,
      leaseUntil: null,
      availableAt: new Date('2099-01-01T00:00:00.000Z'),
      version: { increment: 1 },
    },
  });
}
