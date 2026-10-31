import type { Prisma } from '@prisma/client';
import { withdrawalPendingUntil } from '../users/withdrawal-grace';

/**
 * The account row that holds this phone number. `v1_users.phone` is unique, so any row blocks the number whatever
 * its status; only a final deletion frees it, by overwriting the column. Registration's PHONE_CONFLICT and the
 * pre-signup verify answer both read it through here, so the two can never disagree.
 */
export function findPhoneHolder(db: Pick<Prisma.TransactionClient, 'v1User'>, phone: string) {
  return db.v1User.findUnique({ where: { phone }, select: { id: true, accountStatus: true } });
}

export async function isPhoneRegistered(db: Pick<Prisma.TransactionClient, 'v1User'>, phone: string): Promise<boolean> {
  return (await findPhoneHolder(db, phone)) !== null;
}

/** `isPhoneRegistered` plus, when the holder is a withdrawal waiting out its grace period, when that period ends. */
export async function findPhoneRegistration(
  db: Pick<Prisma.TransactionClient, 'v1User' | 'v1StatusChangeLog'>,
  phone: string,
): Promise<{ registered: boolean; withdrawalPendingUntil: string | null }> {
  const holder = await findPhoneHolder(db, phone);
  if (!holder) return { registered: false, withdrawalPendingUntil: null };
  return { registered: true, withdrawalPendingUntil: await withdrawalPendingUntil(db, holder) };
}
