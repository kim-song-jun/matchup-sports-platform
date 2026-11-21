import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseJsonLd } from '@/test/html-sanitize';
import AwardsPage from './awards/page';
import BracketPage from './bracket/page';
import ResultsPage from './results/page';
import ReviewsPage from './reviews/page';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
}));
vi.mock('./awards/awards-page-client', () => ({ AwardsPageClient: () => <main>awards</main> }));
vi.mock('./bracket/bracket-page-client', () => ({ BracketPageClient: () => <main>bracket</main> }));
vi.mock('./results/results-page-client', () => ({ ResultsPageClient: () => <main>results</main> }));
vi.mock('./reviews/reviews-page-client', () => ({ TournamentReviewsPageClient: () => <main>reviews</main> }));

const cup = { id: 'cup-1', title: '지역 풋살컵', kind: 'regular_tournament', status: 'completed', fixtures: [], groups: [], reviews: [], reviewsTotalCount: 0 };
const params = Promise.resolve({ id: 'cup-1' });

afterEach(() => vi.unstubAllGlobals());

type Page = (props: { params: Promise<{ id: string }> }) => Promise<ReactNode>;
const subpages: ReadonlyArray<readonly [string, Page, string, string]> = [
  ['대진표', BracketPage, '대진표', 'bracket'],
  ['경기 결과', ResultsPage, '경기 결과', 'results'],
  ['개인 시상', AwardsPage, '개인 시상', 'awards'],
  ['참가 후기', ReviewsPage, '참가 후기', 'reviews'],
];

describe('대회 하위 화면의 빵부스러기', () => {
  it.each(subpages)('%s 화면은 대회 > 대회명 > 화면명 순서의 BreadcrumbList 를 서버 HTML 에 담는다', async (_label, Page, name, segment) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: cup }), { status: 200 })));

    const html = renderToStaticMarkup(<>{await Page({ params })}</>);
    const ld = parseJsonLd<{ '@type': string; itemListElement: Array<Record<string, unknown>> }>(html);

    expect(ld?.['@type']).toBe('BreadcrumbList');
    expect(ld?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: '대회', item: 'https://teameet.co.kr/tournaments' },
      { '@type': 'ListItem', position: 2, name: '지역 풋살컵', item: 'https://teameet.co.kr/tournaments/cup-1' },
      { '@type': 'ListItem', position: 3, name, item: `https://teameet.co.kr/tournaments/cup-1/${segment}` },
    ]);
  });

  it.each(subpages)('%s 화면은 대회가 없으면 빵부스러기 없이 404 로 끝난다', async (_label, Page) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    await expect(Page({ params })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
