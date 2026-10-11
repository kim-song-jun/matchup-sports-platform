import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorPage, V1TeamMatch } from '@/types/api';
import { TeamMatchListPageClient } from './team-matches-client';

const { apiGet } = vi.hoisted(() => ({ apiGet: vi.fn() }));
vi.mock('@/lib/api-client', async (original) => ({
  ...await original<typeof import('@/lib/api-client')>(), v1Get: apiGet,
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/team-matches',
  useSearchParams: () => new URLSearchParams(''),
}));

type Filters = { cursor?: string };
let client: QueryClient;
let failCursorPage: boolean;
let holdCursorPage: Promise<never> | null;

function item(index: number): V1TeamMatch {
  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: `lm-${index}`, teamMatchId: `lm-${index}`, title: `더보기 경기 ${index}`,
    sportName: '풋살', sport: { sportId: 'futsal', name: '풋살' }, startsAt, placeName: '구장',
    capacityText: '2팀', status: 'recruiting', viewerState: 'guest',
  } as unknown as V1TeamMatch;
}
function page(items: V1TeamMatch[], nextCursor: string | null): CursorPage<V1TeamMatch> {
  return { items, nextCursor, pageInfo: { nextCursor, hasNext: nextCursor !== null } };
}
function cards() {
  return screen.queryAllByRole('link').filter((link) => /^\/team-matches\/lm-\d/.test(link.getAttribute('href') ?? ''));
}

describe('팀 매치 목록 더 보기 — 실패와 폴링 구분', () => {
  beforeEach(() => {
    failCursorPage = false;
    holdCursorPage = null;
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    apiGet.mockImplementation(async (path: string, filters?: Filters) => {
      if (path !== '/team-matches') return [];
      if (!filters?.cursor) return page([item(0), item(1)], 'c2');
      if (holdCursorPage) return holdCursorPage;
      if (failCursorPage) throw new Error('boom');
      return page([item(2)], null);
    });
  });
  afterEach(() => cleanup());

  function mount() {
    return render(<QueryClientProvider client={client}><TeamMatchListPageClient /></QueryClientProvider>);
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
});
