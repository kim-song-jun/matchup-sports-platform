import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { V1TournamentDetail } from '@/types/api';
import { AwardsPageClient } from './awards-page-client';

const awardsApiMocks = vi.hoisted(() => ({
  useV1Tournament: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...awardsApiMocks,
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/tournament-1/awards',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function makeCompletedTournament(overrides: Partial<V1TournamentDetail> = {}): V1TournamentDetail {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    status: 'completed',
    format: 'knockout',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: null,
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
    popup: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AwardsPageClient GA events', () => {
  const originalShare = navigator.share;
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    vi.clearAllMocks();
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });

  it('tracks tournament_share with channel=native_share when the Web Share API is available', () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: shareMock, configurable: true });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    fireEvent.click(screen.getByRole('button', { name: '결과 공유' }));

    expect(trackEvent).toHaveBeenCalledWith('tournament_share', { channel: 'native_share' });
    expect(shareMock).toHaveBeenCalled();
  });

  it('tracks tournament_share with channel=clipboard when the Web Share API is unavailable', () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextMock }, configurable: true });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    fireEvent.click(screen.getByRole('button', { name: '결과 공유' }));

    expect(trackEvent).toHaveBeenCalledWith('tournament_share', { channel: 'clipboard' });
    expect(writeTextMock).toHaveBeenCalled();
  });
});
