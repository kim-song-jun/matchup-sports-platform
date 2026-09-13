import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1TournamentCampaignsInfinite } from '@/hooks/use-v1-tournament-campaign';
import { queryImageBySrc } from '@/test/next-image';
import EventsPage from './page';

const refetch = vi.hoisted(() => vi.fn());
const fetchNextPage = vi.hoisted(() => vi.fn());
const refetchSports = vi.hoisted(() => vi.fn());
const sportsErrorState = vi.hoisted(() => ({ value: false }));
const replaceMock = vi.hoisted(() => vi.fn());
const routerState = vi.hoisted(() => ({ replace: replaceMock }));
const searchParamsState = vi.hoisted(() => ({ value: new URLSearchParams() }));
const sportsState = vi.hoisted(() => ({ value: undefined as Array<{ id: string; code: string; name: string }> | undefined }));

vi.mock('next/navigation', () => ({
  useRouter: () => routerState,
  useSearchParams: () => searchParamsState.value,
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1MasterSports: () => ({ data: sportsState.value, isError: sportsErrorState.value, refetch: refetchSports }),
}));

vi.mock('@/hooks/use-v1-tournament-campaign', () => ({
  useV1TournamentCampaignsInfinite: vi.fn(),
}));

const useV1TournamentCampaignsInfiniteMock = vi.mocked(useV1TournamentCampaignsInfinite, {
  partial: true,
});

describe('EventsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsState.value = new URLSearchParams();
    sportsState.value = [{ id: 'sport-futsal', code: 'futsal', name: '풋살' }];
    sportsErrorState.value = false;
  });

  it('syncs a same-mounted URL sport change and validates the master sport list', () => {
    useV1TournamentCampaignsInfiniteMock.mockReturnValue({
      data: { pages: [{ items: [] }] }, isLoading: false, isError: false, error: null,
      fetchNextPage, hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false, refetch,
    } as never);
    const { rerender } = render(<EventsPage />);
    searchParamsState.value = new URLSearchParams('sport=futsal');
    rerender(<EventsPage />);
    expect(screen.getByRole('button', { name: '풋살' })).toHaveAttribute('aria-pressed', 'true');

    searchParamsState.value = new URLSearchParams('sport=unknown');
    rerender(<EventsPage />);
    expect(replaceMock).toHaveBeenCalledWith('/events', { scroll: false });
    expect(useV1TournamentCampaignsInfiniteMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: false, sportCode: undefined, limit: 30 }),
    );
    expect(screen.getByRole('button', { name: '전체' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('waits for master sports before applying a URL sport filter', () => {
    useV1TournamentCampaignsInfiniteMock.mockReturnValue({
      data: { pages: [{ items: [] }] }, isLoading: false, isError: false, error: null,
      fetchNextPage, hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false, refetch,
    } as never);
    searchParamsState.value = new URLSearchParams('sport=futsal');
    sportsState.value = undefined;
    const { rerender } = render(<EventsPage />);
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByRole('list', { name: '이벤트 불러오는 중' })).toHaveAttribute('aria-busy', 'true');
    expect(useV1TournamentCampaignsInfiniteMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false, sportCode: undefined, limit: 30 }),
    );
    sportsState.value = [{ id: 'sport-futsal', code: 'futsal', name: '풋살' }];
    act(() => rerender(<EventsPage />));
    const firstEnabledCall = useV1TournamentCampaignsInfiniteMock.mock.calls.find(([params]) => params?.enabled);
    expect(firstEnabledCall?.[0]).toEqual(expect.objectContaining({ sportCode: 'futsal', enabled: true }));
    expect(useV1TournamentCampaignsInfiniteMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true, sportCode: 'futsal', limit: 30 }),
    );
    expect(screen.getByRole('button', { name: '풋살' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses the immediate local draft for query and chip before URL acknowledgement', () => {
    sportsState.value = [
      { id: 'sport-futsal', code: 'futsal', name: '풋살' },
      { id: 'sport-basketball', code: 'basketball', name: '농구' },
    ];
    searchParamsState.value = new URLSearchParams('sport=futsal');
    useV1TournamentCampaignsInfiniteMock.mockReturnValue({
      data: { pages: [{ items: [] }] }, isLoading: false, isError: false, error: null,
      fetchNextPage, hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false, refetch,
    } as never);
    render(<EventsPage />);

    fireEvent.click(screen.getByRole('button', { name: '농구' }));

    expect(useV1TournamentCampaignsInfiniteMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ enabled: true, sportCode: 'basketball', limit: 30 }),
    );
    expect(screen.getByRole('button', { name: '농구' })).toHaveAttribute('aria-pressed', 'true');
    expect(replaceMock).toHaveBeenCalledWith('/events?sport=basketball', { scroll: false });
  });

  it('switches to an external URL sport after a pending local draft', () => {
    sportsState.value = [
      { id: 'sport-futsal', code: 'futsal', name: '풋살' },
      { id: 'sport-basketball', code: 'basketball', name: '농구' },
    ];
    searchParamsState.value = new URLSearchParams('sport=futsal');
    useV1TournamentCampaignsInfiniteMock.mockReturnValue({
      data: { pages: [{ items: [] }] }, isLoading: false, isError: false, error: null,
      fetchNextPage, hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false, refetch,
    } as never);
    const { rerender } = render(<EventsPage />);
    fireEvent.click(screen.getByRole('button', { name: '농구' }));
    expect(useV1TournamentCampaignsInfiniteMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ sportCode: 'basketball', enabled: true }),
    );

    searchParamsState.value = new URLSearchParams('sport=basketball');
    act(() => rerender(<EventsPage />));
    expect(screen.getByRole('button', { name: '농구' })).toHaveAttribute('aria-pressed', 'true');

    searchParamsState.value = new URLSearchParams('sport=futsal');
    act(() => rerender(<EventsPage />));
    expect(useV1TournamentCampaignsInfiniteMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ sportCode: 'futsal', enabled: true }),
    );
    expect(screen.getByRole('button', { name: '풋살' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps an unfiltered list and offers both master-sport and campaign retry when master sports fail', () => {
    searchParamsState.value = new URLSearchParams('sport=futsal');
    sportsState.value = undefined;
    sportsErrorState.value = true;
    useV1TournamentCampaignsInfiniteMock.mockReturnValue({
      data: undefined, isLoading: false, isError: true, error: new Error('campaign unavailable'),
      fetchNextPage, hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false, refetch,
    } as never);
    render(<EventsPage />);
    expect(useV1TournamentCampaignsInfiniteMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ sportCode: undefined, enabled: true }),
    );
    const retryButtons = screen.getAllByRole('button', { name: '다시 시도하기' });
    fireEvent.click(retryButtons[0]);
    expect(refetchSports).toHaveBeenCalledOnce();
    fireEvent.click(retryButtons.at(-1)!);
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('offers an in-page retry after the initial campaign request fails', () => {
    useV1TournamentCampaignsInfiniteMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('network unavailable'),
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      refetch,
    } as never);

    render(<EventsPage />);

    expect(screen.getByText('잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('network unavailable')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));

    expect(refetch).toHaveBeenCalledOnce();
  });

  // Wave 5 — 빈 목록은 공용 EmptyState(illustration + CTA)로 통일한다. 대회 캠페인으로
  // 등록된 게 하나도 없어도 "그럼 대회는 어디서 보나요?"에 답할 수 있게 통합 대회
  // 목록으로 나가는 길을 함께 준다.
  it('빈 이벤트 목록은 그래픽과 함께 대회 목록으로 가는 CTA 를 보여준다', () => {
    useV1TournamentCampaignsInfiniteMock.mockReturnValue({
      data: { pages: [{ items: [] }] },
      isLoading: false,
      isError: false,
      error: null,
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      refetch,
    } as never);

    const { container } = render(<EventsPage />);

    expect(screen.getByText('등록된 이벤트가 없어요')).toBeInTheDocument();
    expect(queryImageBySrc(container, '/illustrations/journey-done-640.webp')).not.toBeNull();
    expect(screen.getByRole('link', { name: '대회 목록 보기' })).toHaveAttribute(
      'href',
      '/tournaments',
    );
  });

  // Wave 5 — 다음 페이지 로드 실패는 인라인 role=alert 카드 대신 공용
  // ErrorState(+재시도)로 통일한다. 재시도는 실패한 그 요청(fetchNextPage)을 다시 부른다.
  it('다음 페이지 로드가 실패하면 재시도 버튼이 있는 에러 상태를 보여준다', () => {
    const item = {
      id: 'c-1',
      slug: 'summer-cup',
      heroTitle: '여름 풋살 컵',
      heroSummary: null,
      heroImageUrl: null,
      publishedAt: '2026-07-14T01:00:00.000Z',
      updatedAt: '2026-07-14T01:00:00.000Z',
      tournament: {
        id: 't-1',
        title: '여름 풋살 컵',
        status: 'open',
        sport: { code: 'futsal', name: '풋살' },
        scheduledAt: '2026-09-01T00:00:00.000Z',
        scheduledEndAt: '2026-09-02T00:00:00.000Z',
        registrationDeadlineAt: '2026-08-25T00:00:00.000Z',
        venue: '검증장',
        coverImageUrl: null,
        teamCount: 8,
        entryFee: 100000,
        prizePool: null,
        prizeSummary: null,
        confirmedCount: 4,
        pendingPaymentCount: 0,
        registrationAvailability: 'available',
      },
    };
    useV1TournamentCampaignsInfiniteMock.mockReturnValue({
      data: { pages: [{ items: [item] }] },
      isLoading: false,
      isError: false,
      error: new Error('network unavailable'),
      fetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: true,
      refetch,
    } as never);

    render(<EventsPage />);

    expect(screen.getByText('다음 이벤트를 불러오지 못했어요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });


});
