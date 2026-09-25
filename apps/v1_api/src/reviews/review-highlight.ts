/**
 * The one tag a public card may show: the tag attached to the most revealed reviews.
 *
 * Nothing is returned until `REVIEW_HIGHLIGHT_MIN_REVIEWERS` distinct reviewers stand behind the
 * reviews — one person across three matches, or one team's roster after one match, would otherwise
 * be exposed as "what people say". Ties go to the lower tag code so the same reviews always give
 * the same sentence.
 */
export const REVIEW_HIGHLIGHT_MIN_REVIEWERS = 3;

export type ReviewHighlight = {
  tagCode: string;
  label: string;
  /** Share of the reviews carrying this tag, 0-1, two decimals. */
  rate: number;
  reviewCount: number;
};

export function pickReviewHighlight<T extends { tags: ReadonlyArray<{ tagCode: string; labelSnapshot: string }> }>(
  reviews: readonly T[],
  /** Who stands behind a review: the reviewing user for a person, the reviewing team for a team. */
  reviewerOf: (review: T) => string | null,
): ReviewHighlight | null {
  const reviewers = new Set(reviews.map(reviewerOf).filter((id): id is string => Boolean(id)));
  if (reviewers.size < REVIEW_HIGHLIGHT_MIN_REVIEWERS) return null;
  const counts = new Map<string, { label: string; count: number }>();
  for (const review of reviews) {
    // A tag repeated inside one review still counts that review once.
    for (const tagCode of new Set(review.tags.map((tag) => tag.tagCode))) {
      const label = review.tags.find((tag) => tag.tagCode === tagCode)?.labelSnapshot ?? tagCode;
      const current = counts.get(tagCode) ?? { label, count: 0 };
      current.count += 1;
      counts.set(tagCode, current);
    }
  }
  let best: { tagCode: string; label: string; count: number } | null = null;
  for (const [tagCode, { label, count }] of counts) {
    if (!best || count > best.count || (count === best.count && tagCode < best.tagCode)) best = { tagCode, label, count };
  }
  if (!best) return null;
  return {
    tagCode: best.tagCode,
    label: best.label,
    rate: Number((best.count / reviews.length).toFixed(2)),
    reviewCount: reviews.length,
  };
}
