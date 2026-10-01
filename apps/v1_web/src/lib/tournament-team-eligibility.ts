import type { V1MyTeam } from '@/types/api';
import { competitionKindLabel } from './v1-status-labels';

export function filterTournamentTeamsBySport(
  teams: readonly V1MyTeam[],
  tournamentSportId: string,
): V1MyTeam[] {
  return teams.filter((team) => team.sport.sportId === tournamentSportId);
}

/** 신청 화면·내 신청 화면이 같이 쓴다. 정규 리그는 "리그"라고 부른다(`kind === 'regular_league'`). */
export function getTournamentTeamEmptyState(hasAnyTeam: boolean, isRegularLeague: boolean) {
  const noun = competitionKindLabel(isRegularLeague ? 'LEAGUE' : 'TOURNAMENT');
  return hasAnyTeam
    ? {
        title: `이 ${noun}에 신청할 수 있는 팀이 없어요`,
        description: `${noun}와 같은 종목의 팀을 만든 뒤 참가 신청을 해주세요.`,
      }
    : {
        title: '소속된 팀이 없어요',
        description: `팀을 만든 뒤 ${noun}에 참가 신청할 수 있어요.`,
      };
}
