import { describe, expect, it } from 'vitest';
import type { V1TournamentDetail, V1TournamentFixtureResult, V1TournamentStanding } from '@/types/api';
import { getTopThree } from '@/app/tournaments/[id]/awards/awards-page-client';

function standing(position: number, registrationId: string, teamName: string): V1TournamentStanding {
  return {
    registrationId,
    teamId: `team-${registrationId}`,
    teamName,
    teamLogoUrl: null,
    position,
    points: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    recalculatedAt: null,
  };
}

function result(homeScore: number, awayScore: number): V1TournamentFixtureResult {
  return {
    homeScore,
    awayScore,
    hasPenalty: false,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    note: null,
    recordedAt: '2026-08-15T06:52:55.671Z',
    goals: [],
  };
}

describe('getTopThree', () => {
  it('prefers final and third-place results over group standings for group knockout tournaments', () => {
    const tournament = {
      format: 'group_knockout',
      groups: [
        {
          standings: [
            standing(1, 'group-a-1', 'Group A Winner'),
            standing(2, 'group-a-2', 'Final Winner'),
          ],
        },
        {
          standings: [
            standing(1, 'group-b-1', 'Fourth Place'),
            standing(2, 'group-b-2', 'Runner Up'),
          ],
        },
      ],
      fixtures: [
        {
          round: 'final',
          homeTeamName: 'Final Winner',
          awayTeamName: 'Runner Up',
          result: result(1, 0),
        },
        {
          round: 'third_place',
          homeTeamName: 'Third Place',
          awayTeamName: 'Fourth Place',
          result: result(5, 1),
        },
      ],
    } as unknown as V1TournamentDetail;

    expect(getTopThree(tournament)).toEqual([
      { pos: 1, name: 'Final Winner' },
      { pos: 2, name: 'Runner Up' },
      { pos: 3, name: 'Third Place' },
    ]);
  });

  it('keeps league podiums based on standings', () => {
    const tournament = {
      format: 'league',
      groups: [
        {
          standings: [
            standing(1, 'league-1', 'League Winner'),
            standing(2, 'league-2', 'League Runner Up'),
            standing(3, 'league-3', 'League Third'),
          ],
        },
      ],
      fixtures: [],
    } as unknown as V1TournamentDetail;

    expect(getTopThree(tournament)).toEqual([
      { pos: 1, name: 'League Winner' },
      { pos: 2, name: 'League Runner Up' },
      { pos: 3, name: 'League Third' },
    ]);
  });

  it('fails closed (returns []) for a multi-group league instead of merging cross-group standings into a fake podium', () => {
    // 조 A 1위(그룹 최상위)와 조 B 1위는 서로 맞붙은 적이 없다. `standing.position`은
    // 조 단위 순위라 조 구분 없이 병합·position 정렬하면 [A1,B1,A2,B2]가 "우승·준우승·..."으로
    // 잘못 확정된다. 정본은 `GET /tournaments/:id/standings/overall` 하나뿐이므로 이 순수
    // 함수는 다조 리그에서 스스로 답을 만들지 않고 빈 배열로 접어야 한다(호출부가
    // useMultiGroupLeagueTopThree로 override).
    const tournament = {
      format: 'league',
      groups: [
        {
          standings: [
            standing(1, 'group-a-1', 'Group A Winner'),
            standing(2, 'group-a-2', 'Group A Runner Up'),
          ],
        },
        {
          standings: [
            standing(1, 'group-b-1', 'Group B Winner'),
            standing(2, 'group-b-2', 'Group B Runner Up'),
          ],
        },
      ],
      fixtures: [],
    } as unknown as V1TournamentDetail;

    expect(getTopThree(tournament)).toEqual([]);
  });
});
