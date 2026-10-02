'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * 어드민 목록 페이지들이 페이지마다 복제해 온 조회 상태 로직의 단일 소스.
 * (검색 debounce 300ms → q, 상태 필터 칩, 필터 변경 시 page=1 리셋, 페이지네이션 props 조립)
 *
 * 렌더링(컬럼·행)은 페이지 소관으로 남기고, 이 훅은 "무엇을 조회할지"만 담당한다 —
 * users/teams/matches/team-matches/admins 5개 페이지가 이 로직을 각자 들고 있어
 * 한 곳을 고치면 다섯 곳을 같이 고쳐야 했다(어드민 재정비 M1).
 */

const DEFAULT_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

/** 어드민 목록 API들이 공통으로 쓰는 페이지 단위 pageInfo 형태 (cursor 아님) */
export interface AdminListPageInfo {
  page?: number;
  totalPages?: number;
  total?: number;
  limit?: number;
}

export interface AdminListPagination {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  loading: boolean;
}

export interface UseAdminListQueryOptions {
  /** 페이지 크기. 기본 20 */
  pageSize?: number;
  /** 상태 필터 초기값 — URL `?status=`를 쓰는 페이지는 searchParams에서 읽어 넘긴다 */
  initialStatus?: string;
}

export interface AdminListQueryState {
  /** 검색 입력값 (debounce 전) — AdminFilterBar의 searchValue/onSearchChange에 연결 */
  search: string;
  setSearch: (value: string) => void;
  /** 300ms debounce + trim 적용된 실제 질의어 */
  debouncedSearch: string;
  /** 상태 필터 칩 값 ('' = 전체) */
  activeStatus: string;
  setActiveStatus: (value: string) => void;
  page: number;
  setPage: (page: number) => void;
  /** mutation 성공 후 첫 페이지부터 다시 그릴 때 사용 */
  resetToFirstPage: () => void;
  /** 목록 API에 그대로 넘기는 필터 객체 — 빈 q/status는 키 자체를 생략 */
  filters: { q?: string; status?: string; page: number; limit: number };
  /** AdminDataTable pagination prop 조립 — totalPages 없는 응답이면 undefined */
  buildPagination: (
    pageInfo: AdminListPageInfo | undefined,
    isFetching: boolean,
  ) => AdminListPagination | undefined;
}

export function useAdminListQuery(
  options: UseAdminListQueryOptions = {},
): AdminListQueryState {
  const { pageSize = DEFAULT_PAGE_SIZE, initialStatus = '' } = options;

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState(initialStatus);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // 필터가 바뀌면 첫 페이지로 돌아간다 — 3페이지를 보던 중 조건을 좁히면 결과가 없을 수 있다.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeStatus]);

  const resetToFirstPage = useCallback(() => setPage(1), []);

  const filters = useMemo(
    () => ({
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
      ...(activeStatus ? { status: activeStatus } : {}),
      page,
      limit: pageSize,
    }),
    [debouncedSearch, activeStatus, page, pageSize],
  );

  const buildPagination = useCallback(
    (
      pageInfo: AdminListPageInfo | undefined,
      isFetching: boolean,
    ): AdminListPagination | undefined => {
      if (!pageInfo?.totalPages) return undefined;
      return {
        page: pageInfo.page ?? page,
        totalPages: pageInfo.totalPages,
        total: pageInfo.total ?? 0,
        limit: pageInfo.limit ?? pageSize,
        onPageChange: setPage,
        loading: isFetching,
      };
    },
    [page, pageSize],
  );

  return {
    search,
    setSearch,
    debouncedSearch,
    activeStatus,
    setActiveStatus,
    page,
    setPage,
    resetToFirstPage,
    filters,
    buildPagination,
  };
}
