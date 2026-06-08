import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  AdminNotificationsPageView,
  AdminReviewsPageView,
} from '@/components/community/admin-function-pages';
import { AdminAuditPageView, AdminDashboardPageView } from '@/components/community/admin-page';
import {
  toAdminNotificationsPageModel,
  toAdminReviewsPageModel,
} from '@/components/community/admin.function-view-model';
import { loadingActivityModel, loadingDashboardModel, notifications, pendingReviews, profile } from './admin.test-fixtures';

function expectNoWeakRouteCopy(container: HTMLElement) {
  const visibleText = container.textContent ?? '';
  expect(visibleText).not.toContain('업체 운영');
  expect(visibleText).not.toContain('운영 기준');
  expect(visibleText).not.toContain('리뷰 기준');
  expect(visibleText).not.toContain('안전한 실제 대상 화면');
  expect(visibleText).not.toContain('서비스 알림');
  expect(visibleText).not.toContain('운영 담당자');
  expect(visibleText).not.toContain('빠른 생성');
  expect(visibleText).not.toContain('바로가기');
}

describe('admin loading and route copy contract', () => {
  it('shows route-specific review loading copy without leaking zero-review state', () => {
    render(<AdminReviewsPageView model={toAdminReviewsPageModel({ profile, pendingReviews: [], states: ['loading'] })} />);

    const reviewsPage = screen.getByTestId('admin-reviews-open-design');
    expect(within(reviewsPage).getByRole('status')).toHaveTextContent('리뷰 관리 화면을 준비하고 있습니다');
    expect(within(reviewsPage).queryByText('운영 데이터를 불러오는 중입니다.')).not.toBeInTheDocument();
    expect(within(reviewsPage).queryByText('0개 리뷰 대기')).not.toBeInTheDocument();
    expect(within(reviewsPage).queryByText('작성할 리뷰가 없습니다.')).not.toBeInTheDocument();
  });

  it('shows structured loading states for dashboard and audit without empty-state copy', () => {
    render(<AdminDashboardPageView model={loadingDashboardModel()} />);

    const dashboard = screen.getByTestId('admin-open-design');
    expect(within(dashboard).getByRole('status')).toHaveTextContent('운영 워크스페이스를 준비하고 있습니다');
    expect(within(dashboard).queryByText('지금 바로 처리할 업무가 없습니다.')).not.toBeInTheDocument();

    cleanup();
    render(<AdminAuditPageView model={loadingActivityModel()} />);

    const audit = screen.getByTestId('admin-audit-open-design');
    expect(within(audit).getByRole('status')).toHaveTextContent('업무 이력을 준비하고 있습니다');
    expect(within(audit).queryByText('표시할 업무 이력이 없습니다.')).not.toBeInTheDocument();
  });

  it('uses customer-action route copy instead of weak or internal generic phrases', () => {
    render(<AdminReviewsPageView model={toAdminReviewsPageModel({ profile, pendingReviews, states: ['ready'] })} />);

    const reviewsPage = screen.getByTestId('admin-reviews-open-design');
    expect(within(reviewsPage).getByText('리뷰 처리 흐름')).toBeInTheDocument();
    expectNoWeakRouteCopy(reviewsPage);

    cleanup();
    render(<AdminNotificationsPageView model={toAdminNotificationsPageModel({ profile, notifications, states: ['ready'] })} />);

    const notificationsPage = screen.getByTestId('admin-notifications-open-design');
    expect(within(notificationsPage).getByText('업무 알림')).toBeInTheDocument();
    expect(within(notificationsPage).getByText('알림 후속 작업')).toBeInTheDocument();
    expect(within(notificationsPage).getByRole('link', { name: /전체 알림/ })).toHaveAttribute('href', '/notifications');
    expectNoWeakRouteCopy(notificationsPage);
  });
});
