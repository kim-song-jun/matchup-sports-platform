/**
 * 홈 → 후기 목록(`/my/reviews?from=%2Fhome`) → 후기 작성 → 뒤로가기가 `?from=` 을 잃어 홈 대신 마이로 가던 문제
 * (alpha 재현). 셸 뒤로가기는 `?from=` 을 따르므로, 이 화면들이 서로 이동할 때 받은 출처를 이어 줘야 한다 —
 * 작성 화면이 출처 없이 열리면 뒤로가기가 `/my/reviews` 로 replace 해 목록의 `?from=` 이 사라지고,
 * 거기서의 뒤로가기는 고정 목적지(마이)로 간다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { V1ReviewSourceResponse } from '@/types/api';
import { ReviewSourcePageClient } from './reviews-api-clients';
import { ReviewsPageView } from './reviews-page';
import type { ReviewsPageModel, ReviewsReceivedPageModel } from './reviews.types';

const routerReplace = vi.fn();
let pathname = '/my/reviews';
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: routerReplace, back: vi.fn() }),
  useSearchParams: () => searchParams,
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const emptyReceived: ReviewsReceivedPageModel = { stats: [], userGroups: [], teamGroups: [] };

function renderList(tab: ReviewsPageModel['tab'] = 'pending') {
  const model: ReviewsPageModel = {
    tab,
    stats: [],
    cards: [
      {
        sourceType: 'match', sourceId: 'm1', title: '리뷰를 기다리는 경기', completedAt: '2026-10-01T10:00:00Z',
        targetType: 'user', targetCount: 2, reviewedCount: 0, remainingCount: 2, state: 'ready',
        href: '/my/reviews/match/m1', badgeLabel: '작성 전', kindLabel: '매치', meta: '', ctaLabel: '리뷰',
      } as ReviewsPageModel['cards'][number],
    ],
    emptyTitle: '',
    emptySub: '',
  };
  return renderWithClient(
    <ReviewsPageView
      errorMessage={null}
      hasManagedTeam={false}
      loading={false}
      model={model}
      onPeriodChange={vi.fn()}
      onRetry={vi.fn()}
      onTabChange={vi.fn()}
      onTeamPeriodChange={vi.fn()}
      period={null}
      receivedModel={emptyReceived}
      summary={{ bySport: [], availableMonths: [], highlight: null }}
      summaryLoading={false}
      teamPeriod={null}
      teamSummary={undefined}
      teamSummaryLoading={false}
    />,
  );
}

beforeEach(() => {
  pathname = '/my/reviews';
  searchParams = new URLSearchParams();
  routerReplace.mockClear();
});

describe('후기 목록 — 받은 출처(?from=)를 작성 화면과 탭에 이어 준다', () => {
  it('홈에서 들어온 목록의 후기 카드는 작성 화면에 지금 목록 주소(출처 포함)를 출처로 싣는다', () => {
    searchParams = new URLSearchParams('from=%2Fhome');
    renderList();

    const card = screen.getByRole('link', { name: /리뷰를 기다리는 경기/ });
    // 작성 화면의 뒤로가기 목적지 = `/my/reviews?from=%2Fhome` — 바로 앞 이력과 같아 history back 으로 돌아온다.
    expect(card).toHaveAttribute('href', '/my/reviews/match/m1?from=%2Fmy%2Freviews%3Ffrom%3D%252Fhome');
  });

  it('탭을 바꾼 목록에서도 후기 카드는 그 탭 주소를 출처로 싣는다', () => {
    searchParams = new URLSearchParams('tab=written&from=%2Fhome');
    renderList('written');

    expect(screen.getByRole('link', { name: /리뷰를 기다리는 경기/ })).toHaveAttribute(
      'href',
      '/my/reviews/match/m1?from=%2Fmy%2Freviews%3Ftab%3Dwritten%26from%3D%252Fhome',
    );
  });

  it('출처 없이 연 목록은 탭 링크를 그대로 두고, 카드는 지금 목록 주소만 출처로 싣는다', () => {
    renderList();

    // 출처가 없어도 작성 화면의 뒤로가기는 지금 목록(바로 앞 이력)으로 돌아와야 한다.
    expect(screen.getByRole('link', { name: /리뷰를 기다리는 경기/ })).toHaveAttribute('href', '/my/reviews/match/m1?from=%2Fmy%2Freviews');
    expect(screen.getByRole('link', { name: '작성된 리뷰' })).toHaveAttribute('href', '/my/reviews?tab=written');
  });

  it('탭을 옮겨도 받은 출처를 이어 간다(탭 한 번 뒤의 뒤로가기가 마이로 새지 않는다)', () => {
    searchParams = new URLSearchParams('from=%2Fhome');
    renderList();

    const tabs = within(screen.getByRole('navigation', { name: '리뷰 탭' }));
    expect(tabs.getByRole('link', { name: '작성할 리뷰' })).toHaveAttribute('href', '/my/reviews?tab=pending&from=%2Fhome');
    expect(tabs.getByRole('link', { name: '작성된 리뷰' })).toHaveAttribute('href', '/my/reviews?tab=written&from=%2Fhome');
    expect(tabs.getByRole('link', { name: '받은 리뷰' })).toHaveAttribute('href', '/my/reviews?tab=received&from=%2Fhome');
  });

  it('로그인 화면 같은 허용되지 않는 출처는 탭에 싣지 않는다', () => {
    searchParams = new URLSearchParams('from=%2Flogin');
    renderList();

    expect(screen.getByRole('link', { name: '작성된 리뷰' })).toHaveAttribute('href', '/my/reviews?tab=written');
  });
});

describe('후기 작성 화면 — 받은 출처(?from=)를 제출 완료·확인으로 이어 준다', () => {
  const reviewerTeam = { teamId: 'team-mine', name: '우리팀', role: 'member' as const };
  const source: V1ReviewSourceResponse = {
    source: { sourceType: 'team_match', sourceId: 'tm-1', title: '우리팀 vs 상대팀', completedAt: '2026-08-18T00:00:00.000Z' },
    reviewerTeam,
    targets: [
      {
        targetType: 'team', targetUserId: null, targetTeamId: 'opp', name: '상대팀', subtitle: '상대 팀',
        imageUrl: null, alreadySubmitted: false, review: null, locked: false, lockReason: null, reviewerTeam,
      },
    ],
  };
  const listHref = '/my/reviews?from=%2Fhome';
  let server: ReturnType<typeof setupServer>;

  beforeEach(() => {
    pathname = '/my/reviews/team_match/tm-1';
    searchParams = new URLSearchParams({ from: listHref });
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost/api/v1');
    server = setupServer(
      http.get('*/api/v1/reviews/sources/:sourceType/:sourceId', () =>
        HttpResponse.json({ status: 'success', data: source, timestamp: '2026-08-18T00:00:00.000Z' }),
      ),
      http.post('*/api/v1/reviews', () =>
        HttpResponse.json({ status: 'success', data: { review: { reviewId: 'r1' }, alreadySubmitted: false }, timestamp: '2026-08-18T00:00:00.000Z' }),
      ),
      http.post('*/api/v1/logs/client-error', () => new HttpResponse(null, { status: 204 })),
    );
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterEach(() => {
    server.close();
    vi.unstubAllEnvs();
  });

  it('리뷰를 보내면 완료 화면으로 바꾸면서 받은 출처를 그대로 싣는다', async () => {
    const user = userEvent.setup();
    renderWithClient(<ReviewSourcePageClient complete={false} sourceId="tm-1" sourceType="team_match" />);

    const total = await screen.findByRole('radiogroup', { name: '상대팀 총점' });
    await user.click(within(total).getByRole('radio', { name: '4점' }));
    await user.click(within(total.closest('.tm-card') as HTMLElement).getByRole('button', { name: '매너가 좋아요' }));
    await user.click(screen.getByRole('button', { name: /리뷰 1건 보내기/ }));

    await waitFor(() => expect(routerReplace).toHaveBeenCalledTimes(1));
    expect(routerReplace).toHaveBeenCalledWith(
      '/my/reviews/team_match/tm-1?complete=1&from=%2Fmy%2Freviews%3Ffrom%3D%252Fhome',
    );
  });

  it('완료 화면의 확인은 작성된 리뷰 탭으로 가되 받은 출처를 이어 간다', async () => {
    const user = userEvent.setup();
    renderWithClient(<ReviewSourcePageClient complete sourceId="tm-1" sourceType="team_match" />);

    await user.click(await screen.findByRole('button', { name: '확인' }));

    expect(routerReplace).toHaveBeenCalledWith('/my/reviews?tab=written&from=%2Fmy%2Freviews%3Ffrom%3D%252Fhome');
  });

  it('출처 없이 연 작성 화면은 예전처럼 출처 없는 주소로 간다', async () => {
    searchParams = new URLSearchParams();
    const user = userEvent.setup();
    renderWithClient(<ReviewSourcePageClient complete sourceId="tm-1" sourceType="team_match" />);

    await user.click(await screen.findByRole('button', { name: '확인' }));

    expect(routerReplace).toHaveBeenCalledWith('/my/reviews?tab=written');
  });
});
