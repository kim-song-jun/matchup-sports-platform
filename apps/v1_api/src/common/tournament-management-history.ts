import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

type HistoryQuery = {
  targetType: string;
  targetId: string;
  action: string;
  afterJson?: { path: string[]; equals: string };
};

/** Admin and director actions share the same idempotency/decision history without fake admin accounts. */
export async function findTournamentManagementAction(
  db: PrismaService | Prisma.TransactionClient,
  where: HistoryQuery,
) {
  const admin = await db.v1AdminActionLog.findFirst({
    where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, afterJson: true, createdAt: true },
  });
  const director = await db.v1OperationAudit.findFirst({
    where: { resourceType: where.targetType, resourceId: where.targetId, action: where.action,
      actorType: 'USER', ...(where.afterJson ? { after: where.afterJson } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true, after: true, createdAt: true },
  });
  if (director && (!admin || director.createdAt > admin.createdAt)) return { ...director, afterJson: director.after };
  return admin;
}
