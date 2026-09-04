/**
 * 웨이브 6(2026-09-04 감사): 리뷰 화면이 자체 카드(ReviewEmpty/ReviewNotice) 대신 공용
 * EmptyState/ErrorState 를 쓴다. 자체 구현이 되살아나면 여기서 잡는다.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { queryImageBySrc } from '@/test/next-image';
import { ReviewsPageView } from './reviews-page';
import type { ReviewsPageModel, ReviewsReceivedPageModel } from './reviews.types';

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

function renderView(overrides: { errorMessage?: string | null; onRetry?: () => void } = {}) {
  const model: ReviewsPageModel = {
    tab: 'pending',
    stats: [],
    cards: [],
    emptyTitle: '남길 후기가 없어요',
    emptySub: '경기가 끝나면 함께 뛴 사람에게 후기를 남길 수 있어요.',
  };
  return render(
    <ReviewsPageView
      errorMessage={overrides.errorMessage ?? null}
      hasManagedTeam={false}
      loading={false}
      model={model}
      onPeriodChange={vi.fn()}
      onRetry={overrides.onRetry ?? vi.fn()}
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

describe('리뷰 목록 상태 화면', () => {
  it('빈 상태는 공용 EmptyState + 그래픽 + 다음 행동이다', () => {
    const { container } = renderView();
    expect(container.querySelector('.tm-empty-state')).not.toBeNull();
    expect(queryImageBySrc(container, '/illustrations/journey-done-640.webp')).not.toBeNull();
    expect(container.querySelector('a.tm-btn-primary[href="/matches"]')).not.toBeNull();
  });

  it('오류는 ErrorState + 재시도다 — 예전엔 중립 버튼의 자체 카드였다', () => {
    const onRetry = vi.fn();
    renderView({ errorMessage: '네트워크 오류', onRetry });
    expect(screen.getByRole('alert')).toHaveTextContent('리뷰를 불러오지 못했어요');
    fireEvent.click(screen.getByRole('button', { name: '다시 시도하기' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
