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
  it('renders all enabled home promos in priority order', () => {
    render(
      <TournamentHeroCard
        items={[
          promo('third', 1),
          promo('first', 30),
          promo('hidden', 100, false),
          promo('second', 20),
        ]}
      />,
    );

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual([
      expect.stringContaining('홈 first'),
      expect.stringContaining('홈 second'),
      expect.stringContaining('홈 third'),
    ]);
  });
});
