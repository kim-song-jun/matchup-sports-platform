import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    v1Post: vi.fn().mockResolvedValue({ id: 'dispute-1', leagueId: 'league-1', teamMatchId: 'tm-1', status: 'open', createdAt: '2026-08-01T00:00:00.000Z' }),
  };
});

import { v1Post } from '@/lib/api-client';
import { useV1FileLeagueDispute } from './use-v1-api';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useV1FileLeagueDispute', () => {
  it('리그ID·팀매치ID를 경로에 넣고 body는 reason만 그대로 보낸다', async () => {
    const { result } = renderHook(() => useV1FileLeagueDispute('league-1', 'tm-1'), { wrapper });

    result.current.mutate({ reason: '심판 판정에 이의가 있어요' });

    await waitFor(() => expect(v1Post).toHaveBeenCalled());
    expect(v1Post).toHaveBeenCalledWith('/league-matches/league-1/fixtures/tm-1/dispute', {
      reason: '심판 판정에 이의가 있어요',
    });
  });
});
