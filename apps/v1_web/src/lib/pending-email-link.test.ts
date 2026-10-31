import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingEmailLink,
  PENDING_EMAIL_LINK_STORAGE_KEY,
  PENDING_EMAIL_LINK_TTL_MS,
  readPendingEmailLink,
  savePendingEmailLink,
} from './pending-email-link';

const NOW = Date.parse('2026-11-01T10:00:00.000Z');
const stored = () => window.sessionStorage.getItem(PENDING_EMAIL_LINK_STORAGE_KEY);

describe('pending email link storage', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('keeps only the normalized email and its expiry, in sessionStorage', () => {
    expect(savePendingEmailLink('  Kim.Team@Gmail.com ', NOW)).toBe(true);

    expect(JSON.parse(stored()!)).toEqual({ email: 'kim.team@gmail.com', expiresAt: '2026-11-01T10:30:00.000Z' });
    expect(window.localStorage.getItem(PENDING_EMAIL_LINK_STORAGE_KEY)).toBeNull();
    expect(readPendingEmailLink(NOW + 1_000)).toBe('kim.team@gmail.com');
  });

  it('is valid for 30 minutes and reads as empty from the expiry instant on, dropping the value', () => {
    savePendingEmailLink('kim@example.com', NOW);

    expect(PENDING_EMAIL_LINK_TTL_MS).toBe(30 * 60 * 1000);
    expect(readPendingEmailLink(NOW + PENDING_EMAIL_LINK_TTL_MS - 1)).toBe('kim@example.com');
    expect(readPendingEmailLink(NOW + PENDING_EMAIL_LINK_TTL_MS)).toBeNull();
    expect(stored()).toBeNull();
  });

  it('reading does not consume the value, so a second reader sees the same answer', () => {
    savePendingEmailLink('kim@example.com', NOW);

    expect(readPendingEmailLink(NOW)).toBe('kim@example.com');
    expect(readPendingEmailLink(NOW)).toBe('kim@example.com');
  });

  it.each(['', '   ', 'kim', 'kim@', 'kim@example', 'a b@example.com', `${'a'.repeat(250)}@example.com`])(
    'does not store %j and drops the older value so it cannot be offered instead',
    (raw) => {
      savePendingEmailLink('older@example.com', NOW);

      expect(savePendingEmailLink(raw, NOW)).toBe(false);

      expect(stored()).toBeNull();
      expect(readPendingEmailLink(NOW)).toBeNull();
    },
  );

  it.each([
    ['not JSON', '{oops'],
    ['an array', '[]'],
    ['no email', JSON.stringify({ expiresAt: '2026-11-01T10:30:00.000Z' })],
    ['a non-email string', JSON.stringify({ email: 'nope', expiresAt: '2026-11-01T10:30:00.000Z' })],
    ['an unparsable expiry', JSON.stringify({ email: 'kim@example.com', expiresAt: 'later' })],
  ])('treats %s as empty and removes it', (_label, raw) => {
    window.sessionStorage.setItem(PENDING_EMAIL_LINK_STORAGE_KEY, raw);

    expect(readPendingEmailLink(NOW)).toBeNull();
    expect(stored()).toBeNull();
  });

  it('reports a blocked storage as not saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'QuotaExceededError');
    });

    expect(savePendingEmailLink('kim@example.com', NOW)).toBe(false);
    expect(readPendingEmailLink(NOW)).toBeNull();
  });

  it('clear removes the value', () => {
    savePendingEmailLink('kim@example.com', NOW);

    clearPendingEmailLink();

    expect(stored()).toBeNull();
  });
});
