export const REVEAL_FALLBACK_HOURS = 72;

type ReviewPairKey = { sourceId: string; reviewerUserId: string; targetUserId: string | null };

type RevealScopeInput = { sourceType: string; sourceId: string; sourceGroupId?: string | null };

/**
 * 상호 공개(reveal) 판정을 접는 단위. `isReviewRevealed()`의 pairKey에서 `sourceId` 자리에 넣는다.
 *
 * 대회 후기만 sourceId(=픽스처)가 아니라 sourceGroupId(=대회)로 접는다. 대회 후기는 중복 방지
 * 스코프 자체가 대회 단위라서, 내가 예선에서 상대를 평가하고 그 상대가 결승에서 나를 평가하면
 * 두 행의 sourceId가 다르다 — 픽스처 기준으로 맞추면 "서로 평가했는데도" 짝이 성립하지 않아
 * 상호 공개 경로가 사실상 죽고 72시간 폴백만 남는다. 대회 단위로 접으면 같은 대회 안에서
 * 어느 경기에 썼든 짝이 맞는다.
 */
export function reviewRevealScope(review: RevealScopeInput): string {
  return review.sourceType === 'tournament_fixture' && review.sourceGroupId
    ? `tournament:${review.sourceGroupId}`
    : review.sourceId;
}

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
