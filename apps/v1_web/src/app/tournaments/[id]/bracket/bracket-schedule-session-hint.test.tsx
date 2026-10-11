import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveStoredV1Session } from '@/lib/session-storage';
import { BracketScheduleTab } from './bracket-page-client';

vi.mock('@/components/public-game-records/use-public-game-records', () => ({
  usePublicTournamentSchedule: () => ({
    data: {
      pages: [{
        tournamentId: 'tour-1',
        tournamentTitle: '테스트 대회',
        bracketPublished: true,
        items: [],
        unscheduled: [],
        standings: [],
        nextCursor: null,
      }],
    },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  usePublicTournamentPlayerRecords: () => ({ data: undefined, isPending: false, isError: false, error: null, refetch: vi.fn() }),
}));

function renderTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <BracketScheduleTab tournamentId="tour-1" />
    </QueryClientProvider>,
  );
}

describe('BracketScheduleTab — 내 경기 조회는 로그인했을 때만', () => {
  const fetchMock = vi.fn();
  const requestedUrls = () => fetchMock.mock.calls.map(([url]) => String(url));

  beforeEach(() => {
    window.localStorage.clear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ status: 'success', data: { teams: [] }, timestamp: new Date().toISOString() }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('비로그인 관전자는 로그인 전용 my-fixtures 를 호출하지 않는다 (호출하면 매번 401)', async () => {
    renderTab();

    // 하이드레이션 effect 가 끝난 뒤에도 요청이 나가지 않아야 한다.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requestedUrls().filter((url) => url.includes('/my-fixtures'))).toEqual([]);
  });

  it('로그인한 사용자는 my-fixtures 를 조회한다 (팀장 경기 강조 유지)', async () => {
    saveStoredV1Session({ userId: 'user-1', userEmail: 'user@example.com' });

    renderTab();

    await waitFor(() => {
      expect(requestedUrls().filter((url) => url.includes('/tournaments/tour-1/my-fixtures'))).toHaveLength(1);
    });
  });
});
