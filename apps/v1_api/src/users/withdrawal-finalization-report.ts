import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';

/** Outbox event type the worker turns into a Slack message. */
export const WITHDRAWAL_FINALIZATION_REPORT_TYPE = 'WITHDRAWAL_FINALIZATION_REPORT';

/** Why an account past its grace period was left alone for a person to look at. */
export type WithdrawalSkipReason = 'no_request_log' | 'active_admin' | 'team_authority' | 'finalization_failed';

export interface WithdrawalFinalizationReportPayload {
  runAt: string;
  finalizedCount: number;
  skipped: { userId: string; reason: WithdrawalSkipReason }[];
  /** Accounts past their grace period that the run's deletion cap left for the next run. */
  remainingDue: number;
}

export interface WithdrawalFinalizationRunResult {
  finalizedUserIds: string[];
  skipped: { userId: string; reason: WithdrawalSkipReason }[];
  remainingDue: number;
}

/**
 * Queues one report for a run that finalized or skipped anything; a quiet run queues nothing.
 *
 * The key is the UTC day plus a digest of what the run did, so the same unresolved accounts are reported once
 * a day instead of every hourly run, and two instances reaching the same result report once. Ids only: the
 * payload never carries an email, phone number or name.
 */
export async function recordWithdrawalFinalizationReport(
  db: { v1OutboxEvent: Pick<Prisma.TransactionClient['v1OutboxEvent'], 'createMany'> },
  result: WithdrawalFinalizationRunResult,
  runAt: Date,
): Promise<boolean> {
  if (result.finalizedUserIds.length === 0 && result.skipped.length === 0 && result.remainingDue === 0) return false;

  const skipped = [...result.skipped].sort((a, b) => a.userId.localeCompare(b.userId));
  const digest = createHash('sha256')
    .update(JSON.stringify({ finalized: [...result.finalizedUserIds].sort(), skipped, remainingDue: result.remainingDue }))
    .digest('hex')
    .slice(0, 16);
  const payload: WithdrawalFinalizationReportPayload = {
    runAt: runAt.toISOString(),
    finalizedCount: result.finalizedUserIds.length,
    skipped,
    remainingDue: result.remainingDue,
  };

  const created = await db.v1OutboxEvent.createMany({
    data: [
      {
        businessKey: `withdrawal-finalization:${runAt.toISOString().slice(0, 10)}:${digest}`,
        aggregateType: 'WITHDRAWAL_FINALIZATION',
        aggregateId: payload.runAt,
        type: WITHDRAWAL_FINALIZATION_REPORT_TYPE,
        payload: payload as unknown as Prisma.InputJsonValue,
      },
    ],
    skipDuplicates: true,
  });
  return created.count === 1;
}
