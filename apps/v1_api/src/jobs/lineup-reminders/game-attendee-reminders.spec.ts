import {
  buildDayBeforeAttendeeRows,
  buildKickoffReminderRows,
  isKickoffReminderDue,
  loadSideAudiences,
  type ReminderGameSide,
  type SideAudience,
} from './game-attendee-reminders';

function side(overrides: Partial<ReminderGameSide> = {}): ReminderGameSide {
  return {
    teamMatchId: 'tm-1',
    gameId: 'game-1',
    sideId: 'side-home',
    teamId: 'team-mapo',
    kind: 'LEAGUE',
    competitionId: 'league-1',
    // 2026-09-29 16:10 UTC = 9/30 (수) 01:10 KST
    startAt: new Date('2026-09-29T16:10:00Z'),
    opponentName: '합정 유나이티드',
    placeName: '망원 유수지 풋살장',
    ...overrides,
  };
}

function audience(attendees: string[] | null, managers: string[]): SideAudience {
  return { attendeeUserIds: attendees === null ? null : new Set(attendees), managerUserIds: new Set(managers) };
}

describe('isKickoffReminderDue', () => {
  const kickoff = new Date('2026-09-30T05:00:00Z'); // 14:00 KST
  it.each([
    ['2시간 5분 전 — 아직 이르다', '2026-09-30T02:55:00Z', false],
    ['정확히 2시간 전', '2026-09-30T03:00:00Z', true],
    ['1시간 45분 전 — 직전 스캔을 놓친 경우', '2026-09-30T03:15:00Z', true],
    ['1시간 30분 전 — "2시간 뒤"가 틀린 말이 된다', '2026-09-30T03:30:00Z', false],
  ])('%s', (_label, now, due) => {
    expect(isKickoffReminderDue(kickoff, new Date(now))).toBe(due);
  });

  it('2시간 전 시각이 야간(21~9시)이면 아침 스캔으로 미루지 않고 생략한다', () => {
    // 01:10 경기의 2시간 전은 23:10 — 목업의 대표 사례.
    expect(isKickoffReminderDue(new Date('2026-09-29T16:10:00Z'), new Date('2026-09-29T14:10:00Z'))).toBe(false);
    // 10:40 경기의 2시간 전(08:40)은 야간이라, 09:00 스캔이 창 안에 있어도 보내지 않는다.
    expect(isKickoffReminderDue(new Date('2026-09-30T01:40:00Z'), new Date('2026-09-30T00:00:00Z'))).toBe(false);
    // 대조군: 11:05 경기의 2시간 전(09:05)은 낮이라 09:15 스캔이 보낸다.
    expect(isKickoffReminderDue(new Date('2026-09-30T02:05:00Z'), new Date('2026-09-30T00:15:00Z'))).toBe(true);
  });
});

describe('buildKickoffReminderRows', () => {
  it('출전자와 팀장·매니저가 한 건씩 받고, "지금 출전 명단에 있어요."는 출전자에게만 붙는다', () => {
    const rows = buildKickoffReminderRows(side(), audience(['player-1', 'captain-playing'], ['captain-playing', 'manager-bench']));

    expect(rows.map((row) => [row.userId, row.body])).toEqual([
      ['player-1', '01:10 vs 합정 유나이티드 · 망원 유수지 풋살장. 지금 출전 명단에 있어요.'],
      ['captain-playing', '01:10 vs 합정 유나이티드 · 망원 유수지 풋살장. 지금 출전 명단에 있어요.'],
      ['manager-bench', '01:10 vs 합정 유나이티드 · 망원 유수지 풋살장.'],
    ]);
    expect(rows[0]).toMatchObject({
      title: '2시간 뒤 경기가 시작돼요',
      targetType: 'team_match',
      targetId: 'tm-1',
      deepLink: '/team-matches/tm-1',
      businessKey: `game-kickoff:game-1:${side().startAt.getTime()}:player-1`,
    });
  });

  it('대회 경기는 대회 경기 상세로 보낸다', () => {
    const [row] = buildKickoffReminderRows(side({ kind: 'TOURNAMENT', competitionId: 'tour-1', placeName: null }), audience(['player-1'], []));
    expect(row).toMatchObject({
      targetType: 'tournament',
      targetId: 'tour-1:tm-1',
      deepLink: '/tournaments/tour-1/matches/tm-1',
      body: '01:10 vs 합정 유나이티드. 지금 출전 명단에 있어요.',
    });
  });

  it('출전 명단이 아직 없는 사이드(친선 참석명단 미제출)는 팀장·매니저에게도 보내지 않는다', () => {
    expect(buildKickoffReminderRows(side({ kind: 'FRIENDLY', competitionId: null }), audience(null, ['captain']))).toEqual([]);
  });
});

describe('buildDayBeforeAttendeeRows', () => {
  it('대회·리그는 "명단 확인"을 받는 팀장·매니저를 빼고 출전자에게 날짜·시각 제목으로 보낸다', () => {
    const rows = buildDayBeforeAttendeeRows(side(), audience(['player-1', 'captain-playing'], ['captain-playing']));

    expect(rows).toEqual([
      {
        userId: 'player-1',
        targetType: 'team_match',
        targetId: 'tm-1',
        title: '9/30 (수) 01:10 경기가 있어요',
        body: 'vs 합정 유나이티드 · 망원 유수지 풋살장. 출전 명단은 경기 전까지 바뀔 수 있어요.',
        deepLink: '/team-matches/tm-1',
        businessKey: `game-day-before:game-1:${side().startAt.getTime()}:player-1`,
      },
    ]);
  });

  it('친선은 팀장 알림이 따로 없어 참석명단에 든 팀장도 받는다', () => {
    const rows = buildDayBeforeAttendeeRows(side({ kind: 'FRIENDLY', competitionId: null }), audience(['player-1', 'captain-playing'], ['captain-playing']));
    expect(rows.map((row) => row.userId)).toEqual(['player-1', 'captain-playing']);
  });
});

describe('loadSideAudiences — 친선 참석명단', () => {
  function fakeTx(lineups: Array<{ id: string; sideId: string; state: string }>, participants: Array<{ sideId: string; userId: string | null; lineupId: string }>) {
    return {
      v1TeamMembership: {
        findMany: jest.fn().mockResolvedValue([
          { teamId: 'team-mapo', userId: 'captain', role: 'owner' },
          { teamId: 'team-mapo', userId: 'player-1', role: 'member' },
          { teamId: 'team-mapo', userId: 'player-not-listed', role: 'member' },
        ]),
      },
      v1GameLineup: { findMany: jest.fn().mockResolvedValue(lineups) },
      v1GameParticipant: {
        findMany: jest.fn(async ({ where }: { where: { lineupId: { in: string[] } } }) =>
          participants.filter((row) => where.lineupId.in.includes(row.lineupId) && row.userId !== null)),
      },
    };
  }
  const friendly = side({ kind: 'FRIENDLY', competitionId: null });

  it('제출된 최신 참석명단의 활성 팀원만 출전자다 — 팀을 나간 사람·명단 밖 팀원은 빠진다', async () => {
    const tx = fakeTx([{ id: 'lineup-2', sideId: 'side-home', state: 'SUBMITTED' }], [
      { lineupId: 'lineup-2', sideId: 'side-home', userId: 'player-1' },
      { lineupId: 'lineup-2', sideId: 'side-home', userId: 'left-the-team' },
    ]);
    const [{ audience: result }] = await loadSideAudiences(tx as never, [friendly]);

    expect([...(result.attendeeUserIds ?? [])]).toEqual(['player-1']);
    expect([...result.managerUserIds]).toEqual(['captain']);
  });

  it('최신 참석명단이 초안이면 출전 명단이 아직 없다', async () => {
    const tx = fakeTx([{ id: 'lineup-3', sideId: 'side-home', state: 'DRAFT' }], [
      { lineupId: 'lineup-3', sideId: 'side-home', userId: 'player-1' },
    ]);
    const [{ audience: result }] = await loadSideAudiences(tx as never, [friendly]);
    expect(result.attendeeUserIds).toBeNull();
  });
});

describe('경기 전 알림의 멱등 키', () => {
  it('같은 일정이면 같은 키, 경기를 옮기면 새 키라 새 시각으로 다시 보낸다', () => {
    const moved = side({ startAt: new Date('2026-10-02T10:00:00Z') });
    const keys = (s: ReminderGameSide) => [
      buildKickoffReminderRows(s, audience(['player-1'], []))[0].businessKey,
      buildDayBeforeAttendeeRows(s, audience(['player-1'], []))[0].businessKey,
    ];

    expect(keys(side())).toEqual(keys(side()));
    const [kickoffBefore, dayBeforeBefore] = keys(side());
    const [kickoffAfter, dayBeforeAfter] = keys(moved);
    expect(kickoffAfter).not.toBe(kickoffBefore);
    expect(dayBeforeAfter).not.toBe(dayBeforeBefore);
  });
});
