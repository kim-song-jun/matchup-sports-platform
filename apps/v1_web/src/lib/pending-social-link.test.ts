import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingSocialLink,
  PENDING_SOCIAL_LINK_STORAGE_KEY,
  peekPendingSocialLink,
  savePendingSocialLink,
  takePendingSocialLink,
} from './pending-social-link';

const NOW = Date.parse('2026-10-31T10:00:00.000Z');
const hint = { next: 'sign_in_then_link', provider: 'kakao', linkToken: 'signed-link-token', linkTokenExpiresInSeconds: 1800 } as const;
const stored = () => window.sessionStorage.getItem(PENDING_SOCIAL_LINK_STORAGE_KEY);

describe('pending social link storage', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    // 읽을 때 유예 종료 시각이 지났는지도 본다 — 시계를 고정해 두어야 고정 날짜가 시간이 가도 그대로 미래다.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps the token, provider and expiry in sessionStorage only', () => {
    expect(savePendingSocialLink(hint, NOW)).toBe(true);

    expect(JSON.parse(stored()!)).toEqual({ linkToken: 'signed-link-token', provider: 'kakao', expiresAt: '2026-10-31T10:30:00.000Z' });
    expect(window.localStorage.getItem(PENDING_SOCIAL_LINK_STORAGE_KEY)).toBeNull();
    expect(takePendingSocialLink(NOW + 1_000)).toEqual({ expired: false, linkToken: 'signed-link-token', provider: 'kakao', expiresAt: '2026-10-31T10:30:00.000Z' });
  });

  it('hands out an expired marker exactly once at the expiry instant, then reads as empty', () => {
    savePendingSocialLink(hint, NOW);

    expect(takePendingSocialLink(NOW + 1_800_000 - 1)).toMatchObject({ expired: false });
    expect(takePendingSocialLink(NOW + 1_800_000)).toEqual({ provider: 'kakao', expired: true });
    expect(stored()).toBeNull();
    expect(takePendingSocialLink(NOW + 1_800_000)).toBeNull();
  });

  it('keeps the provider in the expired marker so the screen can say which login timed out', () => {
    savePendingSocialLink({ ...hint, provider: 'apple' }, NOW);
    expect(takePendingSocialLink(NOW + 3_600_000)).toEqual({ provider: 'apple', expired: true });
  });

  it('does not offer the token of an expired value', () => {
    savePendingSocialLink(hint, NOW);
    expect(takePendingSocialLink(NOW + 3_600_000)).not.toHaveProperty('linkToken');
  });

  it('does not store a hint that carries no token, and drops the older token so it cannot link the wrong provider later', () => {
    savePendingSocialLink(hint, NOW);

    expect(savePendingSocialLink({ next: 'sign_in_then_link', provider: 'apple' }, NOW)).toBe(false);

    expect(stored()).toBeNull();
    expect(takePendingSocialLink(NOW)).toBeNull();
  });

  it('replaces the previous token when a new conflict hands out another one', () => {
    savePendingSocialLink(hint, NOW);
    savePendingSocialLink({ ...hint, provider: 'apple', linkToken: 'second-token' }, NOW);

    expect(takePendingSocialLink(NOW)).toMatchObject({ linkToken: 'second-token', provider: 'apple' });
  });

  describe('withdrawal grace carried with the token', () => {
    const until = '2026-11-06T15:30:00.000Z';

    it('stores the grace end next to the token and reads it back live and expired', () => {
      savePendingSocialLink({ ...hint, withdrawalPendingUntil: until }, NOW);

      expect(JSON.parse(stored()!)).toMatchObject({ withdrawalPendingUntil: until });
      expect(peekPendingSocialLink(NOW + 1_000)).toMatchObject({ expired: false, linkToken: 'signed-link-token', withdrawalPendingUntil: until });
      // 토큰이 만료돼도 "탈퇴 계정이라는 사실과 날짜"는 남아 안내 화면이 같은 말을 한다.
      expect(peekPendingSocialLink(NOW + 3_600_000)).toEqual({ provider: 'kakao', expired: true, withdrawalPendingUntil: until });
    });

    it('keeps "withdrawal but no date" (null) apart from "not a withdrawal" (absent)', () => {
      savePendingSocialLink({ ...hint, withdrawalPendingUntil: null }, NOW);
      expect(JSON.parse(stored()!)).toHaveProperty('withdrawalPendingUntil', null);
      expect(peekPendingSocialLink(NOW)).toHaveProperty('withdrawalPendingUntil', null);

      savePendingSocialLink(hint, NOW);
      expect(JSON.parse(stored()!)).not.toHaveProperty('withdrawalPendingUntil');
      expect(peekPendingSocialLink(NOW)).not.toHaveProperty('withdrawalPendingUntil');
    });

    it('replaces a withdrawal marker left by an earlier conflict instead of merging it into a plain one', () => {
      savePendingSocialLink({ ...hint, withdrawalPendingUntil: until }, NOW);
      savePendingSocialLink({ ...hint, linkToken: 'second-token' }, NOW);

      expect(peekPendingSocialLink(NOW)).toMatchObject({ linkToken: 'second-token' });
      expect(peekPendingSocialLink(NOW)).not.toHaveProperty('withdrawalPendingUntil');
    });

    // 날짜가 깨졌다고 토큰까지 버리면 자동 연결이 조용히 사라진다 — 토큰은 남기고 날짜만 모르는 것(null)으로 읽는다.
    it.each([
      ['an unreadable date', 'someday'],
      ['a number', 1_793_000_000_000],
      ['an object', { until: '2026-11-06T15:30:00.000Z' }],
      ['a boolean', true],
    ])('keeps the token and reads the grace end as unknown when it is %s', (_label, bad) => {
      window.sessionStorage.setItem(
        PENDING_SOCIAL_LINK_STORAGE_KEY,
        JSON.stringify({ linkToken: 'surviving-token', provider: 'kakao', expiresAt: '2026-10-31T10:30:00.000Z', withdrawalPendingUntil: bad }),
      );

      expect(peekPendingSocialLink(NOW)).toEqual({
        expired: false,
        linkToken: 'surviving-token',
        provider: 'kakao',
        expiresAt: '2026-10-31T10:30:00.000Z',
        withdrawalPendingUntil: null,
      });
      expect(takePendingSocialLink(NOW)).toMatchObject({ expired: false, linkToken: 'surviving-token', withdrawalPendingUntil: null });
      expect(stored()).not.toBeNull();
    });

    it('reads a grace end that has already passed as unknown, keeping the withdrawal marker and the token', () => {
      window.sessionStorage.setItem(
        PENDING_SOCIAL_LINK_STORAGE_KEY,
        JSON.stringify({ linkToken: 'surviving-token', provider: 'kakao', expiresAt: '2026-10-31T10:30:00.000Z', withdrawalPendingUntil: '2026-10-30T00:00:00.000Z' }),
      );

      expect(peekPendingSocialLink(NOW)).toMatchObject({ expired: false, linkToken: 'surviving-token', withdrawalPendingUntil: null });
    });

    it('does not store a grace end that is already past either', () => {
      savePendingSocialLink({ ...hint, withdrawalPendingUntil: '2026-10-30T00:00:00.000Z' }, NOW);
      expect(JSON.parse(stored()!)).toHaveProperty('withdrawalPendingUntil', null);
    });

    it('turns the date into unknown at the instant it passes, before and after', () => {
      savePendingSocialLink({ ...hint, linkTokenExpiresInSeconds: 86_400_000, withdrawalPendingUntil: until }, NOW);

      const endsAt = Date.parse(until);
      expect(peekPendingSocialLink(endsAt - 1)).toMatchObject({ withdrawalPendingUntil: until });
      expect(peekPendingSocialLink(endsAt)).toMatchObject({ withdrawalPendingUntil: null });
      expect(peekPendingSocialLink(endsAt + 1)).toMatchObject({ expired: false, linkToken: 'signed-link-token', withdrawalPendingUntil: null });
    });
  });

  it('clears on request', () => {
    savePendingSocialLink(hint, NOW);
    clearPendingSocialLink();
    expect(takePendingSocialLink(NOW)).toBeNull();
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

    expect(takePendingSocialLink(NOW)).toBeNull();
    expect(stored()).toBeNull();
  });

  it('reports false when the browser blocks storage, instead of pretending the token was kept', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(savePendingSocialLink(hint, NOW)).toBe(false);
  });

  it('does not leave the previous token behind when the new one cannot be written', () => {
    savePendingSocialLink(hint, NOW);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    expect(savePendingSocialLink({ ...hint, provider: 'apple', linkToken: 'second-token' }, NOW)).toBe(false);

    expect(takePendingSocialLink(NOW)).toBeNull();
  });
});

describe('peekPendingSocialLink', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('answers the same however many screens look, and leaves a live value exactly as it was', () => {
    savePendingSocialLink(hint, NOW);
    const before = stored();

    const first = peekPendingSocialLink(NOW + 1_000);
    const second = peekPendingSocialLink(NOW + 2_000);

    expect(first).toEqual({ expired: false, linkToken: 'signed-link-token', provider: 'kakao', expiresAt: '2026-10-31T10:30:00.000Z' });
    expect(second).toEqual(first);
    expect(stored()).toBe(before);
  });

  it('reports an expired value as the expired marker every time without deleting it, so the resolver can still be the one to consume it', () => {
    savePendingSocialLink(hint, NOW);
    const before = stored();
    const afterExpiry = NOW + 1_800_000;

    expect(peekPendingSocialLink(afterExpiry)).toEqual({ provider: 'kakao', expired: true });
    expect(peekPendingSocialLink(afterExpiry)).toEqual({ provider: 'kakao', expired: true });
    expect(stored()).toBe(before);

    expect(takePendingSocialLink(afterExpiry)).toEqual({ provider: 'kakao', expired: true });
    expect(peekPendingSocialLink(afterExpiry)).toBeNull();
  });

  it('a banner peeking before the resolver takes cannot make the resolver miss the expiry', () => {
    savePendingSocialLink(hint, NOW);
    const afterExpiry = NOW + 3_600_000;

    peekPendingSocialLink(afterExpiry);

    expect(takePendingSocialLink(afterExpiry)).toEqual({ provider: 'kakao', expired: true });
  });

  it.each([
    ['broken JSON', '{"linkToken":'],
    ['an empty token', JSON.stringify({ linkToken: '', provider: 'kakao', expiresAt: '2026-10-31T10:30:00.000Z' })],
    ['an unreadable expiry', JSON.stringify({ linkToken: 't', provider: 'kakao', expiresAt: 'tomorrow-ish' })],
  ])('reads %s as nothing but does not touch it — only take removes it', (_label, raw) => {
    window.sessionStorage.setItem(PENDING_SOCIAL_LINK_STORAGE_KEY, raw);

    expect(peekPendingSocialLink(NOW)).toBeNull();
    expect(stored()).toBe(raw);

    expect(takePendingSocialLink(NOW)).toBeNull();
    expect(stored()).toBeNull();
  });

  it('is null when nothing is stored, and when the browser blocks reading', () => {
    expect(peekPendingSocialLink(NOW)).toBeNull();

    savePendingSocialLink(hint, NOW);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(peekPendingSocialLink(NOW)).toBeNull();
    vi.restoreAllMocks();
  });
});
