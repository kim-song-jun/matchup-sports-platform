import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createV1QueryClient } from '@/lib/query-client';
import { v1Keys } from '@/lib/query-keys';
import { shouldPersistQuery } from '@/lib/query-persist';
import type { CursorPage, V1Match } from '@/types/api';
import { MatchListPageClient } from './matches-client';

// 실제 목록 client/view/API 훅/캐시를 쓰고 HTTP 경계만 합성 응답으로 바꾼다. 상세 왕복은
// "목록 언마운트 → 같은 QueryClient 로 다시 마운트"로 흉내낸다(팀매치 #1568 테스트와 같은 판정).
const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('@/lib/api-client', async (original) => ({ ...await original<typeof import('@/lib/api-client')>(), v1Get: apiGet }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/matches',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/link', () => ({
  default: ({ href, prefetch: _prefetch, scroll: _scroll, ...props }: ComponentProps<'a'> & { href: string; prefetch?: boolean; scroll?: boolean }) => (
    <a {...props} href={href} />
  ),
}));

type Filters = Record<string, string | number | boolean | undefined>;
let client: QueryClient;

function match(index: number): V1Match {
  return {
    id: `m-${index}`, matchId: `m-${index}`, title: `합성 매치 ${index}`, sportName: '풋살', placeName: '합성 구장',
    startsAt: '2030-10-01T10:00:00.000Z', capacityText: '1/10명', status: 'recruiting', viewerState: 'guest',
  } as V1Match;
}
function page(filters?: Filters): CursorPage<V1Match> {
  const offset = Number(String(filters?.cursor ?? 'page-0').split('-')[1]);
  const next = offset + 20 < 45 ? `page-${offset + 20}` : null;
  return {
    items: Array.from({ length: Math.min(20, 45 - offset) }, (_, i) => match(offset + i)),
    nextCursor: next,
    pageInfo: { nextCursor: next, hasNext: next !== null },
  };
}
function mount() { return render(<QueryClientProvider client={client}><MatchListPageClient /></QueryClientProvider>); }
function cards() { return document.querySelectorAll('a.tm-match-row'); }
async function expectCards(count: number) { await waitFor(() => expect(cards()).toHaveLength(count)); }
async function loadTo40() {
  await expectCards(20);
  fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
  await expectCards(40);
  await waitFor(() => expect(client.isFetching()).toBe(0));
}

beforeEach(() => {
  vi.clearAllMocks();
  client = createV1QueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  apiGet.mockImplementation((path: string, filters?: Filters) => {
    if (path === '/matches') return page(filters);
    if (path === '/master/sports') return [{ sportId: 'futsal', name: '풋살' }];
    if (path === '/master/regions') return [];
    if (path === '/search/recent') return { items: [] };
    throw new Error(`Unexpected API path: ${path}`);
  });
});
afterEach(() => { cleanup(); client.clear(); });

describe('개인매치 목록 — 더 보기 누적분의 상세 복귀', () => {
  it('상세에 다녀와도 40건이 남고 다음 페이지를 이어 받는다', async () => {
    const first = mount();
    await loadTo40();
    first.unmount();

    mount();
    await expectCards(40);
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await expectCards(45);
  });

  it('상세에서 목록 캐시가 무효화되면 오래된 누적분을 버리고 첫 페이지부터', async () => {
    const first = mount();
    await loadTo40();
    first.unmount();
    await client.invalidateQueries({ queryKey: v1Keys.matchesAll() });

    mount();
    await expectCards(20);
  });

  it('복귀용 누적분은 localStorage 로 persist 하지 않는다', async () => {
    const first = mount();
    await loadTo40();
    first.unmount();

    const snapshot = client.getQueryCache().findAll({ queryKey: [...v1Keys.matchesAll(), 'pagination'] });
    expect(snapshot).toHaveLength(1);
    expect(shouldPersistQuery(snapshot[0])).toBe(false);
  });
});
