import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingEmailLink,
  PENDING_EMAIL_LINK_STORAGE_KEY,
  readPendingEmailLink,
  savePendingEmailLink,
  SHARED_TAB_EMAIL_EXPOSURE_MS,
} from './pending-email-link';

const NOW = Date.parse('2026-11-01T10:00:00.000Z');
const stored = () => window.sessionStorage.getItem(PENDING_EMAIL_LINK_STORAGE_KEY);

describe('pending email link storage', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('keeps only the normalized email, the destination and the expiry, in sessionStorage', () => {
    expect(savePendingEmailLink({ email: '  Kim.Team@Example.com ', returnTo: '/matches/abc?tab=info' }, NOW)).toBe(true);

    expect(JSON.parse(stored()!)).toEqual({
      email: 'kim.team@example.com',
      returnTo: '/matches/abc?tab=info',
      expiresAt: '2026-11-01T10:10:00.000Z',
    });
    expect(window.localStorage.getItem(PENDING_EMAIL_LINK_STORAGE_KEY)).toBeNull();
    expect(readPendingEmailLink(NOW + 1_000)).toEqual({ email: 'kim.team@example.com', returnTo: '/matches/abc?tab=info' });
  });

  it('is held for 10 minutes — the shared-tab exposure window, not the social link token lifetime', () => {
    savePendingEmailLink({ email: 'kim@example.com' }, NOW);

    expect(SHARED_TAB_EMAIL_EXPOSURE_MS).toBe(10 * 60 * 1000);
    expect(readPendingEmailLink(NOW + SHARED_TAB_EMAIL_EXPOSURE_MS - 1)).toMatchObject({ email: 'kim@example.com' });
    expect(readPendingEmailLink(NOW + SHARED_TAB_EMAIL_EXPOSURE_MS)).toBeNull();
    expect(stored()).toBeNull();
  });

  it('reading does not consume the value, so a second reader sees the same answer', () => {
    savePendingEmailLink({ email: 'kim@example.com' }, NOW);

    expect(readPendingEmailLink(NOW)).toEqual({ email: 'kim@example.com', returnTo: null });
    expect(readPendingEmailLink(NOW)).toEqual({ email: 'kim@example.com', returnTo: null });
  });

  it.each([
    ['an external address', 'https://evil.example.com/x'],
    ['a protocol-relative address', '//evil.example.com'],
    ['the login screen', '/login?redirect=%2Fmy'],
    ['an empty value', ''],
  ])('does not keep %s as the destination, on save', (_label, returnTo) => {
    savePendingEmailLink({ email: 'kim@example.com', returnTo }, NOW);

    expect(JSON.parse(stored()!).returnTo).toBeNull();
  });

  it('drops an unsafe destination that was written to storage by something else, on read', () => {
    window.sessionStorage.setItem(
      PENDING_EMAIL_LINK_STORAGE_KEY,
      JSON.stringify({ email: 'kim@example.com', returnTo: 'https://evil.example.com', expiresAt: '2026-11-01T10:10:00.000Z' }),
    );

    expect(readPendingEmailLink(NOW)).toEqual({ email: 'kim@example.com', returnTo: null });
  });

  it.each(['', '   ', 'kim', 'kim@', 'kim@example', 'a b@example.com', `${'a'.repeat(250)}@example.com`])(
    'does not store %j and drops the older value so it cannot be offered instead',
    (raw) => {
      savePendingEmailLink({ email: 'older@example.com' }, NOW);

      expect(savePendingEmailLink({ email: raw }, NOW)).toBe(false);

      expect(stored()).toBeNull();
      expect(readPendingEmailLink(NOW)).toBeNull();
    },
  );

  it.each([
    ['not JSON', '{oops'],
    ['an array', '[]'],
    ['no email', JSON.stringify({ returnTo: null, expiresAt: '2026-11-01T10:10:00.000Z' })],
    ['a non-email string', JSON.stringify({ email: 'nope', returnTo: null, expiresAt: '2026-11-01T10:10:00.000Z' })],
    ['a non-string destination', JSON.stringify({ email: 'kim@example.com', returnTo: 5, expiresAt: '2026-11-01T10:10:00.000Z' })],
    ['an unparsable expiry', JSON.stringify({ email: 'kim@example.com', returnTo: null, expiresAt: 'later' })],
  ])('treats %s as empty and removes it', (_label, raw) => {
    window.sessionStorage.setItem(PENDING_EMAIL_LINK_STORAGE_KEY, raw);

    expect(readPendingEmailLink(NOW)).toBeNull();
    expect(stored()).toBeNull();
  });

  it('reports a blocked storage as not saved', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'QuotaExceededError');
    });

    expect(savePendingEmailLink({ email: 'kim@example.com' }, NOW)).toBe(false);
    expect(readPendingEmailLink(NOW)).toBeNull();
  });

  it('clear removes the value', () => {
    savePendingEmailLink({ email: 'kim@example.com' }, NOW);

    clearPendingEmailLink();

    expect(stored()).toBeNull();
  });
});
