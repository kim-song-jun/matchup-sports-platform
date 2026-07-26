import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import { metadata as eventsMetadata } from '@/app/events/layout';
import { absoluteSiteUrl, getSiteOrigin } from './seo';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('SEO site origin', () => {
  it('uses the production Teameet host when no override is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');

    expect(getSiteOrigin()).toBe('https://teameet.co.kr');
    expect(absoluteSiteUrl('/tournaments')).toBe('https://teameet.co.kr/tournaments');
  });

  it('uses only the origin portion of a valid deployment override', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://preview.example.com/base/path');

    expect(getSiteOrigin()).toBe('https://preview.example.com');
  });

  it('falls back to the production host for an invalid override', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'not-a-url');

    expect(getSiteOrigin()).toBe('https://teameet.co.kr');
  });

  it('rejects non-HTTP URL schemes', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'javascript:alert(1)');

    expect(getSiteOrigin()).toBe('https://teameet.co.kr');
  });

  it('rejects an insecure production origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://teameet.co.kr');

    expect(getSiteOrigin()).toBe('https://teameet.co.kr');
  });

  it('publishes canonical metadata and a sitemap entry for the public events hub', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    expect(eventsMetadata.alternates).toMatchObject({ canonical: '/events' });
    expect(eventsMetadata.robots).toMatchObject({ index: true, follow: true });

    const entries = await sitemap();
    expect(entries).toContainEqual(
      expect.objectContaining({
        url: 'https://teameet.co.kr/events',
        changeFrequency: 'daily',
      }),
    );
  });

  it('keeps the static sitemap available when one public API domain is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((input: string | URL | Request) => {
        const url = String(input);
        return Promise.resolve(
          new Response(null, {
            status: url.includes('/api/v1/matches?') ? 503 : 404,
          }),
        );
      }),
    );

    const entries = await sitemap();

    expect(entries).toContainEqual(
      expect.objectContaining({ url: 'https://teameet.co.kr/events' }),
    );
  });
});
