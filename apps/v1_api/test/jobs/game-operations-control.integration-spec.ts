import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { AdminContextService } from '../../src/common/admin-context.service';
import {
  GameOperationFlagKey,
  GameOperationFlagsService,
} from '../../src/config/game-operation-flags';
import { PrismaService } from '../../src/prisma/prisma.service';

const EVIDENCE_ROOT =
  '/private/tmp/teameet-ulw-evidence/teameet-team-tournament-operations-v1';
const BASELINE_SHA = 'a'.repeat(40);
const CANDIDATE_SHA = 'b'.repeat(40);
const PLAN_SHA = 'c'.repeat(64);
const OWNER_USER_ID = '00000000-0000-4000-8000-000000005001';
const OPS_USER_ID = '00000000-0000-4000-8000-000000005002';
const SUPPORT_USER_ID = '00000000-0000-4000-8000-000000005003';
const ORDINARY_USER_ID = '00000000-0000-4000-8000-000000005004';
const TEST_USER_IDS = [
  OWNER_USER_ID,
  OPS_USER_ID,
  SUPPORT_USER_ID,
  ORDINARY_USER_ID,
];

type GatePair = {
  gateId: string;
  commandId: string;
};

type SingleGateInput = {
  phase: 'B' | 'C';
  key: GameOperationFlagKey;
  from: { value: string; version: number };
  to: { value: string; version: number };
  gates: GatePair[];
  transition?: string;
};

type TupleGateInput = {
  phase: 'C';
  tupleKeys: GameOperationFlagKey[];
  fromTuple: Record<string, { value: string; version: number }>;
  toTuple: Record<string, { value: string; version: number }>;
  gates: GatePair[];
};

describe('Task 5 game operation control plane', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let service: GameOperationFlagsService;
  let attemptId: string;
  let attemptRoot: string;
  let bundlePaths: string[];
  let receiptSequence: number;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for Task 5 integration verification');
    }
    moduleRef = await Test.createTestingModule({
      providers: [PrismaService, AdminContextService, GameOperationFlagsService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(GameOperationFlagsService);
    await prisma.$connect();
    await deleteTestRows(prisma);
    for (const userId of TEST_USER_IDS) {
      await prisma.v1User.create({
        data: {
          id: userId,
          email: `task5-${userId.slice(-4)}@example.test`,
          accountStatus: 'active',
          onboardingStatus: 'completed',
        },
      });
    }
    await prisma.v1AdminUser.createMany({
      data: [
        {
          id: '00000000-0000-4000-8000-000000005011',
          userId: OWNER_USER_ID,
          adminRole: 'owner',
          status: 'active',
        },
        {
          id: '00000000-0000-4000-8000-000000005012',
          userId: OPS_USER_ID,
          adminRole: 'ops',
          status: 'active',
        },
        {
          id: '00000000-0000-4000-8000-000000005013',
          userId: SUPPORT_USER_ID,
          adminRole: 'support',
          status: 'active',
        },
      ],
    });
  });

  beforeEach(async () => {
    await prisma.$executeRaw`
      DELETE FROM v1_idempotency_records
      WHERE actor_user_id IN (${OWNER_USER_ID}, ${OPS_USER_ID}, ${SUPPORT_USER_ID}, ${ORDINARY_USER_ID})
    `;
    await prisma.$executeRaw`
      DELETE FROM v1_outbox_events
      WHERE business_key LIKE 'platform-ops-control:%'
         OR business_key LIKE 'task5-poisoned:%'
    `;
    await prisma.$executeRaw`
      DELETE FROM v1_operation_audits
      WHERE system_actor = 'PLATFORM_OPS_CONTROL'
    `;
    await prisma.$executeRaw`DELETE FROM v1_game_operation_flags`;
    await prisma.$executeRaw`DELETE FROM v1_game_cutover_epochs WHERE id = 'game-cutover'`;
    attemptId = randomUUID();
    attemptRoot = join(EVIDENCE_ROOT, `task5-${attemptId}`);
    bundlePaths = [];
    receiptSequence = 0;
    mkdirSync(attemptRoot, { recursive: true, mode: 0o700 });
  });

  afterEach(() => {
    for (const path of bundlePaths) rmSync(path, { force: true });
    rmSync(attemptRoot, { recursive: true, force: true });
  });

  afterAll(async () => {
    await deleteTestRows(prisma);
    await prisma.$disconnect();
    await moduleRef.close();
  });

  it('creates the exact defaults and enforces active owner/ops DB permission', async () => {
    await expect(service.getFlag(OWNER_USER_ID, 'GAME_WRITE')).resolves.toMatchObject({
      key: 'GAME_WRITE',
      value: 'legacy',
      version: 0,
    });
    await expect(service.getFlag(OPS_USER_ID, 'GAME_READ')).resolves.toMatchObject({
      key: 'GAME_READ',
      value: 'legacy',
      version: 0,
    });
    await expect(service.getFlag(SUPPORT_USER_ID, 'GAME_READ')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.getFlag(ORDINARY_USER_ID, 'GAME_READ')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const rows = await prisma.$queryRaw<Array<{ key: string; value: string; version: number }>>`
      SELECT key::text, value, version
      FROM v1_game_operation_flags
      ORDER BY key
    `;
    expect(rows).toEqual([
      { key: 'DIRECTOR_OFFICIALIZE', value: 'off', version: 0 },
      { key: 'GAME_READ', value: 'legacy', version: 0 },
      { key: 'GAME_WRITE', value: 'legacy', version: 0 },
      { key: 'PUBLIC_LIVE', value: 'off', version: 0 },
    ]);
  });

  it('rejects malformed, mixed-gate, and out-of-order transitions before CAS', async () => {
    await service.getFlag(OWNER_USER_ID, 'GAME_READ');
    const malformed = writeSingleGate({
      phase: 'B',
      key: 'GAME_READ',
      from: { value: 'legacy', version: 0 },
      to: { value: 'compare', version: 1 },
      gates: [{ gateId: 'V10', commandId: 'V10' }],
    });
    chmodSync(malformed.path, 0o644);
    await expect(
      service.patchFlag(
        OWNER_USER_ID,
        'GAME_READ',
        {
          expectedVersion: 0,
          value: 'compare',
          gateBundlePath: malformed.path,
          gateBundleHash: malformed.sha256,
          reason: 'malformed immutable gate must be rejected',
        },
        'task5-malformed',
      ),
    ).rejects.toMatchObject({
      response: { code: 'INVALID_GATE_BUNDLE' },
    });
    chmodSync(malformed.path, 0o444);

    const wrongGate = writeSingleGate({
      phase: 'B',
      key: 'GAME_READ',
      from: { value: 'legacy', version: 0 },
      to: { value: 'compare', version: 1 },
      gates: [{ gateId: 'V25', commandId: 'V25' }],
      transition: 'GAME_READ-wrong-gate',
    });
    await expect(
      service.patchFlag(
        OWNER_USER_ID,
        'GAME_READ',
        {
          expectedVersion: 0,
          value: 'compare',
          gateBundlePath: wrongGate.path,
          gateBundleHash: wrongGate.sha256,
          reason: 'mixed gate must be rejected',
        },
        'task5-wrong-gate',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const writeGate = writeSingleGate({
      phase: 'C',
      key: 'GAME_WRITE',
      from: { value: 'legacy', version: 0 },
      to: { value: 'new', version: 1 },
      gates: [
        { gateId: 'V10', commandId: 'V10' },
        { gateId: 'V25', commandId: 'V25' },
      ],
    });
    await expect(
      service.patchFlag(
        OWNER_USER_ID,
        'GAME_WRITE',
        {
          expectedVersion: 0,
          value: 'new',
          gateBundlePath: writeGate.path,
          gateBundleHash: writeGate.sha256,
          reason: 'write cannot precede compare',
        },
        'task5-out-of-order',
      ),
    ).rejects.toMatchObject({
      response: { code: 'CUTOVER_ORDER_VIOLATION' },
    });
    await expect(service.getFlag(OWNER_USER_ID, 'GAME_WRITE')).resolves.toMatchObject({
      value: 'legacy',
      version: 0,
    });
  });

  it('applies CAS once, replays the stored response, and records actor-neutral audit/outbox', async () => {
    const gate = writeSingleGate({
      phase: 'B',
      key: 'GAME_READ',
      from: { value: 'legacy', version: 0 },
      to: { value: 'compare', version: 1 },
      gates: [{ gateId: 'V10', commandId: 'V10' }],
    });
    const input = {
      expectedVersion: 0,
      value: 'compare',
      gateBundlePath: gate.path,
      gateBundleHash: gate.sha256,
      reason: 'enable local comparison',
    };
    const first = await service.patchFlag(OPS_USER_ID, 'GAME_READ', input, 'task5-cas');
    const replay = await service.patchFlag(OPS_USER_ID, 'GAME_READ', input, 'task5-cas');
    expect(replay).toEqual(first);
    await expect(
      service.patchFlag(
        OPS_USER_ID,
        'GAME_READ',
        { ...input, reason: 'different payload' },
        'task5-cas',
      ),
    ).rejects.toMatchObject({
      response: { code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' },
    });

    const staleGate = writeSingleGate({
      phase: 'C',
      key: 'GAME_READ',
      from: { value: 'compare', version: 0 },
      to: { value: 'new', version: 1 },
      gates: [
        { gateId: 'V10', commandId: 'V10' },
        { gateId: 'V25', commandId: 'V25' },
      ],
    });
    await expect(
      service.patchFlag(
        OPS_USER_ID,
        'GAME_READ',
        {
          expectedVersion: 0,
          value: 'new',
          gateBundlePath: staleGate.path,
          gateBundleHash: staleGate.sha256,
          reason: 'stale CAS must fail',
        },
        'task5-stale',
      ),
    ).rejects.toMatchObject({
      response: { code: 'VERSION_CONFLICT' },
    });

    const audits = await prisma.$queryRaw<
      Array<{
        actor_type: string;
        actor_user_id: string | null;
        system_actor: string | null;
        action: string;
      }>
    >`
      SELECT actor_type::text, actor_user_id, system_actor, action
      FROM v1_operation_audits
      WHERE resource_id = 'GAME_READ'
    `;
    expect(audits).toEqual([
      {
        actor_type: 'SYSTEM',
        actor_user_id: null,
        system_actor: 'PLATFORM_OPS_CONTROL',
        action: 'OPERATION_FLAG_CHANGED',
      },
    ]);
    const events = await prisma.$queryRaw<Array<{ type: string }>>`
      SELECT type
      FROM v1_outbox_events
      WHERE aggregate_id = 'GAME_READ'
    `;
    expect(events).toEqual([{ type: 'GAME_OPERATION_FLAG_CHANGED' }]);
    await expect(service.getFlag(OWNER_USER_ID, 'GAME_READ')).resolves.toMatchObject({
      value: 'compare',
      version: 1,
      updatedByUserId: OPS_USER_ID,
    });
  });

  it('serializes tuple rollback against the first new-authority write with no split brain', async () => {
    await advanceToNewTuple();
    const rollbackGate = writeTupleGate({
      phase: 'C',
      tupleKeys: ['GAME_READ', 'GAME_WRITE'],
      fromTuple: {
        GAME_READ: { value: 'new', version: 2 },
        GAME_WRITE: { value: 'new', version: 1 },
      },
      toTuple: {
        GAME_READ: { value: 'compare', version: 3 },
        GAME_WRITE: { value: 'legacy', version: 2 },
      },
      gates: [
        { gateId: 'V10', commandId: 'V10' },
        { gateId: 'V25', commandId: 'V25' },
      ],
    });
    const rollback = service.tupleTransition(
      OWNER_USER_ID,
      {
        expectedVersions: { GAME_READ: 2, GAME_WRITE: 1 },
        transitions: [
          { key: 'GAME_WRITE', from: 'new', to: 'legacy' },
          { key: 'GAME_READ', from: 'new', to: 'compare' },
        ],
        gateBundlePath: rollbackGate.path,
        gateBundleHash: rollbackGate.sha256,
        reason: 'pre-latch authority rollback',
      },
      'task5-tuple-race',
    );
    const write = service.withNewWriteAuthority('task5-race-resource', async (tx) => {
      await tx.$executeRaw`SELECT 1`;
      return { committed: true };
    });
    const outcomes = await Promise.allSettled([rollback, write]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === 'rejected')).toHaveLength(1);

    const flags = await prisma.$queryRaw<Array<{ key: string; value: string }>>`
      SELECT key::text, value
      FROM v1_game_operation_flags
      WHERE key IN ('GAME_READ', 'GAME_WRITE')
      ORDER BY key
    `;
    const epochs = await prisma.$queryRaw<
      Array<{
        write_mode: string;
        first_new_write_at: Date | null;
        first_new_write_resource_id: string | null;
      }>
    >`
      SELECT write_mode::text, first_new_write_at, first_new_write_resource_id
      FROM v1_game_cutover_epochs
      WHERE id = 'game-cutover'
    `;
    const epoch = epochs[0];
    expect(epoch).toBeDefined();
    if (epoch.first_new_write_at) {
      expect(flags).toEqual([
        { key: 'GAME_READ', value: 'new' },
        { key: 'GAME_WRITE', value: 'new' },
      ]);
      expect(epoch.write_mode).toBe('new');
      expect(epoch.first_new_write_resource_id).toBe('task5-race-resource');
    } else {
      expect(flags).toEqual([
        { key: 'GAME_READ', value: 'compare' },
        { key: 'GAME_WRITE', value: 'legacy' },
      ]);
      expect(epoch.write_mode).toBe('legacy');
      expect(epoch.first_new_write_resource_id).toBeNull();
    }
  });

  it('requeues only a poisoned job with CAS and transactional audit/outbox', async () => {
    const jobId = randomUUID();
    const now = new Date();
    await prisma.$executeRaw`
      INSERT INTO v1_outbox_events
        (id, business_key, aggregate_type, aggregate_id, type, payload,
         available_at, lease_owner, lease_until, attempts, retry_generation,
         version, status, last_error, created_at, updated_at)
      VALUES
        (${jobId}, ${`task5-poisoned:${jobId}`}, 'game', 'task5-game',
         'GAME_OPERATION_FLAG_CHANGED', '{}'::jsonb, ${now}, 'dead-worker',
         ${now}, 6, 2, 4, 'POISONED', 'bounded failure', ${now}, ${now})
    `;
    await expect(
      service.requeueJob(
        OPS_USER_ID,
        jobId,
        { expectedVersion: 4, reason: 'operator reviewed poison cause' },
        'task5-requeue',
      ),
    ).resolves.toMatchObject({
      id: jobId,
      status: 'RETRY',
      attempts: 0,
      retryGeneration: 3,
      version: 5,
      leaseOwner: null,
      leaseUntil: null,
      lastError: null,
    });
    await expect(
      service.requeueJob(
        OPS_USER_ID,
        jobId,
        { expectedVersion: 5, reason: 'cannot requeue retry state' },
        'task5-requeue-invalid-state',
      ),
    ).rejects.toMatchObject({
      response: { code: 'JOB_NOT_POISONED' },
    });
    const effects = await prisma.$queryRaw<
      Array<{
        action: string;
        actor_type: string;
        actor_user_id: string | null;
        system_actor: string | null;
        event_type: string;
      }>
    >`
      SELECT audit.action,
             audit.actor_type::text,
             audit.actor_user_id,
             audit.system_actor,
             event.type AS event_type
      FROM v1_operation_audits audit
      JOIN v1_outbox_events event
        ON event.aggregate_id = audit.resource_id
       AND event.type = 'GAME_OPERATION_JOB_REQUEUED'
      WHERE audit.resource_id = ${jobId}
    `;
    expect(effects).toEqual([
      {
        action: 'JOB_REQUEUED',
        actor_type: 'SYSTEM',
        actor_user_id: null,
        system_actor: 'PLATFORM_OPS_CONTROL',
        event_type: 'GAME_OPERATION_JOB_REQUEUED',
      },
    ]);
  });

  async function advanceToNewTuple() {
    const compare = writeSingleGate({
      phase: 'B',
      key: 'GAME_READ',
      from: { value: 'legacy', version: 0 },
      to: { value: 'compare', version: 1 },
      gates: [{ gateId: 'V10', commandId: 'V10' }],
    });
    await service.patchFlag(
      OWNER_USER_ID,
      'GAME_READ',
      {
        expectedVersion: 0,
        value: 'compare',
        gateBundlePath: compare.path,
        gateBundleHash: compare.sha256,
        reason: 'advance compare',
      },
      'task5-advance-read-compare',
    );
    const write = writeSingleGate({
      phase: 'C',
      key: 'GAME_WRITE',
      from: { value: 'legacy', version: 0 },
      to: { value: 'new', version: 1 },
      gates: [
        { gateId: 'V10', commandId: 'V10' },
        { gateId: 'V25', commandId: 'V25' },
      ],
    });
    await service.patchFlag(
      OWNER_USER_ID,
      'GAME_WRITE',
      {
        expectedVersion: 0,
        value: 'new',
        gateBundlePath: write.path,
        gateBundleHash: write.sha256,
        reason: 'advance write',
      },
      'task5-advance-write',
    );
    const read = writeSingleGate({
      phase: 'C',
      key: 'GAME_READ',
      from: { value: 'compare', version: 1 },
      to: { value: 'new', version: 2 },
      gates: [
        { gateId: 'V10', commandId: 'V10' },
        { gateId: 'V25', commandId: 'V25' },
      ],
    });
    await service.patchFlag(
      OWNER_USER_ID,
      'GAME_READ',
      {
        expectedVersion: 1,
        value: 'new',
        gateBundlePath: read.path,
        gateBundleHash: read.sha256,
        reason: 'advance read authority',
      },
      'task5-advance-read-new',
    );
  }

  function writeSingleGate(input: SingleGateInput) {
    const prerequisites = writePrerequisites(input.phase, input.gates);
    const transition =
      input.transition ??
      `${input.key}:${input.from.value}->${input.to.value}`;
    const path = join(
      EVIDENCE_ROOT,
      `flag-gate-${attemptId}-${input.phase}-${slug(transition)}.json`,
    );
    bundlePaths.push(path);
    return immutableJson(path, {
      schemaVersion: 1,
      phase: input.phase,
      attemptId,
      baselineSHA: BASELINE_SHA,
      candidateSHA: CANDIDATE_SHA,
      planSHA: PLAN_SHA,
      transition,
      key: input.key,
      from: input.from,
      to: input.to,
      prerequisites,
      createdAt: new Date().toISOString(),
    });
  }

  function writeTupleGate(input: TupleGateInput) {
    const prerequisites = writePrerequisites(input.phase, input.gates);
    const transition = 'authority-tuple-rollback';
    const path = join(
      EVIDENCE_ROOT,
      `flag-gate-${attemptId}-${input.phase}-${transition}.json`,
    );
    bundlePaths.push(path);
    return immutableJson(path, {
      schemaVersion: 1,
      phase: input.phase,
      attemptId,
      baselineSHA: BASELINE_SHA,
      candidateSHA: CANDIDATE_SHA,
      planSHA: PLAN_SHA,
      transition,
      tupleKeys: input.tupleKeys,
      fromTuple: input.fromTuple,
      toTuple: input.toTuple,
      prerequisites,
      createdAt: new Date().toISOString(),
    });
  }

  function writePrerequisites(phase: string, gates: GatePair[]) {
    return [...gates]
      .sort((left, right) =>
        `${left.gateId}\u0000${left.commandId}`.localeCompare(
          `${right.gateId}\u0000${right.commandId}`,
        ),
      )
      .map((gate) => {
        const path = join(
          attemptRoot,
          `receipt-${receiptSequence++}-${phase}-${gate.gateId}-${gate.commandId}.json`,
        );
        const receipt = immutableJson(path, {
          schemaVersion: 1,
          gateId: gate.gateId,
          phase,
          commandId: gate.commandId,
          attemptId,
          baselineSHA: BASELINE_SHA,
          candidateSHA: CANDIDATE_SHA,
          planSHA: PLAN_SHA,
          verdict: 'accepted',
          createdAt: new Date().toISOString(),
        });
        return {
          gateId: gate.gateId,
          phase,
          commandId: gate.commandId,
          path: receipt.path,
          sha256: receipt.sha256,
          verdict: 'accepted',
        };
      });
  }
});

async function deleteTestRows(prisma: PrismaService) {
  await prisma.$executeRaw`
    DELETE FROM v1_idempotency_records
    WHERE actor_user_id IN (${OWNER_USER_ID}, ${OPS_USER_ID}, ${SUPPORT_USER_ID}, ${ORDINARY_USER_ID})
  `;
  await prisma.$executeRaw`
    DELETE FROM v1_outbox_events
    WHERE business_key LIKE 'platform-ops-control:%'
       OR business_key LIKE 'task5-poisoned:%'
  `;
  await prisma.$executeRaw`
    DELETE FROM v1_operation_audits
    WHERE system_actor = 'PLATFORM_OPS_CONTROL'
  `;
  await prisma.v1AdminUser.deleteMany({ where: { userId: { in: TEST_USER_IDS } } });
  await prisma.v1User.deleteMany({ where: { id: { in: TEST_USER_IDS } } });
}

function immutableJson(path: string, value: unknown) {
  const bytes = Buffer.from(canonicalJson(value));
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o444 });
  return {
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function slug(value: string) {
  return value.replace(/[^A-Za-z0-9._-]+/g, '-');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('test receipt is not JSON serializable');
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (!isRecord(value)) throw new Error('test receipt must be a record');
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(',')}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
