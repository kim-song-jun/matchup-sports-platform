import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeagueStandingsTable } from './league-standings-table';

const baseData = {
  standings: [
    { registrationId: 'r1', teamName: '성수 블루웨이브', position: 1, points: 18, wins: 6, draws: 0, losses: 1, goalsFor: 22, goalsAgainst: 9, fairPlayPoints: 3 },
    { registrationId: 'r2', teamName: '강남 FC', position: 2, points: 12, wins: 4, draws: 0, losses: 3, goalsFor: 15, goalsAgainst: 14, fairPlayPoints: 5 },
  ],
  progress: { total: 30, played: 21, remaining: 9, percent: 70 },
  magicNumber: { registrationId: 'r1', value: 4, clinched: false },
  recalculatedAt: '2026-08-17T10:00:00.000Z',
};

describe('LeagueStandingsTable', () => {
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
    expect(screen.getByText('우승 확정')).toBeInTheDocument();
  });

  it('아직 확정 전이면 매직넘버를 보여준다', () => {
    render(<LeagueStandingsTable data={baseData} />);
    expect(screen.getByText(/매직넘버 4/)).toBeInTheDocument();
  });

  it('순위가 비어 있으면 EmptyState를 보여준다', () => {
    render(<LeagueStandingsTable data={{ ...baseData, standings: [], progress: { total: 0, played: 0, remaining: 0, percent: 0 }, magicNumber: null }} />);
    expect(screen.getByText(/아직 순위가 없어요/)).toBeInTheDocument();
  });
});
