import {
  currentChatEntitlementWhere, currentChatRecipientEntitlementWhere, matchChatReadableWhere, matchChatSendBlock,
} from './chat-entitlement';

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
  it('주최자는 일반 참가자의 상태와 무관하게 기존 방의 읽기 권한을 유지한다', () => {
    const where = currentChatEntitlementWhere('host-1');
    const matchBranch = where.OR?.find((clause: any) => 'match' in clause) as any;
    const hostBranch = matchBranch.match.is.OR.find((clause: any) => clause.hostUserId === 'host-1');

    expect(hostBranch).toEqual({ hostUserId: 'host-1' });
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
    expect(hostBranch.hostedMatches.some).toEqual({ id: 'm1', deletedAt: null });
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

describe('개인 매치 채팅 — 읽기 규칙 하나, 쓰기 규칙 따로', () => {
  it('채팅 목록의 match 절이 읽기 규칙과 같은 객체다 (두 벌이 아니다)', () => {
    const clause = currentChatEntitlementWhere('user-1').OR?.find((c) => c.match);
    expect(clause).toEqual({ match: { is: matchChatReadableWhere('user-1') } });
  });

  const host = (participants: { role: string; status: string }[], status = 'recruiting') =>
    matchChatSendBlock({ status, hostUserId: 'host', participants }, 'host');

  it('확정 참가자가 없는 주최자는 쓰기만 막힌다', () => {
    expect(host([{ role: 'host', status: 'active' }])).toBe('PARTICIPANTS_NOT_CONFIRMED');
    expect(host([{ role: 'participant', status: 'cancelled' }])).toBe('PARTICIPANTS_NOT_CONFIRMED');
  });

  it('확정(active/completed) 참가자가 있으면 주최자도 쓸 수 있다', () => {
    expect(host([{ role: 'participant', status: 'active' }])).toBeNull();
    expect(host([{ role: 'participant', status: 'completed' }], 'completed')).toBeNull();
  });

  it('취소된 매치는 누구든 쓰기가 막힌다 (참가자 포함)', () => {
    expect(host([{ role: 'participant', status: 'active' }], 'cancelled')).toBe('MATCH_CANCELLED');
    expect(matchChatSendBlock({ status: 'cancelled', hostUserId: 'host', participants: [{ role: 'participant', status: 'active' }] }, 'guest'))
      .toBe('MATCH_CANCELLED');
  });

  it('일반 참가자는 모집 중이면 쓸 수 있다', () => {
    expect(matchChatSendBlock({ status: 'recruiting', hostUserId: 'host', participants: [{ role: 'participant', status: 'active' }] }, 'guest'))
      .toBeNull();
  });
});

// 읽기 규칙(목록·열람)과 수신자 규칙(푸시·안 읽음·소켓)은 같은 사람을 가리켜야 한다.
// 두 where 를 같은 가짜 DB 행에 대해 평가해 결과가 일치하는지 본다.
describe('개인 매치 채팅 — 읽기 가능 여부와 수신자 자격이 일치한다', () => {
  type P = { userId: string; role: string; status: string; application?: { status: string } | null };
  type M = { id: string; hostUserId: string; status: string; deletedAt: Date | null; participants: P[] };
  const evalWhere = (where: any, row: any): boolean => {
    if (where == null) return true;
    return Object.entries(where).every(([key, cond]: [string, any]) => {
      if (key === 'OR') return cond.some((c: any) => evalWhere(c, row));
      const value = row[key];
      if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
        if ('some' in cond) return (value ?? []).some((v: any) => evalWhere(cond.some, v));
        if ('in' in cond) return cond.in.includes(value);
        if ('is' in cond) return value != null && evalWhere(cond.is, value);
        return value != null && evalWhere(cond, value);
      }
      return value === cond;
    });
  };
  // 사용자 쪽 행: 그 사용자의 참가 행(match 포함)과 주최 매치.
  const userRow = (m: M, userId: string) => ({
    matchParticipants: m.participants.filter((p) => p.userId === userId).map((p) => ({ ...p, matchId: m.id, match: m })),
    hostedMatches: m.hostUserId === userId ? [m] : [],
  });

  const hostRow: P = { userId: 'host', role: 'host', status: 'active' };
  const guest = (status: string, applicationStatus: string | null = null): P => ({
    userId: 'guest', role: 'participant', status, application: applicationStatus ? { status: applicationStatus } : null,
  });
  const match = (over: Partial<M>): M => ({
    id: 'm1', hostUserId: 'host', status: 'recruiting', deletedAt: null, participants: [hostRow], ...over,
  });

  const cases: { name: string; m: M; user: string; readable: boolean }[] = [
    { name: '참가행 없이 마지막 참가자가 철회한 방의 주최자', m: match({ participants: [guest('cancelled', 'withdrawn')] }), user: 'host', readable: true },
    { name: '참가행 없이 취소된 방의 주최자', m: match({ status: 'cancelled', participants: [] }), user: 'host', readable: true },
    { name: '확정 참가자 없는 방의 주최자', m: match({}), user: 'host', readable: true },
    { name: '확정 참가자가 있는 방의 주최자', m: match({ participants: [hostRow, guest('active')] }), user: 'host', readable: true },
    { name: '확정 참가자', m: match({ participants: [hostRow, guest('active')] }), user: 'guest', readable: true },
    { name: '취소된 매치의 주최자', m: match({ status: 'cancelled', participants: [hostRow, guest('active')] }), user: 'host', readable: true },
    { name: '취소된 매치의 기존 확정 참가자', m: match({ status: 'cancelled', participants: [hostRow, guest('active')] }), user: 'guest', readable: true },
    { name: '종료된 매치의 참가자', m: match({ status: 'completed', participants: [hostRow, guest('completed')] }), user: 'guest', readable: true },
    { name: '내보내진 참가자', m: match({ participants: [hostRow, guest('removed')] }), user: 'guest', readable: false },
    { name: '철회한 참가자', m: match({ participants: [hostRow, guest('cancelled')] }), user: 'guest', readable: false },
    // MatchesService.cancel 은 승인 신청을 그대로 두고 참가 행만 cancelled 로 바꾼다.
    { name: '매치 취소로 cancelled 가 된 참가자', m: match({ status: 'cancelled', participants: [hostRow, guest('cancelled', 'approved')] }), user: 'guest', readable: true },
    { name: '매치 취소로 모두 cancelled 가 된 방의 주최자', m: match({ status: 'cancelled', participants: [hostRow, guest('cancelled', 'approved')] }), user: 'host', readable: true },
    { name: '취소 전에 스스로 철회한 참가자(취소된 매치)', m: match({ status: 'cancelled', participants: [hostRow, guest('cancelled', 'withdrawn')] }), user: 'guest', readable: false },
    { name: '취소 전에 정원 재확인으로 빠진 참가자(취소된 매치)', m: match({ status: 'cancelled', participants: [hostRow, guest('cancelled', null)] }), user: 'guest', readable: false },
    { name: '취소 전에 내보내진 참가자(취소된 매치)', m: match({ status: 'cancelled', participants: [hostRow, guest('removed', 'cancelled_by_host')] }), user: 'guest', readable: false },
    { name: '취소 전에 모두 철회한 방의 주최자(취소된 매치)', m: match({ status: 'cancelled', participants: [hostRow, guest('cancelled', 'withdrawn')] }), user: 'host', readable: true },
    // 주최자가 참가하지 않는 매치는 주최자 행도 cancelled 라 참가 행으로는 열람할 근거가 없다.
    { name: '불참 주최자: 취소로 빠진 참가자가 있으면 취소된 매치를 열람한다', m: match({ status: 'cancelled', participants: [{ ...hostRow, status: 'cancelled' }, guest('cancelled', 'approved')] }), user: 'host', readable: true },
    { name: '불참 주최자: 취소 전에 모두 철회해도 기존 방은 읽기 전용으로 유지', m: match({ status: 'cancelled', participants: [{ ...hostRow, status: 'cancelled' }, guest('cancelled', 'withdrawn')] }), user: 'host', readable: true },
    { name: '취소되지 않은 매치의 철회 참가자는 신청이 approved 여도 불가', m: match({ participants: [hostRow, guest('cancelled', 'approved')] }), user: 'guest', readable: false },
    { name: '무관한 사용자', m: match({ participants: [hostRow, guest('active')] }), user: 'stranger', readable: false },
    { name: '삭제된 매치의 주최자', m: match({ deletedAt: new Date() }), user: 'host', readable: false },
    { name: '삭제된 매치의 확정 참가자', m: match({ deletedAt: new Date(), participants: [hostRow, guest('active')] }), user: 'guest', readable: false },
  ];

  it.each(cases)('$name: 열람 가능 $readable, 수신자 자격도 같다', ({ m, user, readable }) => {
    const canRead = evalWhere(matchChatReadableWhere(user), m);
    const isRecipient = evalWhere(
      (currentChatRecipientEntitlementWhere({
        matchId: m.id, teamId: null, teamMatchId: null, teamMatch: null, teamContactId: null, teamContact: null,
      }) as any).user,
      userRow(m, user),
    );
    expect(canRead).toBe(readable);
    expect(isRecipient).toBe(canRead);
  });
});
