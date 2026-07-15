import { describe, expect, it } from 'vitest';
import { isSafeNotificationHref, safeNotificationHref, migrateV1NotificationHref } from './notification-route';

describe('isSafeNotificationHref', () => {
  it('accepts root-relative same-origin paths', () => {
    expect(isSafeNotificationHref('/matches/123')).toBe(true);
    expect(isSafeNotificationHref('/notifications')).toBe(true);
    expect(isSafeNotificationHref('/teams/t-1')).toBe(true);
    expect(isSafeNotificationHref('/home')).toBe(true);
  });

  it('rejects non-string values', () => {
    expect(isSafeNotificationHref(null)).toBe(false);
    expect(isSafeNotificationHref(undefined)).toBe(false);
    expect(isSafeNotificationHref(42)).toBe(false);
  });

  it('rejects absolute URLs with scheme', () => {
    expect(isSafeNotificationHref('https://teameet.co.kr/home')).toBe(false);
    expect(isSafeNotificationHref('http://evil.com/phish')).toBe(false);
    expect(isSafeNotificationHref('javascript:alert(1)')).toBe(false);
  });

  it('rejects protocol-relative URLs', () => {
    expect(isSafeNotificationHref('//evil.com/path')).toBe(false);
  });

  it('rejects legacy /v1/* browser paths', () => {
    expect(isSafeNotificationHref('/v1/home')).toBe(false);
    expect(isSafeNotificationHref('/v1/matches/123')).toBe(false);
    expect(isSafeNotificationHref('/v1')).toBe(false);
  });

  it('rejects /login to avoid redirect loops', () => {
    expect(isSafeNotificationHref('/login')).toBe(false);
    expect(isSafeNotificationHref('/login?redirect=%2Fhome')).toBe(false);
  });
});

describe('safeNotificationHref', () => {
  it('returns the href when valid', () => {
    expect(safeNotificationHref('/matches/123')).toBe('/matches/123');
  });

  it('returns fallback for invalid hrefs', () => {
    expect(safeNotificationHref('https://evil.com')).toBe('/notifications');
    expect(safeNotificationHref(null)).toBe('/notifications');
    expect(safeNotificationHref('/v1/home')).toBe('/notifications');
  });
});

describe('migrateV1NotificationHref', () => {
  it('strips /v1 prefix', () => {
    expect(migrateV1NotificationHref('/v1/matches/123')).toBe('/matches/123');
    expect(migrateV1NotificationHref('/v1/home')).toBe('/home');
  });

  it('maps /v1 exactly to /home', () => {
    expect(migrateV1NotificationHref('/v1')).toBe('/home');
  });

  it('leaves already-migrated paths unchanged', () => {
    expect(migrateV1NotificationHref('/matches/123')).toBe('/matches/123');
    expect(migrateV1NotificationHref('/home')).toBe('/home');
  });
});
