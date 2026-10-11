import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TournamentsListPageClient as TournamentsPage } from './tournaments-list-client';

function render(ui: ReactElement) {
  const client = new QueryClient();
  return rtlRender(ui, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}

// 배경 재검증(isFetching)은 켜져 있지만 다음 페이지 대기(placeholder)는 아니다.
const useV1TournamentsMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/tournaments',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('@/hooks/use-v1-api', () => ({
  useV1AllTournaments: () => ({ data: [], isPending: false, isError: false, refetch: vi.fn() }),
  useV1Tournaments: useV1TournamentsMock,
  useV1MasterSports: () => ({ data: [] }),
}));
vi.mock('@/hooks/use-media-query', () => ({ useMediaQuery: () => false, DESKTOP_LIST_MEDIA_QUERY: '' }));
vi.mock('@/hooks/use-infinite-scroll', () => ({ useInfiniteScroll: () => ({ current: null }) }));

describe('/tournaments 더 보기 — 배경 재검증과 분리', () => {
  it('isFetching 중에도 더 보기가 활성이고 클릭하면 다음 cursor 를 요청한다', () => {
    useV1TournamentsMock.mockReturnValue({
      data: { items: [{ id: 't1', title: '2026 서울 풋살 오픈', status: 'open', sport: { code: 'futsal', name: '풋살' }, format: 'knockout', genderCategory: 'mixed', teamCount: 16, entryFee: 0, entryFeeConfigured: true, confirmedCount: 0, pendingPaymentCount: 0 }], pageInfo: { hasNext: true, nextCursor: 'cursor-2', totalPages: 2, total: 2, page: 1 } },
      isPending: false, isError: false, error: null, isFetching: true, isPlaceholderData: false, refetch: vi.fn(),
    });
    render(<TournamentsPage />);

    const button = screen.getByRole('button', { name: '더 보기' });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    expect(useV1TournamentsMock).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'cursor-2' }), expect.anything());
  });

  it('서버 seed(placeholder)가 떠 있는 동안에는 cursor 가 없어도 더 보기를 잠근다', () => {
    useV1TournamentsMock.mockReturnValue({
      data: { items: [{ id: 't1', title: '2026 서울 풋살 오픈', status: 'open', sport: { code: 'futsal', name: '풋살' }, format: 'knockout', genderCategory: 'mixed', teamCount: 16, entryFee: 0, entryFeeConfigured: true, confirmedCount: 0, pendingPaymentCount: 0 }], pageInfo: { hasNext: true, nextCursor: 'seed-cursor', totalPages: 2, total: 2, page: 1 } },
      isPending: false, isError: false, error: null, isFetching: true, isPlaceholderData: true, refetch: vi.fn(),
    });
    useV1TournamentsMock.mockClear();
    render(<TournamentsPage />);

    expect(screen.getByRole('button', { name: '더 보기' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    expect(useV1TournamentsMock).not.toHaveBeenCalledWith(expect.objectContaining({ cursor: 'seed-cursor' }), expect.anything());
  });
});
