import type { Prisma } from '@prisma/client';
import type { V1AuthUser } from '../auth/v1-auth-user';

type FriendlyMatchScope = { leagueId: string | null; tournamentId: string | null };

function activePlatformAdmin(tx: Prisma.TransactionClient, userId: string) {
  return tx.v1AdminUser.findFirst({
    where: { userId, status: 'active', revokedAt: null, adminRole: { in: ['owner', 'ops'] }, user: { accountStatus: 'active' } },
    select: { id: true },
  });
}

/** A platform operator is an additional writer, never a substitute team. */
export async function platformMatchOperator(
  tx: Prisma.TransactionClient,
  user: V1AuthUser | null,
  match: FriendlyMatchScope & { platformManaged: boolean },
) {
  if (!user || user.accountStatus !== 'active' || !match.platformManaged || match.leagueId || match.tournamentId) return null;
  return activePlatformAdmin(tx, user.id);
}

/**
 * Corrects a friendly result after both teams confirmed it. Unlike live recording this is not
 * limited to platform-managed matches: once official no team can edit, so the admin is the only
 * corrector (2026-10-01 user decision "admins can always edit"). League/tournament games use the
 * result-review correction lane instead.
 */
export async function friendlyResultCorrector(
  tx: Prisma.TransactionClient,
  user: V1AuthUser | null,
  match: FriendlyMatchScope,
) {
  if (!user || user.accountStatus !== 'active' || match.leagueId || match.tournamentId) return null;
  return activePlatformAdmin(tx, user.id);
}
