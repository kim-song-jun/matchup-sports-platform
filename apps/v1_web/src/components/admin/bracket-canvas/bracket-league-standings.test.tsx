import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LeagueStandingsGroup } from '@/lib/bracket-league-standings-model';
import { BracketLeagueStandings } from './bracket-league-standings';

const row = (registrationId: string, teamName: string, rank: number, extra: Partial<LeagueStandingsGroup['rows'][number]> = {}) => ({
  registrationId, teamName, rank, played: 0, wins: 0, draws: 0, losses: 0, goalDifference: 0, points: 0, ...extra,
});
const groups: LeagueStandingsGroup[] = [
  { groupId: 'gA', name: 'A조', rows: [row('r1', '송파 유나이티드', 1, { played: 2, wins: 2, goalDifference: 3, points: 6 }), row('r2', '마포 레인저스', 2, { played: 2, losses: 2, goalDifference: -3 })] },
  { groupId: 'gB', name: 'B조', rows: [row('r4', '알파 6인 8팀', 1, { played: 1, wins: 1, goalDifference: 1, points: 3 })] },
];

describe('BracketLeagueStandings', () => {
  it('조마다 표를 따로 그리고 열 머리글 8개를 scope=col 로 둔다', () => {
    render(<BracketLeagueStandings groups={groups} />);
    const table = screen.getByRole('table', { name: 'A조 순위표' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['순위', '팀', '경기', '승', '무', '패', '득실', '승점']);
    expect(screen.getByRole('table', { name: 'B조 순위표' })).toBeInTheDocument();
  });

  it('행은 순위·팀·경기·승·무·패·득실·승점 순이고 득실에는 부호가 붙는다', () => {
    render(<BracketLeagueStandings groups={groups} />);
    const rows = within(screen.getByRole('table', { name: 'A조 순위표' })).getAllByRole('row').slice(1);
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['1', '송파 유나이티드', '2', '2', '0', '0', '+3', '6']);
    expect(within(rows[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['2', '마포 레인저스', '2', '0', '0', '2', '-3', '0']);
  });

  it('다른 조 팀이 섞이지 않는다', () => {
    render(<BracketLeagueStandings groups={groups} />);
    expect(within(screen.getByRole('table', { name: 'B조 순위표' })).queryByText('송파 유나이티드')).not.toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'B조 순위표' })).getByText('알파 6인 8팀')).toBeInTheDocument();
  });
});
