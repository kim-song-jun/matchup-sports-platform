import { describe, expect, it } from 'vitest';
import { canonicalUrl, getSiteUrl, buildPageMetadata } from './seo';

describe('getSiteUrl', () => {
  it('returns production host when NEXT_PUBLIC_SITE_URL is not set', () => {
    expect(getSiteUrl()).toBe('https://teameet.co.kr');
  });
});

describe('canonicalUrl', () => {
  it('builds canonical URL from absolute path', () => {
    expect(canonicalUrl('/tournaments')).toBe('https://teameet.co.kr/tournaments');
  });

  it('normalizes relative path to absolute canonical', () => {
    expect(canonicalUrl('tournaments')).toBe('https://teameet.co.kr/tournaments');
  });

  it('handles root path', () => {
    expect(canonicalUrl('/')).toBe('https://teameet.co.kr/');
  });

  it('does not double-prefix /v1', () => {
    // /v1 browser paths are gone — canonical should never include /v1
    const result = canonicalUrl('/home');
    expect(result).not.toContain('/v1/');
    expect(result).toBe('https://teameet.co.kr/home');
  });
});

describe('buildPageMetadata', () => {
  it('uses site title when no page title provided', () => {
    const meta = buildPageMetadata();
    expect(meta.title).toBe('Teameet');
  });

  it('appends site title to page title', () => {
    const meta = buildPageMetadata({ title: '대회' });
    expect(meta.title).toBe('대회 | Teameet');
  });

  it('builds canonical alternates when path provided', () => {
    const meta = buildPageMetadata({ path: '/tournaments' });
    expect(meta.alternates?.canonical).toBe('https://teameet.co.kr/tournaments');
  });

  it('sets noIndex robots when noIndex=true', () => {
    const meta = buildPageMetadata({ noIndex: true });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('sets indexable robots by default', () => {
    const meta = buildPageMetadata();
    expect(meta.robots).toEqual({ index: true, follow: true });
  });
});
