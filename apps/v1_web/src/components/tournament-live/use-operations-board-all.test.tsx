import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOperationsBoardAll } from './use-operations-board-all';

const requests: URLSearchParams[] = [];
let secondPageFails = false;
type Mode = 'normal' | 'no-cursor-key' | 'same-cursor' | 'empty-page' | 'endless' | 'overlap';
let mode: Mode = 'normal';
const item = (n: number) => ({ fixtureId: `f-${n}`, gameId: `g-${n}` });

const server = setupServer(
  http.post('*/api/v1/logs/client-error', () => HttpResponse.json({ status: 'success', timestamp: 't', data: null })),
  http.get('*/api/v1/tournament-ops/tournaments/:tournamentId/operations', ({ request }) => {
    const params = new URL(request.url).searchParams;
    requests.push(params);
    if (mode === 'no-cursor-key') {
      return HttpResponse.json({ status: 'success', timestamp: 't', data: { items: [item(1)], watermark: 'w', liveWarnings: [] } });
    }
    if (mode === 'same-cursor') {
      return HttpResponse.json({ status: 'success', timestamp: 't', data: { items: [item(requests.length)], nextCursor: 'stuck', watermark: 'w', liveWarnings: [] } });
    }
    if (mode === 'empty-page') {
      const first = params.get('cursor') === null;
      return HttpResponse.json({ status: 'success', timestamp: 't', data: { items: first ? [item(1)] : [], nextCursor: 'more', watermark: 'w', liveWarnings: [] } });
    }
    if (mode === 'overlap') {
      // 쪽 사이에 f-2 가 끝나 서버 정렬이 바뀌어, 끝난 구간에서 다시 온다.
      return params.get('cursor') === null
        ? HttpResponse.json({ status: 'success', timestamp: 't', data: { items: [{ ...item(1), gameState: 'LIVE' }, { ...item(2), gameState: 'LIVE' }], nextCursor: 'c1', watermark: 'w', liveWarnings: [{ fixtureId: 'f-2', warnings: ['NO_STAFF_ASSIGNED'] }] } })
        : HttpResponse.json({ status: 'success', timestamp: 't', data: { items: [{ ...item(2), gameState: 'ENDED' }, item(3)], nextCursor: null, watermark: 'w', liveWarnings: [{ fixtureId: 'f-2', warnings: ['LINEUP_NOT_SUBMITTED'] }] } });
    }
    if (mode === 'endless') {
      return HttpResponse.json({ status: 'success', timestamp: 't', data: { items: [item(requests.length)], nextCursor: `c${requests.length}`, watermark: 'w', liveWarnings: [] } });
    }
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
  mode = 'normal';
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

  it('서버가 nextCursor 를 빼먹어도 같은 요청을 되풀이하지 않고 한 페이지로 끝낸다', async () => {
    mode = 'no-cursor-key';
    const { result } = renderHook(() => useOperationsBoardAll('t-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests).toHaveLength(1);
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('같은 커서가 다시 오면 거기서 멈춘다', async () => {
    mode = 'same-cursor';
    const { result } = renderHook(() => useOperationsBoardAll('t-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests.map((p) => p.get('cursor'))).toEqual([null, 'stuck']);
  });

  it('빈 페이지가 오면 커서가 남아 있어도 멈춘다', async () => {
    mode = 'empty-page';
    const { result } = renderHook(() => useOperationsBoardAll('t-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests).toHaveLength(2);
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('끝없이 새 커서가 와도 20페이지에서 멈춘다', async () => {
    mode = 'endless';
    const { result } = renderHook(() => useOperationsBoardAll('t-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requests).toHaveLength(20);
    expect(result.current.data?.items).toHaveLength(20);
  });

  it('쪽 사이에 끝난 경기가 두 번 와도 한 번만 세고 나중 상태를 쓴다', async () => {
    mode = 'overlap';
    const { result } = renderHook(() => useOperationsBoardAll('t-1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items.map((i) => [i.fixtureId, (i as { gameState?: string }).gameState])).toEqual([
      ['f-1', 'LIVE'],
      ['f-2', 'ENDED'],
      ['f-3', undefined],
    ]);
    expect(result.current.data?.liveWarnings).toEqual([{ fixtureId: 'f-2', warnings: ['LINEUP_NOT_SUBMITTED'] }]);
  });

  it('enabled=false 면 읽지 않는다', async () => {
    const { result } = renderHook(() => useOperationsBoardAll('t-1', { enabled: false }), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(requests).toHaveLength(0);
  });
});
