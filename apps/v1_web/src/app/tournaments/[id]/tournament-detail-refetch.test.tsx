import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import type { V1TournamentDetail } from '@/types/api';
import { TournamentDetailPageClient } from './tournament-detail-client';

const queryState = vi.hoisted(() => ({
  tournamentPath: '',
  responses: [] as unknown[],
}));

const nonTournamentHooks = vi.hoisted(() => ({
  useV1MyRegistrations: vi.fn(() => ({ data: [] })),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...nonTournamentHooks,
}));

vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client')>()),
  v1Get: vi.fn(async (path: string) => {
    if (path === queryState.tournamentPath) {
      const response = queryState.responses.shift();
      if (response instanceof Error) throw response;
      return response;
    }
    if (path.endsWith('/standings/overall')) {
      return {
        standings: [],
        progress: { total: 0, played: 0, remaining: 0, percent: 0 },
        magicNumber: null,
        recalculatedAt: null,
        champions: [],
        tieBreakGroups: [],
      };
    }
    if (path.endsWith('/player-records')) {
      return { leagueId: 'tournament-test', goals: [], assists: [], hiddenByEligibility: false };
    }
    return { items: [] };
  }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/tournament-1',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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
    kind: 'regular_tournament',
    registrationDeadlineAt: null,
    rosterDeadlineAt: null,
    bracketPublishedAt: null,
    bracketPublishScheduledAt: null,
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
    entryFeeConfigured: true,
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
    yellowAccumulationLimit: null,
    redCardSuspensionMatches: null,
    refundPolicyText: null,
    confirmedCount: 0,
    participantTeams: [],
    pendingPaymentCount: 0,
    groups: [],
    fixtures: [],
    leagueFixtures: [],
    announcements: [],
    sponsors: [],
    reviews: [],
    reviewsTotalCount: 0,
    awards: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function apiError(statusCode: number) {
  return new V1ApiError({
    status: 'error',
    statusCode,
    code: statusCode === 0 ? 'NETWORK_ERROR' : statusCode === 404 ? 'NOT_FOUND' : 'REQUEST_FAILED',
    message: `조회 실패 ${statusCode}`,
    timestamp: '2026-10-17T00:00:00.000Z',
  });
}

function queueTournamentResponses(tournamentId: string, ...responses: Array<V1TournamentDetail | Error>) {
  queryState.tournamentPath = `/tournaments/${tournamentId}`;
  queryState.responses = [...responses];
}

beforeEach(() => {
  vi.clearAllMocks();
  queryState.tournamentPath = '';
  queryState.responses = [];
  nonTournamentHooks.useV1MyRegistrations.mockReturnValue({ data: [] });
});

describe('TournamentDetailPageClient refetch recovery', () => {
  it.each([503, 0])('keeps same-ID seeded facts after transient %s and lets the user recover', async (statusCode) => {
    const refreshed = makeTournament({ title: '갱신된 풋살 대회', venue: '새 정릉 풋살장' });
    queueTournamentResponses('tournament-1', apiError(statusCode), refreshed);

    render(<TournamentDetailPageClient
      tournamentId="tournament-1"
      seed={makeTournament({ title: '실제 풋살 대회', venue: '정릉 풋살장' })}
    />);

    await screen.findByRole('alert');
    expect(screen.getByRole('heading', { level: 1, name: '실제 풋살 대회' })).toBeInTheDocument();
    expect(screen.getAllByText('정릉 풋살장').length).toBeGreaterThan(0);
    expect(screen.getByRole('alert').closest('[data-nosnippet]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: '실제 풋살 대회' }).closest('[data-nosnippet]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(await screen.findByRole('heading', { level: 1, name: '갱신된 풋살 대회' })).toBeInTheDocument();
    expect(screen.getAllByText('새 정릉 풋살장').length).toBeGreaterThan(0);
    expect(screen.queryByText(/조회 실패/)).not.toBeInTheDocument();
  });

  it.each([401, 403, 404])('hides seeded facts after authoritative %s', async (statusCode) => {
    queueTournamentResponses('tournament-1', apiError(statusCode));

    render(<TournamentDetailPageClient
      tournamentId="tournament-1"
      seed={makeTournament({ title: '보이면 안 되는 오래된 대회', venue: '옛 경기장' })}
    />);

    await screen.findByRole('alert');
    expect(screen.queryByRole('heading', { level: 1, name: '보이면 안 되는 오래된 대회' })).not.toBeInTheDocument();
    expect(screen.queryByText('옛 경기장')).not.toBeInTheDocument();
  });

  it('does not use a seed for a different tournament ID', async () => {
    queueTournamentResponses('tournament-2', apiError(404));

    render(<TournamentDetailPageClient
      tournamentId="tournament-2"
      seed={makeTournament({ title: '다른 대회의 내용', venue: '다른 경기장' })}
    />);

    await screen.findByRole('alert');
    expect(screen.queryByRole('heading', { level: 1, name: '다른 대회의 내용' })).not.toBeInTheDocument();
    expect(screen.queryByText('다른 경기장')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();
  });

  it('shows the full recoverable error when the first request fails without seed data', async () => {
    queueTournamentResponses('tournament-1', apiError(503));

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('alert');
    expect(screen.queryByRole('heading', { level: 1, name: '테스트 대회' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다시 시도하기' })).toBeInTheDocument();
  });
});
