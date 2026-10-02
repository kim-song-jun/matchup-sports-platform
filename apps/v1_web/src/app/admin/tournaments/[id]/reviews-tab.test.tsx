import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewsTab } from './reviews-tab';
import type { V1AdminTournamentReview } from '@/types/api';

const hideMutate = vi.fn();
const unhideMutate = vi.fn();

const review: V1AdminTournamentReview = {
  id: 'review-1',
  authorId: 'user-1',
  authorNickname: '테스트유저',
  authorProfileImageUrl: null,
  teamName: '테스트팀',
  rating: 5,
  comment: '즐거운 경기였어요.',
  photoUrls: [],
  createdAt: '2026-07-18T00:00:00.000Z',
  hiddenAt: null,
  hiddenReason: null,
};

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AdminTournamentReviews: () => ({
    data: { items: [review], total: 1, page: 1, pageSize: 10 },
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isFetching: false,
  }),
  useV1HideReview: () => ({ mutate: hideMutate, isPending: false }),
  useV1UnhideReview: () => ({ mutate: unhideMutate, isPending: false }),
}));

describe('ReviewsTab permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows review data without mutation affordances when the admin has read-only access', () => {
    render(<ReviewsTab tournamentId="tournament-1" canWrite={false} showToast={vi.fn()} />);

    expect(screen.getByText(review.authorNickname)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('조회 전용 권한');
    expect(screen.queryByRole('button', { name: '숨기기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '공개로 전환' })).not.toBeInTheDocument();
  });

  it('keeps hide affordance for mutation-capable admins', () => {
    render(<ReviewsTab tournamentId="tournament-1" canWrite showToast={vi.fn()} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '숨기기' })).toBeEnabled();
  });
});
