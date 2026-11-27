import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOperationsBoardAll } from './use-operations-board-all';

const requests: URLSearchParams[] = [];
let secondPageFails = false;
const item = (n: number) => ({ fixtureId: `f-${n}`, gameId: `g-${n}` });

const server = setupServer(
  http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', timestamp: 't', data: null })),
  http.get('*/api/v1/tournament-ops/tournaments/:tournamentId/operations', ({ request }) => {
    const params = new URL(request.url).searchParams;
    requests.push(params);
    if (params.get('cursor') === null) {
      return HttpResponse.json({
        status: 'success',
        timestamp: '2026-12-20T00:00:00.000Z',
        data: { items: [item(1), item(2)], nextCursor: 'c1', watermark: 'w1', liveWarnings: [{ fixtureId: 'f-1', warnings: ['NO_STAFF_ASSIGNED'] }] },
      });
    }
    if (secondPageFails) {
      return HttpResponse.json({ status: 'error', statusCode: 500, code: 'INTERNAL_ERROR', message: 'boom' }, { status: 500 });
    }
    return HttpResponse.json({
      status: 'success',
      timestamp: '2026-12-20T00:00:00.000Z',
      data: { items: [item(3)], nextCursor: null, watermark: 'w2', liveWarnings: [{ fixtureId: 'f-3', warnings: ['LINEUP_NOT_SUBMITTED'] }] },
    });
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => {
  requests.length = 0;
  secondPageFails = false;
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useOperationsBoardAll', () => {
  it('다음 커서가 없을 때까지 limit 100 으로 읽어 한 목록으로 합친다', async () => {
    const { result } = renderHook(() => useOperationsBoardAll('t-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items.map((i) => i.fixtureId)).toEqual(['f-1', 'f-2', 'f-3']);
    expect(result.current.data?.liveWarnings.map((w) => w.fixtureId)).toEqual(['f-1', 'f-3']);
    expect(requests.map((p) => [p.get('cursor'), p.get('limit'), p.get('status')])).toEqual([
      [null, '100', null],
      ['c1', '100', null],
    ]);
  });

  it('뒤 페이지가 실패하면 첫 페이지만 보여 주지 않고 오류로 끝난다', async () => {
    secondPageFails = true;
    const { result } = renderHook(() => useOperationsBoardAll('t-1'), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it('enabled=false 면 읽지 않는다', async () => {
    const { result } = renderHook(() => useOperationsBoardAll('t-1', { enabled: false }), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(requests).toHaveLength(0);
  });
});
