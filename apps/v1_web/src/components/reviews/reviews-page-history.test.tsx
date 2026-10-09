import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewsRoute from '@/app/my/reviews/page';
import { createV1QueryClient } from '@/lib/query-client';
import { v1Keys } from '@/lib/query-keys';
import type { V1MyTeam, V1ReviewListResponse, V1ReviewReceivedResponse, V1ReviewReceivedSummaryResponse } from '@/types/api';
import type { ReviewsTab } from './reviews.types';

// Next의 URL/RSC 전달만 제어한다. 실제 route의 정규화, client/view, hooks와 HTTP는 유지한다.
vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const apiBase = 'http://localhost/api/v1';
type RouteTabInput = string | string[] | null;
const pageInfo = { nextCursor: null, hasNext: false };
const labels: Record<ReviewsTab, string> = { pending: '작성할 리뷰', written: '작성된 리뷰', received: '받은 리뷰' };
const listData: Record<'pending' | 'written', V1ReviewListResponse> = {
  pending: { items: [{ sourceType: 'match', sourceId: 'pending-match', title: '리뷰를 기다리는 경기', completedAt: '2026-10-01T10:00:00Z', targetType: 'user', targetCount: 2, reviewedCount: 0, remainingCount: 2, state: 'ready' }], pageInfo },
  written: { items: [{ sourceType: 'match', sourceId: 'written-match', title: '리뷰를 보낸 경기', completedAt: '2026-10-02T10:00:00Z', targetType: 'user', targetCount: 2, reviewedCount: 2, remainingCount: 0, state: 'done' }], pageInfo },
};
const receivedData: V1ReviewReceivedResponse = {
  items: [{
    reviewId: 'received-review', sourceType: 'match', sourceId: 'received-match', targetType: 'user',
    targetUser: { userId: 'me', name: '내 계정', imageUrl: null }, targetTeam: null,
    reviewerUser: { userId: 'reviewer', name: '함께 뛴 사람', imageUrl: null }, reviewerTeam: null,
    rating: 4, tags: [{ tagCode: 'teamwork', label: '팀워크가 좋아요' }], status: 'submitted',
    anonymous: false, submittedAt: '2026-10-03T10:00:00Z',
    source: { sourceType: 'match', sourceId: 'received-match', title: '리뷰를 받은 경기', completedAt: '2026-10-03T09:00:00Z' },
  }], pageInfo,
};
const summaryData: V1ReviewReceivedSummaryResponse = {
  bySport: [{ sportId: 'futsal', sportCode: 'futsal', ratingAvg: 4, ratingCount: 1, tagRates: [] }],
  availableMonths: ['2026-10'], highlight: null,
};
const managedTeam: V1MyTeam = {
  teamId: 'managed-team', membershipId: 'membership', name: '내가 운영하는 팀', role: 'manager', status: 'active',
  logoUrl: null, sport: { sportId: 'futsal', name: '풋살' }, region: null, memberCount: 5,
  canManage: true, canCreateTeamMatch: true, detailRoute: '/teams/managed-team', manageRoute: '/teams/managed-team/manage',
};

describe('마이 리뷰 — 유지된 소비자의 URL 이력과 실제 조회', () => {
  const requests: Array<{ path: string; credentials: RequestCredentials }> = [];
  let empty: boolean;
  let failedTab: ReviewsTab | null;
  let withManagedTeam: boolean;
  let queryClient: ReturnType<typeof createV1QueryClient>;
  const server = setupServer(
    http.get(`${apiBase}/reviews`, ({ request }) => {
      const url = new URL(request.url);
      requests.push({ path: `${url.pathname}${url.search}`, credentials: request.credentials });
      const tab = url.searchParams.get('tab');
      if (tab !== 'pending' && tab !== 'written') return HttpResponse.json({ message: '잘못된 탭 요청' }, { status: 400 });
      if (failedTab === tab) return unavailable();
      return HttpResponse.json({ data: empty ? { items: [], pageInfo } : listData[tab] });
    }),
    http.get(`${apiBase}/reviews/received`, ({ request }) => {
      requests.push({ path: new URL(request.url).pathname, credentials: request.credentials });
      if (failedTab === 'received') return unavailable();
      return HttpResponse.json({ data: empty ? { items: [], pageInfo } : receivedData });
    }),
    http.get(`${apiBase}/reviews/received/summary`, ({ request }) => {
      const url = new URL(request.url);
      requests.push({ path: `${url.pathname}${url.search}`, credentials: request.credentials });
      return HttpResponse.json({ data: empty ? { bySport: [], availableMonths: [], highlight: null } : summaryData });
    }),
    http.get(`${apiBase}/me/teams`, () => HttpResponse.json({ data: { items: withManagedTeam ? [managedTeam] : [] } })),
    http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
  );

  function unavailable() {
    return HttpResponse.json({ status: 'error', statusCode: 503, code: 'REVIEWS_UNAVAILABLE', message: '리뷰 서버가 잠시 쉬고 있어요.', timestamp: '2026-10-09T00:00:00Z' }, { status: 503 });
  }

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterAll(() => server.close());
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubEnv('NEXT_PUBLIC_API_URL', apiBase);
    requests.length = 0;
    empty = false;
    failedTab = null;
    withManagedTeam = false;
    // 실제 앱의 60초 freshness는 유지하고 오류의 수동 retry만 분리한다.
    queryClient = createV1QueryClient();
    queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, retry: false } });
  });
  afterEach(() => {
    cleanup();
    queryClient.clear();
    server.resetHandlers();
    window.localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  async function mountRoute(urlTab: RouteTabInput, serverTab = urlTab) {
    function setUrl(tab: RouteTabInput) {
      const params = new URLSearchParams();
      if (tab !== null) for (const value of Array.isArray(tab) ? tab : [tab]) params.append('tab', value);
      window.history.replaceState({}, '', `/my/reviews${params.size > 0 ? `?${params}` : ''}`);
    }
    async function routeTree(tab: RouteTabInput) {
      // 실제 Next는 중복 query를 string[]로 전달한다. 기존 route의 좁은 타입만 test seam에서 보완한다.
      const searchParams = Array.isArray(tab)
        ? Promise.resolve({ tab }) as unknown as NonNullable<Parameters<typeof ReviewsRoute>[0]['searchParams']>
        : Promise.resolve({ tab: tab ?? undefined });
      const route = await ReviewsRoute({ searchParams });
      return (
        <QueryClientProvider client={queryClient}>
          {/* jsdom에서 Next 전환만 보류한다. 실제 Link의 onClick/낙관적 선택은 실행된다. */}
          <div onClickCapture={(event) => { if (event.target instanceof Element && event.target.closest('a')) event.preventDefault(); }}>
            {route}
          </div>
        </QueryClientProvider>
      );
    }
    setUrl(urlTab);
    const view = render(await routeTree(serverTab));
    const tabs = screen.getByRole('navigation', { name: '리뷰 탭' });
    return {
      async navigate(tab: RouteTabInput, incomingServerTab = tab) {
        setUrl(tab);
        view.rerender(await routeTree(incomingServerTab));
        // RSC 변경이 페이지를 새로 mount해서 버그를 숨기지 않도록 같은 DOM임을 확인한다.
        expect(screen.getByRole('navigation', { name: '리뷰 탭' })).toBe(tabs);
      },
    };
  }

  function selected(tab: ReviewsTab) {
    const tabs = within(screen.getByRole('navigation', { name: '리뷰 탭' }));
    for (const [id, label] of Object.entries(labels)) {
      if (id === tab) expect(tabs.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
      else expect(tabs.getByRole('link', { name: label })).not.toHaveAttribute('aria-current');
    }
  }

  function select(tab: ReviewsTab) {
    fireEvent.click(screen.getByRole('link', { name: labels[tab] }));
  }

  function paths() { return requests.map(({ path }) => path); }

  it('written→received 뒤로가기와 앞으로가기가 같은 화면의 선택·내용·HTTP를 복원한다', async () => {
    const route = await mountRoute('written');
    await screen.findByText('리뷰를 보낸 경기');
    select('received');
    selected('received');
    await screen.findByText('리뷰를 받은 경기');
    await route.navigate('received');
    await queryClient.invalidateQueries({ queryKey: v1Keys.reviews({ tab: 'written' }), refetchType: 'none' });

    await route.navigate('written');
    selected('written');
    expect(await screen.findByText('리뷰를 보낸 경기')).toBeVisible();
    expect(screen.queryByText('리뷰를 받은 경기')).not.toBeInTheDocument();
    await waitFor(() => expect(paths().filter((path) => path === '/api/v1/reviews?tab=written')).toHaveLength(2));

    await route.navigate('received');
    selected('received');
    expect(await screen.findByText('리뷰를 받은 경기')).toBeVisible();
    expect(screen.queryByText('리뷰를 보낸 경기')).not.toBeInTheDocument();
    expect(paths()).toContain('/api/v1/reviews/received');
    expect(requests.every(({ credentials }) => credentials === 'include')).toBe(true);
  });

  it('빈 written→received에서 pending 이력으로 돌아가면 올바른 빈 상태와 조회를 복원한다', async () => {
    empty = true;
    const route = await mountRoute('written');
    await screen.findByText('작성된 리뷰가 없어요');
    select('received');
    await screen.findByText('아직 받은 리뷰가 없어요');
    await route.navigate('received');

    await route.navigate('pending');
    selected('pending');
    expect(await screen.findByText('작성할 리뷰가 없어요')).toBeVisible();
    expect(screen.queryByText('아직 받은 리뷰가 없어요')).not.toBeInTheDocument();
    expect(paths()).toContain('/api/v1/reviews?tab=pending');
  });

  it.each([null, 'unknown'])('received에서 URL tab=%s 복귀는 실제 서버 정규화의 pending 조회를 사용한다', async (tab) => {
    const route = await mountRoute('received');
    await screen.findByText('리뷰를 받은 경기');
    await route.navigate(tab);

    selected('pending');
    expect(await screen.findByText('리뷰를 기다리는 경기')).toBeVisible();
    expect(paths()).toContain('/api/v1/reviews?tab=pending');
    expect(paths()).not.toContain('/api/v1/reviews?tab=unknown');
  });

  it.each([['written', 'received'], ['received', 'received']])('중복 tab=%s&tab=%s 최초 표시는 실제 서버 배열 정규화의 pending 선택·본문·HTTP를 유지한다', async (first, second) => {
    await mountRoute([first, second]);

    selected('pending');
    expect(await screen.findByText('리뷰를 기다리는 경기')).toBeVisible();
    expect(screen.queryByText('리뷰를 보낸 경기')).not.toBeInTheDocument();
    expect(screen.queryByText('리뷰를 받은 경기')).not.toBeInTheDocument();
    expect(paths()).toContain('/api/v1/reviews?tab=pending');
    expect(paths()).not.toContain('/api/v1/reviews?tab=written');
    expect(paths()).not.toContain('/api/v1/reviews/received');
  });

  it.each([['written', 'received'], ['received', 'received']])('중복 tab=%s&tab=%s 이력 복귀는 유지된 화면의 pending 선택·본문·HTTP를 복원한다', async (first, second) => {
    const route = await mountRoute('written');
    await screen.findByText('리뷰를 보낸 경기');
    select('received');
    await screen.findByText('리뷰를 받은 경기');
    await route.navigate('received');
    await route.navigate([first, second]);

    selected('pending');
    expect(await screen.findByText('리뷰를 기다리는 경기')).toBeVisible();
    expect(screen.queryByText('리뷰를 보낸 경기')).not.toBeInTheDocument();
    expect(screen.queryByText('리뷰를 받은 경기')).not.toBeInTheDocument();
    expect(paths()).toContain('/api/v1/reviews?tab=pending');
  });

  it.each(['written', 'received'] as const)('%s로 이력 복귀한 실제 오류는 숨기지 않고 해당 조회를 재시도한다', async (tab) => {
    failedTab = tab;
    const route = await mountRoute('pending');
    await screen.findByText('리뷰를 기다리는 경기');
    await route.navigate(tab);

    selected(tab);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('리뷰 서버가 잠시 쉬고 있어요.');
    expect(screen.queryByText(tab === 'received' ? '아직 받은 리뷰가 없어요' : '작성된 리뷰가 없어요')).not.toBeInTheDocument();
    failedTab = null;
    fireEvent.click(within(alert).getByRole('button', { name: '다시 시도하기' }));

    expect(await screen.findByText(tab === 'received' ? '리뷰를 받은 경기' : '리뷰를 보낸 경기')).toBeVisible();
    const endpoint = tab === 'received' ? '/api/v1/reviews/received' : '/api/v1/reviews?tab=written';
    expect(paths().filter((path) => path === endpoint)).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('빠른 received→pending 선택 뒤 늦은 received RSC가 와도 최신 URL·선택·내용을 유지한다', async () => {
    const route = await mountRoute('written');
    await screen.findByText('리뷰를 보낸 경기');
    select('received');
    selected('received');
    select('pending');
    selected('pending');
    await screen.findByText('리뷰를 기다리는 경기');

    await route.navigate('pending', 'received');
    selected('pending');
    expect(screen.getByText('리뷰를 기다리는 경기')).toBeVisible();
    expect(screen.queryByText('리뷰를 받은 경기')).not.toBeInTheDocument();
    await route.navigate('pending');
    selected('pending');
    expect(paths().filter((path) => path === '/api/v1/reviews?tab=pending')).toHaveLength(1);
  });

  it('received 복귀는 사용자·관리 팀 요약의 선택 기간과 별도 HTTP 계약을 유지한다', async () => {
    withManagedTeam = true;
    const route = await mountRoute('received');
    await screen.findByText('리뷰를 받은 경기');
    const userPeriod = await screen.findByRole('combobox', { name: '내가 받은 리뷰 요약 기간 선택' });
    const teamPeriod = await screen.findByRole('combobox', { name: '내 팀이 받은 리뷰 요약 기간 선택' });
    fireEvent.change(userPeriod, { target: { value: '2026-10' } });
    fireEvent.change(teamPeriod, { target: { value: '2026-10' } });
    await waitFor(() => expect(paths()).toContain('/api/v1/reviews/received/summary?targetType=team&period=2026-10'));
    await route.navigate('written');
    selected('written');
    await screen.findByText('리뷰를 보낸 경기');
    await route.navigate('received');

    selected('received');
    expect(await screen.findByRole('combobox', { name: '내가 받은 리뷰 요약 기간 선택' })).toHaveValue('2026-10');
    expect(screen.getByRole('combobox', { name: '내 팀이 받은 리뷰 요약 기간 선택' })).toHaveValue('2026-10');
    expect(paths()).toContain('/api/v1/reviews/received/summary?targetType=user&period=2026-10');
  });
});
