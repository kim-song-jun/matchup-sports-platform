import { describe, expect, it } from 'vitest';
import { resolveAdLink } from './ad-link';

describe('resolveAdLink', () => {
  it.each([
    ['/', '/'],
    ['/tournaments/123', '/tournaments/123'],
    ['/matches?sport=futsal#top', '/matches?sport=futsal#top'],
    ['/%ED%99%88', '/%ED%99%88'],
    // The href is the path the browser resolves, so what was checked is what gets followed.
    ['/a/../tournaments/1', '/tournaments/1'],
    ['/./tournaments/1?x=1', '/tournaments/1?x=1'],
  ])('treats %s as an in-app path', (value, href) => {
    expect(resolveAdLink(value)).toEqual({ kind: 'internal', href });
  });

  it.each([
    ['https://everyday.example.com/event', 'https://everyday.example.com/event'],
    ['HTTPS://EVERYDAY.example.com', 'HTTPS://EVERYDAY.example.com'],
  ])('treats %s as an external HTTPS link', (value, href) => {
    expect(resolveAdLink(value)).toEqual({ kind: 'external', href });
  });

  it.each([
    ['http scheme', 'http://everyday.example.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['app scheme', 'teameet://home'],
    ['protocol-relative url', '//evil.example.com'],
    ['backslash host trick', '/\\evil.example.com'],
    ['whitespace in the path', '/tournaments/1 2'],
    ['whitespace before the scheme', ' https://everyday.example.com'],
    ['https without a host', 'https://'],
    ['a bare relative path', 'tournaments/1'],
    ['an empty string', ''],
    ['dot segments that normalise to a protocol-relative url', '/..//evil.example.com'],
    ['a single dot that normalises to a protocol-relative url', '/.//evil.example.com'],
    ['a parent segment after a directory', '/a/..//evil.example.com'],
    ['an encoded parent segment', '/%2e%2e//evil.example.com'],
    ['a deeper path that climbs back to the root', '/a/b/../..//evil.example.com'],
    ['a null character in the path', '/tournaments/1\u0000'],
    ['a unit separator in the path', '/tournaments/\u001f1'],
    ['a delete character in the path', '/tournaments/\u007f1'],
    ['a tab hidden inside the host trick', '/\t/evil.example.com'],
    ['a control character in an https url', 'https://everyday.example.com/\u0000'],
    ['a user and password before the host', 'https://user:pw@everyday.example.com/event'],
    ['a user name before the host', 'https://admin@everyday.example.com/'],
    ['a user name that imitates a host', 'https://everyday.example.com@evil.example.com/'],
    ['a backslash inside an https url', 'https://everyday.example.com\\@evil.example.com/'],
    ['the https scheme with a different case and userinfo', 'HTTPS://u:p@everyday.example.com'],
    // The render guard applies the same rule the server applies on save.
    ['a loopback address', 'https://127.0.0.1/event'],
    ['localhost', 'https://localhost/event'],
    ['a private network address', 'https://192.168.0.10/'],
    ['a carrier-grade NAT address', 'https://100.64.1.1/'],
    ['an IPv6 address', 'https://[2001:db8::1]/'],
    ['a single-label host', 'https://intranet/'],
    ['an internal-only suffix', 'https://printer.local/'],
    ['the admin console', '/admin/users'],
    ['the API', '/api/v1/ads/active'],
    ['an encoded admin path', '/%61dmin'],
    ['the uploads folder', '/uploads/ads/a.webp'],
    ['the tournament operations console', '/tournament-ops/1'],
    ['a link longer than the stored limit', `/tournaments/${'1'.repeat(500)}`],
  ])('rejects %s', (_label, value) => {
    expect(resolveAdLink(value)).toBeNull();
  });

  it('rejects a missing link', () => {
    expect(resolveAdLink(null)).toBeNull();
    expect(resolveAdLink(undefined)).toBeNull();
  });
});
