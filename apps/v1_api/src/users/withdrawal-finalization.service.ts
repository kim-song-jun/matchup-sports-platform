import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { finalizeAccountDeletion, lockUserRow } from './final-account-deletion';
import {
  recordWithdrawalFinalizationReport,
  type WithdrawalFinalizationRunResult,
  type WithdrawalSkipReason,
} from './withdrawal-finalization-report';
import {
  MAX_FINALIZATIONS_PER_RUN,
  findWithdrawalRequestedAt,
  findWithdrawalRequestedAtByUser,
  isWithdrawalGraceElapsed,
} from './withdrawal-grace';

const RUN_INTERVAL_MS = 60 * 60 * 1000;

/** Recorded on the status log of every account this job deletes. */
export const WITHDRAWAL_GRACE_ELAPSED_REASON = 'withdrawal_grace_elapsed';

// Wider than the operator delete, which only refuses an active team: a suspended team still has an owner or manager
// somebody must hand over. Only archived and deleted teams are let go.
const TEAM_STILL_RUNNING = { status: { not: 'archived' }, deletedAt: null } satisfies Prisma.V1TeamWhereInput;

type Outcome = { kind: 'finalized' } | { kind: 'skipped'; reason: WithdrawalSkipReason } | { kind: 'unchanged' };

/**
 * Destroys accounts whose withdrawal request is older than the grace period (privacy policy: kept 30 days, then
 * destroyed). It runs hourly in every API instance; there is no cross-instance lock because each account is
 * decided under its own row lock and re-checked there, so a second instance either waits and finds the account
 * already deleted or finds nothing due.
 *
 * Accounts that need a person (an active admin record, team authority, no request log, or a failed attempt) are
 * left untouched and listed in the run's report. A run destroys at most `MAX_FINALIZATIONS_PER_RUN` accounts; the
 * count of due accounts it left for the next run is in the report too.
 */
@Injectable()
export class WithdrawalFinalizationService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private activeRun?: Promise<void>;
  private stopping = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(WithdrawalFinalizationService.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.runScheduled();
    }, RUN_INTERVAL_MS);
    this.timer.unref?.();
    void this.runScheduled();
  }

  /** Lets the run in flight finish its current account and record its report before the process goes away. */
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.stopping = true;
    await this.activeRun;
  }

  private runScheduled(): Promise<void> {
    if (this.activeRun) return this.activeRun;
    this.activeRun = this.finalizeDue()
      .then(() => undefined)
      .catch((error: unknown) => {
        this.logger.error({ err: error }, '탈퇴 유예 기간이 지난 계정 삭제 실패');
      })
      .finally(() => {
        this.activeRun = undefined;
      });
    return this.activeRun;
  }

  /** One pass over every `withdrawal_pending` account. Exposed with an injectable clock for the boundary tests. */
  async finalizeDue(now: Date = new Date()): Promise<WithdrawalFinalizationRunResult> {
    const result: WithdrawalFinalizationRunResult = { finalizedUserIds: [], skipped: [], remainingDue: 0 };
    const pending = await this.prisma.v1User.findMany({
      where: { accountStatus: 'withdrawal_pending' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const requestedAt = await findWithdrawalRequestedAtByUser(
      this.prisma,
      pending.map((user) => user.id),
    );

    for (const { id: userId } of pending) {
      const since = requestedAt.get(userId);
      if (!since) {
        result.skipped.push({ userId, reason: 'no_request_log' });
        continue;
      }
      if (!isWithdrawalGraceElapsed(since, now)) continue;
      if (this.stopping || result.finalizedUserIds.length >= MAX_FINALIZATIONS_PER_RUN) {
        result.remainingDue += 1;
        continue;
      }

      try {
        const outcome = await this.finalizeOne(userId, now);
        if (outcome.kind === 'finalized') result.finalizedUserIds.push(userId);
        else if (outcome.kind === 'skipped') result.skipped.push({ userId, reason: outcome.reason });
      } catch (error) {
        this.logger.error({ err: error, userId }, '탈퇴 유예 기간이 지난 계정 삭제 실패');
        result.skipped.push({ userId, reason: 'finalization_failed' });
      }
    }

    if (result.finalizedUserIds.length > 0) {
      this.logger.info({ finalized: result.finalizedUserIds.length }, '탈퇴 유예 기간이 지난 계정을 삭제했어요');
    }
    try {
      await recordWithdrawalFinalizationReport(this.prisma, result, now);
    } catch (error) {
      // The deletions above are committed and cannot be rolled back, so a lost report is logged, not thrown.
      this.logger.error(
        { err: error, finalized: result.finalizedUserIds.length, skipped: result.skipped.length },
        '탈퇴 계정 삭제 결과 보고 기록 실패',
      );
    }
    return result;
  }

  private finalizeOne(userId: string, now: Date): Promise<Outcome> {
    return this.prisma.$transaction(async (tx): Promise<Outcome> => {
      await lockUserRow(tx, userId);

      // Everything below is decided again under the lock: the account may have been restored, deleted by an
      // operator or by another instance, or have filed a newer request since the scan.
      const target = await tx.v1User.findUnique({
        where: { id: userId },
        select: { id: true, accountStatus: true, email: true, phone: true, deletedAt: true },
      });
      if (target?.accountStatus !== 'withdrawal_pending') return { kind: 'unchanged' };

      const requestedAt = await findWithdrawalRequestedAt(tx, userId);
      if (!requestedAt) return { kind: 'skipped', reason: 'no_request_log' };
      if (!isWithdrawalGraceElapsed(requestedAt, now)) return { kind: 'unchanged' };

      const admin = await tx.v1AdminUser.findUnique({ where: { userId }, select: { status: true } });
      if (admin?.status === 'active') return { kind: 'skipped', reason: 'active_admin' };

      const [authority, ownedTeam] = await Promise.all([
        tx.v1TeamMembership.findFirst({
          where: { userId, status: 'active', role: { in: ['owner', 'manager'] }, team: TEAM_STILL_RUNNING },
          select: { id: true },
        }),
        tx.v1Team.findFirst({ where: { ownerUserId: userId, ...TEAM_STILL_RUNNING }, select: { id: true } }),
      ]);
      if (authority || ownedTeam) return { kind: 'skipped', reason: 'team_authority' };

      await finalizeAccountDeletion(tx, {
        target,
        actor: { type: 'system' },
        reason: WITHDRAWAL_GRACE_ELAPSED_REASON,
        deletedAt: now,
        logger: this.logger,
      });
      return { kind: 'finalized' };
    });
  }
}
