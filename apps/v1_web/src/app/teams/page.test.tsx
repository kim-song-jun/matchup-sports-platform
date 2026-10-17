import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { metadata } from './page';
import TeamsPage from './page';
import { parseJsonLd, stripScriptTags } from '@/test/html-sanitize';

const navigationState = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/teams',
  useSearchParams: () => navigationState.params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

const requests: string[] = [];

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
}

async function serverHtml(query: string): Promise<string> {
  navigationState.params = new URLSearchParams(query);
  const page = await TeamsPage({ searchParams: Promise.resolve(Object.fromEntries(navigationState.params)) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (node: ReactNode) => (
    <QueryClientProvider client={client}><IsRestoringProvider value>{node}</IsRestoringProvider></QueryClientProvider>
  );
  return renderToString(wrap(page));
}

function team(id: string, name: string) {
  return {
    id,
    teamId: id,
    name,
    sportName: '풋살',
    sport: { sportId: 'sport-futsal', name: '풋살', code: 'futsal' },
    regionName: '서울 마포구',
    memberCount: 8,
    trustState: 'verified',
    joinPolicy: 'approval_required',
  };
}

function stubApi(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = String(input);
    requests.push(url);
    if (url.includes('/master/sports')) return envelope([{ id: 'sport-futsal', name: '풋살', code: 'futsal' }]);
    if (url.includes('sportId=sport-futsal')) {
      return envelope({ items: [team('filtered-team', '필터 팀')], nextCursor: null, pageInfo: { hasNext: false, totalCount: 1 } });
    }
    return envelope({ items: [team('unfiltered-team', '전체 팀')], nextCursor: null, pageInfo: { hasNext: false, totalCount: 1 } });
  }));
}

function requestedPath(path: string): boolean {
  return requests.some((url) => new URL(url).pathname + new URL(url).search === `/api/v1${path}`);
}

beforeEach(() => { requests.length = 0; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('teams list metadata', () => {
  it('names real example sports and the region-based team discovery service', () => {
    expect(metadata.title).toBe('지역별 풋살·축구 등 스포츠 팀 찾기');
    expect(metadata.description).toContain('풋살·축구');
    expect(metadata.description).toContain('러닝·수영');
    expect(metadata.alternates?.canonical).toBe('/teams');
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });

  it('valid sport filter seed renders the matching API response in first HTML without filtered ItemList', async () => {
    stubApi();

    const html = await serverHtml('sportId=sport-futsal');
    const body = stripScriptTags(html);
    expect(requestedPath('/teams?sportId=sport-futsal&limit=20&includeFacets=true')).toBe(true);
    expect(body).toContain('필터 팀');
    expect(body).not.toContain('전체 팀');
    expect(parseJsonLd(html)).toBeNull();
  });

  it('unknown team URL filter values are ignored using the client parser before requesting seed data', async () => {
    stubApi();

    const html = await serverHtml('sort=unknown&genderRule=unknown&levelCodes=unknown&q=%20%20&status=unknown');

    expect(requestedPath('/teams?limit=20&includeFacets=true')).toBe(true);
    expect(requests.some((url) => url.includes('status=') || url.includes('sort=unknown') || url.includes('genderRule=unknown') || url.includes('levelCodes=unknown'))).toBe(false);
    expect(stripScriptTags(html)).toContain('전체 팀');
    expect(parseJsonLd(html)).toBeNull();
  });
});
