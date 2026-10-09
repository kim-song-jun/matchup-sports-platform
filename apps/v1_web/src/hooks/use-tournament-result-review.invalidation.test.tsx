import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicGameRecordsKeys } from '@/components/public-game-records/use-public-game-records';
import { v1Keys } from '@/lib/query-keys';
import { useCreateResultCorrection } from './use-tournament-result-review';

/** 결과 정정 직후 공개 화면 캐시(staleTime 60초, 종료 경기는 폴링 없음)가 옛 값을 서빙하지 않아야 한다. */
const server = setupServer(
  http.post('*/api/v1/games/:gameId/corrections', () =>
    HttpResponse.json({ status: 'success', timestamp: '2026-10-09T00:00:00.000Z', data: { gameId: 'g-1' } }),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1'));

describe('결과 정정 성공 후 캐시 무효화', () => {
  it('해당 대회의 공개 경기 상세·대회 상세 캐시를 stale 로 만들되 다른 대회는 건드리지 않는다', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    const mine = publicGameRecordsKeys.match('t-1', 'fx-1');
    const detail = v1Keys.tournament('t-1');
    const otherDetail = v1Keys.tournament('t-2');
    const bracket = v1Keys.adminTournamentBracket('t-1');
    const otherBracket = v1Keys.adminTournamentBracket('t-2');
    for (const key of [mine, detail, otherDetail, bracket, otherBracket]) client.setQueryData(key, { score: '옛 값' });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCreateResultCorrection('g-1', 't-1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        expectedVersion: 1,
        baseRevisionId: 'r-1',
        reason: '득점자 정정',
        changes: { score: { home: 1, away: 0 }, actualParticipants: [], eventsHash: 'h' },
      });
    });

    await waitFor(() => expect(client.getQueryState(mine)?.isInvalidated).toBe(true));
    expect(client.getQueryState(detail)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherDetail)?.isInvalidated).toBe(false);
    expect(client.getQueryState(bracket)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherBracket)?.isInvalidated).toBe(false);
  });
});
