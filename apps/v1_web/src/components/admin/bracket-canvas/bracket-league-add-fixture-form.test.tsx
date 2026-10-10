import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeBracket, makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import type { V1AdminTournamentBracket } from '@/types/api';
import { BracketLeagueAddFixtureForm } from './bracket-league-add-fixture-form';

afterEach(cleanup);

const group = makeGroup({ id: 'gA', name: 'A조', phase: 'group' });
const bracketWithRounds = (...rounds: number[]): V1AdminTournamentBracket =>
  makeBracket({
    groups: [group],
    fixtures: rounds.map((n) => makeFixture({ id: `f${n}`, groupId: 'gA', fixtureNumber: n, round: `league_r${n}` })),
  });

describe('BracketLeagueAddFixtureForm — 고른 라운드가 사라졌을 때', () => {
  it('대진이 새로고침되어 고른 라운드가 없어지면 기본 선택(마지막 기존 라운드)을 보여 주고 그 라운드로 보낸다', () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<BracketLeagueAddFixtureForm bracket={bracketWithRounds(1, 2, 3)} pending={false} onSubmit={onSubmit} />);
    const select = screen.getByLabelText('라운드') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'r2' } });
    expect(select.selectedOptions[0].textContent).toBe('2라운드');

    // 2라운드 경기가 모두 지워진 대진으로 갱신
    rerender(<BracketLeagueAddFixtureForm bracket={bracketWithRounds(1, 3)} pending={false} onSubmit={onSubmit} />);
    expect((screen.getByLabelText('라운드') as HTMLSelectElement).selectedOptions[0].textContent).toBe('3라운드');

    fireEvent.click(screen.getByRole('button', { name: '경기 추가' }));
    expect(onSubmit).toHaveBeenCalledWith({ groupId: 'gA', groupName: 'A조', round: 'league_r3', roundName: '3라운드' });
  });
});
