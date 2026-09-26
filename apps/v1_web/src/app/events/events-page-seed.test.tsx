/**
 * /events 서버 렌더 계약 — tournaments-page-seed.test.tsx 와 같다. API 경계(fetch)만 바꾼다.
 */
import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const searchParamsState = vi.hoisted(() => ({ value: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsState.value,
  usePathname: () => '/events',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import EventsPage from './page';

function campaign(id: string, slug: string, heroTitle: string) {
  return {
    id, slug, heroTitle, heroSummary: null, heroImageUrl: null,
    publishedAt: '2026-07-14T01:00:00.000Z', updatedAt: '2026-07-14T01:00:00.000Z',
    tournament: {
      id: `t-${id}`, title: heroTitle, status: 'open', sport: { code: 'futsal', name: '풋살' },
      scheduledAt: null, scheduledEndAt: null, registrationDeadlineAt: null, venue: null,
      coverImageUrl: null, teamCount: 8, entryFee: 0, prizePool: null, prizeSummary: null,
      confirmedCount: 0, pendingPaymentCount: 0, registrationAvailability: 'closed',
    },
  };
}

const requested: string[] = [];

function stubApi(response: () => Response) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    requested.push(String(input));
    return response();
  }));
}

// 실제 앱은 PersistQueryClientProvider 라 서버·첫 렌더에서 isRestoring=true 다(fetchStatus 'idle',
// isLoading=false). 그 상태를 재현하지 않으면 로딩/빈 상태 단언이 실서버와 다르게 통과한다.
async function serverHtml(query = ''): Promise<string> {
  requested.length = 0;
  searchParamsState.value = new URLSearchParams(query);
  const page = await EventsPage({ searchParams: Promise.resolve(Object.fromEntries(searchParamsState.value)) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    <QueryClientProvider client={client}><IsRestoringProvider value>{page}</IsRestoringProvider></QueryClientProvider>,
  );
}

const markup = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '');

describe('/events 서버 렌더', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('캠페인 첫 페이지가 서버 HTML 과 ItemList 에 같은 이름으로 들어간다', async () => {
    const data = { items: [campaign('c-1', 'summer-cup', '여름 풋살 컵')], nextCursor: null };
    stubApi(() => new Response(JSON.stringify({ status: 'success', data }), { status: 200 }));

    const html = await serverHtml();

    expect(markup(html)).toContain('여름 풋살 컵');
    expect(markup(html)).toContain('/tournaments/campaigns/summer-cup');
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1] ?? '{}');
    expect(ld.itemListElement.map((entry: { name: string }) => entry.name)).toEqual(['여름 풋살 컵']);
  });

  it('API 가 실패하면 "등록된 이벤트가 없어요" 대신 로딩 스켈레톤으로 넘긴다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubApi(() => new Response('down', { status: 502 }));

    const html = await serverHtml();

    expect(html).toContain('이벤트 불러오는 중');
    expect(html).not.toContain('등록된 이벤트가 없어요');
    expect(html).not.toContain('application/ld+json');
  });

  it('종목이 걸린 주소는 무필터 목록을 받지 않는다', async () => {
    stubApi(() => new Response(JSON.stringify({ status: 'success', data: { items: [], nextCursor: null } })));

    await serverHtml('sport=futsal');

    expect(requested.filter((url) => url.includes('/tournaments/campaigns'))).toEqual([]);
  });

  // `?sport=` 는 클라이언트가 "종목 있음"으로 읽어 seed 를 버린다 — 서버만 무필터로 읽으면
  // 카드 없는 화면에 ItemList 만 나간다.
  it('ItemList 는 서버 HTML 에 카드가 그려질 때만 나간다 (빈 sport 파라미터 포함)', async () => {
    const data = { items: [campaign('c-1', 'summer-cup', '여름 풋살 컵')], nextCursor: null };
    stubApi(() => new Response(JSON.stringify({ status: 'success', data }), { status: 200 }));

    const html = await serverHtml('sport=');

    const hasLd = html.includes('application/ld+json');
    expect(hasLd).toBe(markup(html).includes('여름 풋살 컵'));
  });
});
