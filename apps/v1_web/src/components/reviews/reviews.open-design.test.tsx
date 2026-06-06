import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ReviewSourcePageView, ReviewsPageView } from './reviews-page';
import { toReviewSourcePageModel, toReviewsPageModel } from './reviews.view-model';
import type { V1ReviewListResponse, V1ReviewSourceResponse } from '@/types/api';

const reviewList = {
  items: [
    {
      sourceId: 'match-1',
      sourceType: 'match',
      title: '성수 풋살 매치',
      completedAt: '2026-05-23T10:00:00.000Z',
      targetCount: 3,
      targetType: 'user',
      reviewedCount: 1,
      remainingCount: 2,
      state: 'ready',
    },
  ],
  pageInfo: { hasNext: false, nextCursor: null },
} satisfies V1ReviewListResponse;

const reviewSource = {
  source: {
    sourceId: 'match-1',
    sourceType: 'match',
    title: '성수 풋살 매치',
    completedAt: '2026-05-23T10:00:00.000Z',
  },
  reviewerTeam: null,
  targets: [
    {
      alreadySubmitted: false,
      imageUrl: null,
      locked: false,
      lockReason: null,
      name: '김정민',
      review: null,
      subtitle: '참가자',
      targetTeamId: null,
      targetType: 'user',
      targetUserId: 'user-1',
    },
  ],
} satisfies V1ReviewSourceResponse;

describe('reviews Open Design contract', () => {
  it('renders review workflow with explicit trust signal states', () => {
    render(
      <ReviewsPageView
        errorMessage={null}
        loading={false}
        model={toReviewsPageModel(reviewList, 'pending')}
        onRetry={vi.fn()}
        onTabChange={vi.fn()}
        receivedModel={{ stats: [], teamGroups: [], userGroups: [] }}
      />,
    );

    const page = screen.getByTestId('reviews-open-design');
    expect(page).toHaveClass('tm-reviews-open-design');
    expect(page).toHaveClass('tm-reviews-desktop-workbench');
    expect(within(page).getByText('리뷰 큐')).toBeInTheDocument();
    expect(within(page).getByText('신뢰 신호')).toBeInTheDocument();
    expect(within(page).getByText('제출 관리')).toBeInTheDocument();
    expect(within(page).getByText('작성할 리뷰')).toBeInTheDocument();
    expect(within(page).getByText('검증됨')).toBeInTheDocument();
    expect(within(page).getByText('추정')).toBeInTheDocument();
    expect(within(page).getByText('샘플')).toBeInTheDocument();
  });

  it('renders review compose as a desktop-safe lane with a constrained action bar', () => {
    render(
      <ReviewSourcePageView
        drafts={{ 'user:user-1': { rating: 4, tagCodes: ['manner'] } }}
        errorMessage={null}
        loading={false}
        message={null}
        model={toReviewSourcePageModel(reviewSource)}
        onRetry={vi.fn()}
        onSubmit={vi.fn()}
        onToggleTag={vi.fn()}
        onUpdateRating={vi.fn()}
        submitting={false}
      />,
    );

    const compose = screen.getByTestId('review-compose-open-design');
    expect(compose).toHaveClass('tm-review-compose-desktop-lane');
    expect(screen.getByRole('button', { name: '리뷰 보내기' }).parentElement).toHaveClass('tm-review-compose-action');
  });

  it('does not render remote review target images as CSS background URLs', () => {
    const remoteSource: V1ReviewSourceResponse = {
      ...reviewSource,
      targets: reviewSource.targets.map((target) => ({ ...target, imageUrl: 'https://tracker.example/avatar.png' })),
    };
    const { container } = render(
      <ReviewSourcePageView
        drafts={{ 'user:user-1': { rating: 4, tagCodes: ['manner'] } }}
        errorMessage={null}
        loading={false}
        message={null}
        model={toReviewSourcePageModel(remoteSource)}
        onRetry={vi.fn()}
        onSubmit={vi.fn()}
        onToggleTag={vi.fn()}
        onUpdateRating={vi.fn()}
        submitting={false}
      />,
    );

    const avatar = container.querySelector('.tm-review-avatar');
    expect(avatar).not.toHaveStyle({ backgroundImage: 'url("https://tracker.example/avatar.png")' });
    expect(avatar).toHaveTextContent('김정');
  });
});
