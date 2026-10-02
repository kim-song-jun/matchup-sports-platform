import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TournamentCampaignNotFound from './not-found';

const campaignStyles = readFileSync(
  'src/components/tournaments/tournament-campaign-template.module.css',
  'utf8',
);

describe('TournamentCampaignNotFound', () => {
  it('offers a keyboard-visible tournament-list action with a 44px target', () => {
    render(<TournamentCampaignNotFound />);

    const action = screen.getByRole('link', { name: '대회 목록으로' });
    expect(action).toHaveAttribute('href', '/tournaments');
    expect(action.className).toContain('notFoundAction');
    // The 44px target and centring come from the shared size modifier, not a module copy of it.
    expect(action).toHaveClass('tm-btn-md');
    expect(campaignStyles).toMatch(
      /\.notFoundAction:focus-visible\s*{[^}]*outline:\s*2px solid var\(--blue500\);[^}]*outline-offset:\s*2px;/,
    );
  });
});
