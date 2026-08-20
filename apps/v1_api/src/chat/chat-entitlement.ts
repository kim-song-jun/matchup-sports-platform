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
  if (room.teamMatchId) {
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
  // 여기 도달했다는 것은 이 함수가 모르는 방 종류가 생겼다는 뜻이다.
  // 예전에는 이 자리가 team_match 로 흘러내려 teamId: { in: [] } 를 만들었고,
  // 그 결과 알림 수신자가 예외 없이 0명이 됐다. 조용히 틀리느니 크게 실패한다.
  throw new Error('Chat room is not linked to a known target type');
}
