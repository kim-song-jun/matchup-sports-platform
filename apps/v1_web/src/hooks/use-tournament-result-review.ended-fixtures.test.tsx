import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTournamentEndedFixtures } from './use-tournament-result-review';

/**
 * 결과 검토·정정 목록은 보드 API 한 페이지(상한 100)만 읽어, 101번째 경기부터 목록과 `?fixtureId=`
 * 딥링크에서 사라졌다 — 큰 리그에서 어드민이 그 경기 결과를 고칠 입구가 없었다(2026-10-01).
 */
const requests: URLSearchParams[] = [];
const fixture = (n: number) => ({ fixtureId: `f-${n}`, gameId: `g-${n}`, revisionId: `r-${n}` });

const server = setupServer(
  http.get('*/api/v1/tournament-ops/tournaments/:tournamentId/operations', ({ request }) => {
    const params = new URL(request.url).searchParams;
    requests.push(params);
    const firstPage = params.get('cursor') === null;
    return HttpResponse.json({
      status: 'success',
      timestamp: '2026-10-01T00:00:00.000Z',
      data: firstPage
        ? {
            items: Array.from({ length: 100 }, (_, index) => fixture(index + 1)),
            nextCursor: 'cursor-after-100',
            watermark: 'w-1',
            liveWarnings: [{ fixtureId: 'f-1', warnings: ['RESULT_REVIEW_OVERDUE'] }],
          }
        : {
            items: [fixture(101)],
            nextCursor: null,
            watermark: 'w-2',
            liveWarnings: [{ fixtureId: 'f-101', warnings: ['RESULT_REVIEW_OVERDUE'] }],
          },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  requests.length = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useTournamentEndedFixtures', () => {
  it('다음 커서가 없을 때까지 읽어 101번째 경기까지 한 목록으로 돌려준다', async () => {
    const { result } = renderHook(() => useTournamentEndedFixtures('league-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toHaveLength(101);
    expect(result.current.data?.items.at(-1)).toMatchObject({ fixtureId: 'f-101' });
    expect(result.current.data?.liveWarnings.map((warning) => warning.fixtureId)).toEqual(['f-1', 'f-101']);
    expect(result.current.data?.nextCursor).toBeNull();
    expect(requests.map((params) => [params.get('status'), params.get('cursor')])).toEqual([
      ['ENDED', null],
      ['ENDED', 'cursor-after-100'],
    ]);
  });

  describe('서버가 커서를 잘못 주어도 요청이 끝없이 이어지지 않는다', () => {
    const boardReply = (items: unknown[], nextCursor: string | null) =>
      HttpResponse.json({
        status: 'success',
        timestamp: '2026-10-01T00:00:00.000Z',
        data: { items, nextCursor, watermark: 'w', liveWarnings: [] },
      });

    it('이미 쓴 커서가 다시 오면 거기서 멈춘다', async () => {
      server.use(
        http.get('*/api/v1/tournament-ops/tournaments/:tournamentId/operations', ({ request }) => {
          requests.push(new URL(request.url).searchParams);
          return boardReply([fixture(requests.length)], 'same-cursor');
        }),
      );
      const { result } = renderHook(() => useTournamentEndedFixtures('league-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(requests.map((params) => params.get('cursor'))).toEqual([null, 'same-cursor']);
      expect(result.current.data?.items).toHaveLength(2);
    });

    it('빈 페이지가 오면 커서가 있어도 멈춘다', async () => {
      server.use(
        http.get('*/api/v1/tournament-ops/tournaments/:tournamentId/operations', ({ request }) => {
          requests.push(new URL(request.url).searchParams);
          return boardReply([], 'cursor-after-empty');
        }),
      );
      const { result } = renderHook(() => useTournamentEndedFixtures('league-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(requests).toHaveLength(1);
      expect(result.current.data?.items).toEqual([]);
    });

    it('커서가 계속 새로 와도 20쪽에서 멈춘다', async () => {
      server.use(
        http.get('*/api/v1/tournament-ops/tournaments/:tournamentId/operations', ({ request }) => {
          requests.push(new URL(request.url).searchParams);
          return boardReply([fixture(requests.length)], `cursor-${requests.length}`);
        }),
      );
      const { result } = renderHook(() => useTournamentEndedFixtures('league-1'), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(requests).toHaveLength(20);
      expect(result.current.data?.items).toHaveLength(20);
    });
  });
});
