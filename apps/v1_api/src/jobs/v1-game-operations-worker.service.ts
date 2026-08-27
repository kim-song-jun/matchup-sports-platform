import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { GameResultOfficialProjectionService } from '../game-operations/game-result-official-projection.service';
import { GameResultVoidProjectionService } from '../game-operations/game-result-void-projection.service';
import { GameResultSubmittedEscalationService } from './result-escalation/game-result-submitted-escalation.service';
import { GameResultLeagueAutoApproveService } from './result-escalation/game-result-league-auto-approve.service';
import {
  LEAGUE_RESULT_ENTRY_REMINDER_TYPE,
  LeagueResultEntryReminderService,
} from './league-reminders/league-result-entry-reminder.service';
import {
  IDENTITY_LINK_EXPIRY_TYPE,
  IdentityLinkExpiryService,
} from './identity-link/identity-link-expiry.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebPushService } from '../notifications/web-push.service';

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
  /**
   * 커밋 뒤에 실행할 부수효과를 담는 자리 (2026-08-26). 핸들러는 트랜잭션 **안에서**
   * 돌기 때문에, 롤백할 수 없는 외부 발송(웹 푸시 등)을 거기서 바로 하면 트랜잭션이
   * 뒤집혔을 때 "일어나지 않은 일"의 알림이 나간다. 여기 담아 두면 워커가 커밋 성공
   * 직후에만 실행한다. 워커가 매 클레임마다 빈 배열로 채우므로 핸들러는 그냥 push 하면
   * 된다(직접 클레임을 만들어 핸들러를 부르는 유닛 스펙에서는 없을 수 있다 —
   * 그 경우 호출부가 즉시 실행으로 폴백한다).
   */
  afterCommit?: Array<() => void | Promise<void>>;
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
    // 리그 감사 그룹 A / R1: team_match_completed 알림의 Web Push best-effort 발송용.
    // ScheduleReminderService(main.ts)가 WebPushService를 받는 것과 같은 이유로 optional이다 —
    // 이 worktree/모듈 밖에서 `new V1GameOperationsWorkerService(prisma)` 형태로 직접 생성하는
    // 기존 통합테스트 호출부가 다수 있어(예: test/tournaments/*.integration-spec.ts) 인자 없이도
    // 계속 동작해야 한다. 실제 워커(v1-game-operations-worker.module.ts)에서는
    // WorkerNotificationsModule이 내보내는 WebPushService가 DI로 자동 주입된다.
    @Optional() private readonly webPush?: WebPushService,
  ) {
    this.transactionTimeoutMs = transactionTimeoutMs ?? GAME_OPERATION_TRANSACTION_TIMEOUT_MS;
    if (this.transactionTimeoutMs <= 0 || this.transactionTimeoutMs >= GAME_OPERATION_SHUTDOWN_MS) {
      throw new Error('Worker transaction timeout must be positive and shorter than shutdown grace');
    }
    const officialProjection = new GameResultOfficialProjectionService(this.webPush);
    this.registerHandler('GAME_RESULT_OFFICIAL', officialProjection.handler);
    const voidProjection = new GameResultVoidProjectionService();
    this.registerHandler('GAME_RESULT_VOIDED', voidProjection.handler);
    const submittedEscalation = new GameResultSubmittedEscalationService();
    this.registerHandler('GAME_RESULT_SUBMITTED', submittedEscalation.handler);
    this.registerHandler('GAME_RESULT_REVIEW_REMINDER', submittedEscalation.reminderHandler);
    this.registerHandler('GAME_RESULT_REVIEW_ESCALATION', submittedEscalation.escalationHandler);
    // D2 (E2): 리그 팀매치 결과가 24시간 무응답이면 자동 승인. 위 12시간 알림과는
    // 별개 잡이다 -- 이쪽은 실제 OFFICIAL 전이를 일으킨다.
    const leagueAutoApprove = new GameResultLeagueAutoApproveService();
    this.registerHandler('GAME_RESULT_LEAGUE_AUTO_APPROVE', leagueAutoApprove.handler);
    // 사용자 확정: 리그 대진의 경기 시작 +24시간에도 결과 미입력(not_entered)이면
    // active admin(owner/ops, support 제외) 전원에게 1회 알림. 스케줄은
    // league-match-admin.service.ts의 generateFixtures/regenerateFixtures(대진 생성)와
    // updateFixture(시작 시각 변경)가 건다 — league-result-entry-reminder.service.ts 참고.
    const leagueResultEntryReminder = new LeagueResultEntryReminderService();
    this.registerHandler(LEAGUE_RESULT_ENTRY_REMINDER_TYPE, leagueResultEntryReminder.handler);
    // 신원 연결 요청은 24시간 뒤 만료된다 — 예전에는 다음 attest 시도 때에야 기록되는
    // lazy 처리라 아무도 손대지 않으면 신청자가 결말을 알 수 없었다. 신청 시각 +24h 에
    // 만료를 확정하고 신청자에게 통보한다(identity-link-expiry.service.ts).
    const identityLinkExpiry = new IdentityLinkExpiryService(this.webPush);
    this.registerHandler(IDENTITY_LINK_EXPIRY_TYPE, identityLinkExpiry.handler);
    // reject/request_supplement close their own review SLA synchronously in
    // the API command (TournamentResultReviewService.closeReviewSla, Task
    // 22); the durable audit handler here only needs to make the outbox's
    // own business key idempotently durable, exactly like the CAS/flag
    // audit trail.
    this.registerDurableAuditHandler('GAME_RESULT_REJECTED');
    this.registerDurableAuditHandler('GAME_RESULT_SUPPLEMENT_REQUESTED');
    // GAME_RESULT_CHANGE_REQUESTED (GamesService.decideResultRevision's
    // TEAM_MATCH change-request branch, games.service.ts) is the same kind
    // of terminal review decision as REJECTED/SUPPLEMENT_REQUESTED above,
    // and needed the identical durable-audit treatment — outbox-handler
    // cleanup task found it writing but never claimed (retrying 6x then
    // POISONED). Unlike REJECTED/SUPPLEMENT_REQUESTED, this branch does NOT
    // yet synchronously close its own v1_result_escalations row the way
    // TournamentResultReviewService.closeReviewSla() does; that's a
    // pre-existing gap in the TEAM_MATCH review-decision flow, not something
    // this handler causes or fixes — the async GAME_RESULT_REVIEW_REMINDER/
    // ESCALATION handlers already guard on `revision.state !== 'SUBMITTED'`
    // so no duplicate/incorrect notification can fire once a decision lands,
    // it just leaves the escalation row's `status` sitting PENDING instead
    // of flipping to CLOSED. Left out of this task's scope deliberately.
    this.registerDurableAuditHandler('GAME_RESULT_CHANGE_REQUESTED');
  }

  /** Read-only registration introspection for tests — no DB access. */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
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

  // `available_at`/`lease_until`/`updated_at` are all `TIMESTAMP(3)` columns
  // (millisecond precision) in the migration, but `CURRENT_TIMESTAMP` itself
  // carries microsecond precision. Postgres ROUNDS (not truncates) when an
  // expression like `CURRENT_TIMESTAMP` or `CURRENT_TIMESTAMP + INTERVAL`
  // is coerced into a lower-precision column -- e.g. `04:48:12.585734` gets
  // stored as `04:48:12.586`, up to 0.5ms *later* than the real instant it
  // was computed at (verified directly: `SELECT clock_timestamp()::timestamp(3)
  // > clock_timestamp()` returns true on a live connection). That rounded-up
  // value can then be later, in wall-clock terms, than a `CURRENT_TIMESTAMP`
  // read by a *second*, separately-begun transaction that starts a fraction
  // of a millisecond afterward -- so `available_at <= CURRENT_TIMESTAMP` (or
  // `lease_until <= CURRENT_TIMESTAMP`) can spuriously evaluate false for a
  // row that should already be claimable, and claimOne() returns null even
  // though an eligible row exists (root cause of the flaky
  // "releases only its own leases..." / "applies every exact retry delay..."
  // integration-spec failures -- confirmed by running each ~50 times locally
  // and diagnostic-logging the exact stored vs. transaction-now values on
  // every empty claim). `date_trunc('milliseconds', ...)` floors instead of
  // rounding, so every value this service writes into one of those columns
  // is guaranteed <= the real instant it was computed -- never in the
  // future relative to any later reader's CURRENT_TIMESTAMP. This is a
  // dormant defect in the deployed worker too (not test-only): the actual
  // `run()` poll loop just never hits the race because its 250ms cadence is
  // ~500,000x wider than the max 0.5ms rounding error, so no job is ever
  // lost or double-processed in production -- a missed claim simply gets
  // picked up on the next poll. It only became reliably observable in
  // integration tests that insert/update a row and claim it back-to-back
  // with near-zero latency.
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
            updated_at = date_trunc('milliseconds', CURRENT_TIMESTAMP)
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
            lease_until = date_trunc('milliseconds', CURRENT_TIMESTAMP) + INTERVAL '30 seconds',
            attempts = event.attempts + 1,
            version = event.version + 1,
            updated_at = date_trunc('milliseconds', CURRENT_TIMESTAMP)
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
    // See claimOne()'s comment: floor to milliseconds so this can never
    // round the stored lease_until/updated_at into the future.
    const updated = await this.prisma.$executeRaw`
      UPDATE v1_outbox_events
      SET lease_until = date_trunc('milliseconds', CURRENT_TIMESTAMP) + INTERVAL '30 seconds',
          version = version + 1,
          updated_at = date_trunc('milliseconds', CURRENT_TIMESTAMP)
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
      // See claimOne()'s comment: floor to milliseconds so this can never
      // round the stored updated_at into the future.
      const poisoned = await this.prisma.$executeRaw`
        UPDATE v1_outbox_events
        SET status = 'POISONED',
            lease_owner = NULL,
            lease_until = NULL,
            last_error = ${lastError},
            version = version + 1,
            updated_at = date_trunc('milliseconds', CURRENT_TIMESTAMP)
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

    // See claimOne()'s comment: floor to milliseconds so this can never
    // round the stored available_at/updated_at into the future.
    const retryDelayMs = GAME_OPERATION_RETRY_DELAYS_MS[claim.attempts - 1];
    const retried = await this.prisma.$executeRaw`
      UPDATE v1_outbox_events
      SET status = 'RETRY',
          available_at = date_trunc('milliseconds', CURRENT_TIMESTAMP) + (${retryDelayMs} * INTERVAL '1 millisecond'),
          lease_owner = NULL,
          lease_until = NULL,
          last_error = ${lastError},
          version = version + 1,
          updated_at = date_trunc('milliseconds', CURRENT_TIMESTAMP)
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
      // 커밋 뒤 부수효과 수집함 — 핸들러가 여기에 담고, 아래에서 커밋이 확정된 뒤에만 실행한다.
      claim.afterCommit = [];
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
        // 커밋이 확정된 뒤에만 외부 발송을 한다. 롤백된 트랜잭션의 알림이 나가는 것을
        // 막는 유일한 지점이라, 실패해도 잡 결과에는 영향을 주지 않는다.
        for (const effect of claim.afterCommit ?? []) {
          const warn = (effectError: unknown) =>
            this.logger.warn(
              `after-commit effect failed for outbox job ${claim.id}: ${this.boundedError(effectError)}`,
            );
          try {
            // 비동기 부수효과도 허용한다 — 잡을 붙잡지 않도록 await 하지 않지만,
            // rejection 을 그냥 두면 unhandled rejection 이 되므로 catch 를 붙인다
            // (Copilot 리뷰).
            const outcome = effect();
            if (outcome instanceof Promise) void outcome.catch(warn);
          } catch (effectError: unknown) {
            warn(effectError);
          }
        }
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
    // See claimOne()'s comment: floor to milliseconds so this can never
    // round the stored available_at/updated_at into the future.
    const released = await this.prisma.$transaction((tx) => tx.$executeRaw`
      UPDATE v1_outbox_events
      SET status = 'RETRY',
          available_at = date_trunc('milliseconds', CURRENT_TIMESTAMP) + (
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
          updated_at = date_trunc('milliseconds', CURRENT_TIMESTAMP)
      WHERE status = 'PROCESSING'
        AND lease_owner = ${this.owner}
    `);
    this.retryCount += released;
    return released;
  }

  async getHealth() {
    const queue = await this.getQueueCounts();
    // 새 잡을 받아 처리할 수 있는지만 보는 판정 — POISONED 잡 존재와 무관하다. 녹아웃
    // 무승부처럼 알려진 정상 경로로 잡 1건이 POISONED 되면(knockout-penalties.ts:150
    // 참고) status 는 아래처럼 영구히 'degraded' 로 남는데, 그걸 프로덕션 배포
    // 헬스체크(deploy/docker-compose.prod.yml)가 그대로 게이트로 삼으면 그 배포는
    // 물론 실패한 배포를 되돌리는 restore_active_release() 의 롤백까지 같은 이유로
    // 영구 차단된다(2026-08-27, C-poisoned-outbox-deploy-gate). POISONED 존재는 여전히
    // 운영 알람 대상이므로 status/queue 필드에는 그대로 남기되, 배포 게이트는 이 필드만
    // 보게 분리한다.
    const deploymentStatus = this.handlers.size === 0 ? 'not_ready' : 'healthy';
    return {
      status: queue.poisoned > 0 || this.poisonCount > 0
        ? 'degraded'
        : deploymentStatus,
      deploymentStatus,
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
    // See claimOne()'s comment: floor to milliseconds so this can never
    // round the stored updated_at into the future.
    return client.$executeRaw`
      UPDATE v1_outbox_events
      SET status = 'COMPLETED',
          lease_owner = NULL,
          lease_until = NULL,
          last_error = NULL,
          version = version + 1,
          updated_at = date_trunc('milliseconds', CURRENT_TIMESTAMP)
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
