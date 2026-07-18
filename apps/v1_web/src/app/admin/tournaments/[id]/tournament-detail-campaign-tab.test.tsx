import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1Tournament } from '@/types/api';
import TournamentDetailClient from './tournament-detail-client';

type WiringHookMocks = {
  tournamentQuery: {
    data: V1Tournament | undefined;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: ReturnType<typeof vi.fn>;
  };
  mutation: { mutate: ReturnType<typeof vi.fn>; isPending: boolean };
};

const hookMocks = vi.hoisted<WiringHookMocks>(() => ({
  tournamentQuery: {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  },
  mutation: { mutate: vi.fn(), isPending: false },
}));

vi.mock('@/hooks/use-v1-api', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/use-v1-api')>('@/hooks/use-v1-api');
  return {
    ...actual,
    useV1AdminMe: () => ({ data: { capabilities: ['status:write'] } }),
    useV1AdminTournament: () => hookMocks.tournamentQuery,
    useV1AdminTournamentRegistrations: () => ({ data: { items: [] } }),
    useV1ChangeTournamentStatus: () => hookMocks.mutation,
    useV1MasterSports: () => ({ data: [] }),
    useV1UpdateTournament: () => hookMocks.mutation,
    useV1UploadImages: () => ({ ...hookMocks.mutation, mutateAsync: vi.fn() }),
  };
});

vi.mock('@/components/v1-ui/confirm-modal', () => ({
  useConfirm: () => ({ confirm: vi.fn(), ConfirmModal: null }),
}));

const tournament: V1Tournament = {
  id: 'tournament-1',
  sportId: 'sport-1',
  title: 'Teameet Futsal Cup',
  status: 'open',
  format: 'group_knockout',
  registrationDeadlineAt: '2026-08-01T00:00:00.000Z',
  rosterDeadlineAt: '2026-08-05T00:00:00.000Z',
  bracketPublishedAt: null,
  scheduledAt: '2026-08-10T00:00:00.000Z',
  scheduledEndAt: '2026-08-11T00:00:00.000Z',
  venue: '서울 풋살장',
  latitude: null,
  longitude: null,
  coverImageUrl: null,
  teamCount: 8,
  minPlayers: 6,
  maxPlayers: 10,
  genderCategory: null,
  genderMinMale: null,
  genderMaxMale: null,
  genderMinFemale: null,
  genderMaxFemale: null,
  entryFee: 300000,
  prizePool: 4000000,
  prizeSummary: '총 400만원 상당 상금',
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
  bankName: null,
  bankAccount: null,
  bankHolder: null,
  rulesText: null,
  refundPolicyText: null,
  registrationCount: 0,
  createdAt: '2026-07-14T00:00:00.000Z',
  updatedAt: '2026-07-14T00:00:00.000Z',
};

describe('TournamentDetailClient campaign tab wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(hookMocks.tournamentQuery, {
      data: tournament,
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('opens the campaign management panel from the existing tournament detail controls', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <TournamentDetailClient id="tournament-1" />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: '캠페인' }));

    expect(screen.getByRole('button', { name: '캠페인' })).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('#panel-campaign')).toBeVisible();
  });

  it('persists cleared optional tournament fields as null', async () => {
    const user = userEvent.setup();
    hookMocks.tournamentQuery.data = {
      ...tournament,
      bankName: '국민은행',
      bankAccount: '123-456',
      bankHolder: '티밋',
      rulesText: '기존 규정',
      refundPolicyText: '기존 환불 정책',
    };
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <TournamentDetailClient id="tournament-1" />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: '대회 정보 수정' }));
    expect(screen.getByLabelText('성별 카테고리')).toHaveValue('');
    await user.clear(screen.getByLabelText('장소'));
    await user.clear(screen.getByLabelText('은행명'));
    await user.clear(screen.getByLabelText('계좌번호'));
    await user.clear(screen.getByLabelText('예금주'));
    await user.clear(screen.getByLabelText('대회 규정'));
    await user.clear(screen.getByLabelText('환불 정책'));
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(hookMocks.mutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        venue: null,
        bankName: null,
        bankAccount: null,
        bankHolder: null,
        rulesText: null,
        refundPolicyText: null,
      }),
      expect.any(Object),
    );
  });
});
