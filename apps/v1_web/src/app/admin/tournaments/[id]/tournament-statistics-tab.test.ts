import { describe, expect, it } from 'vitest';
import type { V1AdminBracketFixture, V1TournamentFixtureGoal } from '@/types/api';
import { buildTournamentStatistics } from './tournament-statistics-tab';

function fixture({
  id,
  homeId,
  homeName,
  awayId,
  awayName,
  homeScore,
  awayScore,
  goals = [],
}: {
  id: string;
  homeId: string;
  homeName: string;
  awayId: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  goals?: V1TournamentFixtureGoal[];
}): V1AdminBracketFixture {
  return {
    id,
    tournamentId: 'tournament-1',
    groupId: null,
    round: 'group',
    fixtureNumber: 1,
    legNumber: 1,
    parentFixtureId: null,
    homeRegistrationId: homeId,
    homeTeamName: homeName,
    awayRegistrationId: awayId,
    awayTeamName: awayName,
    scheduledAt: null,
    venue: null,
    status: 'completed',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    videos: [],
    result: {
      id: `result-${id}`,
      fixtureId: id,
      homeScore,
      awayScore,
      hasPenalty: false,
      homePenaltyScore: null,
      awayPenaltyScore: null,
      note: null,
      recordedAt: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      goals,
    },
  };
}

function goal(id: string, team: 'home' | 'away', playerId: string | null, playerName: string): V1TournamentFixtureGoal {
  return { id, team, playerId, playerName, minute: null };
}

describe('buildTournamentStatistics', () => {
  it('공식 점수와 기록된 득점자를 대회 전체에서 합산한다', () => {
    const result = buildTournamentStatistics([
      fixture({
        id: 'fx-1', homeId: 'a', homeName: '한강 FC', awayId: 'b', awayName: '성수 FC', homeScore: 3, awayScore: 1,
        goals: [goal('g-1', 'home', 'p-1', '김민수'), goal('g-2', 'home', 'p-1', '김민수'), goal('g-3', 'away', null, '이준호')],
      }),
      fixture({
        id: 'fx-2', homeId: 'c', homeName: '마포 FC', awayId: 'a', awayName: '한강 FC', homeScore: 0, awayScore: 2,
        goals: [goal('g-4', 'away', 'p-1', '김민수')],
      }),
    ]);

    expect(result.completedFixtures).toBe(2);
    expect(result.scorers[0]).toMatchObject({ playerName: '김민수', teamName: '한강 FC', goals: 3 });
    expect(result.mostScored.map(({ teamName, goalsFor }) => [teamName, goalsFor])).toEqual([
      ['한강 FC', 5], ['성수 FC', 1], ['마포 FC', 0],
    ]);
    expect(result.leastConceded.map(({ teamName, goalsAgainst }) => [teamName, goalsAgainst])).toEqual([
      ['한강 FC', 1], ['마포 FC', 2], ['성수 FC', 3],
    ]);
  });

  it('이름만 있는 득점자는 같은 팀과 이름으로 합치고 득점자 표를 10명으로 제한한다', () => {
    const goals = Array.from({ length: 12 }, (_, index) =>
      goal(`g-${index}`, 'home', null, index < 2 ? '대타 선수' : `선수 ${index}`),
    );
    const result = buildTournamentStatistics([
      fixture({ id: 'fx-1', homeId: 'a', homeName: '한강 FC', awayId: 'b', awayName: '성수 FC', homeScore: 12, awayScore: 0, goals }),
    ]);

    expect(result.scorers).toHaveLength(10);
    expect(result.scorers[0]).toMatchObject({ playerName: '대타 선수', goals: 2 });
  });

  it('aggregates the same tournament player across fixture-scoped participant ids', () => {
    const first = fixture({
      id: 'fx-1', homeId: 'registration-a', homeName: 'Alpha FC', awayId: 'registration-b', awayName: 'Beta FC', homeScore: 2, awayScore: 0,
      goals: [
        goal('g-1', 'home', 'game-participant-1', 'Player One'),
        goal('g-2', 'home', 'game-participant-1', 'Player One'),
      ],
    });
    const second = fixture({
      id: 'fx-2', homeId: 'registration-a', homeName: 'Alpha FC', awayId: 'registration-c', awayName: 'Gamma FC', homeScore: 1, awayScore: 0,
      goals: [goal('g-3', 'home', 'game-participant-2', ' Player One ')],
    });

    expect(buildTournamentStatistics([first, second]).scorers).toEqual([
      expect.objectContaining({ playerName: 'Player One', teamName: 'Alpha FC', goals: 3 }),
    ]);
  });

  it('keeps own goals in the match score but excludes them from the scorer ranking', () => {
    const ownGoal = {
      ...goal('own-goal-1', 'away', 'participant-away', 'Own Goal Player'),
      ownGoal: true,
    };
    const result = buildTournamentStatistics([
      fixture({
        id: 'fx-own-goal',
        homeId: 'home',
        homeName: 'Home FC',
        awayId: 'away',
        awayName: 'Away FC',
        homeScore: 1,
        awayScore: 0,
        goals: [ownGoal],
      }),
    ]);

    expect(result.scorers).toEqual([]);
    expect(result.mostScored[0]).toMatchObject({ teamName: 'Home FC', goalsFor: 1 });
  });

  it('keeps players with the same name on different teams separate', () => {
    const result = buildTournamentStatistics([
      fixture({
        id: 'fx-1', homeId: 'registration-a', homeName: 'Alpha FC', awayId: 'registration-b', awayName: 'Beta FC', homeScore: 1, awayScore: 1,
        goals: [
          goal('g-1', 'home', 'game-participant-1', 'Same Name'),
          goal('g-2', 'away', 'game-participant-2', 'Same Name'),
        ],
      }),
    ]);

    expect(result.scorers).toHaveLength(2);
    expect(result.scorers.map(({ teamName, goals }) => [teamName, goals])).toEqual([
      ['Alpha FC', 1],
      ['Beta FC', 1],
    ]);
  });

  it('결과가 없는 예정 경기는 모든 통계에서 제외한다', () => {
    const scheduled = fixture({ id: 'fx-1', homeId: 'a', homeName: '한강 FC', awayId: 'b', awayName: '성수 FC', homeScore: 1, awayScore: 0 });
    scheduled.status = 'scheduled';
    scheduled.result = null;

    expect(buildTournamentStatistics([scheduled])).toEqual({
      scorers: [], leastConceded: [], mostScored: [], completedFixtures: 0,
    });
  });
});
