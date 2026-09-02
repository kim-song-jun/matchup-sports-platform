import { Prisma } from '@prisma/client';

type ChatEntitlementRoom = {
  matchId: string | null;
  teamId: string | null;
  teamMatchId: string | null;
  teamMatch: {
    hostTeamId: string;
    approvedApplicantTeamId: string | null;
  } | null;
  teamContactId: string | null;
  teamContact: {
    fromTeamId: string;
    toTeamId: string;
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
            // 'matched' 로 exact-match 하면 결과 제출로 completed 전이되는 순간 채팅방이
            // 목록에서 통째로 사라진다 — approvedApplicantTeamId가 채워진 시점(=매칭
            // 확정)부터 completed 까지는 계속 대화가 필요하므로 두 상태 모두 허용한다.
            // cancelled/expired/recruiting/closed 는 여전히 제외돼 "매칭 전"·"매칭이
            // 취소된 뒤"는 이전과 동일하게 막힌다.
            status: { in: ['matched', 'completed'] },
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
      {
        // status 로 좁히지 않는다 — 컨택 방은 요청 시점부터 양 팀 운영진에게 보여야 한다
        // ("팀 컨택의 채팅 흡수" §3.6). 전송 가능 여부는 ChatService.sendMessage 의
        // TEAM_CONTACT_NOT_ACCEPTED 게이트가 따로 맡는다.
        teamContact: {
          is: {
            OR: [
              { fromTeam: { memberships: { some: { userId, status: 'active', role: { in: [...managerRoles] } } } } },
              { toTeam:   { memberships: { some: { userId, status: 'active', role: { in: [...managerRoles] } } } } },
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
  if (room.teamContactId) {
    const teamIds = [room.teamContact?.fromTeamId, room.teamContact?.toTeamId].filter(
      (teamId): teamId is string => Boolean(teamId),
    );
    return {
      user: {
        teamMemberships: {
          some: { teamId: { in: teamIds }, status: 'active', role: { in: [...managerRoles] } },
        },
      },
    };
  }
  // 여기 도달했다는 것은 이 함수가 모르는 방 종류가 생겼다는 뜻이다.
  // 예전에는 이 자리가 team_match 로 흘러내려 teamId: { in: [] } 를 만들었고,
  // 그 결과 알림 수신자가 예외 없이 0명이 됐다. 조용히 틀리느니 크게 실패한다.
  throw new Error('Chat room is not linked to a known target type');
}
