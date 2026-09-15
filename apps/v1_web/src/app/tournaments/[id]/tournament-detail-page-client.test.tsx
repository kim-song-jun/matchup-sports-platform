import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { V1TournamentDetail } from '@/types/api';
import { TournamentDetailPageClient } from './tournament-detail-client';

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const tournamentApiMocks = vi.hoisted(() => ({
  useV1Tournament: vi.fn(),
  useV1MyRegistrations: vi.fn(),
  useV1Reviews: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...tournamentApiMocks,
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/tournament-1',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

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

describe('TournamentDetailPageClient GA events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tournamentApiMocks.useV1MyRegistrations.mockReturnValue({ data: [] });
    tournamentApiMocks.useV1Reviews.mockReturnValue({
      data: undefined,
      isError: false,
      isPending: false,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it('tracks tournament_view once the tournament detail loads', async () => {
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith('tournament_view', { tournamentId: 'tournament-1' });
    });
    expect(trackEvent).toHaveBeenCalledTimes(1);
  });

  it('does not track tournament_view while the tournament is still loading', () => {
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('keeps the shared application contract in a regular-league rail without tournament capacity facts', async () => {
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({
        status: 'in_progress',
        kind: 'regular_league',
        registrationDeadlineAt: '2099-08-10T14:59:00.000Z',
        confirmedCount: 8,
        teamCount: 8,
      }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    const rail = screen.getByRole('complementary', { name: '리그 참가 신청' });
    expect(within(rail).getByRole('link', { name: '참가 신청하기' })).toHaveAttribute(
      'href', '/tournaments/tournament-1/my',
    );
    expect(within(rail).queryByText('정원')).not.toBeInTheDocument();
    expect(within(rail).queryByText('참가비')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: '참가 신청' })).not.toBeInTheDocument();
  });
});

// 벤치마크 감사(P0 ①): "참가 전 꼭 확인해 주세요" 체크리스트의 고정 문구("환불 불가" 등)와
// 운영자가 대회별로 쓰는 refundPolicyText가 같은 화면에서 서로 다른 말을 했다 — 운영자
// 정책이 있으면 그 항목들을 빼고, 없으면 고정문구가 fallback으로 남는다(2026-09-15 사용자 결정).
describe('TournamentDetailPageClient — 참가 전 유의사항과 환불 정책의 모순 해소', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tournamentApiMocks.useV1MyRegistrations.mockReturnValue({ data: [] });
    tournamentApiMocks.useV1Reviews.mockReturnValue({
      data: undefined,
      isError: false,
      isPending: false,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it('운영자가 환불 정책을 직접 썼으면 고정 환불 문구(환불 불가·주최 취소·대회 연기)는 빠지고 운영자 문구만 보인다', async () => {
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ refundPolicyText: '경기 시작 48시간 전까지 100% 환불, 24시간 전까지 50% 환불됩니다.' }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    expect(screen.getByText(/경기 시작 48시간 전까지 100% 환불/)).toBeInTheDocument();
    expect(screen.queryByText('환불 불가')).not.toBeInTheDocument();
    expect(screen.queryByText('주최 취소')).not.toBeInTheDocument();
    expect(screen.queryByText('대회 연기')).not.toBeInTheDocument();
    // 환불이 아니라 자격 문제인 항목은 운영자 정책과 무관하게 그대로 남는다(모바일+데스크톱 두 사본).
    expect(screen.getAllByText('노쇼 실격').length).toBeGreaterThan(0);
  });

  it('운영자가 환불 정책을 안 썼으면 기존 고정 문구가 그대로 fallback으로 남는다', async () => {
    tournamentApiMocks.useV1Tournament.mockReturnValue({
      data: makeTournament({ refundPolicyText: null }),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<TournamentDetailPageClient tournamentId="tournament-1" />);

    await screen.findByRole('heading', { level: 1, name: '테스트 대회' });
    // 모바일 하단 카드가 데스크톱 클래스 은닉과 무관하게 jsdom에는 항상 그려지므로,
    // 존재 자체(개수 ≥1)만 본다 — 이 테스트의 관심사는 fallback이 여전히 나오는가다.
    expect(screen.getAllByText('환불 불가').length).toBeGreaterThan(0);
    expect(screen.getAllByText('주최 취소').length).toBeGreaterThan(0);
    expect(screen.getAllByText('대회 연기').length).toBeGreaterThan(0);
  });
});
