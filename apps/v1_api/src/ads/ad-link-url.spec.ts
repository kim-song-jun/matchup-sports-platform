import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { isSafePopupLink } from '../popups/popup-screen';
import { AD_LINK_MAX_LENGTH, IsSafeAdLinkUrl, isSafeAdLinkUrl } from './ad-link-url';

describe('isSafeAdLinkUrl', () => {
  it.each([
    '/tournaments/abc',
    '/events?utm_source=home#top',
    'https://everyday.example.com/event',
    'https://www.example.co.kr:8443/a?b=c',
    'HTTPS://Example.com/path',
  ])('accepts %s', (link) => {
    expect(isSafeAdLinkUrl(link)).toBe(true);
  });

  it.each([
    ['plain http', 'http://example.com/a'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html;base64,PHNjcmlwdD4='],
    ['custom app scheme', 'teameet://home'],
    ['protocol-relative', '//evil.example.com/x'],
    ['backslash protocol-relative', '/\\evil.example.com'],
    ['dot segment that normalizes to protocol-relative', '/..//evil.example.com'],
    ['current-dir segment that normalizes to protocol-relative', '/.//evil.example.com'],
    ['nested dot segment that normalizes to protocol-relative', '/a/..//evil.example.com'],
    ['encoded dot segment that normalizes to protocol-relative', '/%2e%2e//evil.example.com'],
    ['backslash inside an https url', 'https://example.com\\@evil.example.com/'],
    ['userinfo', 'https://user:pass@example.com/'],
    ['username only', 'https://admin@example.com/'],
    ['localhost', 'https://localhost/admin'],
    ['localhost subdomain', 'https://app.localhost/'],
    ['loopback v4', 'https://127.0.0.1/'],
    ['private 10/8', 'https://10.0.0.5/'],
    ['private 172.16/12', 'https://172.20.1.1/'],
    ['private 192.168/16', 'https://192.168.0.1/'],
    ['link-local', 'https://169.254.169.254/latest/meta-data'],
    ['decimal-encoded loopback', 'https://2130706433/'],
    ['ipv6 loopback', 'https://[::1]/'],
    ['ipv4-mapped ipv6 loopback', 'https://[::ffff:127.0.0.1]/'],
    ['unspecified ipv6', 'https://[::]/'],
    ['single-label host', 'https://intranet/'],
    ['internal suffix', 'https://billing.internal/'],
    ['mdns suffix', 'https://printer.local/'],
    ['whitespace', '/a b'],
    ['tab', '/a\tb'],
    ['newline', 'https://example.com/\n'],
    ['control character', '/a\u0000b'],
    ['unparsable host', 'https://exa mple.com'],
    ['empty string', ''],
    ['bare word', 'example.com'],
    ['relative path without slash', 'events/1'],
    ['too long', `/${'a'.repeat(AD_LINK_MAX_LENGTH)}`],
    ['localhost with a trailing dot', 'https://localhost./x'],
    ['internal suffix with a trailing dot', 'https://foo.internal./x'],
    ['mdns suffix with a trailing dot', 'https://printer.local./x'],
    ['single-label host with a trailing dot', 'https://intranet./x'],
    ['loopback with a trailing dot', 'https://127.0.0.1./x'],
    ['carrier-grade NAT lower edge', 'https://100.64.0.1/'],
    ['carrier-grade NAT inside', 'https://100.100.100.100/'],
    ['carrier-grade NAT upper edge', 'https://100.127.255.254/'],
  ])('rejects %s', (_label, link) => {
    expect(isSafeAdLinkUrl(link)).toBe(false);
  });

  it.each([
    'https://100.63.255.255/',
    'https://100.128.0.1/',
    'https://example.com./x',
    'https://www.example.co.kr./x',
  ])('accepts %s (just outside the blocked ranges, or a fully qualified public name)', (link) => {
    expect(isSafeAdLinkUrl(link)).toBe(true);
  });

  describe('internal paths the web app reserves', () => {
    it.each([
      '/admin',
      '/admin/',
      '/admin/ops/push-send',
      '/ADMIN',
      '/Admin/Users',
      '/admin?tab=1',
      '/admin#x',
      '/api',
      '/api/v1/health',
      '/API/v1/auth/logout',
      '/uploads',
      '/uploads/ads/banner.webp',
      '/tournament-ops',
      '/tournament-ops/abc/console',
      '/Tournament-Ops/abc',
      '/./admin',
      '/foo/../admin',
      '/foo/../../admin',
      '/%61dmin',
      '/%41dmin/users',
      '/%2561dmin',
      '/%2e%2e/admin',
      '/foo/%2e%2e/admin',
      '/foo/..%2fadmin',
      '/foo%2f..%2fadmin',
      '/%2Fadmin',
      '/ap%69/v1/health',
      '/up%6Coads/a.webp',
      '/tournament%2dops/x',
      '/admin%',
      '/%zz',
    ])('rejects %s', (link) => {
      expect(isSafeAdLinkUrl(link)).toBe(false);
    });

    it.each([
      '/',
      '/tournaments/1',
      '/home',
      '/matches?sport=futsal',
      '/administration',
      '/apis/x',
      '/uploaded/x',
      '/tournament-opsx',
      '/events/admin',
      '/events/api/v1',
      '/tournaments/1?next=/admin',
      '/tournaments/1#admin',
      '/%ED%99%88',
      '/sale/100%25',
      '/foo/../tournaments/1',
    ])('accepts %s', (link) => {
      expect(isSafeAdLinkUrl(link)).toBe(true);
    });

    it('does not apply to external https urls, whose path belongs to another site', () => {
      expect(isSafeAdLinkUrl('https://everyday.example.com/admin/event')).toBe(true);
      expect(isSafeAdLinkUrl('https://everyday.example.com/api/v1')).toBe(true);
    });
  });

  it.each([null, undefined, 42, {}, ['/a']])('rejects non-string %p', (value) => {
    expect(isSafeAdLinkUrl(value)).toBe(false);
  });

  it('never accepts a link the notice popup rule rejects', () => {
    for (const link of ['/a', 'https://example.com/a', 'https://127.0.0.1/', 'http://example.com', '//x', 'https://u@example.com/']) {
      if (isSafeAdLinkUrl(link)) expect(isSafePopupLink(link)).toBe(true);
    }
  });

  it('leaves the notice popup rule untouched: it still accepts what the ad rule now rejects', () => {
    expect(isSafePopupLink('https://127.0.0.1/')).toBe(true);
    expect(isSafePopupLink('https://user:pass@example.com/')).toBe(true);
    expect(isSafeAdLinkUrl('https://127.0.0.1/')).toBe(false);
    expect(isSafeAdLinkUrl('https://user:pass@example.com/')).toBe(false);
  });
});

describe('IsSafeAdLinkUrl decorator', () => {
  class Probe {
    @IsSafeAdLinkUrl()
    link!: string;
  }

  it('produces a validation error for an unsafe link and none for a safe one', async () => {
    expect(await validate(plainToInstance(Probe, { link: 'javascript:alert(1)' }))).toHaveLength(1);
    expect(await validate(plainToInstance(Probe, { link: '/tournaments/1' }))).toHaveLength(0);
  });
});
