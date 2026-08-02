import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { GameResultOfficialProjectionService } from '../game-operations/game-result-official-projection.service';
import { GameResultSubmittedEscalationService } from './result-escalation/game-result-submitted-escalation.service';
import { PrismaService } from '../prisma/prisma.service';

export const GAME_OPERATION_RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 120_000, 600_000] as const;
export const GAME_OPERATION_LEASE_MS = 30_000;
export const GAME_OPERATION_HEARTBEAT_MS = 10_000;
export const GAME_OPERATION_SHUTDOWN_MS = 20_000;
const MAX_ERROR_LENGTH = 2_000;
const GAME_OPERATION_TRANSACTION_TIMEOUT_MS = 15_000;

export type GameOperationClaim = {
  id: string;
  businessKey: string;
  aggregateType: string;
  aggregateId: string;
  revisionId: string | null;
  type: string;
  payload: unknown;
  attempts: number;
  retryGeneration: number;
  version: number;
  leaseOwner: string;
  leaseUntil: Date;
};

export type GameOperationHandler = (
  claim: GameOperationClaim,
  tx: Prisma.TransactionClient,
) => Promise<void>;

type OutboxRow = GameOperationClaim;

type QueueCounts = {
  pending: number;
  retry: number;
  processing: number;
  poisoned: number;
  completed: number;
};

@Injectable()
export class V1GameOperationsWorkerService implements OnModuleDestroy {
  readonly owner = randomUUID();
  private readonly logger = new Logger(V1GameOperationsWorkerService.name);
  private acceptingClaims = true;
  private readonly active = new Map<string, { claim: GameOperationClaim; promise: Promise<void> }>();
  private readonly handlers = new Map<string, GameOperationHandler>();
  private poisonCount = 0;
  private claimCount = 0;
  private retryCount = 0;
  private completionCount = 0;
  private casFailureCount = 0;
  private readonly transactionTimeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() transactionTimeoutMs?: number,
  ) {
    this.transactionTimeoutMs = transactionTimeoutMs ?? GAME_OPERATION_TRANSACTION_TIMEOUT_MS;
    if (this.transactionTimeoutMs <= 0 || this.transactionTimeoutMs >= GAME_OPERATION_SHUTDOWN_MS) {
      throw new Error('Worker transaction timeout must be positive and shorter than shutdown grace');
    }
    const officialProjection = new GameResultOfficialProjectionService();
    this.registerHandler('GAME_RESULT_OFFICIAL', officialProjection.handler);
    const submittedEscalation = new GameResultSubmittedEscalationService();
    this.registerHandler('GAME_RESULT_SUBMITTED', submittedEscalation.handler);
    this.registerHandler('GAME_RESULT_REVIEW_REMINDER', submittedEscalation.reminderHandler);
    this.registerHandler('GAME_RESULT_REVIEW_ESCALATION', submittedEscalation.escalationHandler);
  }

  registerHandler(type: string, handler: GameOperationHandler): void {
    if (!type.trim()) {
      throw new Error('A non-empty outbox event type is required');
    }
    if (this.handlers.has(type)) {
      throw new Error(`A handler is already registered for ${type}`);
    }
    this.handlers.set(type, handler);
  }

  registerDurableAuditHandler(type: string): void {
    this.registerHandler(type, async (claim, tx) => {
      const auditId = randomUUID();
      const effect = JSON.stringify({
        outboxEventId: claim.id,
        eventType: claim.type,
        retryGeneration: claim.retryGeneration,
      });
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
        SELECT
          ${auditId},
          'SYSTEM'::"V1OperationActorType",
          NULL,
          'V1_GAME_OPERATIONS_WORKER',
          'OUTBOX_EFFECT_COMMITTED',
          ${claim.aggregateType},
          ${claim.aggregateId},
          ${claim.businessKey},
          NULL,
          NULL,
          ${effect}::jsonb,
          NULL,
          CURRENT_TIMESTAMP
        WHERE NOT EXISTS (
          SELECT 1
          FROM v1_operation_audits
          WHERE action = 'OUTBOX_EFFECT_COMMITTED'
            AND request_id = ${claim.businessKey}
        )
      `;
    });
  }

  async claimOne(): Promise<GameOperationClaim | null> {
    if (!this.acceptingClaims || this.handlers.size === 0) return null;

    const result = await this.prisma.$transaction(async (tx) => {
      const recovered = await tx.$executeRaw`
        WITH expired AS (
          SELECT id, version
          FROM v1_outbox_events
          WHERE status = 'PROCESSING'
            AND lease_until <= CURRENT_TIMESTAMP
          ORDER BY lease_until ASC, id ASC
          FOR UPDATE SKIP LOCKED
        )
        UPDATE v1_outbox_events event
        SET status = 'RETRY',
            available_at = event.lease_until + (
              CASE event.attempts
                WHEN 1 THEN INTERVAL '1 second'
                WHEN 2 THEN INTERVAL '5 seconds'
                WHEN 3 THEN INTERVAL '30 seconds'
                WHEN 4 THEN INTERVAL '2 minutes'
                ELSE INTERVAL '10 minutes'
              END
            ),
            lease_owner = NULL,
            lease_until = NULL,
            last_error = COALESCE(event.last_error, 'lease expired before completion'),
            version = event.version + 1,
            updated_at = CURRENT_TIMESTAMP
        FROM expired
        WHERE event.id = expired.id
          AND event.version = expired.version
      `;

      const rows = await tx.$queryRaw<OutboxRow[]>`
        WITH candidate AS (
          SELECT id, version
          FROM v1_outbox_events
          WHERE status IN ('PENDING', 'RETRY')
            AND available_at <= CURRENT_TIMESTAMP
            AND (lease_until IS NULL OR lease_until <= CURRENT_TIMESTAMP)
          ORDER BY available_at ASC, created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE v1_outbox_events event
        SET status = 'PROCESSING',
            lease_owner = ${this.owner},
            lease_until = CURRENT_TIMESTAMP + INTERVAL '30 seconds',
            attempts = event.attempts + 1,
            version = event.version + 1,
            updated_at = CURRENT_TIMESTAMP
        FROM candidate
        WHERE event.id = candidate.id
          AND event.version = candidate.version
        RETURNING event.id,
                  event.business_key AS "businessKey",
                  event.aggregate_type AS "aggregateType",
                  event.aggregate_id AS "aggregateId",
                  event.revision_id AS "revisionId",
                  event.type,
                  event.payload,
                  event.attempts,
                  event.retry_generation AS "retryGeneration",
                  event.version,
                  event.lease_owner AS "leaseOwner",
                  event.lease_until AS "leaseUntil"
      `;
      return { recovered, row: rows[0] ?? null };
    });

    this.retryCount += result.recovered;
    if (result.row) this.claimCount += 1;
    return result.row;
  }

  async heartbeat(claim: GameOperationClaim): Promise<boolean> {
    const updated = await this.prisma.$executeRaw`
      UPDATE v1_outbox_events
      SET lease_until = CURRENT_TIMESTAMP + INTERVAL '30 seconds',
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${claim.id}
        AND status = 'PROCESSING'
        AND lease_owner = ${claim.leaseOwner}
        AND version = ${claim.version}
    `;
    if (updated !== 1) {
      this.casFailureCount += 1;
      return false;
    }
    claim.version += 1;
    return true;
  }

  async complete(claim: GameOperationClaim): Promise<boolean> {
    const updated = await this.completeWith(this.prisma, claim);
    if (updated !== 1) {
      this.casFailureCount += 1;
      return false;
    }
    claim.version += 1;
    this.completionCount += 1;
    return true;
  }

  async fail(claim: GameOperationClaim, error: unknown): Promise<'RETRY' | 'POISONED' | 'STALE'> {
    const lastError = this.boundedError(error);
    if (claim.attempts >= 6) {
      const poisoned = await this.prisma.$executeRaw`
        UPDATE v1_outbox_events
        SET status = 'POISONED',
            lease_owner = NULL,
            lease_until = NULL,
            last_error = ${lastError},
            version = version + 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${claim.id}
          AND status = 'PROCESSING'
          AND lease_owner = ${claim.leaseOwner}
          AND version = ${claim.version}
      `;
      if (poisoned !== 1) {
        this.casFailureCount += 1;
        return 'STALE';
      }
      claim.version += 1;
      this.poisonCount += 1;
      return 'POISONED';
    }

    const retryDelayMs = GAME_OPERATION_RETRY_DELAYS_MS[claim.attempts - 1];
    const retried = await this.prisma.$executeRaw`
      UPDATE v1_outbox_events
      SET status = 'RETRY',
          available_at = CURRENT_TIMESTAMP + (${retryDelayMs} * INTERVAL '1 millisecond'),
          lease_owner = NULL,
          lease_until = NULL,
          last_error = ${lastError},
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${claim.id}
        AND status = 'PROCESSING'
        AND lease_owner = ${claim.leaseOwner}
        AND version = ${claim.version}
    `;
    if (retried !== 1) {
      this.casFailureCount += 1;
      return 'STALE';
    }
    claim.version += 1;
    this.retryCount += 1;
    return 'RETRY';
  }

  async processOne(): Promise<boolean> {
    const claim = await this.claimOne();
    if (!claim) return false;

    const handler = this.handlers.get(claim.type);
    if (!handler) {
      await this.fail(claim, new Error(`No handler registered for ${claim.type}`));
      return true;
    }

    let heartbeatPromise: Promise<void> | null = null;
    const heartbeatTimer = setInterval(() => {
      if (heartbeatPromise) return;
      heartbeatPromise = this.heartbeat(claim)
        .then(() => undefined)
        .catch((error: unknown) => {
          this.logger.error(`Heartbeat failed for outbox job ${claim.id}: ${this.boundedError(error)}`);
        })
        .finally(() => {
          heartbeatPromise = null;
        });
    }, GAME_OPERATION_HEARTBEAT_MS);
    heartbeatTimer.unref();

    const work = async () => {
      try {
        await this.prisma.$transaction(async (tx) => {
          const locked = await this.lockClaim(tx, claim);
          if (!locked) {
            throw new Error(`Lease CAS lost before effect for ${claim.id}`);
          }
          await this.runHandlerWithDeadline(handler, claim, tx);
          const completed = await this.completeWith(tx, claim);
          if (completed !== 1) {
            throw new Error(`Lease CAS lost before effect commit for ${claim.id}`);
          }
        }, {
          maxWait: 5_000,
          timeout: this.transactionTimeoutMs,
        });
        claim.version += 1;
        this.completionCount += 1;
      } catch (error: unknown) {
        await this.fail(claim, error);
      } finally {
        clearInterval(heartbeatTimer);
        if (heartbeatPromise) await heartbeatPromise;
        this.active.delete(claim.id);
      }
    };
    const promise = work();

    this.active.set(claim.id, { claim, promise });
    await promise;
    return true;
  }

  async run(signal?: AbortSignal): Promise<void> {
    while (this.acceptingClaims && !signal?.aborted) {
      const processed = await this.processOne();
      if (!processed) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 250);
          timer.unref();
        });
      }
    }
  }

  async shutdown(graceMs = GAME_OPERATION_SHUTDOWN_MS): Promise<void> {
    this.acceptingClaims = false;
    const promises = [...this.active.values()].map(({ promise }) => promise);
    if (promises.length > 0) {
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.allSettled(promises).then(() => undefined),
          new Promise<void>((resolve) => {
            graceTimer = setTimeout(resolve, graceMs);
          }),
        ]);
      } finally {
        if (graceTimer) clearTimeout(graceTimer);
      }
    }
    await this.releaseOwnedLeases();
  }

  async releaseOwnedLeases(): Promise<number> {
    const released = await this.prisma.$transaction((tx) => tx.$executeRaw`
      UPDATE v1_outbox_events
      SET status = 'RETRY',
          available_at = CURRENT_TIMESTAMP + (
            CASE attempts
              WHEN 1 THEN INTERVAL '1 second'
              WHEN 2 THEN INTERVAL '5 seconds'
              WHEN 3 THEN INTERVAL '30 seconds'
              WHEN 4 THEN INTERVAL '2 minutes'
              ELSE INTERVAL '10 minutes'
            END
          ),
          lease_owner = NULL,
          lease_until = NULL,
          last_error = 'worker shutdown before completion',
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'PROCESSING'
        AND lease_owner = ${this.owner}
    `);
    this.retryCount += released;
    return released;
  }

  async getHealth() {
    const queue = await this.getQueueCounts();
    return {
      status: queue.poisoned > 0 || this.poisonCount > 0
        ? 'degraded'
        : this.handlers.size === 0
          ? 'not_ready'
          : 'healthy',
      acceptingClaims: this.acceptingClaims,
      activeHandlers: this.active.size,
      registeredHandlers: this.handlers.size,
      queue,
    };
  }

  async getMetrics() {
    const queue = await this.getQueueCounts();
    return {
      claims: this.claimCount,
      retries: this.retryCount,
      completions: this.completionCount,
      poisoned: this.poisonCount,
      casFailures: this.casFailureCount,
      active: this.active.size,
      queue,
    };
  }

  async onModuleDestroy(): Promise<void> {
    await this.shutdown();
  }

  private async lockClaim(tx: Prisma.TransactionClient, claim: GameOperationClaim): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM v1_outbox_events
      WHERE id = ${claim.id}
        AND status = 'PROCESSING'
        AND lease_owner = ${claim.leaseOwner}
        AND version = ${claim.version}
      FOR UPDATE
    `;
    return rows.length === 1;
  }

  private completeWith(
    client: Pick<Prisma.TransactionClient, '$executeRaw'>,
    claim: GameOperationClaim,
  ): Promise<number> {
    return client.$executeRaw`
      UPDATE v1_outbox_events
      SET status = 'COMPLETED',
          lease_owner = NULL,
          lease_until = NULL,
          last_error = NULL,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${claim.id}
        AND status = 'PROCESSING'
        AND lease_owner = ${claim.leaseOwner}
        AND version = ${claim.version}
    `;
  }

  private async runHandlerWithDeadline(
    handler: GameOperationHandler,
    claim: GameOperationClaim,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        handler(claim, tx),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () => reject(new Error(`Handler deadline exceeded for ${claim.id}`)),
            this.transactionTimeoutMs,
          );
          timeout.unref();
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async getQueueCounts(): Promise<QueueCounts> {
    const [counts] = await this.prisma.$queryRaw<QueueCounts[]>`
      SELECT
        COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending,
        COUNT(*) FILTER (WHERE status = 'RETRY')::int AS retry,
        COUNT(*) FILTER (WHERE status = 'PROCESSING')::int AS processing,
        COUNT(*) FILTER (WHERE status = 'POISONED')::int AS poisoned,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed
      FROM v1_outbox_events
    `;
    return counts ?? { pending: 0, retry: 0, processing: 0, poisoned: 0, completed: 0 };
  }

  private boundedError(error: unknown): string {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const databaseMessage = error.meta?.message;
      if (typeof databaseMessage === 'string' && databaseMessage.trim().length > 0) {
        const normalized = databaseMessage.trim().startsWith('ERROR: ')
          ? databaseMessage.trim().slice('ERROR: '.length)
          : databaseMessage.trim();
        return `Error: ${normalized}`.slice(0, MAX_ERROR_LENGTH);
      }
    }
    const value = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return value.slice(0, MAX_ERROR_LENGTH);
  }
}
