import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TeamRecordsContent } from './team-records-content';
import type { PublicTeamRecordItem, PublicTeamRecordsResponse } from './types';

/**
 * F6 후속 -- 팀 전적 행 캡션이 **어느 대회·리그의 경기인지**를 말해주는지 못박는다.
 *
 * 배경: 개인 전적 화면은 리그 대진에 리그명을 붙이기 시작했는데 팀 전적 화면은 대회명만
 * 붙이고 있었다. 그래서 '전체' 탭에서는 정규 리그 경기와 친선 팀매치가 둘 다 날짜 한 줄로
 * 끝나 서로 구분되지 않았다 -- 같은 경기를 두 화면이 다르게 부르면 안 된다.
 */

function makeItem(overrides: Partial<PublicTeamRecordItem> = {}): PublicTeamRecordItem {
  return {
    gameId: 'game-1',
    teamMatchId: null,
    tournamentId: 'tournament-1',
    tournamentTitle: '여름 챔피언십',
    leagueId: null,
    leagueTitle: null,
    type: 'tournament',
    opponentTeamId: 'team-away',
    opponentTeamName: '부산 FC',
    opponentTeamLogoUrl: null,
    result: 'WON',
    goalsFor: 2,
    goalsAgainst: 1,
    penalties: null,
    events: [],
    playedAt: '2026-08-10T02:00:00.000Z',
    ...overrides,
  };
}

function makeTeamRecords(items: readonly PublicTeamRecordItem[]): PublicTeamRecordsResponse {
  const empty = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 };
  return {
    teamId: 'team-1',
    teamName: '서울 유나이티드',
    teamLogoUrl: null,
    availableSeasons: ['2026'],
    summary: {
      played: items.length,
      won: items.length,
      drawn: 0,
      lost: 0,
      goalsFor: 2 * items.length,
      goalsAgainst: items.length,
      byType: { league: empty, tournament: empty, friendly: empty },
    },
    items,
    nextCursor: null,
  };
}

describe('TeamRecordsContent — 행 캡션의 대회·리그 이름', () => {
  it('정규 리그 대진 행은 대회 경기와 같은 자리에 리그명을 보여준다', () => {
    render(
      <TeamRecordsContent
        data={makeTeamRecords([
          makeItem({
            gameId: 'game-league',
            teamMatchId: 'match-league',
            tournamentId: null,
            tournamentTitle: null,
            leagueId: 'league-1',
            leagueTitle: '2026 가을 정규 리그',
            type: 'league',
          }),
        ])}
      />,
    );

    expect(screen.getByText(/· 2026 가을 정규 리그/)).toBeInTheDocument();
  });

  it("'전체' 탭에서 같은 날 치른 리그 경기와 친선 경기를 캡션만으로 구분할 수 있다", () => {
    render(
      <TeamRecordsContent
        data={makeTeamRecords([
          makeItem({
            gameId: 'game-league',
            teamMatchId: 'match-league',
            tournamentId: null,
            tournamentTitle: null,
            leagueId: 'league-1',
            leagueTitle: '2026 가을 정규 리그',
            type: 'league',
            opponentTeamName: '망원 FC',
          }),
          makeItem({
            gameId: 'game-friendly',
            teamMatchId: 'match-friendly',
            tournamentId: null,
            tournamentTitle: null,
            leagueId: null,
            leagueTitle: null,
            type: 'friendly',
            opponentTeamName: '연남 FC',
          }),
        ])}
        activeType="all"
      />,
    );

    // 리그 행에는 이름이 붙고, 친선 행은 날짜 하나로만 끝난다(` · 이름` 꼬리 없음).
    expect(screen.getByText(/· 2026 가을 정규 리그/)).toBeInTheDocument();
    expect(screen.getByText(/^\d{1,2}\/\d{1,2} \(.\)$/)).toBeInTheDocument();
  });

  it('대회 경기 행은 예전 그대로 대회명을 보여준다(회귀 금지)', () => {
    render(<TeamRecordsContent data={makeTeamRecords([makeItem()])} />);

    expect(screen.getByText(/· 여름 챔피언십/)).toBeInTheDocument();
  });
});
