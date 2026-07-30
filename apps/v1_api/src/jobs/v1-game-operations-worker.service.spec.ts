import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GAME_OPERATION_HEARTBEAT_MS,
  GAME_OPERATION_LEASE_MS,
  GAME_OPERATION_RETRY_DELAYS_MS,
  GAME_OPERATION_SHUTDOWN_MS,
  GameOperationClaim,
  V1GameOperationsWorkerService,
} from './v1-game-operations-worker.service';

type JobState = {
  id: string;
  status: string;
  attempts: number;
  version: number;
  leaseOwner: string | null;
  leaseUntil: Date | null;
  availableAt: Date;
  updatedAt: Date;
  lastError: string | null;
};

const runId = randomUUID();
const keyPrefix = `worker-spec:${runId}:`;

describe('V1GameOperationsWorkerService database lease contract', () => {
  const prisma = new PrismaService();

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterEach(async () => {
    await prisma.$executeRaw`
      DELETE FROM v1_operation_audits
      WHERE request_id LIKE ${`${keyPrefix}%`}
    `;
    await prisma.$executeRaw`
      DELETE FROM v1_outbox_events
      WHERE business_key LIKE ${`${keyPrefix}%`}
    `;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('freezes the lease, heartbeat, shutdown, and exact retry schedule', () => {
    expect(GAME_OPERATION_LEASE_MS).toBe(30_000);
    expect(GAME_OPERATION_HEARTBEAT_MS).toBe(10_000);
    expect(GAME_OPERATION_SHUTDOWN_MS).toBe(20_000);
    expect(GAME_OPERATION_RETRY_DELAYS_MS).toEqual([
      1_000,
      5_000,
      30_000,
      120_000,
      600_000,
    ]);
  });

  it('lets two replicas commit one durable effect exactly once', async () => {
    const job = await insertJob();
    const first = worker();
    const second = worker();

    const processed = await Promise.all([first.processOne(), second.processOne()]);

    expect(processed.sort()).toEqual([false, true]);
    await expect(jobState(job.id)).resolves.toMatchObject({
      status: 'COMPLETED',
      attempts: 1,
      version: 2,
      leaseOwner: null,
      leaseUntil: null,
    });
    await expect(auditCount(job.businessKey, 'OUTBOX_EFFECT_COMMITTED')).resolves.toBe(1);
  });

  it('rolls back a durable effect when the handler fails, then commits it once on retry', async () => {
    const job = await insertJob();
    const crashing = new V1GameOperationsWorkerService(prisma);
    crashing.registerHandler('GAME_OPERATION_FLAG_CHANGED', async (claim, tx) => {
      await writeSpecEffect(claim, tx);
      throw new Error('crash after effect');
    });

    await expect(crashing.processOne()).resolves.toBe(true);
    await expect(auditCount(job.businessKey, 'SPEC_EFFECT_COMMITTED')).resolves.toBe(0);
    await expect(jobState(job.id)).resolves.toMatchObject({
      status: 'RETRY',
      attempts: 1,
      version: 2,
    });

    await makeRetryDue(job.id);
    const replacement = new V1GameOperationsWorkerService(prisma);
    replacement.registerHandler('GAME_OPERATION_FLAG_CHANGED', writeSpecEffect);
    await expect(replacement.processOne()).resolves.toBe(true);

    await expect(auditCount(job.businessKey, 'SPEC_EFFECT_COMMITTED')).resolves.toBe(1);
    await expect(jobState(job.id)).resolves.toMatchObject({
      status: 'COMPLETED',
      attempts: 2,
      leaseOwner: null,
    });
  });

  it('recovers an expired lease with the exact next delay and rejects the late owner CAS', async () => {
    const job = await insertJob();
    const expiredOwner = worker();
    const takeover = worker();
    const expiredClaim = await expiredOwner.claimOne();
    expect(expiredClaim).not.toBeNull();

    await prisma.$executeRaw`
      UPDATE v1_outbox_events
      SET lease_until = CURRENT_TIMESTAMP - INTERVAL '2 seconds',
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${job.id}
        AND version = ${expiredClaim!.version}
    `;

    const takeoverClaim = await takeover.claimOne();
    expect(takeoverClaim).toMatchObject({
      id: job.id,
      attempts: 2,
      leaseOwner: takeover.owner,
    });
    await expect(expiredOwner.complete(expiredClaim!)).resolves.toBe(false);
    await expect(takeover.complete(takeoverClaim!)).resolves.toBe(true);
    await expect(jobState(job.id)).resolves.toMatchObject({
      status: 'COMPLETED',
      attempts: 2,
      leaseOwner: null,
    });

    const metrics = await expiredOwner.getMetrics();
    expect(metrics.casFailures).toBe(1);
    expect(JSON.stringify(metrics)).not.toContain(expiredOwner.owner);
  });

  it('applies every exact retry delay and poisons attempt six with a bounded error', async () => {
    const service = worker();

    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const job = await insertJob({ attempts: attempt - 1 });
      const claim = await service.claimOne();
      expect(claim).toMatchObject({ id: job.id, attempts: attempt });
      const result = await service.fail(claim!, new Error('x'.repeat(3_000)));
      const state = await jobState(job.id);

      if (attempt < 6) {
        expect(result).toBe('RETRY');
        expect(state.status).toBe('RETRY');
        expect(Math.round(state.availableAt.getTime() - state.updatedAt.getTime())).toBe(
          GAME_OPERATION_RETRY_DELAYS_MS[attempt - 1],
        );
      } else {
        expect(result).toBe('POISONED');
        expect(state.status).toBe('POISONED');
        expect(state.leaseOwner).toBeNull();
        expect(state.leaseUntil).toBeNull();
        expect(state.lastError).toHaveLength(2_000);
      }
      expect(state.version).toBe(2);
    }

    await expect(service.getMetrics()).resolves.toMatchObject({
      claims: 6,
      retries: 5,
      poisoned: 1,
      casFailures: 0,
    });
  });

  it('claims unsupported types and moves them to retry instead of fake completion', async () => {
    const job = await insertJob({ type: 'UNSUPPORTED_OPERATION' });
    const service = worker();

    await expect(service.processOne()).resolves.toBe(true);

    const state = await jobState(job.id);
    expect(state).toMatchObject({
      status: 'RETRY',
      attempts: 1,
      leaseOwner: null,
    });
    expect(state.lastError).toContain('No handler registered for UNSUPPORTED_OPERATION');
    await expect(auditCount(job.businessKey, 'OUTBOX_EFFECT_COMMITTED')).resolves.toBe(0);
  });

  it('releases only its own leases on shutdown using the next exact delay', async () => {
    const firstJob = await insertJob();
    const firstOwner = worker();
    const firstClaim = await firstOwner.claimOne();
    expect(firstClaim?.id).toBe(firstJob.id);

    const secondJob = await insertJob();
    const secondOwner = worker();
    const secondClaim = await secondOwner.claimOne();
    expect(secondClaim?.id).toBe(secondJob.id);

    await firstOwner.shutdown(0);

    const released = await jobState(firstJob.id);
    expect(released.status).toBe('RETRY');
    expect(released.leaseOwner).toBeNull();
    expect(released.lastError).toBe('worker shutdown before completion');
    expect(Math.round(released.availableAt.getTime() - released.updatedAt.getTime())).toBe(1_000);
    await expect(jobState(secondJob.id)).resolves.toMatchObject({
      status: 'PROCESSING',
      leaseOwner: secondOwner.owner,
    });
  });

  it('times out a hung transaction before shutdown grace and releases the row lock', async () => {
    const job = await insertJob();
    const service = new V1GameOperationsWorkerService(prisma, 50);
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    service.registerHandler('GAME_OPERATION_FLAG_CHANGED', async () => {
      markStarted?.();
      await new Promise<void>(() => undefined);
    });

    const processing = service.processOne();
    await started;
    const shutdownStartedAt = Date.now();
    await service.shutdown(500);
    await processing;

    expect(Date.now() - shutdownStartedAt).toBeLessThan(500);
    await expect(jobState(job.id)).resolves.toMatchObject({
      status: 'RETRY',
      leaseOwner: null,
    });
  });

  it('queries durable queue state for not-ready and poisoned health without leaking owner identity', async () => {
    const service = new V1GameOperationsWorkerService(prisma);
    await expect(service.getHealth()).resolves.toMatchObject({
      status: 'not_ready',
      registeredHandlers: 0,
    });

    service.registerDurableAuditHandler('GAME_OPERATION_FLAG_CHANGED');
    await expect(service.getHealth()).resolves.toMatchObject({
      status: 'healthy',
      registeredHandlers: 1,
    });

    await insertJob({ status: 'POISONED', attempts: 6 });
    const health = await service.getHealth();

    expect(health).toMatchObject({
      status: 'degraded',
      queue: { poisoned: 1 },
    });
    expect(JSON.stringify(health)).not.toContain(service.owner);
  });

  function worker(): V1GameOperationsWorkerService {
    const service = new V1GameOperationsWorkerService(prisma);
    service.registerDurableAuditHandler('GAME_OPERATION_FLAG_CHANGED');
    service.registerDurableAuditHandler('GAME_OPERATION_JOB_REQUEUED');
    return service;
  }

  async function insertJob(options: {
    type?: string;
    status?: 'PENDING' | 'RETRY' | 'PROCESSING' | 'POISONED' | 'COMPLETED';
    attempts?: number;
  } = {}) {
    const id = randomUUID();
    const businessKey = `${keyPrefix}${id}`;
    const status = options.status ?? 'PENDING';
    const type = options.type ?? 'GAME_OPERATION_FLAG_CHANGED';
    const attempts = options.attempts ?? 0;
    await prisma.$executeRaw`
      INSERT INTO v1_outbox_events (
        id,
        business_key,
        aggregate_type,
        aggregate_id,
        revision_id,
        type,
        payload,
        available_at,
        lease_owner,
        lease_until,
        attempts,
        retry_generation,
        version,
        status,
        last_error,
        created_at,
        updated_at
      )
      VALUES (
        ${id},
        ${businessKey},
        'GAME_OPERATION',
        ${id},
        NULL,
        ${type},
        '{"source":"worker-contract-spec"}'::jsonb,
        CURRENT_TIMESTAMP,
        NULL,
        NULL,
        ${attempts},
        0,
        0,
        ${status}::"V1OutboxStatus",
        NULL,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;
    return { id, businessKey };
  }

  async function makeRetryDue(id: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE v1_outbox_events
      SET available_at = CURRENT_TIMESTAMP,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
        AND status = 'RETRY'
    `;
  }

  async function jobState(id: string): Promise<JobState> {
    const [row] = await prisma.$queryRaw<JobState[]>`
      SELECT id,
             status::text AS status,
             attempts,
             version,
             lease_owner AS "leaseOwner",
             lease_until AS "leaseUntil",
             available_at AS "availableAt",
             updated_at AS "updatedAt",
             last_error AS "lastError"
      FROM v1_outbox_events
      WHERE id = ${id}
    `;
    if (!row) throw new Error(`Missing worker spec job ${id}`);
    return row;
  }

  async function auditCount(businessKey: string, action: string): Promise<number> {
    const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM v1_operation_audits
      WHERE request_id = ${businessKey}
        AND action = ${action}
    `;
    return row?.count ?? 0;
  }

  async function writeSpecEffect(
    claim: GameOperationClaim,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.$executeRaw`
      INSERT INTO v1_operation_audits (
        id,
        actor_type,
        actor_user_id,
        system_actor,
        action,
        resource_type,
        resource_id,
        request_id,
        source_ip,
        before,
        after,
        reason,
        created_at
      )
      VALUES (
        ${randomUUID()},
        'SYSTEM'::"V1OperationActorType",
        NULL,
        'V1_GAME_OPERATIONS_WORKER_SPEC',
        'SPEC_EFFECT_COMMITTED',
        ${claim.aggregateType},
        ${claim.aggregateId},
        ${claim.businessKey},
        NULL,
        NULL,
        '{"spec":true}'::jsonb,
        NULL,
        CURRENT_TIMESTAMP
      )
    `;
  }
});
