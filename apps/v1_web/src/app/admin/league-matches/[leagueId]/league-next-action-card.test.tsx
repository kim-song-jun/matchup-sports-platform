import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LeagueNextActionCard } from './league-next-action-card';
import type { V1LeagueFixture } from '@/types/league-match';

const fixture = { teamMatchId: 'tm-1', title: '1주차', startAt: '2026-11-14T01:00:00.000Z' } as V1LeagueFixture;

describe('LeagueNextActionCard', () => {
  // MD-QA #210: '… 알파 2팀예요' — 팀 이름 끝 받침에 맞춰 이에요/예요를 고른다.
  it('받침 있는 팀 이름 뒤에는 이에요를 붙인다', () => {
    render(<LeagueNextActionCard action={{ kind: 'next', fixture }} leagueId="league-1" matchupLabel="알파 1팀 vs 알파 2팀" />);
    expect(screen.getByText('다음 경기는 알파 1팀 vs 알파 2팀이에요')).toBeInTheDocument();
  });
});
