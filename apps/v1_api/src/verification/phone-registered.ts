import type { Prisma } from '@prisma/client';
import { withdrawalPendingUntil } from '../users/withdrawal-grace';

/**
 * Whether an account row already holds this phone number. `v1_users.phone` is unique, so any row blocks the
 * number whatever its status; only the admin delete flow frees it, by overwriting the column. Registration's
 * PHONE_CONFLICT and the pre-signup verify answer both use this, so the two can never disagree.
 */
export async function isPhoneRegistered(
  db: Pick<Prisma.TransactionClient, 'v1User'>,
  phone: string,
): Promise<boolean> {
  const holder = await db.v1User.findUnique({ where: { phone }, select: { id: true } });
  return holder !== null;
}

/**
 * `isPhoneRegistered` plus, when the holder is a withdrawn account waiting out its grace period, when that
 * period ends. Same rule as the plain check, so what the caller learns and what registration enforces agree.
 */
export async function findPhoneRegistration(
  db: Pick<Prisma.TransactionClient, 'v1User' | 'v1StatusChangeLog'>,
  phone: string,
): Promise<{ registered: boolean; withdrawalPendingUntil: string | null }> {
  const holder = await db.v1User.findUnique({ where: { phone }, select: { id: true, accountStatus: true } });
  if (!holder) return { registered: false, withdrawalPendingUntil: null };
  return { registered: true, withdrawalPendingUntil: await withdrawalPendingUntil(db, holder) };
}
