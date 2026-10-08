'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';

export type CursorPagination<T> = { readonly cursor?: string; readonly accumulated: readonly T[] };

/**
 * "더 보기"(커서 누적) 목록의 cursor 와 앞 페이지 누적분 — 매치·팀매치·대회 목록이 같이 쓴다.
 *
 * - **필터가 바뀌면 렌더 중에 되감는다.** effect 를 기다리면 "새 필터 + 이전 cursor" 요청이 한 번
 *   나간다 — 그 cursor 는 이전 필터 기준 토큰이라 새 필터에서는 무효하다.
 * - **상세에 다녀와도 누적분을 되살린다.** 컴포넌트 state 는 상세로 가며 언마운트되어 사라지므로
 *   (MD-QA #55: 40개 → 상세 → 20개), 마지막으로 성공한 cursor 와 앞 페이지들을 React Query 메모리
 *   캐시(`[...scope, 'pagination', filtersKey]`)에 둔다. localStorage 에는 안 남고(query-persist 화이트리스트
 *   밖) 계정 전환 clear 와 GC 를 그대로 따른다. 되살릴 때는 그 cursor 의 페이지 캐시(`pageKey`)가 아직
 *   성공·유효한지 본다 — 상세의 쓰기가 무효화했거나 GC 됐으면 오래된 누적분도 버리고 첫 페이지부터.
 *
 * 저장은 목록 쿼리 뒤에서 `useCursorPaginationSnapshot` 으로 한다(쿼리가 이 훅의 cursor 를 써야 해서
 * 한 훅으로 묶을 수 없다).
 */
export function useCursorPagination<T>(
  scope: readonly unknown[],
  filtersKey: string,
  pageKey: (cursor: string | undefined) => QueryKey,
) {
  const queryClient = useQueryClient();
  // scope 는 호출마다 새 배열(v1Keys.*())이라 내용으로만 묶는다.
  const scopeKey = JSON.stringify(scope);
  const snapshotKey = useMemo(() => [...scope, 'pagination', filtersKey] as const, [scopeKey, filtersKey]);
  const [pagination, setPagination] = useState<CursorPagination<T>>(() => {
    const saved = queryClient.getQueryData<CursorPagination<T>>(snapshotKey);
    const page = saved ? queryClient.getQueryState(pageKey(saved.cursor)) : undefined;
    return saved && page?.status === 'success' && !page.isInvalidated ? saved : { accumulated: [] };
  });
  const [pagedFiltersKey, setPagedFiltersKey] = useState(filtersKey);
  if (pagedFiltersKey !== filtersKey) {
    setPagedFiltersKey(filtersKey);
    setPagination({ accumulated: [] });
  }
  return { ...pagination, setPagination, snapshotKey };
}

/**
 * 목록 쿼리가 **성공으로 끝난 상태**만 복귀 snapshot 으로 남긴다 — 더 보기 중 이전 페이지 placeholder 나
 * 실패한 다음 페이지를 저장하면, 돌아왔을 때 받은 적 없는 cursor 를 되살린다.
 */
export function useCursorPaginationSnapshot<T>(
  snapshotKey: QueryKey,
  pagination: CursorPagination<T>,
  query: { isSuccess: boolean; isPlaceholderData: boolean; isFetching: boolean; dataUpdatedAt: number },
  enabled = true,
) {
  const queryClient = useQueryClient();
  const { cursor, accumulated } = pagination;
  const { isSuccess, isPlaceholderData, isFetching, dataUpdatedAt } = query;
  useEffect(() => {
    if (enabled && isSuccess && !isPlaceholderData && !isFetching) {
      queryClient.setQueryData<CursorPagination<T>>(snapshotKey, { cursor, accumulated });
    }
  }, [accumulated, cursor, dataUpdatedAt, enabled, isFetching, isPlaceholderData, isSuccess, queryClient, snapshotKey]);
}
