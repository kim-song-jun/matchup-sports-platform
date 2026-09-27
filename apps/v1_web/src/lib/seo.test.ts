import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap from '@/app/sitemap';
import { metadata as eventsMetadata } from '@/app/events/layout';
import { absoluteSiteUrl, getSiteOrigin, metadataDescription, teamDescriptionFallback } from './seo';

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

describe('teamDescriptionFallback', () => {
  it('종목·지역이 다 있으면 둘을 함께 쓴다', () => {
    expect(teamDescriptionFallback('강남 FC', '풋살', '서울 송파구')).toBe(
      '풋살 · 서울 송파구에서 활동하는 강남 FC 팀을 만나보세요.',
    );
  });

  it('지역만 있으면 지역만 쓴다', () => {
    expect(teamDescriptionFallback('강남 FC', null, '서울 송파구')).toBe(
      '서울 송파구에서 활동하는 강남 FC 팀을 만나보세요.',
    );
  });

  it('종목만 있으면 어색하지 않은 다른 문장을 쓴다', () => {
    expect(teamDescriptionFallback('강남 FC', '풋살', null)).toBe('풋살을 함께할 강남 FC 팀을 만나보세요.');
  });

  it('둘 다 없어도 null·undefined 가 문장에 새지 않는다', () => {
    const text = teamDescriptionFallback('강남 FC', null, null);

    expect(text).toBe('강남 FC 팀을 만나보세요.');
    expect(text).not.toMatch(/null|undefined/);
  });

  it('공백만 있는 값은 없는 것으로 본다', () => {
    expect(teamDescriptionFallback('강남 FC', '  ', ' \n ')).toBe('강남 FC 팀을 만나보세요.');
  });
});

describe('metadataDescription', () => {
  const fallback = '풋살 · 송파 풋살파크에서 열리는 팀매치 정보를 확인해 보세요.';

  it('검색 설명으로 쓸 수 없는 짧은 입력은 기본 문구로 바꾼다', () => {
    expect(metadataDescription('dfd', fallback)).toBe(fallback);
    expect(metadataDescription('   ', fallback)).toBe(fallback);
    expect(metadataDescription(null, fallback)).toBe(fallback);
  });

  it('충분한 길이의 입력은 공백을 접어 그대로 쓰고, 155자를 넘으면 자른다', () => {
    expect(metadataDescription('매주 토요일 오전 송파에서\n풋살하는 팀이에요', fallback)).toBe('매주 토요일 오전 송파에서 풋살하는 팀이에요');
    const long = metadataDescription('가'.repeat(200), fallback);
    expect(long).toHaveLength(153);
    expect(long.endsWith('…')).toBe(true);
  });
});
