import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { V1MyTeam, V1TournamentDetail } from '@/types/api';
import { TournamentApplyPageClient } from './tournament-apply-client';

const tournamentApplyApiMocks = vi.hoisted(() => ({
  useV1Tournament: vi.fn(),
  useV1MyTeams: vi.fn(),
  useV1MyRegistrations: vi.fn(),
  useV1Registration: vi.fn(),
  useV1CreateRegistration: vi.fn(),
  useV1SubmitRegistration: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...tournamentApplyApiMocks,
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/tournament-1/apply',
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

function makeTournament(overrides: Partial<V1TournamentDetail> = {}): V1TournamentDetail {
  return {
    id: 'tournament-1',
    sportId: 'sport-futsal',
    sport: { code: 'futsal', name: '풋살' },
    title: '테스트 대회',
    status: 'open',
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

function makeTeam(overrides: Partial<V1MyTeam> = {}): V1MyTeam {
  return {
    teamId: 'team-1',
    membershipId: 'membership-1',
    name: '성수 풋살 크루',
    role: 'owner',
    status: 'active',
    logoUrl: null,
    sport: { sportId: 'sport-futsal', name: '풋살' },
    region: { regionId: 'region-seoul', name: '서울', parentName: null },
    memberCount: 12,
    canManage: true,
    canCreateTeamMatch: true,
    detailRoute: '/teams/team-1',
    manageRoute: '/teams/team-1/members',
    ...overrides,
  };
}

describe('TournamentApplyPageClient GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();

    tournamentApplyApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament(),
      isLoading: false,
      isError: false,
      error: null,
    });
    tournamentApplyApiMocks.useV1MyTeams.mockReturnValue({
      data: { items: [makeTeam()] },
      isLoading: false,
    });
    tournamentApplyApiMocks.useV1MyRegistrations.mockReturnValue({ data: [], isLoading: false });
    tournamentApplyApiMocks.useV1Registration.mockReturnValue({ data: undefined });
  });

  it('tracks tournament_apply_complete once the registration is submitted', async () => {
    const createRegistrationMutateAsync = vi.fn().mockResolvedValue({
      id: 'registration-1',
      status: 'draft',
    });
    const submitRegistrationMutateAsync = vi.fn().mockResolvedValue({
      id: 'registration-1',
      status: 'awaiting_payment',
      payment: { paymentDueAt: '2026-07-19T00:00:00.000Z' },
      paymentInstructions: {
        bankName: '국민은행',
        bankAccount: '123-456-789',
        bankHolder: '아이위',
      },
      depositorName: '성수 풋살 크루',
    });
    tournamentApplyApiMocks.useV1CreateRegistration.mockReturnValue({
      mutateAsync: createRegistrationMutateAsync,
      isPending: false,
    });
    tournamentApplyApiMocks.useV1SubmitRegistration.mockReturnValue({
      mutateAsync: submitRegistrationMutateAsync,
      isPending: false,
    });

    render(<TournamentApplyPageClient tournamentId="tournament-1" />);

    const [nextButton] = await screen.findAllByRole('button', { name: /^다음 단계/ });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(createRegistrationMutateAsync).toHaveBeenCalledWith({ teamId: 'team-1' });
    });

    fireEvent.click(await screen.findByLabelText('전체 동의'));

    const depositorInput = screen.getByLabelText('입금자명 *');
    fireEvent.change(depositorInput, { target: { value: '성수 풋살 크루' } });

    const [submitButton] = screen.getAllByRole('button', { name: '신청 제출하기' });
    fireEvent.click(submitButton);
    fireEvent.click(await screen.findByRole('button', { name: '확인하고 신청하기' }));

    await waitFor(() => {
      expect(submitRegistrationMutateAsync).toHaveBeenCalled();
      expect(trackEvent).toHaveBeenCalledWith('tournament_apply_complete', { tournamentId: 'tournament-1' });
    });
  });
});
