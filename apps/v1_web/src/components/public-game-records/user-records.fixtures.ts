import type { PublicUserRecordItem, PublicUserRecordsResponse } from './types';

/** 본인 조회(동의 전) 응답 픽스처 -- 리그 1경기, 1골 1도움. 테스트가 필요한 칸만 덮어쓴다. */
export function ownerRecordItem(overrides: Partial<PublicUserRecordItem> = {}): PublicUserRecordItem {
  return {
    id: 'record-1', gameId: 'game-1', teamMatchId: 'match-1', type: 'league', matchType: 'team_match', tournamentId: null,
    tournamentTitle: null, leagueId: 'league-1', leagueTitle: '마포 주말 리그', round: null, teamId: 'team-1', teamName: '마포 FC',
    opponentTeamId: 'team-2', opponentTeamName: '합정 유나이티드', result: 'WON', goals: 1, assists: 1, cards: { yellow: 0, red: 0 },
    minutesPlayed: 90, started: true, goalkeeper: false, mvp: false, officialAt: '2026-09-30T01:10:00.000Z', ...overrides,
  };
}

const ZERO_TOTALS = { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, mvpCount: 0 };

export function ownerRecordsResponse(overrides: Partial<PublicUserRecordsResponse> = {}): PublicUserRecordsResponse {
  return {
    userId: 'user-a',
    nickname: '골잡이',
    viewerIsOwner: true,
    consentGranted: false,
    summary: {
      appearances: 1, goals: 1, assists: 1, yellowCards: 0, redCards: 0, mvpCount: 0, matchMvpCount: 0, tournamentAwardCount: 0,
      byType: {
        league: { ...ZERO_TOTALS, appearances: 1, goals: 1, assists: 1 },
        tournament: ZERO_TOTALS,
        friendly: ZERO_TOTALS,
      },
    },
    tournamentAwards: [],
    items: [ownerRecordItem()],
    nextCursor: null,
    ...overrides,
  };
}
