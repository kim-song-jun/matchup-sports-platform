import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1HomeNextGame } from '@/types/api';
import { NextGameCard } from './next-game-card';

// 2026-09-30 00:10 KST — 리그 경기(01:10)는 1시간 뒤다.
const NOW = new Date('2026-09-29T15:10:00.000Z');
const KICKOFF = '2026-09-29T16:10:00.000Z';

function leagueGame(overrides: Partial<V1HomeNextGame> = {}): V1HomeNextGame {
  return {
    gameId: 'game-1',
    teamMatchId: 'tm-1',
    competitionKind: 'LEAGUE',
    competitionId: 'league-1',
    title: '마포 주말 리그 1주차',
    opponentName: '합정 유나이티드',
    scheduledAt: KICKOFF,
    placeName: '망원 유수지 풋살장',
    teamId: 'team-a',
    teamName: '마포 FC',
    viewerCanManage: false,
    viewerParticipating: true,
    participantCount: 10,
    ...overrides,
  };
}

const hrefOf = (name: string) => screen.getByRole('link', { name }).getAttribute('href');

describe('NextGameCard', () => {
  it('출전하는 팀원: 시각·상대·장소, 내 출전 칩, 경기 상세(주)·명단 보기 링크', () => {
    render(<NextGameCard game={leagueGame()} now={NOW} />);

    expect(screen.getByRole('heading', { name: 'vs 합정 유나이티드' })).toBeInTheDocument();
    expect(screen.getByText('1시간 뒤')).toBeInTheDocument();
    expect(screen.getByText('오늘 01:10')).toBeInTheDocument();
    expect(screen.getByText('마포 주말 리그 1주차 · 망원 유수지 풋살장')).toBeInTheDocument();
    expect(screen.getByText('내 출전')).toBeInTheDocument();
    expect(screen.getByText('마포 FC · 10명 출전')).toBeInTheDocument();
    expect(hrefOf('경기 상세')).toBe('/league-matches/league-1/fixtures/tm-1?from=%2Fhome');
    expect(hrefOf('명단 보기')).toBe('/teams/team-a/games/game-1/roster');
  });

  it('명단에서 빠진 팀원: 칩은 없고 경기 상세·명단 보기 링크는 그대로 있다', () => {
    render(<NextGameCard game={leagueGame({ viewerParticipating: false })} now={NOW} />);

    expect(screen.queryByText('내 출전')).not.toBeInTheDocument();
    expect(screen.queryByText(/빠졌|없어요/)).not.toBeInTheDocument();
    expect(hrefOf('경기 상세')).toContain('/league-matches/league-1/fixtures/tm-1');
    expect(hrefOf('명단 보기')).toBe('/teams/team-a/games/game-1/roster');
  });

  it('팀장·매니저: 주 버튼이 명단 확인이 되고 경기 상세가 보조로 내려간다', () => {
    render(<NextGameCard game={leagueGame({ viewerCanManage: true, viewerParticipating: false })} now={NOW} />);

    const links = screen.getAllByRole('link').map((link) => link.textContent);
    expect(links).toEqual(['명단 확인', '경기 상세']);
    expect(hrefOf('명단 확인')).toBe('/teams/team-a/games/game-1/roster');
    expect(screen.getByText('마포 FC · 10명 출전 · 경기 시작 전까지 바꿀 수 있어요')).toBeInTheDocument();
  });

  it('친선: 팀원에게는 팀장 전용인 참석명단 링크를 내지 않고 경기 상세만 준다', () => {
    const friendly = leagueGame({
      competitionKind: 'FRIENDLY',
      competitionId: null,
      title: '주말 친선',
      participantCount: null,
    });
    render(<NextGameCard game={friendly} now={NOW} />);

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['경기 상세']);
    expect(hrefOf('경기 상세')).toBe('/team-matches/tm-1?from=%2Fhome');
    expect(screen.getByText('친선')).toBeInTheDocument();
  });

  it('친선: 팀장·매니저에게는 참석명단 화면으로 가는 명단 확인을 준다', () => {
    const friendly = leagueGame({
      competitionKind: 'FRIENDLY',
      competitionId: null,
      viewerCanManage: true,
      viewerParticipating: false,
      participantCount: null,
    });
    render(<NextGameCard game={friendly} now={NOW} />);

    expect(hrefOf('명단 확인')).toBe('/team-matches/tm-1/lineup');
  });

  it('기준 명단이 없는 대회 경기는 팀원이 열면 404 인 명단 링크를 내지 않는다', () => {
    const tournament = leagueGame({ competitionKind: 'TOURNAMENT', competitionId: 't-1', participantCount: null, viewerParticipating: false });
    render(<NextGameCard game={tournament} now={NOW} />);

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['경기 상세']);
    expect(hrefOf('경기 상세')).toBe('/tournaments/t-1/matches/tm-1?from=%2Fhome');
  });
});
