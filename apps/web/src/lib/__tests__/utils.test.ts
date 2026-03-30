import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cn,
  formatCurrency,
  formatAmount,
  formatDate,
  formatMatchDate,
  formatFullDate,
  formatDateDot,
  formatDateCompact,
  formatDateShort,
  formatDateTime,
  friendlyLevel,
  getTimeBadge,
} from '../utils';

// ── cn ──────────────────────────────────────────────────────────────────────

describe('cn', () => {
  it('merges multiple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('deduplicates conflicting tailwind classes — last wins', () => {
    expect(cn('text-sm', 'text-lg')).toBe('text-lg');
  });

  it('ignores falsy values (false, undefined, null)', () => {
    expect(cn('foo', false, undefined, null, 'bar')).toBe('foo bar');
  });

  it('handles conditional object syntax', () => {
    expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500');
  });

  it('returns empty string when no classes are given', () => {
    expect(cn()).toBe('');
  });
});

// ── formatCurrency ───────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('returns "무료" for 0', () => {
    expect(formatCurrency(0)).toBe('무료');
  });

  it('formats 15000 as "15,000원"', () => {
    expect(formatCurrency(15000)).toBe('15,000원');
  });

  it('formats small amounts without separator', () => {
    expect(formatCurrency(500)).toBe('500원');
  });

  it('formats large amounts with multiple comma separators', () => {
    expect(formatCurrency(1000000)).toBe('1,000,000원');
  });
});

// ── formatAmount ─────────────────────────────────────────────────────────────

describe('formatAmount', () => {
  it('returns "0원" for 0 — never "무료"', () => {
    expect(formatAmount(0)).toBe('0원');
  });

  it('formats 15000 as "15,000원"', () => {
    expect(formatAmount(15000)).toBe('15,000원');
  });

  it('formats large amounts with separator', () => {
    expect(formatAmount(1200000)).toBe('1,200,000원');
  });
});

// ── Date formatters ──────────────────────────────────────────────────────────
// Reference: 2025-03-03 is a Monday (월).

describe('formatDate', () => {
  it('returns M/D (요일) — 2025-03-03 is 3/3 (월)', () => {
    expect(formatDate('2025-03-03T09:00:00')).toBe('3/3 (월)');
  });

  it('does not zero-pad single-digit month or day', () => {
    // 2025-01-05 is a Sunday (일)
    expect(formatDate('2025-01-05T00:00:00')).toBe('1/5 (일)');
  });

  it('handles December 25 correctly', () => {
    // 2025-12-25 is a Thursday (목)
    expect(formatDate('2025-12-25T00:00:00')).toBe('12/25 (목)');
  });
});

describe('formatMatchDate', () => {
  it('is an alias of formatDate — produces identical output', () => {
    const input = '2025-03-03T09:00:00';
    expect(formatMatchDate(input)).toBe(formatDate(input));
  });
});

describe('formatFullDate', () => {
  it('returns YYYY년 M월 D일 (요일) — 2025-03-03 is 2025년 3월 3일 (월)', () => {
    expect(formatFullDate('2025-03-03T09:00:00')).toBe('2025년 3월 3일 (월)');
  });

  it('does not zero-pad single-digit month or day', () => {
    // 2025-01-05 is a Sunday (일)
    expect(formatFullDate('2025-01-05T00:00:00')).toBe('2025년 1월 5일 (일)');
  });
});

describe('formatDateDot', () => {
  it('returns YYYY.M.D (요일) — 2025-03-03 is 2025.3.3 (월)', () => {
    expect(formatDateDot('2025-03-03T09:00:00')).toBe('2025.3.3 (월)');
  });

  it('does not zero-pad single-digit values', () => {
    // 2025-01-05 is a Sunday (일)
    expect(formatDateDot('2025-01-05T00:00:00')).toBe('2025.1.5 (일)');
  });
});

describe('formatDateCompact', () => {
  it('returns YYYY.MM.DD with zero-padding — 2025-03-03 is 2025.03.03', () => {
    expect(formatDateCompact('2025-03-03T09:00:00')).toBe('2025.03.03');
  });

  it('zero-pads single-digit month and day', () => {
    expect(formatDateCompact('2025-01-05T00:00:00')).toBe('2025.01.05');
  });

  it('leaves two-digit values unchanged', () => {
    expect(formatDateCompact('2025-12-25T00:00:00')).toBe('2025.12.25');
  });
});

describe('formatDateShort', () => {
  it('returns "3월 3일" for 2025-03-03', () => {
    // toLocaleDateString ko-KR month:'short' day:'numeric'
    expect(formatDateShort('2025-03-03T09:00:00')).toBe('3월 3일');
  });

  it('returns "1월 5일" for 2025-01-05', () => {
    expect(formatDateShort('2025-01-05T00:00:00')).toBe('1월 5일');
  });
});

describe('formatDateTime', () => {
  it('includes year, month, day, and minute components', () => {
    // toLocaleDateString ko-KR produces Korean AM/PM format: "2025년 3월 3일 오후 02:05"
    const result = formatDateTime('2025-03-03T14:05:00');
    expect(result).toContain('2025');
    expect(result).toContain('3');   // month
    expect(result).toContain('05');  // zero-padded minutes
  });

  it('distinguishes AM and PM times', () => {
    const am = formatDateTime('2025-03-03T09:00:00');
    const pm = formatDateTime('2025-03-03T14:00:00');
    // CI locale may output "오전/오후" or "AM/PM" depending on environment
    const amPattern = /오전|AM/i;
    const pmPattern = /오후|PM/i;
    expect(am).toMatch(amPattern);
    expect(pm).toMatch(pmPattern);
  });

  it('returns a non-empty string for midnight', () => {
    const result = formatDateTime('2025-03-03T00:00:00');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── friendlyLevel ────────────────────────────────────────────────────────────

describe('friendlyLevel', () => {
  it('returns "누구나" when both args are null', () => {
    expect(friendlyLevel(null, null)).toBe('누구나');
  });

  it('returns "누구나" when min is undefined', () => {
    expect(friendlyLevel(undefined, 5)).toBe('누구나');
  });

  it('returns "누구나" when max is undefined', () => {
    expect(friendlyLevel(1, undefined)).toBe('누구나');
  });

  it('returns "누구나" for full range 1-5', () => {
    expect(friendlyLevel(1, 5)).toBe('누구나');
  });

  it('returns "초심자" for min=1, max=2', () => {
    expect(friendlyLevel(1, 2)).toBe('초심자');
  });

  it('returns "초급~중급" for min=2, max=3', () => {
    expect(friendlyLevel(2, 3)).toBe('초급~중급');
  });

  it('returns "중급 이상" for min=3, max=4', () => {
    expect(friendlyLevel(3, 4)).toBe('중급 이상');
  });

  it('returns "상급자" for min=4, max=5', () => {
    expect(friendlyLevel(4, 5)).toBe('상급자');
  });

  it('returns "상급자" when min=5, max=5', () => {
    expect(friendlyLevel(5, 5)).toBe('상급자');
  });
});

// ── getTimeBadge ─────────────────────────────────────────────────────────────

describe('getTimeBadge', () => {
  // getTimeBadge uses Math.ceil((target - now) / msPerDay).
  // To control the boundary precisely we pin "now" to midnight so that
  // diff values land exactly on integers without fractional rounding effects.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T00:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns { text: "오늘" } for a timestamp at the same moment as now (diff=0)', () => {
    // target === now → diff = Math.ceil(0) = 0 → "오늘"
    const result = getTimeBadge('2025-06-15T00:00:00');
    expect(result).not.toBeNull();
    expect(result!.text).toBe('오늘');
  });

  it('uses a red color class for "오늘"', () => {
    const result = getTimeBadge('2025-06-15T00:00:00');
    expect(result!.color).toContain('red');
  });

  it('returns "오늘" for past dates (diff <= 0)', () => {
    const result = getTimeBadge('2025-06-01T00:00:00');
    expect(result).not.toBeNull();
    expect(result!.text).toBe('오늘');
  });

  it('returns { text: "내일" } for exactly 1 day ahead', () => {
    // 2025-06-16T00:00:00 - 2025-06-15T00:00:00 = exactly 1 day → diff=1 → "내일"
    const result = getTimeBadge('2025-06-16T00:00:00');
    expect(result).not.toBeNull();
    expect(result!.text).toBe('내일');
  });

  it('uses a blue color class for "내일"', () => {
    const result = getTimeBadge('2025-06-16T00:00:00');
    expect(result!.color).toContain('blue');
  });

  it('returns { text: "이번 주" } for a date 5 days ahead', () => {
    const result = getTimeBadge('2025-06-20T00:00:00');
    expect(result).not.toBeNull();
    expect(result!.text).toBe('이번 주');
  });

  it('returns { text: "이번 주" } for a date exactly 7 days ahead', () => {
    const result = getTimeBadge('2025-06-22T00:00:00');
    expect(result).not.toBeNull();
    expect(result!.text).toBe('이번 주');
  });

  it('returns null for dates more than 7 days ahead', () => {
    const result = getTimeBadge('2025-06-30T00:00:00');
    expect(result).toBeNull();
  });
});
