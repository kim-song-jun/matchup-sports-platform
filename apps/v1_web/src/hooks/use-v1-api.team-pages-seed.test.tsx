/**
 * /teams는 빌드 타임(CI, API 미접속)에 정적 프리렌더되면서 빈 목록을 seed로 구울 수 있다
 * (app/teams/page.tsx의 revalidate=0 주석 참고, 메모: isr-serves-build-time-empty-cache).
 * 그 빈 seed를 useV1TeamPages가 initialData로 받으면 dataUpdatedAt이 "지금"으로 찍혀
 * providers.tsx의 staleTime(60_000ms) 동안 배경 refetch가 아예 안 돈다 — 배포 직후 최대
 * 1분간 실제 유저에게도 "0팀"이 보인다. 이 테스트는 그 회귀를 못박는다.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CursorPage, V1Team } from '@/types/api';

const { v1GetMock } = vi.hoisted(() => {
  const realPage: CursorPage<V1Team> = {
    items: [{ id: 'real-1', teamId: 'real-1', name: '실제 팀' } as unknown as V1Team],
    nextCursor: null,
    pageInfo: { nextCursor: null, hasNext: false, totalCount: 1 },
  };
  return { v1GetMock: vi.fn().mockResolvedValue(realPage) };
});

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return { ...actual, v1Get: v1GetMock };
});

import { useV1TeamPages } from './use-v1-api';

beforeEach(() => {
  v1GetMock.mockReset().mockResolvedValue({
    items: [{ id: 'real-1', teamId: 'real-1', name: '실제 팀' } as unknown as V1Team],
    nextCursor: null,
    pageInfo: { nextCursor: null, hasNext: false, totalCount: 1 },
  });
});

const emptyBuildTimeSeed: CursorPage<V1Team> = {
  items: [],
  nextCursor: null,
  pageInfo: { nextCursor: null, hasNext: false, total: 0 },
};

// providers.tsx(apps/v1_web/src/app/providers.tsx)의 실제 staleTime과 맞춘다 — 기본값
// staleTime:0인 QueryClient로는 initialData든 placeholderData든 어차피 즉시 stale이라
// 이 회귀를 재현하지 못한다.
function makeWrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } })) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

describe('useV1TeamPages — 빌드 타임 빈 seed가 refetch를 막지 않는다', () => {
  it('커서 URL의 seed는 같은 필터와 시작 커서로 조회하고 첫 페이지 캐시와 분리한다', async () => {
    v1GetMock.mockClear();
    const wrapper = makeWrapper();
    const { result } = renderHook(
      () => useV1TeamPages({ sportId: 'sport-futsal' }, { initialCursor: 'cursor/page-2' }),
      { wrapper },
    );

    await waitFor(() => expect(v1GetMock).toHaveBeenCalledWith('/teams', {
      sportId: 'sport-futsal',
      cursor: 'cursor/page-2',
    }));
    await waitFor(() => expect(result.current.data?.pageParams).toEqual(['cursor/page-2']));
  });

  it('UI의 q·마감순 cursor URL을 같은 필터의 API dialect로 hydration fetch한다', async () => {
    const { result } = renderHook(
      () => useV1TeamPages({
        sportId: 'sport-futsal',
        regionId: 'region-seoul',
        query: '마포 FC',
        joinPolicy: 'approval_required',
        limit: 20,
      }, { initialCursor: 'opaque-page-2' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(v1GetMock).toHaveBeenCalledWith('/teams', {
      sportId: 'sport-futsal',
      regionId: 'region-seoul',
      query: '마포 FC',
      joinPolicy: 'approval_required',
      limit: 20,
      cursor: 'opaque-page-2',
    }));
    await waitFor(() => expect(result.current.data?.pageParams).toEqual(['opaque-page-2']));
  });

  it('커서 rows와 별도의 matching-filter metadata를 갱신한다', async () => {
    const metadataSeed: CursorPage<V1Team> = {
      items: [],
      nextCursor: null,
      pageInfo: { nextCursor: null, hasNext: true, totalCount: 105 },
      facets: { sports: [{ sportId: 'sport-futsal', count: 94 }, { sportId: 'sport-soccer', count: 11 }] },
    } as CursorPage<V1Team>;
    v1GetMock.mockImplementation((_path, params) => params?.includeFacets
      ? Promise.resolve(metadataSeed)
      : Promise.resolve({ items: [{ id: 'cursor-row' }], pageInfo: { hasNext: false, nextCursor: null } }));
    const { result } = renderHook(
      () => useV1TeamPages({ sportId: 'sport-futsal' }, { initialCursor: 'cursor/page-2', metadataSeed }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(v1GetMock).toHaveBeenCalledWith('/teams', {
      sportId: 'sport-futsal',
      cursor: 'cursor/page-2',
    }));
    await waitFor(() => expect(v1GetMock).toHaveBeenCalledWith('/teams', {
      sportId: 'sport-futsal',
      limit: 1,
      includeFacets: true,
    }));
    await waitFor(() => expect(result.current.listMetadata).toEqual(metadataSeed));
  });

  it('metadata refresh failure remains an explicit error without promoting cursor rows to totals', async () => {
    v1GetMock.mockClear();
    v1GetMock.mockImplementation((_path, params) => params?.cursor
      ? Promise.resolve({ items: [{ id: 'cursor-row' }], pageInfo: { hasNext: false, nextCursor: null } })
      : Promise.reject(new Error('metadata unavailable')));
    const { result } = renderHook(
      () => useV1TeamPages({ sportId: 'sport-futsal' }, { initialCursor: 'cursor/page-2' }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isListMetadataError).toBe(true));
    expect(result.current.listMetadata).toBeUndefined();
    expect(result.current.data?.pages[0]?.items).toEqual([{ id: 'cursor-row' }]);
  });

  it('같은 필터여도 시작 커서가 다른 infinite queries는 캐시를 공유하지 않는다', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderHook(() => {
      useV1TeamPages({ sportId: 'sport-futsal' }, { initialCursor: 'cursor/page-2' });
      useV1TeamPages({ sportId: 'sport-futsal' }, { initialCursor: 'cursor/page-3' });
    }, { wrapper: makeWrapper(client) });

    expect(client.getQueryCache().getAll().filter((query) => query.queryKey.at(-1) === 'infinite')).toHaveLength(2);
  });

  it('seed가 있어도 마운트 시 실제 목록 fetch를 건다', async () => {
    v1GetMock.mockClear();
    renderHook(() => useV1TeamPages(undefined, { seed: emptyBuildTimeSeed }), { wrapper: makeWrapper() });

    await waitFor(() => expect(v1GetMock).toHaveBeenCalled());
  });

  it('빈 seed를 보여주다가 실제 fetch가 오면 진짜 목록으로 바뀐다', async () => {
    v1GetMock.mockClear();
    const { result } = renderHook(() => useV1TeamPages(undefined, { seed: emptyBuildTimeSeed }), { wrapper: makeWrapper() });

    expect(result.current.data?.pages[0]?.items).toHaveLength(0);
    await waitFor(() => expect(result.current.data?.pages[0]?.items).toHaveLength(1));
    expect(result.current.data?.pages[0]?.items[0]?.name).toBe('실제 팀');
  });

  it('seed가 없으면 지금처럼 로딩부터 시작한다', () => {
    renderHook(() => useV1TeamPages(undefined, {}), { wrapper: makeWrapper() });
    // 회귀 없음을 표시하는 스모크 — seed 없는 기존 경로는 그대로 undefined data에서 시작한다.
  });
});
