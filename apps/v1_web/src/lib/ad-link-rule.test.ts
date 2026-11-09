import { describe, expect, it } from 'vitest';
import { AD_LINK_MAX_LENGTH, checkAdLink } from './ad-link-rule';

// The accept/reject tables below are copied from `apps/v1_api/src/ads/ad-link-url.spec.ts`. When the server
// rule changes, change both: a link the server refuses must not pass here, and one it accepts must not be blocked.

const ACCEPTED = [
  '/tournaments/abc',
  '/events?utm_source=home#top',
  'https://everyday.example.com/event',
  'https://www.example.co.kr:8443/a?b=c',
  'HTTPS://Example.com/path',
  'https://100.63.255.255/',
  'https://100.128.0.1/',
  'https://example.com./x',
  'https://www.example.co.kr./x',
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
  'https://everyday.example.com/admin/event',
  'https://everyday.example.com/api/v1',
];

const REJECTED: Array<[label: string, link: string]> = [
  ['plain http', 'http://example.com/a'],
  ['javascript scheme', 'javascript:alert(1)'],
  ['data scheme', 'data:text/html;base64,PHNjcmlwdD4='],
  ['custom app scheme', 'teameet://home'],
  ['protocol-relative', '//evil.example.com/x'],
  ['backslash protocol-relative', '/\\evil.example.com'],
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
];

const RESERVED_PATHS = [
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
];

// In-app paths whose dot segments collapse into a protocol-relative url, the same values the public link guard refuses.
const NORMALISES_TO_ANOTHER_SITE = [
  '/..//evil.example.com',
  '/.//evil.example.com',
  '/a/..//evil.example.com',
  '/a/b/../..//evil.example.com',
  '/%2e%2e//evil.example.com',
  '/a/%2e%2e//evil.example.com',
  '/a/..%2f/evil.example.com',
];

describe('checkAdLink', () => {
  it.each(ACCEPTED)('accepts %s', (link) => {
    expect(checkAdLink(link)).toEqual({ ok: true });
  });

  it.each(REJECTED)('rejects %s and says why', (_label, link) => {
    expect(checkAdLink(link)).toEqual({ ok: false, reason: expect.stringMatching(/\S/) });
  });

  it.each(RESERVED_PATHS)('rejects the reserved in-app path %s', (link) => {
    expect(checkAdLink(link)).toEqual({ ok: false, reason: expect.stringMatching(/\S/) });
  });

  it.each(['/admin/ops/push-send', '/API/v1/auth/logout', '/%61dmin', '/foo/../uploads/a.webp', '/tournament-ops/abc/console'])(
    'names the blocked areas when rejecting %s',
    (link) => {
      expect(checkAdLink(link)).toEqual({ ok: false, reason: expect.stringContaining('/admin, /api, /uploads, /tournament-ops') });
    },
  );

  it.each(NORMALISES_TO_ANOTHER_SITE)('rejects %s, which resolves to another site once dot segments are applied', (link) => {
    expect(checkAdLink(link)).toEqual({ ok: false, reason: expect.stringContaining('//로 시작하는 주소가 돼요') });
  });

  it.each([
    ['http://example.com/a', '/로 시작하는 앱 안 경로나 https:// 주소'],
    ['//evil.example.com/x', '//로 시작하는 주소'],
    ['https://user:pass@example.com/', '아이디·비밀번호'],
    ['https://localhost/admin', 'localhost'],
    ['https://192.168.0.1/', '내부망'],
    ['https://[::1]/', 'IPv6'],
    ['https://intranet/', '점이 없는 이름'],
    ['https://billing.internal/', '내부 전용 이름'],
    ['/a b', '공백'],
    ['https://exa mple.com', '공백'],
  ])('explains %s by what is wrong with it', (link, expected) => {
    expect(checkAdLink(link)).toEqual({ ok: false, reason: expect.stringContaining(expected) });
  });

  it('gives a different reason for each kind of problem, so the owner knows which part to change', () => {
    const reasons = new Set(
      ['http://x.com', '//x.com', '/admin', 'https://u:p@x.com/', 'https://localhost/', 'https://[::1]/', 'https://intranet/', 'https://a.local/']
        .map((link) => (checkAdLink(link) as { reason: string }).reason),
    );
    expect(reasons.size).toBe(8);
  });
});
