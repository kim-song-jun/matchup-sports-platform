import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentListItem } from '@/types/api';
import { TournamentHeroCard } from './tournament-hero-card';

function promo(id: string, priority: number, enabled = true): V1TournamentListItem {
  return {
    id,
    title: id,
    status: 'open',
    scheduledAt: '2026-08-01T09:00:00.000Z',
    sport: { code: 'futsal', name: '풋살' },
    venue: '서울',
    promoHomeEnabled: enabled,
    promoHomePriority: priority,
    promoHomeTitle: `홈 ${id}`,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
  } as V1TournamentListItem;
}

describe('TournamentHeroCard', () => {
  it('renders all enabled home promos with priority 0 first', () => {
    render(
      <TournamentHeroCard
        items={[
          promo('third', 2),
          promo('first', 0),
          promo('hidden', 100, false),
          promo('second', 1),
        ]}
      />,
    );

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      expect.stringContaining('홈 first'),
      expect.stringContaining('홈 second'),
      expect.stringContaining('홈 third'),
    ]);
  });

  it('links a promoted tournament to its published campaign when a campaign slug exists', () => {
    render(
      <TournamentHeroCard
        items={[
          { ...promo('campaign-tournament', 0), campaignSlug: 'summer-futsal-cup' },
          promo('detail-tournament', 1),
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: /홈 campaign-tournament/ })).toHaveAttribute(
      'href',
      '/tournaments/campaigns/summer-futsal-cup',
    );
    expect(screen.getByRole('link', { name: /홈 detail-tournament/ })).toHaveAttribute(
      'href',
      '/tournaments/detail-tournament',
    );
  });
});
