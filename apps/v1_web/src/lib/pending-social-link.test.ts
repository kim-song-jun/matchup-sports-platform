import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingSocialLink,
  PENDING_SOCIAL_LINK_STORAGE_KEY,
  readPendingSocialLink,
  savePendingSocialLink,
} from './pending-social-link';

const NOW = Date.parse('2026-10-31T10:00:00.000Z');
const hint = { next: 'sign_in_then_link', provider: 'kakao', linkToken: 'signed-link-token', linkTokenExpiresInSeconds: 600 } as const;
const stored = () => window.sessionStorage.getItem(PENDING_SOCIAL_LINK_STORAGE_KEY);

describe('pending social link storage', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('keeps the token, provider and expiry in sessionStorage only', () => {
    expect(savePendingSocialLink(hint, NOW)).toBe(true);

    expect(JSON.parse(stored()!)).toEqual({ linkToken: 'signed-link-token', provider: 'kakao', expiresAt: '2026-10-31T10:10:00.000Z' });
    expect(window.localStorage.getItem(PENDING_SOCIAL_LINK_STORAGE_KEY)).toBeNull();
    expect(readPendingSocialLink(NOW + 1_000)).toEqual({ linkToken: 'signed-link-token', provider: 'kakao', expiresAt: '2026-10-31T10:10:00.000Z' });
  });

  it('treats the expiry instant as expired, deletes the value, and stays empty afterwards', () => {
    savePendingSocialLink(hint, NOW);

    expect(readPendingSocialLink(NOW + 600_000 - 1)).not.toBeNull();
    expect(readPendingSocialLink(NOW + 600_000)).toBeNull();
    expect(stored()).toBeNull();
    expect(readPendingSocialLink(NOW)).toBeNull();
  });

  it('does not store a hint that carries no token, and drops the older token so it cannot link the wrong provider later', () => {
    savePendingSocialLink(hint, NOW);

    expect(savePendingSocialLink({ next: 'sign_in_then_link', provider: 'apple' }, NOW)).toBe(false);

    expect(stored()).toBeNull();
    expect(readPendingSocialLink(NOW)).toBeNull();
  });

  it('replaces the previous token when a new conflict hands out another one', () => {
    savePendingSocialLink(hint, NOW);
    savePendingSocialLink({ ...hint, provider: 'apple', linkToken: 'second-token' }, NOW);

    expect(readPendingSocialLink(NOW)).toMatchObject({ linkToken: 'second-token', provider: 'apple' });
  });

  it('clears on request', () => {
    savePendingSocialLink(hint, NOW);
    clearPendingSocialLink();
    expect(readPendingSocialLink(NOW)).toBeNull();
  });

  it.each([
    ['broken JSON', '{"linkToken":'],
    ['a non-object', '"token"'],
    ['an empty token', JSON.stringify({ linkToken: '', provider: 'kakao', expiresAt: '2026-10-31T10:10:00.000Z' })],
    ['a provider that cannot be linked', JSON.stringify({ linkToken: 't', provider: 'naver', expiresAt: '2026-10-31T10:10:00.000Z' })],
    ['an unreadable expiry', JSON.stringify({ linkToken: 't', provider: 'kakao', expiresAt: 'tomorrow-ish' })],
    ['a missing expiry', JSON.stringify({ linkToken: 't', provider: 'kakao' })],
  ])('reads %s as nothing and removes it', (_label, raw) => {
    window.sessionStorage.setItem(PENDING_SOCIAL_LINK_STORAGE_KEY, raw);

    expect(readPendingSocialLink(NOW)).toBeNull();
    expect(stored()).toBeNull();
  });

  it('reports false when the browser blocks storage, instead of pretending the token was kept', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(savePendingSocialLink(hint, NOW)).toBe(false);
  });
});
