import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatMatchDate, formatFullDate, getTimeBadge, cn } from '../utils';

describe('formatCurrency', () => {
  it('formats positive numbers with comma separator', () => {
    expect(formatCurrency(15000)).toBe('15,000원');
    expect(formatCurrency(1000000)).toBe('1,000,000원');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('무료');
  });

  it('handles edge case: NaN input', () => {
    // formatCurrency does not guard against NaN — documents actual behavior
    const result = formatCurrency(NaN);
    expect(result).toBe('NaN원');
  });

  it('formats small amounts', () => {
    expect(formatCurrency(500)).toBe('500원');
  });
});

describe('formatDate', () => {
  it('formats ISO date string to M/D', () => {
    const result = formatDate('2026-03-25');
    expect(result).toContain('3');
    expect(result).toContain('25');
  });

  it('handles empty string', () => {
    expect(formatDate('')).toBeDefined();
  });
});

describe('formatMatchDate', () => {
  it('returns month/day with weekday', () => {
    const result = formatMatchDate('2026-03-25'); // Wednesday
    expect(result).toContain('3/25');
  });

  it('handles edge date (Jan 1)', () => {
    const result = formatMatchDate('2026-01-01');
    expect(result).toContain('1/1');
  });
});

describe('formatFullDate', () => {
  it('returns year.month.day format', () => {
    const result = formatFullDate('2026-03-25T10:00:00');
    expect(result).toContain('2026');
    expect(result).toContain('3');
    expect(result).toContain('25');
  });
});

describe('getTimeBadge', () => {
  it('returns "오늘" for today\'s date', () => {
    const today = new Date().toISOString().split('T')[0];
    const badge = getTimeBadge(today);
    expect(badge).toBeTruthy();
    expect(badge?.text).toBe('오늘');
  });

  it('returns "내일" for tomorrow', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const badge = getTimeBadge(tomorrow);
    expect(badge).toBeTruthy();
    expect(badge?.text).toBe('내일');
  });

  it('returns null for dates far in the future', () => {
    const farFuture = new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0];
    const badge = getTimeBadge(farFuture);
    expect(badge).toBeNull();
  });

  it('returns "오늘" for past dates (diff <= 0)', () => {
    const badge = getTimeBadge('2020-01-01');
    expect(badge).toBeTruthy();
    expect(badge?.text).toBe('오늘');
  });

  it('returns "이번 주" for dates within 7 days', () => {
    const inFiveDays = new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0];
    const badge = getTimeBadge(inFiveDays);
    expect(badge).toBeTruthy();
    expect(badge?.text).toBe('이번 주');
  });
});

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('handles undefined and null', () => {
    expect(cn('a', undefined, null, 'b')).toBe('a b');
  });
});
