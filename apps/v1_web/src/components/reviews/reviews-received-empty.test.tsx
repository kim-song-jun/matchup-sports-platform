import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewsPageView } from './reviews-page';
import type { ReviewsPageModel, ReviewsReceivedPageModel } from './reviews.types';

vi.mock('next/navigation', () => ({
  usePathname: () => '/my/reviews',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const emptyReceived: ReviewsReceivedPageModel = { stats: [], userGroups: [], teamGroups: [] };
const emptyModel = { cards: [], emptyTitle: '', emptySub: '', tab: 'received' } as unknown as ReviewsPageModel;

// AppChrome 이 알림 배지 등을 조회하므로 QueryClient 가 필요하다.
function render(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return rtlRender(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function renderReceived(overrides: Partial<Parameters<typeof ReviewsPageView>[0]> = {}) {
  return render(
    <ReviewsPageView
      errorMessage={null}
      hasManagedTeam={false}
      loading={false}
      model={emptyModel}
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
      {...overrides}
    />,
  );
}

describe('받은 리뷰 탭', () => {
  // 집계 카드는 0건이면 스스로 렌더하지 않는다. 개별 리뷰까지 0건이면 화면에 탭만 남고
  // 본문이 통째로 비어 버렸다(alpha 실측) — 사용자가 로딩 중인지 없는 건지 알 수 없다.
  it('받은 리뷰가 하나도 없으면 빈 상태를 보여준다', () => {
    renderReceived();

    expect(screen.getByText('아직 받은 리뷰가 없어요')).toBeInTheDocument();
  });

  // 로딩·에러를 "0건"으로 오해해 빈 상태를 띄우면 에러가 조용히 사라진다.
  it('로딩 중에는 빈 상태 대신 스켈레톤을 보여준다', () => {
    renderReceived({ loading: true });

    expect(screen.queryByText('아직 받은 리뷰가 없어요')).not.toBeInTheDocument();
  });

  it('에러일 때는 빈 상태 대신 에러 안내를 보여준다', () => {
    renderReceived({ errorMessage: '네트워크 오류' });

    expect(screen.queryByText('아직 받은 리뷰가 없어요')).not.toBeInTheDocument();
    expect(screen.getByText('리뷰를 불러오지 못했어요')).toBeInTheDocument();
  });
});
