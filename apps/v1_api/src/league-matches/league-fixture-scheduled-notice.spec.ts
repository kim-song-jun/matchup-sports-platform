import {
  firstGameByTeam,
  firstGameNoticeBody,
  playerRecipientsByTeam,
  type ScheduledFixtureRow,
} from './league-fixture-scheduled-notice';

function fixture(overrides: Partial<ScheduledFixtureRow> & { at: string | null }): ScheduledFixtureRow {
  const { at, ...rest } = overrides;
  return {
    startAt: at === null ? null : new Date(at),
    hostTeamId: 'team-mapo',
    hostTeam: { name: '마포 FC' },
    approvedApplicantTeamId: 'team-hapjeong',
    approvedApplicantTeam: { name: 'QA0929 합정 유나이티드' },
    ...rest,
  };
}

describe('firstGameByTeam', () => {
  it('팀마다 가장 이른 대진을 고르고, 홈·원정 양쪽 팀 모두에게 상대 이름을 준다', () => {
    const first = firstGameByTeam([
      fixture({ at: '2026-10-07T10:00:00Z' }),
      fixture({ at: '2026-09-29T16:10:00Z' }),
      fixture({ at: '2026-10-14T10:00:00Z', hostTeamId: 'team-hapjeong', hostTeam: { name: 'QA0929 합정 유나이티드' }, approvedApplicantTeamId: 'team-mapo', approvedApplicantTeam: { name: '마포 FC' } }),
    ]);

    expect(first.get('team-mapo')).toEqual({ startAt: new Date('2026-09-29T16:10:00Z'), opponentName: 'QA0929 합정 유나이티드' });
    expect(first.get('team-hapjeong')).toEqual({ startAt: new Date('2026-09-29T16:10:00Z'), opponentName: '마포 FC' });
  });

  it('시각이 아직 없는 대진은 첫 경기가 될 수 없다 — 더 늦은 확정 대진이 첫 경기가 된다', () => {
    const first = firstGameByTeam([fixture({ at: null }), fixture({ at: '2026-10-07T10:00:00Z' })]);
    expect(first.get('team-mapo')?.startAt).toEqual(new Date('2026-10-07T10:00:00Z'));
  });
});

describe('firstGameNoticeBody', () => {
  it('목업 문구 그대로 — 날짜·요일·시각, 받침에 맞는 와/과', () => {
    expect(
      firstGameNoticeBody('(QA0929) 마포 주말 리그', { startAt: new Date('2026-09-29T16:10:00Z'), opponentName: 'QA0929 합정 유나이티드' }),
    ).toBe('"(QA0929) 마포 주말 리그" 첫 경기는 9/30 (수) 01:10, QA0929 합정 유나이티드와 해요.');
    expect(
      firstGameNoticeBody('가을 리그', { startAt: new Date('2026-10-03T05:00:00Z'), opponentName: '강남' }),
    ).toBe('"가을 리그" 첫 경기는 10/3 (토) 14:00, 강남과 해요.');
  });
});

describe('playerRecipientsByTeam', () => {
  const registrations = [
    { teamId: 'team-mapo', players: [{ userId: 'player-1' }, { userId: 'player-captain' }, { userId: 'player-left' }] },
    { teamId: 'team-hapjeong', players: [{ userId: 'player-2' }] },
  ];
  const memberships = [
    { teamId: 'team-mapo', userId: 'player-1', role: 'member' },
    { teamId: 'team-mapo', userId: 'player-captain', role: 'owner' },
    { teamId: 'team-mapo', userId: 'bench-only-member', role: 'member' }, // 참가 명단에 없는 팀원
    { teamId: 'team-hapjeong', userId: 'player-2', role: 'member' },
    { teamId: 'team-hapjeong', userId: 'player-1', role: 'member' }, // 다른 팀 소속 — 마포 명단 선수의 합정 멤버십은 무관
  ];

  it('참가 명단에 있고 지금도 그 팀의 일반 멤버인 선수만 받는다', () => {
    const recipients = playerRecipientsByTeam({ registrations, memberships });

    // 대조군 양쪽: 받는 선수(player-1, player-2)와 못 받는 선수(팀장, 팀 나간 선수, 명단 밖 멤버)가 함께 있다.
    expect(recipients.get('team-mapo')).toEqual(['player-1']);
    expect(recipients.get('team-hapjeong')).toEqual(['player-2']);
    const everyone = [...recipients.values()].flat();
    expect(everyone).not.toContain('player-captain'); // 팀장·매니저는 현행 문구를 이미 받는다
    expect(everyone).not.toContain('player-left'); // 멤버십이 없는(탈퇴) 선수
    expect(everyone).not.toContain('bench-only-member'); // 참가 명단에 없는 팀원
  });

  it('매니저도 팀장과 같이 현행 문구 대상이라 선수 알림에서 뺀다', () => {
    const recipients = playerRecipientsByTeam({
      registrations: [{ teamId: 'team-mapo', players: [{ userId: 'player-1' }, { userId: 'player-manager' }] }],
      memberships: [
        { teamId: 'team-mapo', userId: 'player-1', role: 'member' },
        { teamId: 'team-mapo', userId: 'player-manager', role: 'manager' },
      ],
    });
    expect(recipients.get('team-mapo')).toEqual(['player-1']);
  });
});
