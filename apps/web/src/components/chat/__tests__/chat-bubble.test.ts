import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatChatTime, formatDateLabel, getDateKey } from '../chat-bubble';

// ── formatChatTime ────────────────────────────────────────────────────────────

describe('formatChatTime', () => {
  it('formats midnight as "오전 12:00"', () => {
    expect(formatChatTime('2025-06-15T00:00:00')).toBe('오전 12:00');
  });

  it('formats 1 AM as "오전 1:00"', () => {
    expect(formatChatTime('2025-06-15T01:00:00')).toBe('오전 1:00');
  });

  it('formats 11:59 AM as "오전 11:59"', () => {
    expect(formatChatTime('2025-06-15T11:59:00')).toBe('오전 11:59');
  });

  it('formats noon (12:00) as "오후 12:00"', () => {
    expect(formatChatTime('2025-06-15T12:00:00')).toBe('오후 12:00');
  });

  it('formats 1 PM as "오후 1:00"', () => {
    expect(formatChatTime('2025-06-15T13:00:00')).toBe('오후 1:00');
  });

  it('formats 11 PM as "오후 11:00"', () => {
    expect(formatChatTime('2025-06-15T23:00:00')).toBe('오후 11:00');
  });

  it('zero-pads minutes to two digits', () => {
    expect(formatChatTime('2025-06-15T09:05:00')).toBe('오전 9:05');
  });

  it('does not zero-pad the hour', () => {
    const result = formatChatTime('2025-06-15T09:00:00');
    // Should be "오전 9:00", not "오전 09:00"
    expect(result).toBe('오전 9:00');
  });
});

// ── formatDateLabel ──────────────────────────────────────────────────────────

describe('formatDateLabel', () => {
  beforeEach(() => {
    // Pin "now" to 2025-06-15 (Sunday, 일)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "오늘" for a timestamp on today', () => {
    expect(formatDateLabel('2025-06-15T08:30:00')).toBe('오늘');
  });

  it('returns "오늘" for a timestamp just before midnight today', () => {
    expect(formatDateLabel('2025-06-15T23:59:59')).toBe('오늘');
  });

  it('returns "어제" for a timestamp on yesterday', () => {
    expect(formatDateLabel('2025-06-14T18:00:00')).toBe('어제');
  });

  it('returns "어제" for the very start of yesterday', () => {
    expect(formatDateLabel('2025-06-14T00:00:00')).toBe('어제');
  });

  it('returns M월 D일 (요일) format for older dates', () => {
    // 2025-06-01 is a Sunday (일)
    expect(formatDateLabel('2025-06-01T10:00:00')).toBe('6월 1일 (일)');
  });

  it('returns M월 D일 (요일) for a date 2 days ago', () => {
    // 2025-06-13 is a Friday (금)
    expect(formatDateLabel('2025-06-13T10:00:00')).toBe('6월 13일 (금)');
  });

  it('does not zero-pad month or day in the fallback format', () => {
    // 2025-01-05 is a Sunday (일) — should produce "1월 5일", not "01월 05일"
    expect(formatDateLabel('2025-01-05T10:00:00')).toBe('1월 5일 (일)');
  });
});

// ── getDateKey ───────────────────────────────────────────────────────────────

describe('getDateKey', () => {
  it('returns YYYY-M-D format (no zero-padding)', () => {
    expect(getDateKey('2025-03-03T09:00:00')).toBe('2025-3-3');
  });

  it('does not zero-pad single-digit month or day', () => {
    expect(getDateKey('2025-01-05T00:00:00')).toBe('2025-1-5');
  });

  it('handles double-digit month and day correctly', () => {
    expect(getDateKey('2025-12-25T00:00:00')).toBe('2025-12-25');
  });

  it('produces the same key for different times on the same day', () => {
    const morning = getDateKey('2025-06-15T08:00:00');
    const evening = getDateKey('2025-06-15T22:30:00');
    expect(morning).toBe(evening);
  });

  it('produces different keys for consecutive days', () => {
    const day1 = getDateKey('2025-06-15T12:00:00');
    const day2 = getDateKey('2025-06-16T12:00:00');
    expect(day1).not.toBe(day2);
    expect(day1).toBe('2025-6-15');
    expect(day2).toBe('2025-6-16');
  });
});
