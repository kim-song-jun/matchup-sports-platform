import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TeamMatchOperatePage from './page';

vi.mock('@/components/team-matches/team-match-operate-entry', () => ({
  TeamMatchOperateEntry: ({ teamMatchId }: { teamMatchId: string }) => (
    <div data-testid="operate-entry" data-team-match-id={teamMatchId} />
  ),
}));

describe('TeamMatchOperatePage', () => {
  it('passes the canonical dynamic route id to the operate entry', async () => {
    const page = await TeamMatchOperatePage({ params: Promise.resolve({ id: 'canonical-team-match' }) });

    render(page);

    expect(screen.getByTestId('operate-entry')).toHaveAttribute('data-team-match-id', 'canonical-team-match');
  });
});
