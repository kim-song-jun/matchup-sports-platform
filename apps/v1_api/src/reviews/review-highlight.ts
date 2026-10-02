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
  const counts = new Map<string, { count: number; labels: Map<string, number> }>();
  for (const review of reviews) {
    // A tag repeated inside one review still counts that review once.
    for (const tagCode of new Set(review.tags.map((tag) => tag.tagCode))) {
      const label = review.tags.find((tag) => tag.tagCode === tagCode)?.labelSnapshot ?? tagCode;
      const current = counts.get(tagCode) ?? { count: 0, labels: new Map<string, number>() };
      current.count += 1;
      current.labels.set(label, (current.labels.get(label) ?? 0) + 1);
      counts.set(tagCode, current);
    }
  }
  let best: { tagCode: string; count: number; labels: Map<string, number> } | null = null;
  for (const [tagCode, { count, labels }] of counts) {
    if (!best || count > best.count || (count === best.count && tagCode < best.tagCode)) best = { tagCode, count, labels };
  }
  if (!best) return null;
  // Labels are snapshots and the copy may have changed over time; row order is not stable, so take
  // the most used wording (then the lowest) instead of whichever row came first.
  const label = [...best.labels.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0][0];
  return {
    tagCode: best.tagCode,
    label,
    rate: Number((best.count / reviews.length).toFixed(2)),
    reviewCount: reviews.length,
  };
}
