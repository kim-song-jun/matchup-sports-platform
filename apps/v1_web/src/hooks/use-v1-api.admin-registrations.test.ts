import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    v1Get: vi.fn(),
  };
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

// 신청 목록 전량 로더 계약 — 커서 미처리 + 기본 limit 20으로 21번째 이후 신청이
// 화면에서 통째로 누락되던 결함의 재발 방지. 커서를 서버 상한(50)씩 끝까지 순회한다.
describe('useV1AdminTournamentRegistrations (전량 로더)', () => {
  beforeEach(() => {
    v1GetMock.mockReset();
  });

  it('hasNext=false면 한 번만 호출하고 그대로 반환한다 (limit=50 고정)', async () => {
    v1GetMock.mockResolvedValueOnce(pageOf(['r1', 'r2'], null));
    const { result } = renderHook(() => useV1AdminTournamentRegistrations('t1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(v1GetMock).toHaveBeenCalledTimes(1);
    expect(v1GetMock).toHaveBeenCalledWith('/admin/tournaments/t1/registrations', { limit: 50 });
    expect(result.current.data).toEqual({ items: [{ id: 'r1' }, { id: 'r2' }], truncated: false });
  });

  it('hasNext가 꺼질 때까지 커서를 이어 붙여 전량을 모은다', async () => {
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
    expect(result.current.data?.items.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
    expect(result.current.data?.truncated).toBe(false);
  });

  it('안전 상한(20페이지)에 걸리면 truncated=true로 정직하게 알린다', async () => {
    v1GetMock.mockImplementation((_path, params) => {
      const cursor = (params as { cursor?: string })?.cursor ?? 'c0';
      return Promise.resolve(pageOf([`r-${cursor}`], `${cursor}+`));
    });
    const { result } = renderHook(() => useV1AdminTournamentRegistrations('t1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(v1GetMock).toHaveBeenCalledTimes(20);
    expect(result.current.data?.items).toHaveLength(20);
    expect(result.current.data?.truncated).toBe(true);
  });
});
