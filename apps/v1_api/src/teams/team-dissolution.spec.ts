import {
  TeamMatchCandidate,
  buildDissolutionInfo,
  classifyTeamMatch,
  findDissolutionBlockers,
  isOpenCompetitionEntry,
  isWithinRestoreWindow,
  loadTeamArchivedBy,
  restoreDeadlineOf,
} from './team-dissolution';

const TEAM = 'team-1';
const NOW = new Date('2026-10-01T00:00:00.000Z');
const FUTURE = new Date('2026-10-05T11:00:00.000Z');
const PAST = new Date('2026-09-20T11:00:00.000Z');

function match(overrides: Partial<TeamMatchCandidate> = {}): TeamMatchCandidate {
  return {
    id: 'tm-1',
    title: '주말 친선',
    status: 'recruiting',
    startAt: FUTURE,
    placeName: '망원 유수지',
    hostTeamId: TEAM,
    approvedApplicantTeamId: null,
    leagueId: null,
    tournamentId: null,
    platformManaged: false,
    hostTeam: { name: '우리 팀' },
    approvedApplicantTeam: null,
    ...overrides,
  };
}

describe('classifyTeamMatch — 해체가 팀매치를 어떻게 다루나', () => {
  it('상대가 정해진 친선 경기는 해체를 막는다(호스트든 상대든)', () => {
    expect(classifyTeamMatch(match({ status: 'matched', approvedApplicantTeamId: 'other' }), TEAM, NOW)).toBe('matched_blocker');
    expect(
      classifyTeamMatch(match({ status: 'matched', hostTeamId: 'other', approvedApplicantTeamId: TEAM }), TEAM, NOW),
    ).toBe('matched_blocker');
  });

  it('앞으로 있을 모집 중·모집 마감 경기는 서버가 취소한다', () => {
    expect(classifyTeamMatch(match({ status: 'recruiting' }), TEAM, NOW)).toBe('auto_cancel');
    expect(classifyTeamMatch(match({ status: 'closed' }), TEAM, NOW)).toBe('auto_cancel');
    expect(classifyTeamMatch(match({ startAt: null }), TEAM, NOW)).toBe('auto_cancel');
  });

  it('지난 모집 경기·리그/대회 대진·플랫폼 모집은 건드리지 않는다', () => {
    expect(classifyTeamMatch(match({ startAt: PAST }), TEAM, NOW)).toBe('untouched');
    expect(classifyTeamMatch(match({ startAt: NOW }), TEAM, NOW)).toBe('untouched');
    expect(classifyTeamMatch(match({ leagueId: 'league-1', status: 'matched' }), TEAM, NOW)).toBe('untouched');
    expect(classifyTeamMatch(match({ tournamentId: 'tour-1' }), TEAM, NOW)).toBe('untouched');
    expect(classifyTeamMatch(match({ platformManaged: true }), TEAM, NOW)).toBe('untouched');
    expect(classifyTeamMatch(match({ hostTeamId: 'other' }), TEAM, NOW)).toBe('untouched');
  });
});

describe('isOpenCompetitionEntry — 대회·리그 참가가 해체를 막나', () => {
  const entry = (status: string, tournamentStatus: string, deletedAt: Date | null = null) => ({
    id: 'reg-1',
    status: status as never,
    tournament: { id: 't-1', title: '마포 리그', kind: 'regular_league' as const, status: tournamentStatus as never, deletedAt },
  });

  it('끝나지 않은 대회·리그에 취소되지 않은 신청이 있으면 막는다', () => {
    for (const status of ['submitted', 'awaiting_payment', 'paid', 'confirmed', 'waitlisted', 'cancel_requested']) {
      expect(isOpenCompetitionEntry(entry(status, 'in_progress'))).toBe(true);
    }
    expect(isOpenCompetitionEntry(entry('confirmed', 'open'))).toBe(true);
  });

  it('취소·임시 저장 신청이거나 대회가 끝났거나 지워졌으면 막지 않는다', () => {
    expect(isOpenCompetitionEntry(entry('cancelled', 'in_progress'))).toBe(false);
    expect(isOpenCompetitionEntry(entry('draft', 'open'))).toBe(false);
    expect(isOpenCompetitionEntry(entry('confirmed', 'completed'))).toBe(false);
    expect(isOpenCompetitionEntry(entry('confirmed', 'cancelled'))).toBe(false);
    expect(isOpenCompetitionEntry(entry('confirmed', 'open', PAST))).toBe(false);
  });
});

describe('복구 기간(30일)', () => {
  const dissolvedAt = new Date('2026-09-01T09:00:00.000Z');

  it('정확히 30일째까지는 복구할 수 있고 1ms 뒤부터는 못 한다', () => {
    const deadline = restoreDeadlineOf(dissolvedAt);
    expect(deadline.toISOString()).toBe('2026-10-01T09:00:00.000Z');
    expect(isWithinRestoreWindow(dissolvedAt, deadline)).toBe(true);
    expect(isWithinRestoreWindow(dissolvedAt, new Date(deadline.getTime() + 1))).toBe(false);
  });

  it('해체 시각이 없는 보관 팀(어드민이 옛날에 보관)은 셀프 복구 대상이 아니다', () => {
    expect(isWithinRestoreWindow(null, dissolvedAt)).toBe(false);
  });

  it('복구 버튼은 팀장이 해체한 팀의 팀장에게만 켜지고, 운영팀 보관은 기간 안이어도 꺼진다', () => {
    expect(buildDissolutionInfo(dissolvedAt, 'owner', true, dissolvedAt)).toMatchObject({
      canRestore: true,
      restoreDeadlineAt: new Date('2026-10-01T09:00:00.000Z'),
    });
    expect(buildDissolutionInfo(dissolvedAt, 'owner', false, dissolvedAt).canRestore).toBe(false);
    expect(buildDissolutionInfo(dissolvedAt, 'admin', true, dissolvedAt)).toMatchObject({
      archivedBy: 'admin',
      canRestore: false,
      restoreDeadlineAt: null,
    });
  });
});

describe('loadTeamArchivedBy — 누가 보관했나', () => {
  function db(logs: Array<{ targetId: string; actorType: string }>) {
    return { v1StatusChangeLog: { findMany: jest.fn().mockResolvedValue(logs) } };
  }

  it('팀마다 마지막 보관 기록의 주체로 가르고, 기록이 없는 옛 보관 행은 운영팀 보관이다', async () => {
    const fake = db([
      { targetId: 'by-owner', actorType: 'user' },
      { targetId: 'by-admin', actorType: 'admin' },
      { targetId: 'by-system', actorType: 'system' },
    ]);
    const archivedBy = await loadTeamArchivedBy(fake as never, ['by-owner', 'by-admin', 'by-system', 'no-log']);
    expect(['by-owner', 'by-admin', 'by-system', 'no-log'].map(archivedBy)).toEqual(['owner', 'admin', 'admin', 'admin']);
    expect(fake.v1StatusChangeLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { targetType: 'team', targetId: { in: ['by-owner', 'by-admin', 'by-system', 'no-log'] }, toStatus: 'archived' },
        orderBy: { createdAt: 'desc' },
        distinct: ['targetId'],
      }),
    );
  });
});

describe('findDissolutionBlockers', () => {
  function db(rows: { games?: unknown[]; matches?: unknown[]; registrations?: unknown[] }) {
    return {
      v1Game: { findMany: jest.fn().mockResolvedValue(rows.games ?? []) },
      v1TeamMatch: { findMany: jest.fn().mockResolvedValue(rows.matches ?? []) },
      v1TournamentRegistration: { findMany: jest.fn().mockResolvedValue(rows.registrations ?? []) },
    } as never;
  }

  it('막는 것이 없으면 빈 목록 — 모집 중 경기만 있는 팀은 해체할 수 있다', async () => {
    await expect(findDissolutionBlockers(db({ matches: [match()] }), TEAM, NOW)).resolves.toEqual([]);
  });

  it('LIVE 경기는 진행 중 항목으로만 세고, 같은 경기를 상대 확정 목록에 또 넣지 않는다', async () => {
    const matched = match({ id: 'tm-live', status: 'matched', approvedApplicantTeamId: 'other', approvedApplicantTeam: { name: '합정 FC' } });
    const other = match({ id: 'tm-next', status: 'matched', approvedApplicantTeamId: 'other', approvedApplicantTeam: { name: '합정 FC' } });
    const blockers = await findDissolutionBlockers(
      db({
        games: [{
          id: 'game-1',
          sides: [{ teamId: TEAM, displayNameSnapshot: '우리 팀' }, { teamId: 'other', displayNameSnapshot: '합정 FC' }],
          teamMatch: { id: 'tm-live', title: '주말 친선', startAt: FUTURE, placeName: null, tournamentId: null },
        }],
        matches: [matched, other],
      }),
      TEAM,
      NOW,
    );
    expect(blockers.map((blocker) => [blocker.kind, blocker.items.map((item) => item.id)])).toEqual([
      ['live_game', ['game-1']],
      ['matched_team_match', ['tm-next']],
    ]);
    expect(blockers[0].items[0]).toMatchObject({ opponentName: '합정 FC', route: '/team-matches/tm-live' });
    expect(blockers[1].items[0]).toMatchObject({ opponentName: '합정 FC', route: '/team-matches/tm-next' });
  });

  it('리그와 대회 참가를 나눠 알려 주고, 끝난 대회 참가는 빼고 본다', async () => {
    const registration = (id: string, kind: string | null, status: string) => ({
      id,
      status: 'confirmed',
      tournament: { id: `t-${id}`, title: id, kind, status, deletedAt: null },
    });
    const blockers = await findDissolutionBlockers(
      db({
        registrations: [
          registration('league', 'regular_league', 'in_progress'),
          registration('cup', null, 'open'),
          registration('old-cup', 'regular_tournament', 'completed'),
        ],
      }),
      TEAM,
      NOW,
    );
    expect(blockers.map((blocker) => [blocker.kind, blocker.items.map((item) => item.id)])).toEqual([
      ['league_entry', ['league']],
      ['tournament_entry', ['cup']],
    ]);
    expect(blockers[0].items[0].route).toBe('/tournaments/t-league/my');
  });
});
