import { Prisma } from '@prisma/client';
import { activeChatOperator } from './platform-team-match-chat';

type ChatEntitlementRoom = {
  matchId: string | null;
  teamId: string | null;
  teamMatchId: string | null;
  teamMatch: {
    hostTeamId: string | null;
    approvedApplicantTeamId: string | null;
    platformManaged?: boolean;
    createdByUserId?: string | null;
  } | null;
  teamContactId: string | null;
  teamContact: {
    fromTeamId: string;
    toTeamId: string;
  } | null;
};

const managerRoles = ['owner', 'manager'] as const;

export function teamMatchChatEntitlementWhere(userId: string): Prisma.V1TeamMatchWhereInput {
  const managers = { some: { userId, status: 'active' as const, role: { in: [...managerRoles] } } };
  return {
    deletedAt: null,
    OR: [
      {
        platformManaged: true, status: { in: ['recruiting', 'closed', 'matched', 'completed'] },
        OR: [
          { createdByUserId: userId, createdByUser: { is: { adminUser: { is: activeChatOperator } } } },
          { hostTeam: { is: { memberships: managers } } },
          { approvedApplicantTeam: { is: { memberships: managers } } },
        ],
      },
      {
        platformManaged: false, status: { in: ['matched', 'completed'] },
        hostTeamId: { not: null }, approvedApplicantTeamId: { not: null },
        OR: [
          { hostTeam: { is: { memberships: managers } } },
          { approvedApplicantTeam: { is: { memberships: managers } } },
        ],
      },
    ],
  };
}

export function currentChatEntitlementWhere(userId: string): Prisma.V1ChatRoomWhereInput {
  return {
    OR: [
      {
        match: {
          is: {
            deletedAt: null,
            OR: [
              { participants: { some: { userId, status: { in: ['active', 'completed'] } } } },
              {
                hostUserId: userId,
                participants: { some: { role: 'participant', status: { in: ['active', 'completed'] } } },
              },
            ],
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
      { teamMatch: { is: teamMatchChatEntitlementWhere(userId) } },
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
        OR: [
          {
            matchParticipants: {
              some: { matchId: room.matchId, status: { in: ['active', 'completed'] }, match: { deletedAt: null } },
            },
          },
          {
            hostedMatches: {
              some: {
                id: room.matchId,
                deletedAt: null,
                participants: { some: { role: 'participant', status: { in: ['active', 'completed'] } } },
              },
            },
          },
        ],
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
    const teamManagers: Prisma.V1ChatRoomParticipantWhereInput = {
      user: { teamMemberships: { some: { teamId: { in: teamIds }, status: 'active', role: { in: [...managerRoles] } } } },
    };
    if (!room.teamMatch?.platformManaged || !room.teamMatch.createdByUserId) return teamManagers;
    return { OR: [teamManagers, {
      userId: room.teamMatch.createdByUserId,
      user: { adminUser: { is: activeChatOperator } },
    }] };
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
