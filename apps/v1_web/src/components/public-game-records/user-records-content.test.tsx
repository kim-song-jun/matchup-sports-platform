import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UserRecordsContent } from './user-records-content';
import type { PublicUserRecordItem, PublicUserRecordsResponse } from './types';

function item(overrides: Partial<PublicUserRecordItem> = {}): PublicUserRecordItem {
  return {
    id: 'record-1',
    gameId: 'game-1',
    teamMatchId: 'team-match-1',
    type: 'tournament',
    matchType: 'tournament',
    tournamentId: 'tournament-1',
    tournamentTitle: '여름 챔피언십',
    leagueId: null,
    leagueTitle: null,
    round: '결승',
    teamId: 'team-home',
    teamName: '서울 유나이티드',
    opponentTeamId: 'team-away',
    opponentTeamName: '부산 FC',
    result: 'WON',
    goals: 1,
    cards: { yellow: 0, red: 0 },
    minutesPlayed: 90,
    started: true,
    goalkeeper: false,
    mvp: false,
    officialAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

function data(items: readonly PublicUserRecordItem[]): PublicUserRecordsResponse {
  return {
    userId: 'user-1',
    nickname: '테스트 유저',
    viewerIsOwner: false,
    consentGranted: true,
    summary: {
      appearances: items.length,
      goals: items.reduce((sum, record) => sum + record.goals, 0),
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      mvpCount: 0,
      matchMvpCount: 0,
      tournamentAwardCount: 0,
      byType: {
        league: { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, mvpCount: 0 },
        tournament: { appearances: items.length, goals: 1, assists: 0, yellowCards: 0, redCards: 0, mvpCount: 0 },
        friendly: { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, mvpCount: 0 },
      },
    },
    tournamentAwards: [],
    items,
    nextCursor: null,
  };
}

describe('UserRecordsContent match links', () => {
  it('canonical records link to the category-specific exact match while records without an ID keep the tournament route', () => {
    render(
      <UserRecordsContent
        data={data([
          item(),
          item({
            id: 'record-league',
            gameId: 'game-league',
            teamMatchId: 'team-match-league',
            type: 'league',
            matchType: 'team_match',
            tournamentId: null,
            tournamentTitle: null,
            leagueId: 'league-1',
            leagueTitle: '2026 가을 정규 리그',
          }),
          item({
            id: 'record-friendly',
            gameId: 'game-friendly',
            teamMatchId: 'team-match-friendly',
            type: 'friendly',
            matchType: 'team_match',
            tournamentId: null,
            tournamentTitle: null,
          }),
          item({ id: 'record-legacy', gameId: 'game-legacy', teamMatchId: null }),
        ])}
      />,
    );

    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/tournaments/tournament-1/matches/team-match-1',
      '/league-matches/league-1/fixtures/team-match-league',
      '/team-matches/team-match-friendly',
      '/tournaments/tournament-1',
    ]);
  });
});
