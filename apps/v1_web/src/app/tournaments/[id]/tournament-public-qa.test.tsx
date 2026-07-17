import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { V1TournamentDetail } from '@/types/api';
import { TournamentFlowNav } from '@/components/tournaments/tournament-flow-nav';
import { BracketPageContent } from './bracket/bracket-page-client';
import { ResultsPageContent } from './results/results-page-client';

function makeTournament(
  overrides: Partial<V1TournamentDetail> & Pick<V1TournamentDetail, 'format' | 'status'>,
): V1TournamentDetail {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    scheduledAt: null,
    scheduledEndAt: null,
    venue: null,
    latitude: null,
    longitude: null,
    coverImageUrl: null,
    teamCount: 8,
    minPlayers: 5,
    maxPlayers: 10,
    genderCategory: null,
    genderMinMale: null,
    genderMaxMale: null,
    genderMinFemale: null,
    genderMaxFemale: null,
    entryFee: 0,
    prizePool: null,
    prizeSummary: null,
    prizeBreakdown: null,
    promoHomeEnabled: false,
    promoHomeTitle: null,
    promoHomeSubtitle: null,
    promoHomeImageUrl: null,
    promoHomeBadgeText: null,
    promoHomeDateText: null,
    promoHomeTeamsText: null,
    promoHomeLocationText: null,
    promoHomePrizeText: null,
    promoHomePriority: 0,
    promoListEnabled: false,
    promoListTitle: null,
    promoListSubtitle: null,
    promoListImageUrl: null,
    promoListBadgeText: null,
    promoListDateText: null,
    promoListTeamsText: null,
    promoListLocationText: null,
    promoListPrizeText: null,
    promoListPriority: 0,
    campaignSlug: null,
    rulesText: null,
    refundPolicyText: null,
    confirmedCount: 0,
    participantTeams: [],
    pendingPaymentCount: 0,
    groups: [],
    fixtures: [],
    announcements: [],
    sponsors: [],
    reviews: [],
    awards: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('public tournament QA regressions', () => {
  it('shows an explicit empty state when a completed tournament has no final standings', () => {
    render(<ResultsPageContent tournament={makeTournament({ format: 'knockout', status: 'completed' })} />);

    expect(screen.getByText('최종 순위가 아직 등록되지 않았어요.')).toBeInTheDocument();
  });

  it('does not mention a group stage for an empty direct-knockout bracket', () => {
    render(<BracketPageContent tournament={makeTournament({ format: 'knockout', status: 'open' })} />);

    expect(screen.getByText(/대진 편성이 완료되면/)).toBeInTheDocument();
    expect(screen.queryByText(/조별리그가 끝난 후/)).not.toBeInTheDocument();
  });

  it('keeps the group-stage explanation for a group-then-knockout bracket', () => {
    render(<BracketPageContent tournament={makeTournament({ format: 'group_knockout', status: 'open' })} />);

    expect(screen.getByText(/조별리그가 끝난 후/)).toBeInTheDocument();
  });

  it('uses the correct Korean directional particle in journey-link labels', () => {
    render(
      <TournamentFlowNav
        prev={{ href: '/results', label: '최종결과' }}
        next={{ href: '/awards', label: '시상·리뷰', enabled: true }}
      />,
    );

    expect(screen.getByRole('link', { name: '최종결과로 이동' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '시상·리뷰로 이동' })).toBeInTheDocument();
  });

  it('uses "으로" after a final consonant other than rieul', () => {
    render(
      <TournamentFlowNav
        prev={{ href: '/bracket', label: '순위·브래킷' }}
      />,
    );

    expect(screen.getByRole('link', { name: '순위·브래킷으로 이동' })).toBeInTheDocument();
  });

  it('lets keyboard users replay the mobile champion celebration', () => {
    const tournament = makeTournament({
      format: 'knockout',
      status: 'completed',
      fixtures: [
        {
          id: 'final-1',
          groupId: null,
          round: 'final',
          fixtureNumber: 1,
          legNumber: 1,
          scheduledAt: null,
          venue: null,
          homeTeamName: '서울 유나이티드',
          homeRegistrationId: 'registration-home',
          awayTeamName: '부산 FC',
          awayRegistrationId: 'registration-away',
          status: 'completed',
          result: {
            homeScore: 2,
            awayScore: 1,
            hasPenalty: false,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            note: null,
            recordedAt: '2026-07-16T00:00:00.000Z',
          },
          videos: [],
        },
      ],
    });

    render(<ResultsPageContent tournament={tournament} />);
    const champion = screen.getByRole('button', { name: /우승팀: 서울 유나이티드/ });

    fireEvent.keyDown(champion, { key: 'Enter' });

    expect(champion).toHaveAttribute('tabindex', '0');
  });
});
