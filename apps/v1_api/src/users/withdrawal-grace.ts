import type { Prisma } from '@prisma/client';

/** How long a withdrawn account is kept (and can still be taken back) before it is destroyed. */
export const WITHDRAWAL_GRACE_DAYS = 30;

/**
 * Most accounts one run of the automatic deletion destroys. A deletion cannot be undone, so a run that finds many
 * due (the first one after deploy, or a bug that backdates requests) stops here and leaves the rest for the next hour.
 */
export const MAX_FINALIZATIONS_PER_RUN = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

type StatusLogReader = Pick<Prisma.TransactionClient, 'v1StatusChangeLog'>;

const WITHDRAWAL_REQUEST_LOG_WHERE = { targetType: 'user', toStatus: 'withdrawal_pending' } as const;

/**
 * When the account last became `withdrawal_pending`, or null when no such log exists. A member's own request
 * (`ProfileService.withdrawalRequest`) and an operator moving the account there (`AdminService.changeUserStatus`)
 * write the same log shape, so both start the clock; a cancelled and re-filed request counts from the latest one.
 */
export async function findWithdrawalRequestedAt(db: StatusLogReader, userId: string): Promise<Date | null> {
  const row = await db.v1StatusChangeLog.findFirst({
    where: { ...WITHDRAWAL_REQUEST_LOG_WHERE, targetId: userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}

/** `findWithdrawalRequestedAt` for many accounts in one query; accounts with no request log are absent from the map. */
export async function findWithdrawalRequestedAtByUser(
  db: StatusLogReader,
  userIds: readonly string[],
): Promise<Map<string, Date>> {
  if (userIds.length === 0) return new Map();
  const rows = await db.v1StatusChangeLog.groupBy({
    by: ['targetId'],
    where: { ...WITHDRAWAL_REQUEST_LOG_WHERE, targetId: { in: [...userIds] } },
    _max: { createdAt: true },
  });
  const requestedAt = new Map<string, Date>();
  for (const row of rows) {
    if (row._max.createdAt) requestedAt.set(row.targetId, row._max.createdAt);
  }
  return requestedAt;
}

export function withdrawalGraceEndsAt(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + WITHDRAWAL_GRACE_DAYS * DAY_MS);
}

/** The grace has run out at the instant it ends, not a moment after. */
export function isWithdrawalGraceElapsed(requestedAt: Date, now: Date): boolean {
  return now.getTime() >= withdrawalGraceEndsAt(requestedAt).getTime();
}

/**
 * ISO end of the grace period for an account that holds something (a phone number) another person is asking for.
 * Null when the account is not waiting to be destroyed, and also when it is but no request log says since when.
 * Only callers that already proved the number belongs to the asker may reveal this.
 */
export async function withdrawalPendingUntil(
  db: StatusLogReader,
  holder: { id: string; accountStatus: string },
): Promise<string | null> {
  if (holder.accountStatus !== 'withdrawal_pending') return null;
  const requestedAt = await findWithdrawalRequestedAt(db, holder.id);
  return requestedAt ? withdrawalGraceEndsAt(requestedAt).toISOString() : null;
}
