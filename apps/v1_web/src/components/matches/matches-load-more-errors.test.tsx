import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorPage, V1Match } from '@/types/api';
import { MatchListPageClient } from './matches-client';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('@/lib/api-client', async (original) => ({
  ...await original<typeof import('@/lib/api-client')>(), v1Get: apiGet,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/matches',
  useSearchParams: () => new URLSearchParams(''),
}));

type Filters = { cursor?: string };
let client: QueryClient;
let failCursorPage: boolean;
let holdCursorPage: Promise<never> | null;
let holdFirstPage: Promise<never> | null;

function item(index: number): V1Match {
  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: `lm-${index}`, matchId: `lm-${index}`, title: `더보기 경기 ${index}`,
    sportName: '풋살', startsAt, 
    status: 'open',
  } as unknown as V1Match;
}
function page(items: V1Match[], nextCursor: string | null): CursorPage<V1Match> {
  return { items, nextCursor, pageInfo: { nextCursor, hasNext: nextCursor !== null } };
}
function cards() {
  return screen.queryAllByRole('link').filter((link) => /^\/matches\/lm-\d/.test(link.getAttribute('href') ?? ''));
}

describe('매치 목록 더 보기 — 실패와 폴링 구분', () => {
  beforeEach(() => {
    failCursorPage = false;
    holdCursorPage = null;
    holdFirstPage = null;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiGet.mockImplementation(async (path: string, filters?: Filters) => {
      if (path !== '/matches') return [];
      if (!filters?.cursor) return holdFirstPage ?? page([item(0), item(1)], 'c2');
      if (holdCursorPage) return holdCursorPage;
      if (failCursorPage) throw new Error('boom');
      return page([item(2)], null);
    });
  });
  afterEach(() => cleanup());

  function mount() {
    return render(<QueryClientProvider client={client}><MatchListPageClient /></QueryClientProvider>);
  }

  it('마지막 페이지를 받은 뒤 배경 재검증이 실패해도 그 페이지 카드와 마지막 상태를 유지한다', async () => {
    mount();
    await waitFor(() => expect(cards()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    await waitFor(() => expect(cards()).toHaveLength(3));

    failCursorPage = true;
    await client.refetchQueries({ predicate: (q) => JSON.stringify(q.queryKey).includes('c2') });

    await waitFor(() => expect(client.getQueryCache().getAll().some((q) => q.state.status === 'error')).toBe(true));
    expect(cards()).toHaveLength(3);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /더 보기|다시 불러오기/ })).not.toBeInTheDocument();
  });

  it('다음 페이지 요청이 실패하면 쌓은 카드는 두고 다시 불러오기 → 재시도 대기 중에도 카드가 유지되고 버튼은 잠긴다', async () => {
    failCursorPage = true;
    mount();
    await waitFor(() => expect(cards()).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }));
    const retry = await screen.findByRole('button', { name: '다시 불러오기' });
    expect(cards()).toHaveLength(2);

    holdCursorPage = new Promise<never>(() => undefined);
    fireEvent.click(retry);

    const pending = await screen.findByRole('button', { name: '불러오는 중…' });
    expect(pending).toBeDisabled();
    expect(cards()).toHaveLength(2);
  });

  it('서버 seed 로 그리는 동안(첫 페이지 검증 전)에는 더 보기가 잠겨 seed 의 커서를 따라가지 않는다', async () => {
    holdFirstPage = new Promise<never>(() => undefined);
    const seed = { page: page([item(7), item(8)], 'stale-seed-cursor'), sports: [] };
    render(<QueryClientProvider client={client}><MatchListPageClient seed={seed} /></QueryClientProvider>);

    const button = await screen.findByRole('button', { name: '더 보기' });
    expect(cards()).toHaveLength(2);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(apiGet.mock.calls.some(([, filters]) => (filters as Filters | undefined)?.cursor === 'stale-seed-cursor')).toBe(false);
  });
});
