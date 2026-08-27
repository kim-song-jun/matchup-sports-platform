import { currentChatEntitlementWhere, currentChatRecipientEntitlementWhere } from './chat-entitlement';

// 감사 결함 회귀 방지(2026-08-27): 팀매치 채팅방이 rooms() 목록에 뜨려면 이 where 를
// 통과해야 한다. 예전엔 status:'matched' 로 exact-match 해서 결과 제출로 completed 로
// 전이되는 순간 방이 목록에서 사라졌다 — 경기 종료 뒤에도 대화를 이어갈 수 있어야 하므로
// matched/completed 둘 다 통과해야 한다.
describe('currentChatEntitlementWhere — 팀매치 채팅 엔타이틀먼트는 matched/completed 둘 다 허용한다', () => {
  it('team_match 분기의 status 필터가 matched 와 completed 를 모두 포함한다', () => {
    const where = currentChatEntitlementWhere('user-1');
    const teamMatchBranch = where.OR?.find((clause: any) => 'teamMatch' in clause) as any;

    expect(teamMatchBranch.teamMatch.is.status).toEqual({ in: ['matched', 'completed'] });
    expect(teamMatchBranch.teamMatch.is.approvedApplicantTeamId).toEqual({ not: null });
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
    expect(where.user?.matchParticipants?.some?.matchId).toBe('m1');
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
