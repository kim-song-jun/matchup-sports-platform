import type { ListStatusGroup } from '../common/pagination/list-status-groups';

export type TeamMatchListGroupRow = {
  status: string;
  startAt: Date | null;
  endAt: Date | null;
  deadlineAt: Date | null;
  approvedApplicantTeamId: string | null;
  leagueId: string | null;
  tournamentId: string | null;
  game: { state: string } | null;
};

/**
 * 공개 목록에서 이 팀매치가 들어갈 묶음. 카드가 그리는 상태와 같은 기준이다(team-matches.card-model.ts).
 * - 진행 중: 경기 기록이 진행·일시중지거나, 친선 매치가 시작~종료 시각 사이(카드의 '진행 중').
 * - 신청 가능: 모집 중 · 상대 없음 · 신청 마감 전.
 * - 경기 예정: 상대가 정해졌고 시작 전.
 * - 신청 마감: 상대 없이 모집이 닫힘(마감 시각 경과·직접 마감), 시작 전.
 * - 끝난 경기: 완료, 경기 기록 종료, 종료 시각이 지난 확정 경기(카드의 '종료 확인 중').
 * `at` 은 첫 페이지 시각이라 스크롤하는 동안 카드가 묶음 사이를 옮기지 않는다.
 */
export function teamMatchListGroup(row: TeamMatchListGroupRow, at: Date): ListStatusGroup {
  if (row.startAt === null) return 'unscheduled';
  if (row.status === 'matched') {
    const state = row.game?.state ?? null;
    if (state === 'LIVE' || state === 'PAUSED') return 'live';
    if (state === 'ENDED') return 'ended';
    if (row.startAt > at) return 'scheduled';
    const friendly = row.leagueId === null && row.tournamentId === null;
    return friendly && (row.endAt === null || row.endAt > at) ? 'live' : 'ended';
  }
  if (row.status === 'recruiting' || row.status === 'closed') {
    const open =
      row.status === 'recruiting' &&
      row.approvedApplicantTeamId === null &&
      row.startAt > at &&
      (row.deadlineAt === null || row.deadlineAt > at);
    return open ? 'open' : 'closed';
  }
  return 'ended';
}
