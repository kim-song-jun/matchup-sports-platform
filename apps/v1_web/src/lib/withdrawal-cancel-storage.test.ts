import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearWithdrawalCancel,
  readWithdrawalCancel,
  saveWithdrawalCancel,
  WITHDRAWAL_CANCEL_STORAGE_KEY,
} from './withdrawal-cancel-storage';

const NOW = Date.parse('2026-10-31T10:00:00.000Z');
const offer = { token: 'withdrawal-cancel-token-0001', expiresInSeconds: 600 };
const stored = () => window.sessionStorage.getItem(WITHDRAWAL_CANCEL_STORAGE_KEY);

describe('withdrawal cancel storage', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('keeps the token, expiry and return path in sessionStorage only', () => {
    expect(saveWithdrawalCancel(offer, '/my/teams?tab=joined', NOW)).toBe(true);

    expect(JSON.parse(stored()!)).toEqual({
      token: offer.token,
      expiresAt: '2026-10-31T10:10:00.000Z',
      returnTo: '/my/teams?tab=joined',
    });
    expect(window.localStorage.getItem(WITHDRAWAL_CANCEL_STORAGE_KEY)).toBeNull();
    expect(readWithdrawalCancel(NOW + 1_000)).toEqual({ token: offer.token, expiresAt: '2026-10-31T10:10:00.000Z', returnTo: '/my/teams?tab=joined' });
  });

  it.each([
    ['an absolute URL', 'https://evil.example/'],
    ['a protocol-relative URL', '//evil.example'],
    ['the login screen', '/login'],
    ['nothing', null],
    ['undefined', undefined],
  ])('stores no return path for %s', (_label, returnTo) => {
    saveWithdrawalCancel(offer, returnTo, NOW);
    expect(JSON.parse(stored()!).returnTo).toBeNull();
  });

  it('re-sanitizes a return path that was tampered with after it was stored', () => {
    window.sessionStorage.setItem(
      WITHDRAWAL_CANCEL_STORAGE_KEY,
      JSON.stringify({ token: offer.token, expiresAt: '2026-10-31T10:10:00.000Z', returnTo: 'https://evil.example/steal' }),
    );
    expect(readWithdrawalCancel(NOW)?.returnTo).toBeNull();
  });

  it('treats the expiry instant as expired and deletes the value', () => {
    saveWithdrawalCancel(offer, null, NOW);

    expect(readWithdrawalCancel(NOW + 600_000 - 1)).not.toBeNull();
    expect(readWithdrawalCancel(NOW + 600_000)).toBeNull();
    expect(stored()).toBeNull();
  });

  it('clears on request', () => {
    saveWithdrawalCancel(offer, null, NOW);
    clearWithdrawalCancel();
    expect(readWithdrawalCancel(NOW)).toBeNull();
  });

  it.each([
    ['broken JSON', 'not json'],
    ['an empty token', JSON.stringify({ token: '', expiresAt: '2026-10-31T10:10:00.000Z', returnTo: null })],
    ['an unreadable expiry', JSON.stringify({ token: offer.token, expiresAt: 'soon', returnTo: null })],
    ['a return path that is not a string', JSON.stringify({ token: offer.token, expiresAt: '2026-10-31T10:10:00.000Z', returnTo: 3 })],
  ])('reads %s as nothing and removes it', (_label, raw) => {
    window.sessionStorage.setItem(WITHDRAWAL_CANCEL_STORAGE_KEY, raw);

    expect(readWithdrawalCancel(NOW)).toBeNull();
    expect(stored()).toBeNull();
  });

  it('reports false when the browser blocks storage', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    expect(saveWithdrawalCancel(offer, null, NOW)).toBe(false);
  });
});
