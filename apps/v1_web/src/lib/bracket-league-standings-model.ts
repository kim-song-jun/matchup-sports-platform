import type { V1AdminBracketGroup, V1AdminBracketStanding } from '@/types/api';
import { sortLeagueGroups } from './bracket-league-grid-model';

export type LeagueStandingRow = {
  registrationId: string;
  teamName: string;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalDifference: number;
  points: number;
};
export type LeagueStandingsGroup = { groupId: string; name: string; rows: LeagueStandingRow[] };

/** 승점·득실은 서버 대회 설정이 정본이라 여기서 다시 계산하지 않는다 — 공개 순위 탭과 같은 숫자를 보여 주기 위해서다. */
export function buildLeagueStandings(input: {
  groups: readonly V1AdminBracketGroup[];
  standings: readonly V1AdminBracketStanding[];
}): LeagueStandingsGroup[] {
  return sortLeagueGroups(input.groups).flatMap((group) => {
    const recorded = input.standings.filter((s) => s.groupId === group.id).sort((a, b) => a.position - b.position);
    const recordedIds = new Set(recorded.map((s) => s.registrationId));
    const pending = [...group.groupTeams]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .filter((t): t is typeof t & { registrationId: string; teamName: string } =>
        t.registrationId !== null && t.teamName !== null && !recordedIds.has(t.registrationId));
    const rows: LeagueStandingRow[] = [
      ...recorded.map((s) => ({
        registrationId: s.registrationId, teamName: s.teamName, played: s.wins + s.draws + s.losses,
        wins: s.wins, draws: s.draws, losses: s.losses, goalDifference: s.goalDifference, points: s.points,
      })),
      ...pending.map((t) => ({
        registrationId: t.registrationId, teamName: t.teamName, played: 0, wins: 0, draws: 0, losses: 0, goalDifference: 0, points: 0,
      })),
    ].map((row, index) => ({ ...row, rank: index + 1 }));
    return rows.length === 0 ? [] : [{ groupId: group.id, name: group.name, rows }];
  });
}
