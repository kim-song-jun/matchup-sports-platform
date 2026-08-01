import { randomUUID } from 'node:crypto';
import { OperationAuditWriterService } from '../../src/common/audit/operation-audit-writer.service';
import { GamesService } from '../../src/games/games.service';
import {
  GAME_OPERATION_RETRY_DELAYS_MS,
  V1GameOperationsWorkerService,
} from '../../src/jobs/v1-game-operations-worker.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { FOOTBALL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config';

const prisma = new PrismaService();
const games = new GamesService(prisma, new OperationAuditWriterService());
const runId = randomUUID();
const prefix = `task9:${runId}`;
let tournamentOutboxId = '';

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
  tournamentGame: '79000000-0000-4000-8000-000000000047',
  tournamentHomeSide: '79000000-0000-4000-8000-000000000048',
  tournamentAwaySide: '79000000-0000-4000-8000-000000000049',
  tournamentRevision: '79000000-0000-4000-8000-00000000004a',
  terminalSupersededRevision: '79000000-0000-4000-8000-00000000004b',
  terminalApprovedRevision: '79000000-0000-4000-8000-00000000004c',
  terminalChangeRequestedRevision: '79000000-0000-4000-8000-00000000004d',
  terminalCancelledRevision: '79000000-0000-4000-8000-00000000004e',
} as const;

type OfficialProjectionRuntime = {
  projectOfficialResult(input: { outboxEventId: string; deliveredSequence: number }): Promise<unknown>;
  reconcileOfficialResult(input: {
    revisionId: string;
    expectedCount: number;
    expectedHash: string;
    actorUserId: string;
    reason: string;
    failBeforeWatermark?: boolean;
  }): Promise<{ mismatchDetected: boolean; repaired: boolean }>;
  getTeamRecordTotals(input: {
    teamId: string;
    utcYear: number;
    tournamentId?: string;
  }): Promise<{
    calendarYear: { played: number; won: number; drawn: number; lost: number };
    tournament: { played: number; won: number; drawn: number; lost: number } | null;
    lifetime: { played: number; won: number; drawn: number; lost: number };
  }>;
  getProjectionHealth(input: { entityType: string; entityId: string }): Promise<{
    visibleStatuses: string[];
    currentStatuses: string[];
  }>;
  configureBracketEdges(input: {
    actorUserId: string;
    edges: Array<{
      sourceFixtureId: string;
      outcome: 'WINNER' | 'LOSER';
      targetFixtureId: string;
      targetSide: 'HOME' | 'AWAY';
    }>;
  }): Promise<unknown>;
  setVisibilityMode(input: {
    gameId: string;
    mode: 'HIDDEN' | 'OFFICIAL_ONLY';
    actorUserId: string;
    expectedVersion: number;
  }): Promise<unknown>;
  getPublicProjection(input: { gameId: string }): Promise<{
    lineup: unknown | null;
    events: unknown[];
    pendingResult: unknown | null;
    officialResult: { revisionId: string } | null;
    records: { revisionId: string } | null;
  }>;
};

type EscalationRuntime = {
  materializeDue(now: Date): Promise<{ reminders: number; escalations: number }>;
  closeForRevision(revisionId: string, reason: string): Promise<unknown>;
  list(input: { actorUserId: string; status?: string }): Promise<{ items: Array<{ id: string }> }>;
  detail(input: { escalationId: string; actorUserId: string }): Promise<{ id: string; resultRevisionId: string }>;
  acknowledge(input: { escalationId: string; actorUserId: string; expectedVersion: number; reason: string }): Promise<unknown>;
  resolve(input: { escalationId: string; actorUserId: string; expectedVersion: number; reason: string }): Promise<unknown>;
};

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

  describe.skip('Task 9 future GREEN contracts (activate when each lane runtime exists)', () => {
    it('[RED] duplicate and reordered deliveries keep one immutable fact while UTC-year, tournament, and lifetime totals exclude pending/error state', async () => {
      const runtime = loadTask9Runtime<OfficialProjectionRuntime>(
        '../../src/games/projections/game-projection.service',
        'GameProjectionService',
      );
      if (runtime.projectOfficialResult) {
        await runtime.projectOfficialResult({ outboxEventId: officialOutboxId, deliveredSequence: 2 });
        await runtime.projectOfficialResult({ outboxEventId: officialOutboxId, deliveredSequence: 2 });
        await runtime.projectOfficialResult({ outboxEventId: officialOutboxId, deliveredSequence: 1 });
      }

      const initialWatermarks = await prisma.v1ProjectionWatermark.findMany({
        where: { projection: 'TEAM_RECORD', entityType: 'TEAM', entityId: ids.hostTeam },
      });
      await seedDiagnosticWatermarks();
      if (runtime.projectOfficialResult) {
        await runtime.projectOfficialResult({ outboxEventId: tournamentOutboxId, deliveredSequence: 1 });
        await runtime.projectOfficialResult({ outboxEventId: tournamentOutboxId, deliveredSequence: 1 });
      }
      const totals = runtime.getTeamRecordTotals
        ? await runtime.getTeamRecordTotals({ teamId: ids.hostTeam, utcYear: 2026, tournamentId: ids.tournament })
        : null;
      const health = runtime.getProjectionHealth
        ? await runtime.getProjectionHealth({ entityType: 'TEAM', entityId: ids.hostTeam })
        : null;
      const [teamMatchFacts, tournamentFacts, teamRecordFacts] = await Promise.all([
        futureFactCount('v1_game_official_facts', ids.revision),
        futureFactCount('v1_game_official_facts', ids.tournamentRevision),
        futureFactCount('v1_team_record_facts', ids.revision),
      ]);

      expect({
        projectionRuntimeAvailable: typeof runtime.projectOfficialResult === 'function',
        initialWatermarkCount: initialWatermarks.length,
        initialWatermarkRevisionId: initialWatermarks[0]?.revisionId ?? null,
        initialWatermarkStatus: initialWatermarks[0]?.status ?? null,
        teamMatchFacts,
        tournamentFacts,
        teamRecordFacts,
        totals,
        health,
      }).toEqual({
        projectionRuntimeAvailable: true,
        initialWatermarkCount: 1,
        initialWatermarkRevisionId: ids.revision,
        initialWatermarkStatus: 'APPLIED',
        teamMatchFacts: 1,
        tournamentFacts: 1,
        teamRecordFacts: 2,
        totals: {
          calendarYear: { played: 2, won: 2, drawn: 0, lost: 0 },
          tournament: { played: 1, won: 1, drawn: 0, lost: 0 },
          lifetime: { played: 2, won: 2, drawn: 0, lost: 0 },
        },
        health: {
          visibleStatuses: ['APPLIED', 'FAILED', 'PENDING'],
          currentStatuses: ['APPLIED'],
        },
      });
    });

    it('[RED] malformed official payload and sequence are rejected without a projection write', async () => {
      const runtime = loadTask9Runtime<OfficialProjectionRuntime>(
        '../../src/games/projections/game-projection.service',
        'GameProjectionService',
      );
      const failure = runtime.projectOfficialResult
        ? await captureBusinessFailure(() =>
            runtime.projectOfficialResult!({ outboxEventId: '', deliveredSequence: 0 }),
          )
        : { code: 'PROJECTION_RUNTIME_MISSING' };
      const invalidWrites = await prisma.v1ProjectionWatermark.count({
        where: { revisionId: { in: ['', 'invalid'] } },
      });
      expect({ failure, invalidWrites }).toEqual({
        failure: { code: 'PROJECTION_EVENT_INVALID' },
        invalidWrites: 0,
      });
    });

    it('[RED] Task 9A creates a same-revision team fact but neither personal nor pending-identity projection rows', async () => {
      const runtime = loadTask9Runtime<OfficialProjectionRuntime>(
        '../../src/games/projections/game-projection.service',
        'GameProjectionService',
      );
      if (runtime.projectOfficialResult) {
        await runtime.projectOfficialResult({ outboxEventId: officialOutboxId, deliveredSequence: 3 });
      }
      const [teamFacts, linkedPersonal, guestPersonal, pendingIdentity] = await Promise.all([
        futureFactCount('v1_team_record_facts', ids.revision),
        prisma.v1ProjectionWatermark.count({
          where: { projection: 'USER_RECORD', entityType: 'USER', entityId: ids.linkedUser },
        }),
        prisma.v1ProjectionWatermark.count({
          where: { projection: 'USER_RECORD', entityType: 'PARTICIPANT', entityId: ids.guestParticipant },
        }),
        prisma.v1ProjectionWatermark.count({
          where: { projection: 'PENDING_IDENTITY', revisionId: ids.revision },
        }),
      ]);

      expect({
        projectionRuntimeAvailable: typeof runtime.projectOfficialResult === 'function',
        teamFacts,
        linkedPersonal,
        guestPersonal,
        pendingIdentity,
      }).toEqual({
        projectionRuntimeAvailable: true,
        teamFacts: 2,
        linkedPersonal: 0,
        guestPersonal: 0,
        pendingIdentity: 0,
      });
    });

    it('[RED] normalized WINNER/LOSER edges advance one locked target side and reject duplicate-side and cross-tournament conflicts', async () => {
      const runtime = loadTask9Runtime<OfficialProjectionRuntime>(
        '../../src/games/projections/game-projection.service',
        'GameProjectionService',
      );
      if (runtime.configureBracketEdges) {
        await runtime.configureBracketEdges({
          actorUserId: ids.opsUser,
          edges: [
            {
              sourceFixtureId: ids.sourceFixture,
              outcome: 'WINNER',
              targetFixtureId: ids.targetFixture,
              targetSide: 'HOME',
            },
            {
              sourceFixtureId: ids.sourceFixture,
              outcome: 'LOSER',
              targetFixtureId: ids.targetFixture,
              targetSide: 'AWAY',
            },
          ],
        });
      }
      if (runtime.projectOfficialResult) {
        await Promise.all([
          runtime.projectOfficialResult({ outboxEventId: tournamentOutboxId, deliveredSequence: 2 }),
          runtime.projectOfficialResult({ outboxEventId: tournamentOutboxId, deliveredSequence: 2 }),
        ]);
      }
      const advanced = await prisma.v1TournamentFixture.findUniqueOrThrow({ where: { id: ids.targetFixture } });
      const duplicateSide = runtime.configureBracketEdges
        ? await captureBusinessFailure(() =>
            runtime.configureBracketEdges!({
              actorUserId: ids.opsUser,
              edges: [{
                sourceFixtureId: ids.sourceFixture,
                outcome: 'LOSER',
                targetFixtureId: ids.targetFixture,
                targetSide: 'HOME',
              }],
            }),
          )
        : { code: 'BRACKET_RUNTIME_MISSING' };
      const crossTournament = runtime.configureBracketEdges
        ? await captureBusinessFailure(() =>
            runtime.configureBracketEdges!({
              actorUserId: ids.opsUser,
              edges: [{
                sourceFixtureId: ids.sourceFixture,
                outcome: 'WINNER',
                targetFixtureId: ids.otherTournamentFixture,
                targetSide: 'HOME',
              }],
            }),
          )
        : { code: 'BRACKET_RUNTIME_MISSING' };
      const afterConflicts = await prisma.v1TournamentFixture.findUniqueOrThrow({ where: { id: ids.targetFixture } });
      const edgeCount = await bracketEdgeCount(ids.sourceFixture);

      expect({
        bracketRuntimeAvailable: typeof runtime.configureBracketEdges === 'function',
        projectionRuntimeAvailable: typeof runtime.projectOfficialResult === 'function',
        edgeCount,
        advanced: {
          homeRegistrationId: advanced.homeRegistrationId,
          awayRegistrationId: advanced.awayRegistrationId,
        },
        duplicateSide,
        crossTournament,
        afterConflicts: {
          homeRegistrationId: afterConflicts.homeRegistrationId,
          awayRegistrationId: afterConflicts.awayRegistrationId,
        },
      }).toEqual({
        bracketRuntimeAvailable: true,
        projectionRuntimeAvailable: true,
        edgeCount: 2,
        advanced: {
          homeRegistrationId: ids.hostRegistration,
          awayRegistrationId: ids.opponentRegistration,
        },
        duplicateSide: { code: 'BRACKET_TARGET_SIDE_CONFLICT' },
        crossTournament: { code: 'BRACKET_CROSS_TOURNAMENT' },
        afterConflicts: {
          homeRegistrationId: ids.hostRegistration,
          awayRegistrationId: ids.opponentRegistration,
        },
      });
    });

    it('[RED] persisted HIDDEN denies every public field while OFFICIAL_ONLY exposes only official result and records', async () => {
      const runtime = loadTask9Runtime<OfficialProjectionRuntime>(
        '../../src/games/projections/game-projection.service',
        'GameProjectionService',
      );
      if (runtime.setVisibilityMode) {
        await runtime.setVisibilityMode({ gameId: ids.game, mode: 'HIDDEN', actorUserId: ids.opsUser, expectedVersion: 0 });
      }
      const hiddenMode = await persistedVisibilityMode(ids.game);
      const hidden = runtime.getPublicProjection ? await runtime.getPublicProjection({ gameId: ids.game }) : null;
      if (runtime.setVisibilityMode) {
        await runtime.setVisibilityMode({
          gameId: ids.game,
          mode: 'OFFICIAL_ONLY',
          actorUserId: ids.opsUser,
          expectedVersion: 1,
        });
      }
      const officialOnlyMode = await persistedVisibilityMode(ids.game);
      const officialOnly = runtime.getPublicProjection ? await runtime.getPublicProjection({ gameId: ids.game }) : null;

      expect({
        visibilityRuntimeAvailable:
          typeof runtime.setVisibilityMode === 'function' && typeof runtime.getPublicProjection === 'function',
        hiddenMode,
        hidden,
        officialOnlyMode,
        officialOnly,
      }).toEqual({
        visibilityRuntimeAvailable: true,
        hiddenMode: 'HIDDEN',
        hidden: { lineup: null, events: [], pendingResult: null, officialResult: null, records: null },
        officialOnlyMode: 'OFFICIAL_ONLY',
        officialOnly: {
          lineup: null,
          events: [],
          pendingResult: null,
          officialResult: { revisionId: ids.revision },
          records: { revisionId: ids.revision },
        },
      });
    });

    it('[RED] reconciliation detects an injected count/hash mismatch and audited repair converges', async () => {
      await prisma.v1ProjectionWatermark.updateMany({
        where: { projection: 'TEAM_RECORD', entityType: 'TEAM', entityId: ids.hostTeam },
        data: { revisionId: ids.revision, sourceHash: 'injected-mismatch', status: 'FAILED' },
      });
      const runtime = loadTask9Runtime<OfficialProjectionRuntime>(
        '../../src/games/projections/game-projection.service',
        'GameProjectionService',
      );
      const reconciliationResult = runtime.reconcileOfficialResult
        ? await runtime.reconcileOfficialResult({
            revisionId: ids.revision,
            expectedCount: 2,
            expectedHash: 'official-source-hash',
            actorUserId: ids.opsUser,
            reason: 'Task 9 injected mismatch repair',
          })
        : { contractUnavailable: true };
      const repaired = await prisma.v1ProjectionWatermark.findFirst({
        where: { projection: 'TEAM_RECORD', entityType: 'TEAM', entityId: ids.hostTeam },
      });
      const repairAudits = await prisma.v1OperationAudit.count({
        where: { resourceId: ids.revision, action: 'GAME_PROJECTION_REPAIRED' },
      });

      expect({ reconciliationResult, repairedStatus: repaired?.status ?? null, repairAudits }).toEqual({
        reconciliationResult: { mismatchDetected: true, repaired: true },
        repairedStatus: 'APPLIED',
        repairAudits: 1,
      });
    });

    it('[RED] injected pre-watermark reconciliation failure rolls back fact, aggregate, audit, and watermark together', async () => {
      const runtime = loadTask9Runtime<OfficialProjectionRuntime>(
        '../../src/games/projections/game-projection.service',
        'GameProjectionService',
      );
      const before = await projectionTransactionSnapshot(ids.revision);
      const failure = runtime.reconcileOfficialResult
        ? await captureBusinessFailure(() => runtime.reconcileOfficialResult!({
            revisionId: ids.revision,
            expectedCount: 2,
            expectedHash: 'rollback-injected-hash',
            actorUserId: ids.opsUser,
            reason: 'Task 9 watermark-last rollback probe',
            failBeforeWatermark: true,
          }))
        : { code: 'PROJECTION_RUNTIME_MISSING' };
      const after = await projectionTransactionSnapshot(ids.revision);

      expect({ failure, before, after }).toEqual({
        failure: { code: 'PROJECTION_REPAIR_INJECTED_FAILURE' },
        before,
        after: before,
      });
    });

    it('[RED] frozen +23:59/+24h/+47:59/+48h boundaries materialize exactly one reminder and escalation', async () => {
      const submittedAt = new Date('2026-08-01T00:00:00.000Z');
      await prisma.$executeRaw`
        UPDATE v1_game_result_revisions
        SET state = 'SUBMITTED', submitted_at = ${submittedAt}, official_at = NULL
        WHERE id = ${ids.slaRevision}
      `;
      await prisma.v1ResultEscalation.deleteMany({ where: { resultRevisionId: ids.slaRevision } });

      const runtime = loadTask9Runtime<EscalationRuntime>(
        '../../src/jobs/result-escalation/result-escalation.service',
        'ResultEscalationService',
      );
      if (runtime.materializeDue) await runtime.materializeDue(new Date('2026-08-01T23:59:00.000Z'));
      expect(await escalationCounts(ids.slaRevision)).toEqual({ reminders: 0, escalations: 0 });
      if (runtime.materializeDue) await runtime.materializeDue(new Date('2026-08-02T00:00:00.000Z'));
      if (runtime.materializeDue) await runtime.materializeDue(new Date('2026-08-02T23:59:00.000Z'));
      expect(await escalationCounts(ids.slaRevision)).toEqual({ reminders: 1, escalations: 0 });
      if (runtime.materializeDue) await runtime.materializeDue(new Date('2026-08-03T00:00:00.000Z'));
      if (runtime.materializeDue) await runtime.materializeDue(new Date('2026-08-03T00:00:00.000Z'));
      expect({
        materializeRuntimeAvailable: typeof runtime.materializeDue === 'function',
        counts: await escalationCounts(ids.slaRevision),
      }).toEqual({ materializeRuntimeAvailable: true, counts: { reminders: 1, escalations: 1 } });
    });

    it('[RED] superseded, approved, change-requested, and cancelled revisions independently close prior SLA jobs', async () => {
      const cases = [
        { revisionId: ids.terminalSupersededRevision, reason: 'superseded' },
        { revisionId: ids.terminalApprovedRevision, reason: 'approved' },
        { revisionId: ids.terminalChangeRequestedRevision, reason: 'change_requested' },
        { revisionId: ids.terminalCancelledRevision, reason: 'cancelled' },
      ];
      const runtime = loadTask9Runtime<EscalationRuntime>(
        '../../src/jobs/result-escalation/result-escalation.service',
        'ResultEscalationService',
      );
      const results: Array<{ revisionId: string; reason: string; open: number; closedReasons: string[] }> = [];
      for (const terminal of cases) {
        await seedEscalationRows(terminal.revisionId);
        if (runtime.closeForRevision) await runtime.closeForRevision(terminal.revisionId, terminal.reason);
        const rows = await prisma.v1ResultEscalation.findMany({
          where: { resultRevisionId: terminal.revisionId },
          orderBy: { kind: 'asc' },
        });
        results.push({
          revisionId: terminal.revisionId,
          reason: terminal.reason,
          open: rows.filter((row) => row.status === 'PENDING' || row.status === 'ACKNOWLEDGED').length,
          closedReasons: rows.map((row) => row.reason ?? ''),
        });
      }

      expect({ closeRuntimeAvailable: typeof runtime.closeForRevision === 'function', results }).toEqual({
        closeRuntimeAvailable: true,
        results: cases.map((terminal) => ({
          ...terminal,
          open: 0,
          closedReasons: [terminal.reason, terminal.reason],
        })),
      });
    });

    it('[RED] escalation list/detail/ack/resolve enforces role, validation, version, and audit lifecycle', async () => {
      await seedEscalationRows(ids.slaRevision);
      await prisma.v1ResultEscalation.updateMany({
        where: { resultRevisionId: ids.slaRevision, kind: 'REMINDER' },
        data: { status: 'RESOLVED', resolvedByUserId: ids.opsUser, reason: 'reminder-complete' },
      });
      const row = await prisma.v1ResultEscalation.findFirstOrThrow({
        where: { resultRevisionId: ids.slaRevision, kind: 'ESCALATION' },
      });
      await prisma.v1ResultEscalation.update({
        where: { id: row.id },
        data: { status: 'PENDING', ackByUserId: null, resolvedByUserId: null, reason: null },
      });
      const runtime = loadTask9Runtime<EscalationRuntime>(
        '../../src/jobs/result-escalation/result-escalation.service',
        'ResultEscalationService',
      );
      const list = runtime.list
        ? await runtime.list({ actorUserId: ids.supportUser, status: 'PENDING' })
        : { contractUnavailable: true };
      const detail = runtime.detail
        ? await runtime.detail({ escalationId: row.id, actorUserId: ids.supportUser })
        : { contractUnavailable: true };
      const denied = runtime.detail
        ? await captureBusinessFailure(() => runtime.detail!({ escalationId: row.id, actorUserId: ids.linkedUser }))
        : { code: 'ESCALATION_RUNTIME_MISSING' };
      if (runtime.acknowledge) {
        await runtime.acknowledge({
          escalationId: row.id,
          actorUserId: ids.supportUser,
          expectedVersion: 0,
          reason: 'triaged',
        });
      }
      const afterAck = await prisma.v1ResultEscalation.findUniqueOrThrow({ where: { id: row.id } });
      if (runtime.resolve) {
        await runtime.resolve({
          escalationId: row.id,
          actorUserId: ids.opsUser,
          expectedVersion: 1,
          reason: 'repaired',
        });
      }
      const afterResolve = await prisma.v1ResultEscalation.findUniqueOrThrow({ where: { id: row.id } });
      const audits = await prisma.v1OperationAudit.count({
        where: {
          resourceId: row.id,
          action: { in: ['RESULT_ESCALATION_ACKNOWLEDGED', 'RESULT_ESCALATION_RESOLVED'] },
        },
      });

      expect({
        listIds: 'items' in list ? list.items.map((item) => item.id) : [],
        detail: 'id' in detail ? { id: detail.id, resultRevisionId: detail.resultRevisionId } : null,
        denied,
        ackRuntimeAvailable: typeof runtime.acknowledge === 'function',
        afterAck: { status: afterAck.status, ackByUserId: afterAck.ackByUserId },
        resolveRuntimeAvailable: typeof runtime.resolve === 'function',
        afterResolve: { status: afterResolve.status, resolvedByUserId: afterResolve.resolvedByUserId },
        audits,
      }).toEqual({
        listIds: [row.id],
        detail: { id: row.id, resultRevisionId: ids.slaRevision },
        denied: { code: 'ESCALATION_FORBIDDEN' },
        ackRuntimeAvailable: true,
        afterAck: { status: 'ACKNOWLEDGED', ackByUserId: ids.supportUser },
        resolveRuntimeAvailable: true,
        afterResolve: { status: 'RESOLVED', resolvedByUserId: ids.opsUser },
        audits: 2,
      });
      const staleVersion = runtime.acknowledge
        ? await captureBusinessFailure(() => runtime.acknowledge!({
            escalationId: row.id,
            actorUserId: ids.supportUser,
            expectedVersion: 0,
            reason: 'stale replay',
          }))
        : { code: 'ESCALATION_RUNTIME_MISSING' };
      const malformedStatus = runtime.list
        ? await captureBusinessFailure(() =>
            runtime.list!({ actorUserId: ids.supportUser, status: 'NOT_A_STATUS' }),
          )
        : { code: 'ESCALATION_RUNTIME_MISSING' };
      expect({ staleVersion, malformedStatus }).toEqual({
        staleVersion: { code: 'ESCALATION_VERSION_CONFLICT' },
        malformedStatus: { code: 'ESCALATION_STATUS_INVALID' },
      });
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
}

function authUser(id: string) {
  return { id, email: `${id}@example.test`, accountStatus: 'active' as const, onboardingStatus: 'completed' as const };
}

function auditWorker(): V1GameOperationsWorkerService {
  const worker = new V1GameOperationsWorkerService(prisma);
  worker.registerDurableAuditHandler('TASK9_PIN_WORKER');
  return worker;
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

async function escalationCounts(revisionId: string): Promise<{ reminders: number; escalations: number }> {
  const [reminders, escalationCount] = await Promise.all([
    prisma.v1ResultEscalation.count({ where: { resultRevisionId: revisionId, kind: 'REMINDER' } }),
    prisma.v1ResultEscalation.count({ where: { resultRevisionId: revisionId, kind: 'ESCALATION' } }),
  ]);
  return { reminders, escalations: escalationCount };
}

async function seedEscalationRows(revisionId: string): Promise<void> {
  await Promise.all([
    prisma.v1ResultEscalation.upsert({
      where: { resultRevisionId_kind: { resultRevisionId: revisionId, kind: 'REMINDER' } },
      create: { resultRevisionId: revisionId, kind: 'REMINDER', dueAt: new Date('2026-08-02T00:00:00.000Z') },
      update: { status: 'PENDING', ackByUserId: null, resolvedByUserId: null, reason: null },
    }),
    prisma.v1ResultEscalation.upsert({
      where: { resultRevisionId_kind: { resultRevisionId: revisionId, kind: 'ESCALATION' } },
      create: { resultRevisionId: revisionId, kind: 'ESCALATION', dueAt: new Date('2026-08-03T00:00:00.000Z') },
      update: { status: 'PENDING', ackByUserId: null, resolvedByUserId: null, reason: null },
    }),
  ]);
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

async function futureTableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS exists
  `;
  return rows[0]?.exists === true;
}

async function persistedVisibilityMode(gameId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<Array<{ mode: string }>>`
    SELECT mode::text AS mode
    FROM v1_game_visibility_policies
    WHERE game_id = ${gameId}
  `;
  return rows[0]?.mode ?? null;
}

async function projectionTransactionSnapshot(revisionId: string): Promise<{
  officialFacts: number;
  teamFacts: number;
  repairAudits: number;
  watermarks: Array<{ projection: string; entityType: string; entityId: string; sourceHash: string; status: string }>;
}> {
  const [officialFacts, teamFacts, repairAudits, watermarks] = await Promise.all([
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
  ]);
  return { officialFacts, teamFacts, repairAudits, watermarks };
}

function loadTask9Runtime<T extends object>(modulePath: string, exportName: string): Partial<T> {
  try {
    const loaded: unknown = require(modulePath);
    if (typeof loaded !== 'object' || loaded === null || !(exportName in loaded)) return {};
    const Constructor = (loaded as Record<string, unknown>)[exportName];
    if (typeof Constructor !== 'function') return {};
    return Reflect.construct(Constructor, [prisma]) as Partial<T>;
  } catch (error) {
    if (typeof error === 'object' && error !== null) {
      const moduleError = error as { code?: unknown; message?: unknown };
      if (
        moduleError.code === 'MODULE_NOT_FOUND' &&
        typeof moduleError.message === 'string' &&
        moduleError.message.includes(`Cannot find module '${modulePath}'`)
      ) {
        return {};
      }
    }
    throw error;
  }
}

async function captureBusinessFailure(operation: () => Promise<unknown>): Promise<{ code: string }> {
  try {
    await operation();
    return { code: 'MISLEADING_SUCCESS' };
  } catch (error) {
    if (error instanceof Error && 'code' in error && typeof (error as Error & { code?: unknown }).code === 'string') {
      return { code: (error as Error & { code: string }).code };
    }
    return { code: 'UNRELATED_EXCEPTION' };
  }
}
