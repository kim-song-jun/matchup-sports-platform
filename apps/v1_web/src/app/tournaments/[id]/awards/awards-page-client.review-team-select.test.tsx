/**
 * 다중 팀 팀장·운영진 겸임 사용자가 대회 리뷰를 남길 때, 서버 400
 * TEAM_SELECTION_REQUIRED(details.teams)를 받으면 UI가 팀 선택지를 보여주고, 선택 후
 * 재제출이 teamId를 포함해 성공으로 이어지는지 검증한다. 이 흐름이 깨지면 다중 팀
 * 운영자는 리뷰를 영원히 작성할 수 없다(수정 전 실제 결함).
 */
import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { V1ApiError } from '@/lib/api-client';
import type { V1TournamentDetail } from '@/types/api';
import { AwardsPageClient } from './awards-page-client';

const mutateMock = vi.fn();

const apiMocks = vi.hoisted(() => ({
  useV1Tournament: vi.fn(),
  useV1TournamentParticipantCheck: vi.fn(),
  useV1MyTournamentReview: vi.fn(),
  useV1SubmitTournamentReview: vi.fn(),
  useV1UploadImages: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-v1-api')>()),
  ...apiMocks,
}));

vi.mock('@/lib/session-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/session-storage')>()),
  hasStoredV1Session: () => true,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/tournaments/tournament-1/awards',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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

describe('AwardsPageClient — 다중 팀 겸임 사용자의 리뷰 팀 선택', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.useV1Tournament.mockReturnValue({
      data: makeCompletedTournament(),
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    apiMocks.useV1TournamentParticipantCheck.mockReturnValue({ data: { isParticipant: true } });
    apiMocks.useV1MyTournamentReview.mockReturnValue({ data: null });
    apiMocks.useV1UploadImages.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });

    // 첫 제출(teamId 없음)은 서버의 TEAM_SELECTION_REQUIRED를 흉내내고, teamId가 실린
    // 두 번째 제출은 성공한다 — 실제 백엔드 계약(details.teams 배열)을 그대로 재현한다.
    mutateMock.mockImplementation((body: { teamId?: string }, opts: { onSuccess?: () => void; onError?: (e: unknown) => void }) => {
      if (!body.teamId) {
        opts.onError?.(
          new V1ApiError({
            status: 'error',
            timestamp: '2026-08-13T00:00:00.000Z',
            statusCode: 400,
            code: 'TEAM_SELECTION_REQUIRED',
            message: '여러 팀을 운영하고 계셔서 리뷰를 남길 팀을 먼저 선택해야 해요.',
            details: {
              teams: [
                { teamId: 'team-1', teamName: '레알마드리드' },
                { teamId: 'team-2', teamName: '바르셀로나' },
              ],
            },
          }),
        );
        return;
      }
      opts.onSuccess?.();
    });
    apiMocks.useV1SubmitTournamentReview.mockReturnValue({ mutate: mutateMock, isPending: false });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('TEAM_SELECTION_REQUIRED 수신 시 팀 선택지를 보여주고, 선택 후 재제출은 teamId를 포함한다', () => {
    render(<AwardsPageClient tournamentId="tournament-1" />);

    fireEvent.click(screen.getByRole('button', { name: '+ 후기 쓰기' }));

    // 첫 제출 — teamId 없이 나감, 서버가 TEAM_SELECTION_REQUIRED로 응답
    fireEvent.click(screen.getByRole('button', { name: '후기 등록' }));

    expect(mutateMock).toHaveBeenCalledTimes(1);
    expect(mutateMock.mock.calls[0][0].teamId).toBeUndefined();

    // 팀 선택 UI가 나타나고, 선택 전에는 제출 버튼이 비활성화된다
    const teamA = screen.getByRole('radio', { name: /레알마드리드/ });
    const teamB = screen.getByRole('radio', { name: /바르셀로나/ });
    expect(teamA).toBeInTheDocument();
    expect(teamB).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '선택한 팀으로 등록' })).toBeDisabled();

    // 팀 선택 후 재제출 — teamId가 실려 나간다
    fireEvent.click(teamB);
    fireEvent.click(screen.getByRole('button', { name: '선택한 팀으로 등록' }));

    expect(mutateMock).toHaveBeenCalledTimes(2);
    expect(mutateMock.mock.calls[1][0].teamId).toBe('team-2');
  });
});
