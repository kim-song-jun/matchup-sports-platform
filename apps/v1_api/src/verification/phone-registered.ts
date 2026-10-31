import type { Prisma } from '@prisma/client';

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
