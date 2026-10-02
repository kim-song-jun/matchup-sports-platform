import { describe, expect, it } from 'vitest';
import type { V1AdminBracketFixture, V1AdminBracketResult, V1TournamentFixtureGoal } from '@/types/api';
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
  outcomeReason = 'NORMAL',
}: {
  id: string;
  homeId: string;
  homeName: string;
  awayId: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  goals?: V1TournamentFixtureGoal[];
  outcomeReason?: V1AdminBracketResult['outcomeReason'];
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
      outcomeReason,
      recordedAt: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      goals,
    },
  };
}

function goal(
  id: string,
  team: 'home' | 'away',
  playerId: string | null,
  playerName: string,
  playerUserId: string | null = null,
): V1TournamentFixtureGoal {
  return { id, team, playerId, playerUserId, playerName, minute: null };
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
    expect(result.excludedFixtures).toBe(0);
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

  // 회귀 방지 — 이전에는 playerUserId가 없어서 team+name만으로 동일인을 판정했고,
  // 같은 팀의 동명이인 두 명이 한 줄로 합쳐졌다(존재하지 않는 득점자를 만들어냈다).
  it('같은 팀의 동명이인은 playerUserId가 다르면 서로 다른 득점자로 남는다', () => {
    const result = buildTournamentStatistics([
      fixture({
        id: 'fx-1', homeId: 'registration-a', homeName: '한강 FC', awayId: 'registration-b', awayName: 'Beta FC', homeScore: 5, awayScore: 0,
        goals: [
          goal('g-1', 'home', 'game-participant-1', '김민수', 'user-a'),
          goal('g-2', 'home', 'game-participant-1', '김민수', 'user-a'),
          goal('g-3', 'home', 'game-participant-2', '김민수', 'user-b'),
          goal('g-4', 'home', 'game-participant-2', '김민수', 'user-b'),
          goal('g-5', 'home', 'game-participant-2', '김민수', 'user-b'),
        ],
      }),
    ]);

    expect(result.scorers).toHaveLength(2);
    expect(result.scorers.map(({ playerName, teamName, goals }) => [playerName, teamName, goals])).toEqual([
      ['김민수', '한강 FC', 3],
      ['김민수', '한강 FC', 2],
    ]);
  });

  // playerUserId가 있으면 경기마다 표기가 흔들려도(공백 등) 이름 정규화 없이 같은 사람으로
  // 묶인다 — userId 우선순위가 이름 기반 폴백보다 위라는 계약을 못박는다.
  it('playerUserId가 같으면 이름 표기가 달라도 한 사람으로 합친다', () => {
    const first = fixture({
      id: 'fx-1', homeId: 'registration-a', homeName: 'Alpha FC', awayId: 'registration-b', awayName: 'Beta FC', homeScore: 1, awayScore: 0,
      goals: [goal('g-1', 'home', 'game-participant-1', '김 민수', 'user-a')],
    });
    const second = fixture({
      id: 'fx-2', homeId: 'registration-a', homeName: 'Alpha FC', awayId: 'registration-c', awayName: 'Gamma FC', homeScore: 1, awayScore: 0,
      goals: [goal('g-2', 'home', 'game-participant-9', '김민수', 'user-a')],
    });

    const result = buildTournamentStatistics([first, second]);
    expect(result.scorers).toEqual([
      expect.objectContaining({ teamName: 'Alpha FC', goals: 2 }),
    ]);
  });

  it('몰수·중단으로 끝난 경기는 완료 경기 수·득점·실점 어디에도 합산하지 않고 별도로 센다', () => {
    const result = buildTournamentStatistics([
      fixture({
        id: 'fx-normal', homeId: 'a', homeName: '한강 FC', awayId: 'b', awayName: '성수 FC', homeScore: 2, awayScore: 0,
        goals: [goal('g-1', 'home', 'p-1', '김민수')],
      }),
      fixture({
        id: 'fx-forfeit', homeId: 'a', homeName: '한강 FC', awayId: 'c', awayName: '마포 FC', homeScore: 0, awayScore: 0,
        outcomeReason: 'FORFEIT',
      }),
      fixture({
        id: 'fx-abandoned', homeId: 'b', homeName: '성수 FC', awayId: 'c', awayName: '마포 FC', homeScore: 1, awayScore: 0,
        goals: [goal('g-2', 'home', 'p-2', '이준호')],
        outcomeReason: 'ABANDONED',
      }),
    ]);

    expect(result.completedFixtures).toBe(1);
    expect(result.excludedFixtures).toBe(2);
    // 몰수·중단 경기의 팀은 그 경기로는 played/goalsFor/goalsAgainst가 전혀 늘지 않는다 —
    // '마포 FC'는 두 경기 모두 제외 대상이라 아예 팀 표에 등장하지 않는다.
    expect(result.mostScored.map(({ teamName }) => teamName)).toEqual(['한강 FC', '성수 FC']);
    expect(result.mostScored.find((row) => row.teamName === '한강 FC')).toMatchObject({ played: 1, goalsFor: 2, goalsAgainst: 0 });
    expect(result.mostScored.find((row) => row.teamName === '성수 FC')).toMatchObject({ played: 1, goalsFor: 0, goalsAgainst: 2 });
    // 중단 경기(fx-abandoned)에서 기록된 골(이준호)도 득점자 집계에서 빠진다.
    expect(result.scorers.map(({ playerName }) => playerName)).toEqual(['김민수']);
  });

  it('결과가 없는 예정 경기는 모든 통계에서 제외한다', () => {
    const scheduled = fixture({ id: 'fx-1', homeId: 'a', homeName: '한강 FC', awayId: 'b', awayName: '성수 FC', homeScore: 1, awayScore: 0 });
    scheduled.status = 'scheduled';
    scheduled.result = null;

    expect(buildTournamentStatistics([scheduled])).toEqual({
      scorers: [], leastConceded: [], mostScored: [], completedFixtures: 0, excludedFixtures: 0,
    });
  });
});
