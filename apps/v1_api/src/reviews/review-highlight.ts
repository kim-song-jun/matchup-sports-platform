/**
 * The one tag a public card may show: the tag attached to the most revealed reviews.
 *
 * Below `REVIEW_HIGHLIGHT_MIN_REVIEWS` reviews a tag rate points at the one or two people who wrote
 * them, so nothing is returned. Ties go to the lower tag code so the same reviews always give the
 * same sentence.
 */
export const REVIEW_HIGHLIGHT_MIN_REVIEWS = 3;

export type ReviewHighlight = {
  tagCode: string;
  label: string;
  /** Share of the reviews carrying this tag, 0-1, two decimals. */
  rate: number;
  reviewCount: number;
};

export function pickReviewHighlight(
  reviews: ReadonlyArray<{ tags: ReadonlyArray<{ tagCode: string; labelSnapshot: string }> }>,
): ReviewHighlight | null {
  if (reviews.length < REVIEW_HIGHLIGHT_MIN_REVIEWS) return null;
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
