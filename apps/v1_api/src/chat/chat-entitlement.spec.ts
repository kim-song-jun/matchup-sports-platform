import { currentChatEntitlementWhere, currentChatRecipientEntitlementWhere } from './chat-entitlement';

// 감사 결함 회귀 방지(2026-08-27): 팀매치 채팅방이 rooms() 목록에 뜨려면 이 where 를
// 통과해야 한다. 예전엔 status:'matched' 로 exact-match 해서 결과 제출로 completed 로
// 전이되는 순간 방이 목록에서 사라졌다 — 경기 종료 뒤에도 대화를 이어갈 수 있어야 하므로
// matched/completed 둘 다 통과해야 한다. 플랫폼 주관 분기는 모집 중부터 열리지만
// 일반 팀매치는 양 팀 확정과 활성 owner/manager 계약을 그대로 유지한다.
describe('currentChatEntitlementWhere — 일반/플랫폼 팀매치 채팅 엔타이틀먼트', () => {
  function teamMatchEntitlement() {
    const where = currentChatEntitlementWhere('user-1');
    const relation = where.OR?.find((clause) => clause.teamMatch)?.teamMatch;
    if (!relation || !('is' in relation) || !relation.is) {
      throw new Error('Missing team-match room entitlement');
    }
    return relation.is;
  }

  const managers = {
    some: { userId: 'user-1', status: 'active', role: { in: ['owner', 'manager'] } },
  };

  it('일반 팀매치는 양 팀이 확정된 matched/completed 경기의 활성 운영진만 허용한다', () => {
    const entitlement = teamMatchEntitlement();
    expect(entitlement.deletedAt).toBeNull();
    expect(entitlement.OR).toHaveLength(2);
    expect(entitlement.OR?.find((clause) => clause.platformManaged === false)).toEqual({
      platformManaged: false,
      status: { in: ['matched', 'completed'] },
      hostTeamId: { not: null },
      approvedApplicantTeamId: { not: null },
      OR: [
        { hostTeam: { is: { memberships: managers } } },
        { approvedApplicantTeam: { is: { memberships: managers } } },
      ],
    });
  });

  it('플랫폼 모집은 팀 배정 전부터 현재 권한이 있는 생성 운영자 또는 배정 팀 운영진만 허용한다', () => {
    const entitlement = teamMatchEntitlement();
    expect(entitlement.deletedAt).toBeNull();
    expect(entitlement.OR?.find((clause) => clause.platformManaged === true)).toEqual({
      platformManaged: true,
      status: { in: ['recruiting', 'closed', 'matched', 'completed'] },
      OR: [
        {
          createdByUserId: 'user-1',
          createdByUser: {
            is: {
              adminUser: {
                is: {
                  status: 'active', revokedAt: null, adminRole: { in: ['owner', 'ops'] },
                  user: { accountStatus: 'active' },
                },
              },
            },
          },
        },
        { hostTeam: { is: { memberships: managers } } },
        { approvedApplicantTeam: { is: { memberships: managers } } },
      ],
    });
  });
});

describe('currentChatEntitlementWhere — 개인매치 주최자 채팅', () => {
  it('활성 일반 참가자가 있을 때 주최자도 현재 채팅 권한을 유지한다', () => {
    const where = currentChatEntitlementWhere('host-1');
    const matchBranch = where.OR?.find((clause: any) => 'match' in clause) as any;
    const hostBranch = matchBranch.match.is.OR.find((clause: any) => clause.hostUserId === 'host-1');

    expect(hostBranch.participants.some).toEqual({
      role: 'participant',
      status: { in: ['active', 'completed'] },
    });
  });
});

// "팀 컨택의 채팅 흡수" §3.6: 컨택 방은 요청 시점부터 양 팀 운영진에게 보여야 한다.
// status: 'accepted' 필터가 남아 있으면 requested/declined/withdrawn/expired 컨택 방이
// 방 목록에서 조용히 사라진다.
describe('currentChatEntitlementWhere — team_contact 분기는 status 로 좁히지 않는다', () => {
  it('teamContact 분기 where 에 status: accepted 가 없다', () => {
    const where = currentChatEntitlementWhere('user-1');
    const teamContactBranch = where.OR?.find((clause: any) => 'teamContact' in clause) as any;

    expect(JSON.stringify(teamContactBranch)).not.toContain('"status":"accepted"');
  });
});

describe('currentChatRecipientEntitlementWhere', () => {
  it('match 방이면 match 참가자로 좁힌다', () => {
    const where = currentChatRecipientEntitlementWhere({
      matchId: 'm1',
      teamId: null,
      teamMatchId: null,
      teamMatch: null,
      teamContactId: null,
      teamContact: null,
    });
    const participantBranch = (where.user as any)?.OR?.find((clause: any) => clause.matchParticipants);
    const hostBranch = (where.user as any)?.OR?.find((clause: any) => clause.hostedMatches);
    expect(participantBranch.matchParticipants.some.matchId).toBe('m1');
    expect(hostBranch.hostedMatches.some).toMatchObject({
      id: 'm1',
      participants: {
        some: { role: 'participant', status: { in: ['active', 'completed'] } },
      },
    });
  });

  it('team 방이면 팀 멤버십으로 좁힌다', () => {
    const where = currentChatRecipientEntitlementWhere({
      matchId: null,
      teamId: 't1',
      teamMatchId: null,
      teamMatch: null,
      teamContactId: null,
      teamContact: null,
    });
    expect(where.user?.teamMemberships?.some?.teamId).toBe('t1');
  });

  it('team_match 방이면 양 팀의 owner/manager 로 좁힌다', () => {
    const where = currentChatRecipientEntitlementWhere({
      matchId: null,
      teamId: null,
      teamMatchId: 'tm1',
      teamMatch: { hostTeamId: 'host', approvedApplicantTeamId: 'guest' },
      teamContactId: null,
      teamContact: null,
    });
    const some = where.user?.teamMemberships?.some;
    expect(some?.teamId).toEqual({ in: ['host', 'guest'] });
    expect(some?.role).toEqual({ in: ['owner', 'manager'] });
  });

  it('플랫폼 팀매치 수신자는 배정 팀 운영진과 현재 권한이 있는 생성 운영자로 좁힌다', () => {
    const where = currentChatRecipientEntitlementWhere({
      matchId: null,
      teamId: null,
      teamMatchId: 'tm-platform',
      teamMatch: {
        hostTeamId: null, approvedApplicantTeamId: 'guest',
        platformManaged: true, createdByUserId: 'operator-1',
      },
      teamContactId: null,
      teamContact: null,
    });
    expect(where).toEqual({
      OR: [
        {
          user: {
            teamMemberships: {
              some: { teamId: { in: ['guest'] }, status: 'active', role: { in: ['owner', 'manager'] } },
            },
          },
        },
        {
          userId: 'operator-1',
          user: {
            adminUser: {
              is: {
                status: 'active', revokedAt: null, adminRole: { in: ['owner', 'ops'] },
                user: { accountStatus: 'active' },
              },
            },
          },
        },
      ],
    });
  });

  it('team_contact 방이면 양 팀의 owner/manager 로 좁힌다', () => {
    const where = currentChatRecipientEntitlementWhere({
      matchId: null, teamId: null, teamMatchId: null, teamMatch: null,
      teamContactId: 'c1',
      teamContact: { fromTeamId: 'A', toTeamId: 'B' },
    });
    const some = where.user?.teamMemberships?.some;
    expect(some?.teamId).toEqual({ in: ['A', 'B'] });
    expect(some?.role).toEqual({ in: ['owner', 'manager'] });
  });

  // 이 테스트가 이 태스크의 존재 이유다.
  // 지금은 링크가 하나도 없는 방이 조용히 team_match 분기로 떨어져
  // teamId: { in: [] } 를 만든다 — 수신자 0명, 예외 없음. 알림이 소리 없이 사라진다.
  it('알려진 링크가 없는 방이면 조용히 빈 대상을 만들지 않고 실패한다', () => {
    expect(() =>
      currentChatRecipientEntitlementWhere({
        matchId: null,
        teamId: null,
        teamMatchId: null,
        teamMatch: null,
        teamContactId: null,
        teamContact: null,
      }),
    ).toThrow(/not linked/i);
  });
});
