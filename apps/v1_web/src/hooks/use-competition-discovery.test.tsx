import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { useCompetitionDiscovery } from './use-competition-discovery';
import { getV1ApiBaseUrl } from '@/lib/api-client';
import { createCompetitionDiscoveryHandlers, type CompetitionDiscoveryFixture } from '@/test/msw/competition-discovery-handlers';
import type { CompetitionDiscoveryFilters, CompetitionDiscoveryItem } from '@/lib/competition-discovery';

const api = getV1ApiBaseUrl();
const server = setupServer(http.post(`${api}/logs/client-error`, () => HttpResponse.json({ status: 'success', data: null })));
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
const sportId = '8c0ae163-e4d0-4037-8cf2-4e18216fe0f8';
const fixture = (id: string, extra: Partial<CompetitionDiscoveryFixture> = {}): CompetitionDiscoveryFixture => ({
  id, sportId, kind: 'regular_tournament', title: id, sport: { code: 'futsal', name: '풋살' }, status: 'open', format: 'knockout',
  registrationDeadlineAt: '2099-12-01T00:00:00Z', scheduledAt: '2099-10-01T00:00:00Z', scheduledEndAt: '2099-12-31T00:00:00Z',
  entryFee: 0, genderCategory: 'mixed', teamCount: 4, confirmedCount: 0, pendingPaymentCount: 0, createdAt: '2026-01-01T00:00:00Z', ...extra,
} as CompetitionDiscoveryFixture);
const fixtures = [fixture('available'), fixture('full', { confirmedCount: 2, pendingPaymentCount: 2 }),
  fixture('expired', { registrationDeadlineAt: '2000-01-01T00:00:00Z' }),
  fixture('hidden', { status: 'draft' }), fixture('cancelled', { status: 'cancelled' }),
  fixture('active-league', { kind: 'regular_league', status: 'in_progress', teamCount: undefined }),
  fixture('full-league', { kind: 'regular_league', status: 'in_progress', maxTeams: 1, confirmedCount: 1, teamCount: undefined }),
  fixture('held-league', { kind: 'regular_league', status: 'on_hold' }),
  { ...fixture('private'), isPublic: false },
  fixture('upcoming-league', { kind: 'regular_league', status: 'open', teamCount: undefined }),
];
function setup(initial: CompetitionDiscoveryFilters) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  // 실제 목록과 같이 필터 변경 시 observer를 새로 만든다.
  return { client, wrapper, initial };
}

describe('목록 훅 → HTTP → 필터·정렬 응답 계약', () => {
  it('모집·종목·부문·기간·무료 조건을 전달해 정원 마감 항목을 제외한다', async () => {
    server.use(...createCompetitionDiscoveryHandlers(api, fixtures));
    const params: CompetitionDiscoveryFilters = { kind: 'tournament', registration: 'open', sportId, genderCategory: 'mixed', format: 'knockout', feeMax: 0, dateFrom: '2099-11-01', dateTo: '2099-11-30' };
    const { wrapper, client } = setup(params);
    const hook = renderHook(() => useCompetitionDiscovery({ ...params, limit: 20 }), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(hook.result.current.data?.items.map((item) => item.id)).toEqual(['available']);
    expect(hook.result.current.data?.pageInfo.total).toBe(1);
    hook.unmount(); client.clear();
  });
  // 2026-10-27: 리그도 대회처럼 접수 중일 때만 신청을 받는다 — 진행 중 리그는 신청 가능 목록에 없다.
  it('시작 전 접수 중 리그는 신청 가능으로 조회되고 진행 중 리그는 빠진다', async () => {
    server.use(...createCompetitionDiscoveryHandlers(api, fixtures));
    const { wrapper, client } = setup({ kind: 'league' });
    const hook = renderHook(({ phase }: { phase: 'upcoming' | 'ongoing' }) => useCompetitionDiscovery({ kind: 'league', registration: 'open', phase, limit: 20 }), { wrapper, initialProps: { phase: 'upcoming' } });
    await waitFor(() => expect(hook.result.current.data?.items.map((item) => item.id)).toEqual(['upcoming-league']));
    hook.rerender({ phase: 'ongoing' });
    await waitFor(() => expect(hook.result.current.data?.items).toEqual([]));
    hook.unmount(); client.clear();
  });
  it('필터 API 실패를 빈 결과나 성공으로 숨기지 않는다', async () => {
    server.use(http.get(`${api}/tournaments`, () => HttpResponse.json({ status: 'error', statusCode: 503, code: 'UNAVAILABLE', message: '조회할 수 없어요.' }, { status: 503 })));
    const { wrapper, client } = setup({ kind: 'all' });
    const hook = renderHook(() => useCompetitionDiscovery({ kind: 'all', limit: 20 }), { wrapper });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
    hook.unmount(); client.clear();
  });
});
