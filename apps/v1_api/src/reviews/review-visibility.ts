export const REVEAL_FALLBACK_HOURS = 72;

type ReviewPairKey = { sourceId: string; reviewerUserId: string; targetUserId: string | null };

export function isReviewRevealed(
  review: ReviewPairKey & { submittedAt: Date },
  reverseReviews: ReviewPairKey[],
  now: Date,
): boolean {
  const partnerSubmitted = reverseReviews.some(
    (candidate) =>
      candidate.sourceId === review.sourceId &&
      candidate.reviewerUserId === review.targetUserId &&
      candidate.targetUserId === review.reviewerUserId,
  );
  if (partnerSubmitted) return true;

  const elapsedMs = now.getTime() - review.submittedAt.getTime();
  return elapsedMs >= REVEAL_FALLBACK_HOURS * 60 * 60 * 1000;
}
