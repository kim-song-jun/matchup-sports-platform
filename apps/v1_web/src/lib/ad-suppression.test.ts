import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPopupSuppressed, suppressPopupForToday } from './ad-suppression';

// KST is UTC+9: 2026-11-08T14:59:59Z is 23:59:59 on Nov 8 in Korea, 2026-11-08T15:00:00Z is 00:00:00 on Nov 9.
const KST_NOV_8_LAST_SECOND = new Date('2026-11-08T14:59:59.999Z');
const KST_NOV_9_MIDNIGHT = new Date('2026-11-08T15:00:00.000Z');
const KST_NOV_9_LAST_SECOND = new Date('2026-11-09T14:59:59.999Z');
const KST_NOV_10_MIDNIGHT = new Date('2026-11-09T15:00:00.000Z');

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('popup suppression by KST day', () => {
  it('is not suppressed before the campaign was ever closed', () => {
    expect(isPopupSuppressed('never-closed', KST_NOV_9_MIDNIGHT)).toBe(false);
  });

  it('suppresses until the KST midnight even though the UTC date has already changed', () => {
    suppressPopupForToday('midnight-edge', new Date('2026-11-08T05:00:00Z'));

    expect(isPopupSuppressed('midnight-edge', KST_NOV_8_LAST_SECOND)).toBe(true);
    // Same UTC date (Nov 8) as the line above, but 00:00 on Nov 9 in Korea: a UTC-day check would still suppress.
    expect(isPopupSuppressed('midnight-edge', KST_NOV_9_MIDNIGHT)).toBe(false);
  });

  it('keeps suppressing across the UTC date change that happens at 09:00 KST', () => {
    suppressPopupForToday('utc-rollover', new Date('2026-11-08T15:30:00Z'));

    expect(isPopupSuppressed('utc-rollover', new Date('2026-11-08T23:59:00Z'))).toBe(true);
    expect(isPopupSuppressed('utc-rollover', KST_NOV_9_LAST_SECOND)).toBe(true);
    expect(isPopupSuppressed('utc-rollover', KST_NOV_10_MIDNIGHT)).toBe(false);
  });

  it('ends at the next KST midnight, not 24 hours after closing', () => {
    suppressPopupForToday('late-close', new Date('2026-11-08T14:00:00Z'));

    expect(isPopupSuppressed('late-close', new Date('2026-11-08T14:59:00Z'))).toBe(true);
    expect(isPopupSuppressed('late-close', new Date('2026-11-08T15:01:00Z'))).toBe(false);

    suppressPopupForToday('early-close', new Date('2026-11-08T15:01:00Z'));
    expect(isPopupSuppressed('early-close', new Date('2026-11-09T15:00:00Z'))).toBe(false);
    expect(isPopupSuppressed('early-close', new Date('2026-11-09T14:00:00Z'))).toBe(true);
  });

  it('leaves other campaigns untouched', () => {
    suppressPopupForToday('closed-campaign', KST_NOV_8_LAST_SECOND);

    expect(isPopupSuppressed('closed-campaign', KST_NOV_8_LAST_SECOND)).toBe(true);
    expect(isPopupSuppressed('another-campaign', KST_NOV_8_LAST_SECOND)).toBe(false);
  });

  it('survives a reload because it is stored in localStorage', async () => {
    suppressPopupForToday('persisted', KST_NOV_8_LAST_SECOND);

    vi.resetModules();
    const reloaded = await import('./ad-suppression');

    expect(reloaded.isPopupSuppressed('persisted', KST_NOV_8_LAST_SECOND)).toBe(true);
  });

  it('treats an unreadable stored value as not suppressed and replaces it on the next close', () => {
    window.localStorage.setItem('teameet.v1.ad-suppressed.popup.garbled', '{not a date');

    expect(isPopupSuppressed('garbled', KST_NOV_8_LAST_SECOND)).toBe(false);
    suppressPopupForToday('garbled', KST_NOV_8_LAST_SECOND);
    expect(isPopupSuppressed('garbled', KST_NOV_8_LAST_SECOND)).toBe(true);
  });

  it('drops entries from earlier days when it writes, and keeps today\'s other campaigns', () => {
    suppressPopupForToday('old-day', new Date('2026-11-07T05:00:00Z'));
    suppressPopupForToday('same-day', new Date('2026-11-08T05:00:00Z'));
    window.localStorage.setItem('unrelated-key', 'keep me');

    suppressPopupForToday('new-day', new Date('2026-11-08T06:00:00Z'));

    expect(window.localStorage.getItem('teameet.v1.ad-suppressed.popup.old-day')).toBeNull();
    expect(window.localStorage.getItem('teameet.v1.ad-suppressed.popup.same-day')).toBe('2026-11-08');
    expect(window.localStorage.getItem('unrelated-key')).toBe('keep me');
  });
});

describe('when localStorage cannot be used', () => {
  it('falls back to memory for the rest of the page session when the write is refused', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    suppressPopupForToday('quota-full', KST_NOV_8_LAST_SECOND);

    expect(isPopupSuppressed('quota-full', KST_NOV_8_LAST_SECOND)).toBe(true);
    expect(isPopupSuppressed('quota-full', KST_NOV_9_MIDNIGHT)).toBe(false);
    expect(isPopupSuppressed('other-quota-campaign', KST_NOV_8_LAST_SECOND)).toBe(false);
  });

  it('falls back to memory when reading the storage object itself throws', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(isPopupSuppressed('blocked-storage', KST_NOV_8_LAST_SECOND)).toBe(false);
    suppressPopupForToday('blocked-storage', KST_NOV_8_LAST_SECOND);
    expect(isPopupSuppressed('blocked-storage', KST_NOV_8_LAST_SECOND)).toBe(true);
  });

  it('does not pretend a memory-only suppression outlives a reload', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    suppressPopupForToday('memory-only', KST_NOV_8_LAST_SECOND);

    vi.resetModules();
    const reloaded = await import('./ad-suppression');

    expect(reloaded.isPopupSuppressed('memory-only', KST_NOV_8_LAST_SECOND)).toBe(false);
  });
});
