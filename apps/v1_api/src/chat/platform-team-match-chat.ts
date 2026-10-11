import type { Prisma } from '@prisma/client';

export const activeChatOperator = {
  status: 'active', revokedAt: null, adminRole: { in: ['owner', 'ops'] },
  user: { accountStatus: 'active' },
} satisfies Prisma.V1AdminUserWhereInput;

export type TeamMatchChatSource = {
  platformManaged: boolean;
  createdByUserId: string | null;
  hostTeamId: string | null;
  approvedApplicantTeamId: string | null;
};

/**
 * Seeds a participant row for every user entitled to the team match room (both teams' owners/managers
 * and the active platform operator). Existing rows are never touched, so a member who left stays out.
 */
export async function enrollTeamMatchChatMembers(
  tx: Prisma.TransactionClient,
  room: { id: string; createdAt: Date },
  match: TeamMatchChatSource,
): Promise<string | null> {
  const managers = await tx.v1TeamMembership.findMany({
    where: {
      teamId: { in: [match.hostTeamId, match.approvedApplicantTeamId].filter((id): id is string => Boolean(id)) },
      status: 'active', role: { in: ['owner', 'manager'] }, user: { accountStatus: 'active' },
    },
    select: { userId: true },
  });
  const operator = match.platformManaged && match.createdByUserId ? await tx.v1AdminUser.findFirst({
    where: { userId: match.createdByUserId, ...activeChatOperator }, select: { userId: true },
  }) : null;
  const userIds = [...new Set([...managers.map((member) => member.userId), ...(operator ? [operator.userId] : [])])];
  if (userIds.length) await tx.v1ChatRoomParticipant.createMany({
    data: userIds.map((userId) => ({ chatRoomId: room.id, userId, status: 'active', visibleFromAt: room.createdAt })),
    skipDuplicates: true,
  });
  return operator?.userId ?? null;
}

/** Same transaction as recruitment creation/approval; never resets existing history/preferences. */
export async function ensurePlatformTeamMatchChat(tx: Prisma.TransactionClient, teamMatchId: string) {
  const match = await tx.v1TeamMatch.findUniqueOrThrow({
    where: { id: teamMatchId },
    select: { platformManaged: true, createdByUserId: true, hostTeamId: true, approvedApplicantTeamId: true, deletedAt: true },
  });
  if (!match.platformManaged || match.deletedAt) return;
  const room = await tx.v1ChatRoom.upsert({
    where: { teamMatchId }, create: { teamMatchId, status: 'active' }, update: {},
  });
  const operatorUserId = await enrollTeamMatchChatMembers(tx, room, match);
  if (operatorUserId) await tx.v1ChatRoomParticipant.updateMany({
    where: { chatRoomId: room.id, userId: operatorUserId, status: 'left' },
    data: { status: 'active', leftAt: null },
  });
}
