import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Get: vi.fn() };
});

import { v1Get } from '@/lib/api-client';
import { useV1AdminTournamentRegistrations } from './use-v1-api';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

const v1GetMock = vi.mocked(v1Get);

function pageOf(ids: string[], nextCursor: string | null) {
  return {
    items: ids.map((id) => ({ id })),
    pageInfo: { nextCursor, hasNext: nextCursor !== null },
  };
}

describe('useV1AdminTournamentRegistrations', () => {
  beforeEach(() => v1GetMock.mockReset());

  it('requests the server maximum and returns one complete page', async () => {
    v1GetMock.mockResolvedValueOnce(pageOf(['r1', 'r2'], null));
    const { result } = renderHook(() => useV1AdminTournamentRegistrations('t1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(v1GetMock).toHaveBeenCalledWith('/admin/tournaments/t1/registrations', { limit: 50 });
    expect(result.current.data).toEqual({ items: [{ id: 'r1' }, { id: 'r2' }], truncated: false });
  });

  it('follows every cursor so registrations after the first page remain visible and countable', async () => {
    v1GetMock
      .mockResolvedValueOnce(pageOf(['r1'], 'c1'))
      .mockResolvedValueOnce(pageOf(['r2'], 'c2'))
      .mockResolvedValueOnce(pageOf(['r3'], null));
    const { result } = renderHook(() => useV1AdminTournamentRegistrations('t1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(v1GetMock).toHaveBeenNthCalledWith(2, '/admin/tournaments/t1/registrations', {
      limit: 50,
      cursor: 'c1',
    });
    expect(v1GetMock).toHaveBeenNthCalledWith(3, '/admin/tournaments/t1/registrations', {
      limit: 50,
      cursor: 'c2',
    });
    expect(result.current.data?.items.map((registration) => registration.id)).toEqual(['r1', 'r2', 'r3']);
    expect(result.current.data?.truncated).toBe(false);
  });

  it('reports truncation instead of silently treating the safety cap as complete', async () => {
    v1GetMock.mockImplementation((_path, params) => {
      const cursor = (params as { cursor?: string })?.cursor ?? 'c0';
      return Promise.resolve(pageOf([`r-${cursor}`], `${cursor}+`));
    });
    const { result } = renderHook(() => useV1AdminTournamentRegistrations('t1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(v1GetMock).toHaveBeenCalledTimes(20);
    expect(result.current.data?.truncated).toBe(true);
  });
});
