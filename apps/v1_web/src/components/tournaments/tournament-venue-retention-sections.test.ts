import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getTournamentPostEventCards } from './tournament-venue-retention-model';
import { TournamentPostEventHubSection } from './tournament-venue-retention-sections';
import type { V1TournamentFixture } from '@/types/api';

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

const NO_FIXTURES: V1TournamentFixture[] = [];

describe('TournamentPostEventHubSection — completed action list vs default hub (regression guard)', () => {
  it('renders the 3-row completed action list with correct hrefs for a completed tournament', () => {
    render(
      createElement(TournamentPostEventHubSection, {
        tournamentId: 'tour-42',
        status: 'completed',
        fixtures: NO_FIXTURES,
        hasAnnouncements: false,
        sponsorCount: 0,
        announcements: [],
      }),
    );

    expect(screen.getByRole('link', { name: /최종 결과·시상/ })).toHaveAttribute(
      'href',
      '/tournaments/tour-42/results',
    );
    expect(screen.getByRole('link', { name: /대진표·조별 순위/ })).toHaveAttribute(
      'href',
      '/tournaments/tour-42/bracket',
    );
    expect(screen.getByRole('link', { name: /후기·매너 평가/ })).toHaveAttribute('href', '/my/reviews');
    expect(screen.getByText('대회 후 더보기')).toBeInTheDocument();
  });

  it('keeps rendering the original 5-card hub (not the completed action list) for a non-completed tournament', () => {
    render(
      createElement(TournamentPostEventHubSection, {
        tournamentId: 'tour-42',
        status: 'open',
        fixtures: NO_FIXTURES,
        hasAnnouncements: false,
        sponsorCount: 0,
        announcements: [],
      }),
    );

    expect(screen.getByText('대회 후 허브')).toBeInTheDocument();
    expect(screen.queryByText('대회 후 더보기')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /최종 결과·시상/ })).not.toBeInTheDocument();
  });
});
