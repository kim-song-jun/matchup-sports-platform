import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useV1TeamMatch } from '@/hooks/use-v1-api';
import { server } from '@/test/msw/server';
import type { V1TeamMatch } from '@/types/api';
import { TeamMatchOperateEntry } from './team-match-operate-entry';

const matchId = 'operate-entry-refresh-match';
const queryClients: QueryClient[] = [];
type TeamMatchDetailResponse = Omit<V1TeamMatch, 'id'>;
const recruitingPreviewCases: Array<[string, NonNullable<TeamMatchDetailResponse['periods']>]> = [
  ['approved recruiting A with a single period', [{ code: 'SINGLE_PERIOD', label: '단일', durationMinutes: 2, extraTime: false }]],
  ['approved recruiting B with two periods', [
    { code: 'FIRST_HALF', label: '전반', durationMinutes: 1, extraTime: false },
    { code: 'SECOND_HALF', label: '후반', durationMinutes: 1, extraTime: false },
  ]],
];
const denialCases: Array<[string, { teamMatchId?: string; manageableHostTeam?: boolean }, string]> = [
  ['mismatched canonical ID', { teamMatchId: 'different-team-match' }, '요청한 팀매치와 조회된 정보가 일치하지 않아요.'],
  ['viewer without host-management permission', { manageableHostTeam: false }, '호스트 팀장이나 매니저만 볼 수 있어요.'],
];
const operateConsole = vi.hoisted(() => ({ render: vi.fn((_props: unknown) => <div data-testid="operate-console" />) }));

vi.mock('@/components/team-matches/team-match-operate-console', () => ({
  TeamMatchOperateConsole: (props: unknown) => operateConsole.render(props),
}));

function FocusRefreshProbe() {
  const query = useV1TeamMatch(matchId, { refetchOnWindowFocus: 'always' });
  return <p role="status">{query.data?.status}</p>;
}

function detail(status: V1TeamMatch['status'], overrides: { teamMatchId?: string; manageableHostTeam?: boolean } = {}): TeamMatchDetailResponse {
  const viewer: NonNullable<V1TeamMatch['viewer']> = {
    state: 'none',
    applicationId: null,
    participantId: null,
    canApply: false,
    manageableHostTeam: overrides.manageableHostTeam ?? true,
    manageableOpponentTeam: false,
  };
  return {
    teamMatchId: overrides.teamMatchId ?? matchId,
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
    operateConsole.render.mockClear();
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

  it.each(recruitingPreviewCases)('renders %s from the real hook when the response has teamMatchId and no id', async (_name, periods) => {
    server.use(
      http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
      http.get(`*/api/v1/team-matches/${matchId}`, () => HttpResponse.json({
        status: 'success',
        data: { ...detail('recruiting'), periods },
        timestamp: new Date().toISOString(),
      })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClients.push(queryClient);

    render(<QueryClientProvider client={queryClient}><TeamMatchOperateEntry teamMatchId={matchId} /></QueryClientProvider>);

    expect(await screen.findByRole('heading', { name: '경기 규칙 미리보기' })).toBeInTheDocument();
    for (const period of periods) {
      const row = screen.getByText(period.label).closest('li');
      if (!row) throw new Error(`Missing rendered row for period ${period.label}`);
      expect(within(row).getByText(`${period.durationMinutes}분`)).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: '팀매치 상세로' })).toHaveAttribute('href', `/team-matches/${matchId}`);
    expect(screen.queryByText('팀매치를 확인할 수 없어요')).not.toBeInTheDocument();
  });

  it('uses the canonical response teamMatchId for matched console context and result link', async () => {
    server.use(
      http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
      http.get(`*/api/v1/team-matches/${matchId}`, () => HttpResponse.json({
        status: 'success', data: detail('matched'), timestamp: new Date().toISOString(),
      })),
    );
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClients.push(queryClient);

    render(<QueryClientProvider client={queryClient}><TeamMatchOperateEntry teamMatchId={matchId} /></QueryClientProvider>);

    expect(await screen.findByTestId('operate-console')).toBeInTheDocument();
    expect(operateConsole.render).toHaveBeenCalledWith(expect.objectContaining({
      teamMatchContext: expect.objectContaining({ teamMatchId: matchId }),
      resultHref: `/team-matches/${matchId}/result`,
    }));
  });

  it.each(denialCases)('denies %s from the real detail response', async (_name, overrides, expectedMessage) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClients.push(queryClient);
    server.use(
      http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
      http.get(`*/api/v1/team-matches/${matchId}`, () => HttpResponse.json({
        status: 'success', data: detail('recruiting', overrides), timestamp: new Date().toISOString(),
      })),
    );

    render(<QueryClientProvider client={queryClient}><TeamMatchOperateEntry teamMatchId={matchId} /></QueryClientProvider>);

    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
    expect(operateConsole.render).not.toHaveBeenCalled();
  });
});
