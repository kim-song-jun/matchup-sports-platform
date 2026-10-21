import { teamMatchListGroup, type TeamMatchListGroupRow } from './team-match-list-group';

const AT = new Date('2026-10-21T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const at = (offsetMs: number) => new Date(AT.getTime() + offsetMs);

function row(overrides: Partial<TeamMatchListGroupRow> = {}): TeamMatchListGroupRow {
  return {
    status: 'recruiting',
    startAt: at(24 * HOUR),
    endAt: at(26 * HOUR),
    deadlineAt: at(12 * HOUR),
    approvedApplicantTeamId: null,
    leagueId: null,
    tournamentId: null,
    game: null,
    ...overrides,
  };
}

describe('teamMatchListGroup — 공개 목록 묶음', () => {
  it.each([
    ['모집 중 · 상대 없음 · 마감 전', row(), 'open'],
    ['마감 시각이 없는 모집 중', row({ deadlineAt: null }), 'open'],
    ['신청 마감 시각이 지남(대기 신청이 남아 시작 전까지 공개)', row({ deadlineAt: at(-HOUR) }), 'closed'],
    ['팀장이 직접 마감', row({ status: 'closed' }), 'closed'],
    ['상대 확정 · 시작 전', row({ status: 'matched', approvedApplicantTeamId: 'team-b', game: { state: 'SCHEDULED' } }), 'scheduled'],
    ['경기 기록 진행 중', row({ status: 'matched', startAt: at(-HOUR), game: { state: 'LIVE' } }), 'live'],
    ['경기 기록 일시중지', row({ status: 'matched', startAt: at(-HOUR), game: { state: 'PAUSED' } }), 'live'],
    ['친선이 시작~종료 시각 사이(카드의 진행 중)', row({ status: 'matched', startAt: at(-HOUR), endAt: at(HOUR), game: { state: 'SCHEDULED' } }), 'live'],
    ['친선이 종료 시각을 지남(카드의 종료 확인 중)', row({ status: 'matched', startAt: at(-3 * HOUR), endAt: at(-HOUR), game: { state: 'SCHEDULED' } }), 'ended'],
    ['경기 기록 종료(결과 대기)', row({ status: 'matched', startAt: at(-3 * HOUR), game: { state: 'ENDED' } }), 'ended'],
    ['완료', row({ status: 'completed', startAt: at(-48 * HOUR) }), 'ended'],
    ['시작이 지났는데 기록이 없는 리그 경기', row({ status: 'matched', leagueId: 'league-1', startAt: at(-HOUR), endAt: at(HOUR), game: { state: 'SCHEDULED' } }), 'ended'],
    ['시작 시각이 없는 리그 대진', row({ status: 'matched', leagueId: 'league-1', startAt: null }), 'unscheduled'],
  ] as const)('%s → %s', (_, value, expected) => {
    expect(teamMatchListGroup(value, AT)).toBe(expected);
  });

  it('기준 시각으로 판정한다 — 1페이지 뒤에 시작한 매치도 그 시각 기준으로는 아직 신청 가능이다', () => {
    const startsSoon = row({ startAt: at(HOUR), deadlineAt: null });
    expect(teamMatchListGroup(startsSoon, AT)).toBe('open');
    expect(teamMatchListGroup(startsSoon, at(2 * HOUR))).toBe('closed');
  });
});
