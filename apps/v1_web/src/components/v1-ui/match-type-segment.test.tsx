import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MatchTypeSegment } from './match-type-segment';

describe('MatchTypeSegment', () => {
  it('팀 매치를 첫 번째 선택지로 보여준다', () => {
    render(<MatchTypeSegment active="team" />);
    const nav = screen.getByRole('navigation', { name: '매치 유형' });
    const links = within(nav).getAllByRole('link');

    expect(links[0]).toHaveTextContent('팀');
    expect(links[0]).toHaveAttribute('href', '/team-matches');
    expect(links[1]).toHaveTextContent('개인');
    expect(links[1]).toHaveAttribute('href', '/matches');
  });
});
