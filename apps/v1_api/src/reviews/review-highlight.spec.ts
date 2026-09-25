import { pickReviewHighlight, REVIEW_HIGHLIGHT_MIN_REVIEWS } from './review-highlight';

const review = (...codes: string[]) => ({ tags: codes.map((tagCode) => ({ tagCode, labelSnapshot: `label:${tagCode}` })) });

describe('pickReviewHighlight', () => {
  it('shows nothing below the minimum — a rate over one or two reviews points at who wrote them', () => {
    const reviews = Array.from({ length: REVIEW_HIGHLIGHT_MIN_REVIEWS - 1 }, () => review('manner'));
    expect(pickReviewHighlight(reviews)).toBeNull();
  });

  it('picks the tag on the most reviews and reports its share of all reviews', () => {
    const highlight = pickReviewHighlight([
      review('manner', 'punctual'),
      review('manner'),
      review('teamwork'),
      review(),
    ]);
    expect(highlight).toEqual({ tagCode: 'manner', label: 'label:manner', rate: 0.5, reviewCount: 4 });
  });

  it('counts a tag once per review even when a review repeats it', () => {
    const highlight = pickReviewHighlight([review('manner', 'manner'), review('punctual'), review('punctual')]);
    expect(highlight?.tagCode).toBe('punctual');
    expect(highlight?.rate).toBe(0.67);
  });

  it('breaks ties the same way every time', () => {
    const reviews = [review('teamwork'), review('manner'), review()];
    expect(pickReviewHighlight(reviews)?.tagCode).toBe('manner');
    expect(pickReviewHighlight([...reviews].reverse())?.tagCode).toBe('manner');
  });

  it('shows nothing when enough reviews carry no tag at all', () => {
    expect(pickReviewHighlight([review(), review(), review()])).toBeNull();
  });
});
