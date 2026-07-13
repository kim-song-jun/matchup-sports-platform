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

  it('renders nothing for draft/open/closed/cancelled tournaments — too early (or cancelled) for any "대회 후" content', () => {
    for (const status of ['draft', 'open', 'closed', 'cancelled'] as const) {
      const { container, unmount } = render(
        createElement(TournamentPostEventHubSection, {
          tournamentId: 'tour-42',
          status,
          fixtures: NO_FIXTURES,
          hasAnnouncements: false,
          sponsorCount: 0,
          announcements: [],
        }),
      );

      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('renders nothing for an in_progress tournament with no completed fixtures/announcements/sponsors — nothing real to show yet', () => {
    const { container } = render(
      createElement(TournamentPostEventHubSection, {
        tournamentId: 'tour-42',
        status: 'in_progress',
        fixtures: NO_FIXTURES,
        hasAnnouncements: false,
        sponsorCount: 0,
        announcements: [],
      }),
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders only the genuinely available rows (not "준비 중" placeholders) for an in_progress tournament with a completed fixture', () => {
    const fixtures: V1TournamentFixture[] = [
      {
        id: 'f1',
        groupId: null,
        round: '조별 1라운드',
        status: 'completed',
        homeRegistrationId: 'r1',
        awayRegistrationId: 'r2',
        homeTeamName: '팀A',
        awayTeamName: '팀B',
        result: { homeScore: 2, awayScore: 1, hasPenalty: false, homePenaltyScore: null, awayPenaltyScore: null },
      } as V1TournamentFixture,
    ];

    render(
      createElement(TournamentPostEventHubSection, {
        tournamentId: 'tour-42',
        status: 'in_progress',
        fixtures,
        hasAnnouncements: false,
        sponsorCount: 0,
        announcements: [],
      }),
    );

    expect(screen.getByText('대회 현황')).toBeInTheDocument();
    // 결과·순위, 리뷰 등 "available" 상태 카드만 뜨고, "하이라이트 영상" 같은 upcoming
    // placeholder는 나오지 않는다.
    expect(screen.queryByText('하이라이트 영상')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /리뷰·매너 기록/ })).toHaveAttribute('href', '/my/reviews');
  });
});
