import { describe, expect, it } from 'vitest';
import type { V1MyTeam } from '@/types/api';
import {
  filterTournamentTeamsBySport,
  getTournamentTeamEmptyState,
} from './tournament-team-eligibility';

function team(teamId: string, sportId: string): V1MyTeam {
  return {
    teamId,
    membershipId: `membership-${teamId}`,
    name: teamId,
    role: 'owner',
    status: 'active',
    logoUrl: null,
    sport: { sportId, name: sportId },
    region: null,
    memberCount: 6,
    canManage: true,
    canCreateTeamMatch: true,
    detailRoute: `/teams/${teamId}`,
    manageRoute: `/my/teams/${teamId}`,
  };
}

describe('filterTournamentTeamsBySport', () => {
  it('keeps only teams whose sport matches the tournament sport', () => {
    // Given: one futsal team and one running team owned by the same user.
    const teams = [team('futsal-team', 'sport-futsal'), team('running-team', 'sport-running')];

    // When: the tournament team candidates are filtered for futsal.
    const result = filterTournamentTeamsBySport(teams, 'sport-futsal');

    // Then: the unrelated running team cannot enter the application flow.
    expect(result.map((item) => item.teamId)).toEqual(['futsal-team']);
  });

  it('distinguishes no teams from teams that do not match the tournament sport', () => {
    expect(getTournamentTeamEmptyState(false)).toEqual({
      title: '소속된 팀이 없어요',
      description: '팀을 만든 뒤 대회에 참가 신청할 수 있어요.',
    });
    expect(getTournamentTeamEmptyState(true)).toEqual({
      title: '이 대회에 신청할 수 있는 팀이 없어요',
      description: '대회와 같은 종목의 팀을 만든 뒤 참가 신청을 해주세요.',
    });
  });
});
