import type { V1MyTeam } from '@/types/api';

export function filterTournamentTeamsBySport(
  teams: readonly V1MyTeam[],
  tournamentSportId: string,
): V1MyTeam[] {
  return teams.filter((team) => team.sport.sportId === tournamentSportId);
}

export function getTournamentTeamEmptyState(hasAnyTeam: boolean) {
  return hasAnyTeam
    ? {
        title: '이 대회에 신청할 수 있는 팀이 없어요',
        description: '대회와 같은 종목의 팀을 만든 뒤 참가 신청을 해주세요.',
      }
    : {
        title: '소속된 팀이 없어요',
        description: '팀을 만든 뒤 대회에 참가 신청할 수 있어요.',
      };
}
