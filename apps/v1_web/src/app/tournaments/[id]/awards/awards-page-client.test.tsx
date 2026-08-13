import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trackEvent } from '@/lib/analytics';
import type { V1TournamentDetail } from '@/types/api';
import { AwardsPageClient } from './awards-page-client';

const awardsApiMocks = vi.hoisted(() => ({
  useV1Tournament: vi.fn(),
  useV1TournamentParticipantCheck: vi.fn(),
}));

const sessionMocks = vi.hoisted(() => ({
  hasStoredV1Session: vi.fn(() => true),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...awardsApiMocks,
}));

vi.mock('@/lib/session-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session-storage')>()),
  ...sessionMocks,
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
    awardsApiMocks.useV1TournamentParticipantCheck.mockReturnValue({ data: undefined });
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

/**
 * 후기 작성 CTA 게이트 — 자격 판정이 "대회를 신청한 계정 1명"에서 "참가 팀의 팀장·매니저,
 * 팀당 1건"으로 바뀐 변경의 회귀 테스트. 잡아야 하는 버그: 신청서를 내지 않은 팀장에게
 * 버튼이 안 보이는 것(원래 증상), 이미 팀 후기가 있는데 또 쓸 수 있는 것,
 * 자격 없는 사용자에게 버튼이 노출되는 것.
 */
describe('AwardsPageClient 후기 작성 게이트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionMocks.hasStoredV1Session.mockReturnValue(true);
    awardsApiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('신청서를 내지 않은 팀장도 자격 팀이 있으면 후기 쓰기 버튼이 보인다', () => {
    awardsApiMocks.useV1TournamentParticipantCheck.mockReturnValue({
      data: {
        isParticipant: true,
        reviewableTeams: [{ teamId: 'team-1', teamName: '레알마드리드', alreadyReviewed: false }],
      },
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    expect(screen.getByRole('button', { name: '+ 후기 쓰기' })).toBeTruthy();
  });

  it('우리 팀이 이미 후기를 남겼으면 버튼 대신 작성완료로 바뀐다', () => {
    awardsApiMocks.useV1TournamentParticipantCheck.mockReturnValue({
      data: {
        isParticipant: true,
        reviewableTeams: [{ teamId: 'team-1', teamName: '레알마드리드', alreadyReviewed: true }],
      },
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    expect(screen.queryByRole('button', { name: '+ 후기 쓰기' })).toBeNull();
    expect(screen.getByText('✓ 작성완료')).toBeTruthy();
  });

  it('자격 팀이 없으면 버튼 없이 팀장·매니저만 쓸 수 있다고 안내한다', () => {
    awardsApiMocks.useV1TournamentParticipantCheck.mockReturnValue({
      data: { isParticipant: false, reviewableTeams: [] },
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);

    expect(screen.queryByRole('button', { name: '+ 후기 쓰기' })).toBeNull();
    expect(screen.getByText(/팀장 또는 매니저만 작성할 수 있어요/)).toBeTruthy();
  });

  it('두 팀의 대표를 겸하면 후기 작성 모달에 팀 선택이 나온다', () => {
    awardsApiMocks.useV1TournamentParticipantCheck.mockReturnValue({
      data: {
        isParticipant: true,
        reviewableTeams: [
          { teamId: 'team-1', teamName: '레알마드리드', alreadyReviewed: false },
          { teamId: 'team-2', teamName: '바르셀로나', alreadyReviewed: false },
        ],
      },
    });

    render(<AwardsPageClient tournamentId="tournament-1" />);
    fireEvent.click(screen.getByRole('button', { name: '+ 후기 쓰기' }));

    const picker = screen.getByLabelText('어느 팀 후기인가요?') as HTMLSelectElement;
    expect([...picker.options].map((option) => option.textContent)).toEqual(['레알마드리드', '바르셀로나']);
  });
});
