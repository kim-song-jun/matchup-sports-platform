import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactNode } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1AdminTeamMatch, useV1ChangeTeamMatchStatus, useV1MyTeamMatchesInfinite, useV1TeamMatch, useV1TeamMatches } from './use-v1-api';

const api = 'http://localhost/api/v1';
const id = 'status-fixture';
let status = 'recruiting';
const item = () => ({ teamMatchId: id, title: '팀매치', status, displayState: status });
const page = () => ({ items: status === 'cancelled' ? [] : [item()], pageInfo: { hasNext: false, nextCursor: null } });
const ok = (data: unknown) => HttpResponse.json({ status: 'success', data });
const server = setupServer(
  http.get(`${api}/team-matches`, () => ok(page())),
  http.get(`${api}/team-matches/${id}`, () => status === 'cancelled'
    ? HttpResponse.json({ status: 'error', statusCode: 404, code: 'NOT_FOUND_OR_ARCHIVED', message: 'Team match was not found' }, { status: 404 })
    : ok(item())),
  http.get(`${api}/me/team-matches`, () => ok(page())),
  http.get(`${api}/admin/team-matches/${id}`, () => ok(item())),
  http.post(`${api}/admin/team-matches/${id}/status`, async ({ request }) => {
    status = (await request.json() as { status: string }).status;
    return ok({ teamMatchId: id, status });
  }),
  http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => { status = 'recruiting'; vi.stubEnv('NEXT_PUBLIC_API_URL', api); });
afterEach(() => { cleanup(); server.resetHandlers(); vi.unstubAllEnvs(); });
afterAll(() => server.close());

describe('admin team-match status refresh', () => {
  it('updates mounted public list/detail, my matches and admin detail after the status POST', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => ({
      publicList: useV1TeamMatches(), detail: useV1TeamMatch(id), mine: useV1MyTeamMatchesInfinite('created'),
      admin: useV1AdminTeamMatch(id), change: useV1ChangeTeamMatchStatus(),
    }), { wrapper });
    await waitFor(() => expect(result.current.admin.data?.status).toBe('recruiting'));
    await waitFor(() => expect(result.current.publicList.data?.items).toHaveLength(1));
    await waitFor(() => expect(result.current.mine.data?.pages[0].items).toHaveLength(1));
    await act(async () => { await result.current.change.mutateAsync({ id, status: 'closed', reason: '모집 마감' }); });
    await waitFor(() => expect(result.current.detail.data?.status).toBe('closed'));
    await waitFor(() => expect(result.current.admin.data?.status).toBe('closed'));
    await waitFor(() => expect(result.current.publicList.data?.items[0].status).toBe('closed'));
    await act(async () => { await result.current.change.mutateAsync({ id, status: 'cancelled', reason: '경기 취소' }); });
    await waitFor(() => expect(result.current.publicList.data?.items).toHaveLength(0));
    await waitFor(() => expect(result.current.mine.data?.pages[0].items).toHaveLength(0));
    await waitFor(() => expect(result.current.admin.data?.status).toBe('cancelled'));
    await waitFor(() => expect(result.current.detail.isError).toBe(true));
    client.clear();
  });
});
