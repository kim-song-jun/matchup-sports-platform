import { Prisma, V1TeamMatchStatus } from '@prisma/client';
import { cascadeCompleteTeamMatchSchedulesInTx } from '../team-schedules/team-schedules.service';

type Transaction = Prisma.TransactionClient;

/**
 * Completes a TeamMatch at the same transaction boundary as its result.
 *
 * This is intentionally shared by result submission and the console end
 * command so status, audit, and team-calendar completion cannot drift apart.
 * The update is idempotent: only the first caller writes the status log and
 * completes scheduled team calendars.
 */
export async function completeTeamMatchAtResultBoundary(
  tx: Transaction,
  teamMatchId: string,
  actorUserId: string | null,
  reason: string,
): Promise<void> {
  const before = await tx.v1TeamMatch.findUnique({
    where: { id: teamMatchId },
    select: { status: true },
  });
  if (before === null) return;
  const completion = await tx.v1TeamMatch.updateMany({
    where: { id: teamMatchId, status: { not: V1TeamMatchStatus.completed } },
    data: { status: V1TeamMatchStatus.completed, completedAt: new Date() },
  });
  if (completion.count !== 1) return;
  await tx.v1StatusChangeLog.create({
    data: {
      targetType: 'team_match',
      targetId: teamMatchId,
      fromStatus: before.status,
      toStatus: V1TeamMatchStatus.completed,
      actorType: actorUserId === null ? 'system' : 'user',
      actorUserId,
      reason,
    },
  });
  await cascadeCompleteTeamMatchSchedulesInTx(tx, teamMatchId);
}
