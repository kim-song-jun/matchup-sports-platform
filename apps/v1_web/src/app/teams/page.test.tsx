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

  it('direct cursor SSR renders only that page as detail anchors and gets counts from the matching first-page metadata request', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      requests.push(url.toString());
      if (url.pathname.endsWith('/master/sports')) {
        return envelope([
          { id: 'sport-futsal', name: '풋살', code: 'futsal' },
          { id: 'sport-soccer', name: '축구', code: 'soccer' },
        ]);
      }
      if (url.searchParams.get('cursor') === 'cursor-page-2') {
        return envelope({
          items: [team('cursor-team', '두 번째 페이지 팀')],
          nextCursor: 'cursor-page-3',
          pageInfo: { hasNext: true, nextCursor: 'cursor-page-3' },
        });
      }
      if (url.searchParams.get('includeFacets') === 'true') {
        return envelope({
          items: [team('metadata-only-team', '메타데이터 전용 팀')],
          nextCursor: null,
          pageInfo: { hasNext: true, totalCount: 105 },
          facets: { sports: [{ sportId: 'sport-futsal', count: 94 }, { sportId: 'sport-soccer', count: 11 }] },
        });
      }
      return envelope({ items: [], nextCursor: null, pageInfo: { hasNext: false, totalCount: 0 } });
    }));

    const html = await serverHtml('sportId=sport-futsal&regionId=region-seoul&sort=deadline&q=%20%20%EB%A7%88%ED%8F%AC%20FC%20%20&cursor=cursor-page-2');
    const body = stripScriptTags(html);

    const teamRequests = requests.map((request) => new URL(request)).filter((url) => url.pathname.endsWith('/teams'));
    const cursorRequest = teamRequests.find((url) => url.searchParams.get('cursor') === 'cursor-page-2');
    expect(cursorRequest?.searchParams.get('sportId')).toBe('sport-futsal');
    expect(cursorRequest?.searchParams.get('regionId')).toBe('region-seoul');
    expect(cursorRequest?.searchParams.get('query')).toBe('마포 FC');
    expect(cursorRequest?.searchParams.get('joinPolicy')).toBe('approval_required');
    const metadataRequest = teamRequests.find((url) => url.searchParams.get('includeFacets') === 'true');
    expect(metadataRequest?.searchParams.get('sportId')).toBe('sport-futsal');
    expect(metadataRequest?.searchParams.get('regionId')).toBe('region-seoul');
    expect(metadataRequest?.searchParams.get('query')).toBe('마포 FC');
    expect(metadataRequest?.searchParams.get('joinPolicy')).toBe('approval_required');
    expect(metadataRequest?.searchParams.get('cursor')).toBeNull();
    expect(metadataRequest?.searchParams.get('limit')).toBe('1');
    expect(body).toContain('두 번째 페이지 팀');
    expect(body).not.toContain('메타데이터 전용 팀');
    expect(body).toContain('105');
    expect(body).toContain('94');
    expect(body).toContain('11');
    expect(body).toContain('href="/teams/cursor-team?from=');
    const continuationHref = body.match(/href="([^"]*cursor=cursor-page-3[^"]*)"/)?.[1]?.replaceAll('&amp;', '&');
    expect(continuationHref).toBeDefined();
    const continuationUrl = new URL(continuationHref!, 'https://teameet.test');
    expect(continuationUrl.searchParams.get('cursor')).toBe('cursor-page-3');
    expect(continuationUrl.searchParams.get('sportId')).toBe('sport-futsal');
    expect(continuationUrl.searchParams.get('regionId')).toBe('region-seoul');
    expect(continuationUrl.searchParams.get('sort')).toBe('deadline');
    expect(continuationUrl.searchParams.get('q')).toBe('마포 FC');
    expect(continuationUrl.searchParams.get('query')).toBeNull();
    expect(continuationUrl.searchParams.get('joinPolicy')).toBeNull();
    expect(parseJsonLd(html)).toBeNull();
  });
});
