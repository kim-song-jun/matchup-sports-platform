import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1TeamMatch } from '@/hooks/use-v1-api';
import { server } from '@/test/msw/server';
import type { V1TeamMatch } from '@/types/api';
import { TeamMatchOperateEntry } from './team-match-operate-entry';

const matchId = 'operate-entry-refresh-match';
const queryClients: QueryClient[] = [];

function FocusRefreshProbe() {
  const query = useV1TeamMatch(matchId, { refetchOnWindowFocus: 'always' });
  return <p role="status">{query.data?.status}</p>;
}

function detail(status: V1TeamMatch['status']): V1TeamMatch {
  const viewer: NonNullable<V1TeamMatch['viewer']> = {
    state: 'none',
    applicationId: null,
    participantId: null,
    canApply: false,
    manageableHostTeam: true,
    manageableOpponentTeam: false,
  };
  return {
    id: matchId,
    teamMatchId: matchId,
    title: '운영 진입 갱신 확인 경기',
    sportName: '풋살',
    placeName: '테스트 경기장',
    startsAt: '2026-11-04T10:00:00.000Z',
    capacityText: '5:5',
    status,
    gameId: 'operate-entry-refresh-game',
    periods: [{ code: 'SINGLE', label: '단판', durationMinutes: 35, extraTime: false }],
    viewer,
    league: null,
  };
}

describe('TeamMatchOperateEntry live detail refresh', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    queryClients.splice(0).forEach((client) => client.clear());
    server.resetHandlers();
    vi.unstubAllEnvs();
  });
  afterAll(() => server.close());

  it('positive control: the real TeamMatch hook re-reads MSW data on a visible focus transition', async () => {
    let currentStatus: V1TeamMatch['status'] = 'recruiting';
    let reads = 0;
    server.use(
      http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
      http.get(`*/api/v1/team-matches/${matchId}`, () => {
        reads += 1;
        return HttpResponse.json({
          status: 'success',
          data: detail(currentStatus),
          timestamp: new Date().toISOString(),
        });
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClients.push(queryClient);
    render(<QueryClientProvider client={queryClient}><FocusRefreshProbe /></QueryClientProvider>);
    expect(await screen.findByText('recruiting')).toBeInTheDocument();
    expect(reads).toBe(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    window.dispatchEvent(new Event('visibilitychange'));
    currentStatus = 'completed';
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      window.dispatchEvent(new Event('visibilitychange'));
    });

    expect(await screen.findByText('completed')).toBeInTheDocument();
    await waitFor(() => expect(reads).toBe(2));
  });

  it('re-reads the actual TeamMatch response on window focus and replaces preview with completed state', async () => {
    let currentStatus: V1TeamMatch['status'] = 'recruiting';
    let reads = 0;
    server.use(
      http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
      http.get(`*/api/v1/team-matches/${matchId}`, () => {
        reads += 1;
        return HttpResponse.json({
          status: 'success',
          data: detail(currentStatus),
          timestamp: new Date().toISOString(),
        });
      }),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClients.push(queryClient);

    render(
      <QueryClientProvider client={queryClient}>
        <TeamMatchOperateEntry teamMatchId={matchId} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('heading', { name: '경기 규칙 미리보기' })).toBeInTheDocument();
    expect(reads).toBe(1);

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    window.dispatchEvent(new Event('visibilitychange'));
    currentStatus = 'completed';
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      window.dispatchEvent(new Event('visibilitychange'));
    });

    expect(await screen.findByText('경기가 종료됐어요')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '경기 결과 보기' })).toHaveAttribute(
      'href',
      `/team-matches/${matchId}/result`,
    );
    await waitFor(() => expect(reads).toBe(2));
  });
});
