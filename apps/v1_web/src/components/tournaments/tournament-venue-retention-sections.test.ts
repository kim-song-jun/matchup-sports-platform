import { describe, expect, it } from 'vitest';
import { getTournamentPostEventCards } from './tournament-venue-retention-model';

describe('getTournamentPostEventCards', () => {
  it('links completed tournament fixtures to the review inbox instead of an upcoming placeholder', () => {
    const cards = getTournamentPostEventCards({
      status: 'completed',
      hasCompletedFixture: true,
      hasAnnouncements: false,
      sponsorCount: 0,
      announcements: [],
    });

    expect(cards.find((card) => card.key === 'reviews')).toMatchObject({
      title: '리뷰·매너 기록',
      status: 'available',
      actionLabel: '리뷰 작성',
      href: '/my/reviews',
    });
  });
});
