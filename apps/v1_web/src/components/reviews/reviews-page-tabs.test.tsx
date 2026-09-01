import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewsPageView } from './reviews-page';
import type { ReviewsPageModel, ReviewsReceivedPageModel } from './reviews.types';

// 이 파일은 ReviewTabs 가 SegmentedTabs 로 이관된 뒤에도 실제 소비 계약(3개 탭 ·
// href 매핑 · 활성 탭 표시)이 그대로인지를 잡는다 — SegmentedTabs 자체의 범용 동작은
// segmented-tabs.test.tsx 가 이미 검증하므로, 여기서는 reviews-page.tsx 가 그 컴포넌트에
// 넘기는 항목 배열(id ↔ href ↔ label)이 실제로 맞는지만 좁게 확인한다.
vi.mock('next/navigation', () => ({
  usePathname: () => '/my/reviews',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function render(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const emptyReceived: ReviewsReceivedPageModel = { stats: [], userGroups: [], teamGroups: [] };

function renderView(tab: ReviewsPageModel['tab']) {
  const model: ReviewsPageModel = { tab, stats: [], cards: [], emptyTitle: '', emptySub: '' };
  return render(
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
      summary={{ bySport: [], availableMonths: [] }}
      summaryLoading={false}
      teamPeriod={null}
      teamSummary={undefined}
      teamSummaryLoading={false}
    />,
  );
}

describe('ReviewTabs(SegmentedTabs 이관) — 탭 3개의 href·활성 표시가 실제 라우트와 맞는다', () => {
  it('탭 3개가 각자 /my/reviews?tab=<id> 로 라우팅된다(하드코딩 href 오타 방지)', () => {
    renderView('written');

    expect(screen.getByRole('link', { name: '작성할 리뷰' })).toHaveAttribute('href', '/my/reviews?tab=pending');
    expect(screen.getByRole('link', { name: '작성된 리뷰' })).toHaveAttribute('href', '/my/reviews?tab=written');
    expect(screen.getByRole('link', { name: '받은 리뷰' })).toHaveAttribute('href', '/my/reviews?tab=received');
  });

  // 주소를 바꾸는 링크이므로 계약은 aria-selected(탭 위젯) 가 아니라 aria-current="page" 다.
  // getAllByRole('link') 로 집는 것 자체가 "tab 역할이 붙지 않았다"는 회귀 방어를 겸한다 —
  // role="tablist" 가 되살아나면 링크 role 이 덮여 이 쿼리가 0건이 되어 실패한다.
  it('현재 탭만 aria-current="page" 를 갖는다(나머지 둘은 없음)', () => {
    renderView('written');

    const tabs = screen.getAllByRole('link');
    expect(tabs.map((tab) => [tab.textContent, tab.getAttribute('aria-current')])).toEqual([
      ['작성할 리뷰', null],
      ['작성된 리뷰', 'page'],
      ['받은 리뷰', null],
    ]);
  });
});
