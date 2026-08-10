import { describe, expect, it } from 'vitest';
import { countMissingAssists } from './result-review-warnings';

describe('countMissingAssists', () => {
  it('is total goals minus total assists (D-6: 1골 = 최대 1어시)', () => {
    expect(countMissingAssists([{ goals: 2, assists: 1 }, { goals: 1, assists: 0 }])).toBe(2);
  });

  it('never goes negative even if assists somehow exceed goals (defensive)', () => {
    expect(countMissingAssists([{ goals: 0, assists: 1 }])).toBe(0);
  });

  it('returns 0 for a scoreless game', () => {
    expect(countMissingAssists([])).toBe(0);
  });
});
