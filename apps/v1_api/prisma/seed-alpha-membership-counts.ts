import type { Prisma } from '@prisma/client';

// Alpha seeds preserve memberships created outside their own fixture roster.
export async function refreshAlphaTeamMembershipCounts(tx: Prisma.TransactionClient, teamId: string) {
  const roles = await tx.v1TeamMembership.groupBy({
    by: ['role'],
    where: { teamId, status: 'active' },
    _count: { _all: true },
  });
  return tx.v1Team.update({
    where: { id: teamId },
    data: {
      memberCount: roles.reduce((total, role) => total + role._count._all, 0),
      managerCount: roles.find((role) => role.role === 'manager')?._count._all ?? 0,
    },
  });
}
