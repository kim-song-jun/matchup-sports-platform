import { Prisma } from '@prisma/client';

type ChatEntitlementRoom = {
  matchId: string | null;
  teamId: string | null;
  teamMatchId: string | null;
  teamMatch: {
    hostTeamId: string;
    approvedApplicantTeamId: string | null;
  } | null;
};

const managerRoles = ['owner', 'manager'] as const;

export function currentChatEntitlementWhere(userId: string): Prisma.V1ChatRoomWhereInput {
  return {
    OR: [
      {
        match: {
          is: {
            deletedAt: null,
            participants: { some: { userId, status: 'active' } },
          },
        },
      },
      {
        team: {
          is: {
            status: 'active',
            deletedAt: null,
            memberships: { some: { userId, status: 'active' } },
          },
        },
      },
      {
        teamMatch: {
          is: {
            status: 'matched',
            deletedAt: null,
            approvedApplicantTeamId: { not: null },
            OR: [
              {
                hostTeam: {
                  memberships: {
                    some: { userId, status: 'active', role: { in: [...managerRoles] } },
                  },
                },
              },
              {
                approvedApplicantTeam: {
                  is: {
                    memberships: {
                      some: { userId, status: 'active', role: { in: [...managerRoles] } },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    ],
  };
}

export function currentChatRecipientEntitlementWhere(
  room: ChatEntitlementRoom,
): Prisma.V1ChatRoomParticipantWhereInput {
  if (room.matchId) {
    return {
      user: {
        matchParticipants: {
          some: { matchId: room.matchId, status: 'active', match: { deletedAt: null } },
        },
      },
    };
  }
  if (room.teamId) {
    return {
      user: {
        teamMemberships: {
          some: {
            teamId: room.teamId,
            status: 'active',
            team: { status: 'active', deletedAt: null },
          },
        },
      },
    };
  }
  const teamIds = [room.teamMatch?.hostTeamId, room.teamMatch?.approvedApplicantTeamId].filter(
    (teamId): teamId is string => Boolean(teamId),
  );
  return {
    user: {
      teamMemberships: {
        some: {
          teamId: { in: teamIds },
          status: 'active',
          role: { in: [...managerRoles] },
        },
      },
    },
  };
}
