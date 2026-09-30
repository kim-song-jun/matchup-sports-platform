import type { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';

/** A platform operator is an additional writer, never a substitute team. */
export async function platformMatchOperator(
  tx: Prisma.TransactionClient,
  user: V1AuthUser | null,
  match: { platformManaged: boolean; leagueId: string | null; tournamentId: string | null },
) {
  if (!user || user.accountStatus !== 'active' || !match.platformManaged || match.leagueId || match.tournamentId) return null;
  return tx.v1AdminUser.findFirst({
    where: { userId: user.id, status: 'active', revokedAt: null, adminRole: { in: ['owner', 'ops'] }, user: { accountStatus: 'active' } },
    select: { id: true },
  });
}
