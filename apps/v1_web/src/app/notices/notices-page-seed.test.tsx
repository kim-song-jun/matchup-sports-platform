/**
 * /notices 서버 렌더 계약 — tournaments-page-seed.test.tsx 와 같다. API 경계(fetch)만 바꾼다.
 */
import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/notices',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

import NoticesPage from './page';

// 실제 앱은 PersistQueryClientProvider 라 서버·첫 렌더에서 isRestoring=true 다(fetchStatus 'idle',
// isLoading=false). 그 상태를 재현하지 않으면 로딩/빈 상태 단언이 실서버와 다르게 통과한다.
async function serverHtml(): Promise<string> {
  const page = await NoticesPage();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToString(
    <QueryClientProvider client={client}><IsRestoringProvider value>{page}</IsRestoringProvider></QueryClientProvider>,
  );
}

const markup = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '');

describe('/notices 서버 렌더', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('공지 목록이 서버 HTML 과 ItemList 에 같은 이름·링크로 들어간다', async () => {
    const data = {
      notices: [{ noticeId: 'n-1', title: '9월 정기 점검 안내', category: '안내', publishedAt: '2026-09-20T15:30:00.000Z', body: '점검' }],
      pageInfo: { hasNextPage: false, nextCursor: null },
    };
    const fetchMock = vi.fn(async (_input: string | URL) => new Response(JSON.stringify({ status: 'success', data }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const html = await serverHtml();

    // 클라이언트 '전체' 요청과 같은 쿼리(limit 없음)여야 placeholder 가 같은 목록이다.
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/api\/v1\/notices$/);
    expect(markup(html)).toContain('9월 정기 점검 안내');
    expect(markup(html)).toContain('href="/notices/n-1"');
    // 서버(UTC 컨테이너)와 브라우저(KST)가 같은 날짜를 그려야 하이드레이션이 어긋나지 않는다.
    expect(markup(html)).toContain('9월 21일');
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1] ?? '{}');
    expect(ld.itemListElement).toEqual([
      expect.objectContaining({ name: '9월 정기 점검 안내', url: expect.stringMatching(/\/notices\/n-1$/) }),
    ]);
  });

  it('API 가 실패하면 빈 목록을 그리지 않고 로딩 상태로 넘긴다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 500 })));

    const html = await serverHtml();

    expect(html).toContain('tm-skeleton-page');
    expect(html).not.toContain('아직 공지가 없어요');
    expect(html).not.toContain('application/ld+json');
  });
});
