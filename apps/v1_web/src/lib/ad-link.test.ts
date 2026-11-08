import { describe, expect, it } from 'vitest';
import { resolveAdLink } from './ad-link';

describe('resolveAdLink', () => {
  it.each([
    ['/', '/'],
    ['/tournaments/123', '/tournaments/123'],
    ['/matches?sport=futsal#top', '/matches?sport=futsal#top'],
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
  ])('rejects %s', (_label, value) => {
    expect(resolveAdLink(value)).toBeNull();
  });

  it('rejects a missing link', () => {
    expect(resolveAdLink(null)).toBeNull();
    expect(resolveAdLink(undefined)).toBeNull();
  });
});
