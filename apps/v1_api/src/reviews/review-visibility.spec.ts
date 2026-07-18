import { isReviewRevealed, REVEAL_FALLBACK_HOURS } from './review-visibility';

describe('isReviewRevealed', () => {
  const baseReview = {
    sourceId: 'match-1',
    reviewerUserId: 'user-a',
    targetUserId: 'user-b',
    submittedAt: new Date('2026-07-19T00:00:00Z'),
  };

  it('상대(user-b→user-a, 같은 sourceId)가 이미 제출했으면 즉시 공개', () => {
    const reverseReviews = [{ sourceId: 'match-1', reviewerUserId: 'user-b', targetUserId: 'user-a' }];
    const now = new Date('2026-07-19T00:10:00Z'); // 10분 후
    expect(isReviewRevealed(baseReview, reverseReviews, now)).toBe(true);
  });

  it('상대가 안 냈고 72시간 미만이면 비공개', () => {
    const now = new Date('2026-07-21T23:59:00Z'); // 71시간 59분 후
    expect(isReviewRevealed(baseReview, [], now)).toBe(false);
  });

  it('상대가 안 냈어도 72시간 지나면 공개', () => {
    const now = new Date('2026-07-22T00:01:00Z'); // 72시간 1분 후
    expect(isReviewRevealed(baseReview, [], now)).toBe(true);
  });

  it('reverseReviews에 다른 sourceId나 다른 사람 리뷰가 섞여 있어도 정확히 매칭한다', () => {
    const reverseReviews = [
      { sourceId: 'match-2', reviewerUserId: 'user-b', targetUserId: 'user-a' }, // 다른 매치
      { sourceId: 'match-1', reviewerUserId: 'user-c', targetUserId: 'user-a' }, // 다른 사람
    ];
    const now = new Date('2026-07-19T00:10:00Z');
    expect(isReviewRevealed(baseReview, reverseReviews, now)).toBe(false);
  });
});
