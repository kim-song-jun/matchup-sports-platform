import { ConflictException } from '@nestjs/common';
import { Prisma, V1AuthProvider } from '@prisma/client';

/** `Prisma.TransactionClient` and `PrismaService` both satisfy this, so the check runs inside or outside a transaction. */
type EmailLookupClient = Pick<Prisma.TransactionClient, 'v1User'>;

/** Refuses an address another account holds as its email or as its email login key; says nothing else about that account. */
export async function assertEmailFree(db: EmailLookupClient, callerId: string, email: string) {
  const holder = await db.v1User.findFirst({
    where: {
      id: { not: callerId },
      OR: [{ email }, { authIdentities: { some: { provider: V1AuthProvider.email, providerUserKey: email } } }],
    },
    select: { id: true },
  });
  if (holder) throw emailConflict();
}

export function emailConflict() {
  return new ConflictException({ code: 'EMAIL_CONFLICT', message: '이미 다른 계정에서 쓰는 이메일이에요.' });
}

/**
 * Serializes everything that claims one address as an email login key (adding an email login, changing the account
 * email). Signup takes no lock; the unique indexes cover that race. Release is automatic at the end of the transaction.
 */
export async function lockEmailIdentity(tx: Prisma.TransactionClient, email: string) {
  const identityScope = JSON.stringify(['account-link-identity', V1AuthProvider.email, email]);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identityScope}, 0))`;
}

/** A unique-index violation on the account email or on an email login key — another account took the address first. */
export function isEmailUniqueViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  const columns = Array.isArray(target) ? target.join(',') : typeof target === 'string' ? target : '';
  return /email|provider_?user_?key/i.test(columns);
}
