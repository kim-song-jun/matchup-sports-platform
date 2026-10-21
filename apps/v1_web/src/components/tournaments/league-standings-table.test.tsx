import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeagueStandingsTable } from './league-standings-table';
import { queryImageBySrc } from '@/test/next-image';

const baseData = {
  standings: [
    { registrationId: 'r1', teamName: '성수 블루웨이브', position: 1, points: 18, wins: 6, draws: 0, losses: 1, goalsFor: 22, goalsAgainst: 9, fairPlayPoints: 3 },
    { registrationId: 'r2', teamName: '강남 FC', position: 2, points: 12, wins: 4, draws: 0, losses: 3, goalsFor: 15, goalsAgainst: 14, fairPlayPoints: 5 },
  ],
  progress: { total: 30, played: 21, remaining: 9, percent: 70 },
  magicNumber: { registrationId: 'r1', value: 4, clinched: false },
  recalculatedAt: '2026-08-17T10:00:00.000Z',
  champions: [],
  tieBreakGroups: [],
};

describe('LeagueStandingsTable', () => {
  it('대회와 정규 리그 행의 실제 팀 로고를 팀 이름 옆에 표시한다', () => {
    const { container } = render(<LeagueStandingsTable data={{ ...baseData, standings: [
      { ...baseData.standings[0], teamLogoUrl: '/uploads/teams/tournament.webp' },
      { ...baseData.standings[1], registrationId: undefined, teamId: 'team-2', teamLogoUrl: '/uploads/teams/league.webp' },
    ] }} />);
    for (const path of ['/uploads/teams/tournament.webp', '/uploads/teams/league.webp']) {
      const image = queryImageBySrc(container, path);
      expect(image).not.toBeNull();
      expect(image?.closest('td')).toHaveTextContent(path.includes('tournament') ? '성수 블루웨이브' : '강남 FC');
    }
  });
  // MD-QA #171: "FP 10" 약어만 보여 무슨 숫자인지, 왜 순위가 갈렸는지 알 수 없었다.
  it('FP 가 있으면 페어플레이 벌점이라는 설명을 함께 보여준다', () => {
    render(<LeagueStandingsTable data={baseData} />);
    expect(screen.getByText(/FP는 페어플레이 벌점이에요/)).toBeInTheDocument();
  });
  it('FP 가 없는 표(정규 리그 등)에는 설명을 붙이지 않는다', () => {
    render(<LeagueStandingsTable data={{ ...baseData, standings: baseData.standings.map(({ fairPlayPoints: _fp, ...row }) => row) }} />);
    expect(screen.queryByText(/FP는 페어플레이 벌점이에요/)).not.toBeInTheDocument();
  });
  it('순위·팀명·승점을 표시한다', () => {
    render(<LeagueStandingsTable data={baseData} />);
    expect(screen.getByText('성수 블루웨이브')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('진행률을 숫자와 함께 보여준다(색만으로 전달하지 않는다)', () => {
    render(<LeagueStandingsTable data={baseData} />);
    expect(screen.getByText(/21\s*\/\s*30/)).toBeInTheDocument();
    expect(screen.getByText(/70%/)).toBeInTheDocument();
  });

  it('우승이 확정되면 확정 배지를 보여준다', () => {
    render(<LeagueStandingsTable data={{ ...baseData, magicNumber: { registrationId: 'r1', value: 0, clinched: true } }} />);
    expect(screen.getByText('1위 확정')).toBeInTheDocument();
    expect(screen.queryByText(/승점 \d/)).not.toBeInTheDocument();
  });

  it('아직 확정 전이면 1위 확정까지 필요한 승점을 풀어 쓴다', () => {
    render(<LeagueStandingsTable data={baseData} />);
    expect(screen.getByText('1위 확정까지 승점 4')).toBeInTheDocument();
    expect(screen.getByText('· 성수 블루웨이브')).toBeInTheDocument();
    expect(screen.queryByText(/매직넘버/)).not.toBeInTheDocument();
  });

  it('매직넘버 값이 없으면 확정 줄을 그리지 않는다', () => {
    render(<LeagueStandingsTable data={{ ...baseData, magicNumber: null }} />);
    expect(screen.queryByText(/1위 확정/)).not.toBeInTheDocument();
  });

  it('순위가 비어 있으면 EmptyState를 보여준다', () => {
    render(<LeagueStandingsTable data={{ ...baseData, standings: [], progress: { total: 0, played: 0, remaining: 0, percent: 0 }, magicNumber: null }} />);
    expect(screen.getByText(/아직 순위가 없어요/)).toBeInTheDocument();
  });
});
