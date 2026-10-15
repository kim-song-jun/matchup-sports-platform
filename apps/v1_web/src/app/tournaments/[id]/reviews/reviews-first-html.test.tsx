import { IsRestoringProvider, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReviewsPage, { generateMetadata } from './page';
import { stripScriptTags } from '@/test/html-sanitize';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/tournaments/cup/reviews',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const review = {
  id: 'review-1', authorId: 'author-1', authorNickname: '참가팀장', authorProfileImageUrl: null,
  teamName: '주말팀', rating: 5, comment: '경기 시간 안내가 정확하고 운영이 원활했어요.', photoUrls: [], createdAt: '2026-10-01T00:00:00Z',
};
const cup = { id: 'cup', title: '지역 풋살컵', kind: 'regular_tournament', status: 'completed', fixtures: [], groups: [], reviews: [review], reviewsTotalCount: 1 };
const params = Promise.resolve({ id: 'cup' });

function serve(data: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data }), { status })));
}
afterEach(() => vi.unstubAllGlobals());

describe('참가 후기 공개 HTML과 검색 자격', () => {
  it('실제 후기와 대회명이 JS 실행 전 본문에 렌더된다', async () => {
    serve(cup);
    const node = await ReviewsPage({ params });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const html = stripScriptTags(renderToString(
      <QueryClientProvider client={client}><IsRestoringProvider value>{node}</IsRestoringProvider></QueryClientProvider>,
    ));
    expect(html).toContain(cup.title);
    expect(html).toContain(review.comment);
    expect(html).toContain(review.teamName);
    expect((await generateMetadata({ params })).robots).toMatchObject({ index: true, follow: true });
    client.clear();
  });

  it('후기가 없으면 상세는 유지하고 검색에서는 제외하되 링크는 따라갈 수 있다', async () => {
    serve({ ...cup, reviews: [], reviewsTotalCount: 0 });
    const meta = await generateMetadata({ params });
    expect(meta.robots).toMatchObject({ index: false, follow: true });
    expect(meta.alternates).toMatchObject({ canonical: '/tournaments/cup/reviews' });
  });

  it('조회 장애를 후기 없음으로 오인해 성공 처리하지 않는다', async () => {
    serve(null, 503);
    await expect(generateMetadata({ params })).rejects.toThrow('503');
  });
});
