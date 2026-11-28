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
type Mode = 'normal' | 'no-cursor-key' | 'same-cursor' | 'empty-page' | 'endless';
let mode: Mode = 'normal';
const fixture = (n: number) => ({ fixtureId: `f-${n}`, gameId: `g-${n}`, revisionId: `r-${n}` });
const envelope = (data: object) => HttpResponse.json({ status: 'success', timestamp: '2026-10-01T00:00:00.000Z', data });

const server = setupServer(
  http.get('*/api/v1/tournament-ops/tournaments/:tournamentId/operations', ({ request }) => {
    const params = new URL(request.url).searchParams;
    requests.push(params);
    const firstPage = params.get('cursor') === null;
    if (mode === 'no-cursor-key') return envelope({ items: [fixture(1)], watermark: 'w', liveWarnings: [] });
    if (mode === 'same-cursor') {
      return envelope({ items: [fixture(requests.length)], nextCursor: 'stuck', watermark: 'w', liveWarnings: [] });
    }
    if (mode === 'empty-page') {
      return envelope({ items: firstPage ? [fixture(1)] : [], nextCursor: 'more', watermark: 'w', liveWarnings: [] });
    }
    if (mode === 'endless') {
      return envelope({ items: [fixture(requests.length)], nextCursor: `c${requests.length}`, watermark: 'w', liveWarnings: [] });
    }
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
  mode = 'normal';
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

  it('서버가 nextCursor 를 빼먹어도 같은 요청을 되풀이하지 않고 한 페이지로 끝낸다', async () => {
    mode = 'no-cursor-key';
    const { result } = renderHook(() => useTournamentEndedFixtures('league-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests).toHaveLength(1);
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('같은 커서가 다시 오면 거기서 멈춘다', async () => {
    mode = 'same-cursor';
    const { result } = renderHook(() => useTournamentEndedFixtures('league-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests.map((params) => params.get('cursor'))).toEqual([null, 'stuck']);
  });

  it('빈 페이지가 오면 커서가 남아 있어도 멈춘다', async () => {
    mode = 'empty-page';
    const { result } = renderHook(() => useTournamentEndedFixtures('league-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests).toHaveLength(2);
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('끝없이 새 커서가 와도 20페이지에서 멈춘다', async () => {
    mode = 'endless';
    const { result } = renderHook(() => useTournamentEndedFixtures('league-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests).toHaveLength(20);
    expect(result.current.data?.items).toHaveLength(20);
  });
});
