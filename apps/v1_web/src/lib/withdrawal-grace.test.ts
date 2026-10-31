import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usableWithdrawalDate } from './withdrawal-grace';

const UNTIL = '2026-11-06T15:30:00.000Z';

describe('usableWithdrawalDate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });
  afterEach(() => vi.useRealTimers());

  it('keeps a date that has not come yet', () => {
    vi.setSystemTime(Date.parse(UNTIL) - 1);
    expect(usableWithdrawalDate(UNTIL)).toBe(UNTIL);
  });

  it('treats the instant the grace ends, and anything after it, as unknown', () => {
    vi.setSystemTime(Date.parse(UNTIL));
    expect(usableWithdrawalDate(UNTIL)).toBeNull();
    vi.setSystemTime(Date.parse(UNTIL) + 86_400_000);
    expect(usableWithdrawalDate(UNTIL)).toBeNull();
  });

  it('judges against the time it is given instead of the clock when one is passed', () => {
    vi.setSystemTime(Date.parse(UNTIL) + 1);
    expect(usableWithdrawalDate(UNTIL, Date.parse(UNTIL) - 1)).toBe(UNTIL);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an unreadable string', 'someday'],
    ['an empty string', ''],
    ['a number', Date.parse(UNTIL)],
    ['an object', { until: UNTIL }],
    ['a boolean', true],
  ])('reads %s as unknown', (_label, value) => {
    vi.setSystemTime(Date.parse(UNTIL) - 86_400_000);
    expect(usableWithdrawalDate(value)).toBeNull();
  });
});
