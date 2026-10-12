import { focusManager, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import type { CursorPage, V1TeamMatch } from '@/types/api';
import { useV1TeamMatch, useV1TeamMatches } from './use-v1-api';

const api = 'http://localhost/api/v1';
const matchId = 'team-match-expiry-1';
let status: 'recruiting' | 'closed' = 'recruiting';
let listReads = 0;
let detailReads = 0;
const match = { id: matchId, teamMatchId: matchId, status, displayState: status } as V1TeamMatch;
const server = setupServer(
  http.get(`${api}/team-matches`, ({ request }) => {
    listReads += 1;
    const item = { ...match, status, displayState: status };
    const items = status === 'closed' && new URL(request.url).searchParams.get('sort') === 'recommended' ? [] : [item];
    const data: CursorPage<V1TeamMatch> = { items, nextCursor: null, pageInfo: { hasNext: false, nextCursor: null } };
    return HttpResponse.json({ status: 'success', data });
  }),
  http.get(`${api}/team-matches/${matchId}`, () => {
    detailReads += 1;
    return HttpResponse.json({ status: 'success', data: { ...match, status, displayState: status } });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);

function createTab() {
  const client = createV1QueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, staleTime: Infinity, retry: false } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  status = 'recruiting';
  listReads = 0;
  detailReads = 0;
  vi.stubEnv('NEXT_PUBLIC_API_URL', api);
  focusManager.setFocused(undefined);
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  focusManager.setFocused(undefined);
});
afterAll(() => server.close());

describe('team-match deadline refresh', () => {
  it('refreshes active list and detail queries on tab return with a fresh cache', async () => {
    const tab = createTab();
    const { result } = renderHook(() => ({
      list: useV1TeamMatches(),
      detail: useV1TeamMatch(matchId),
    }), { wrapper: tab.wrapper });
    await waitFor(() => {
      expect(result.current.list.data?.items[0]?.status).toBe('recruiting');
      expect(result.current.detail.data?.status).toBe('recruiting');
    });
    expect(listReads).toBe(1);
    expect(detailReads).toBe(1);

    status = 'closed';
    await act(async () => { focusManager.setFocused(false); });
    expect(listReads).toBe(1);
    expect(detailReads).toBe(1);
    await act(async () => { focusManager.setFocused(true); });

    await waitFor(() => {
      expect(result.current.list.data?.items[0]?.status).toBe('closed');
      expect(result.current.detail.data?.status).toBe('closed');
    });
    expect(listReads).toBe(2);
    expect(detailReads).toBe(2);
  });

  it('polls an open detail after the same 15-second interval as the list', async () => {
    const tab = createTab();
    const { result } = renderHook(() => ({ list: useV1TeamMatches(), detail: useV1TeamMatch(matchId) }), { wrapper: tab.wrapper });
    await waitFor(() => {
      expect(result.current.list.data?.items[0]?.status).toBe('recruiting');
      expect(result.current.detail.data?.status).toBe('recruiting');
    });
    status = 'closed';
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15_100)); });
    await waitFor(() => {
      expect(result.current.list.data?.items[0]?.status).toBe('closed');
      expect(result.current.detail.data?.status).toBe('closed');
    });
    expect(listReads).toBeGreaterThanOrEqual(2);
    expect(detailReads).toBeGreaterThanOrEqual(2);
  }, 20_000);

  it('recommended list drops a deadline-closed item when the refreshed API response no longer includes it', async () => {
    const tab = createTab();
    const { result } = renderHook(() => useV1TeamMatches({ sort: 'recommended' }), { wrapper: tab.wrapper });
    await waitFor(() => expect(result.current.data?.items[0]?.status).toBe('recruiting'));
    expect(listReads).toBe(1);

    status = 'closed';
    await act(async () => { focusManager.setFocused(false); });
    await act(async () => { focusManager.setFocused(true); });

    await waitFor(() => expect(result.current.data?.items).toEqual([]));
    expect(listReads).toBe(2);
  });
});
