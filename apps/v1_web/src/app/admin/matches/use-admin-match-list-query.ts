'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { AdminListQueryState } from '@/hooks/use-admin-list-query';
import { pickAllowedParam } from '../pick-allowed-param';

type Draft = { search: string; activeStatus: string; page: number };
type StatusOptions = ReadonlyArray<{ value: string }>;

function readDraft(query: string, statuses: StatusOptions): Draft {
  const params = new URLSearchParams(query);
  const rawPage = params.get('page') ?? '1';
  const page = Number(rawPage);
  return {
    search: params.get('q') ?? '',
    activeStatus: pickAllowedParam(params.get('status'), statuses),
    page: /^\d+$/.test(rawPage) && Number.isSafeInteger(page) && page >= 1 ? page : 1,
  };
}

/** 매치 목록만 URL에 저장한다. 다른 관리자 목록의 조회 계약은 바꾸지 않는다. */
export function useAdminMatchListQuery(statuses: StatusOptions, pageSize: number): AdminListQueryState {
  const query = useSearchParams().toString();
  const fromUrl = useMemo(() => readDraft(query, statuses), [query, statuses]);
  const [draft, setDraft] = useState(fromUrl);
  const latestDraft = useRef(draft);
  const [debouncedSearch, setDebouncedSearch] = useState(fromUrl.search.trim());

  useEffect(() => {
    // native history의 URL 갱신을 Next가 반영하기 전의 오래된 snapshot은 무시한다.
    if (query !== new URLSearchParams(window.location.search).toString()) return;
    const current = latestDraft.current;
    if (current.search === fromUrl.search && current.activeStatus === fromUrl.activeStatus
      && current.page === fromUrl.page) return;
    // Back/Forward·외부 URL 변경은 검색 debounce를 기다리지 않고 복원한다.
    latestDraft.current = fromUrl;
    setDraft(fromUrl);
    setDebouncedSearch(fromUrl.search.trim());
  }, [query, fromUrl]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(draft.search.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft.search]);

  const updateDraft = useCallback((patch: Partial<Draft>) => {
    // 연속 입력은 router snapshot이 아니라 가장 최근 draft에 병합한다.
    const next = { ...latestDraft.current, ...patch };
    latestDraft.current = next;
    setDraft(next);
    const url = new URL(window.location.href);
    if (next.search) url.searchParams.set('q', next.search);
    else url.searchParams.delete('q');
    if (next.activeStatus) url.searchParams.set('status', next.activeStatus);
    else url.searchParams.delete('status');
    if (next.page > 1) url.searchParams.set('page', String(next.page));
    else url.searchParams.delete('page');
    // Next의 native History 연동이 내부 state를 복사한다. 새 history 항목·scroll 이동 없음.
    // API 검색만 debounce하며 URL은 즉시 보존해 입력 직후 상세로 이동해도 유실되지 않는다.
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const setSearch = useCallback((search: string) => updateDraft({ search, page: 1 }), [updateDraft]);
  const setActiveStatus = useCallback((activeStatus: string) => updateDraft({ activeStatus, page: 1 }), [updateDraft]);
  const setPage = useCallback((page: number) => updateDraft({ page }), [updateDraft]);
  const resetToFirstPage = useCallback(() => setPage(1), [setPage]);
  const filters = useMemo(() => ({
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(draft.activeStatus ? { status: draft.activeStatus } : {}),
    page: draft.page,
    limit: pageSize,
  }), [debouncedSearch, draft.activeStatus, draft.page, pageSize]);

  const buildPagination: AdminListQueryState['buildPagination'] = useCallback((pageInfo, isFetching) => {
    if (!pageInfo?.totalPages) return undefined;
    return {
      page: pageInfo.page ?? draft.page,
      totalPages: pageInfo.totalPages,
      total: pageInfo.total ?? 0,
      limit: pageInfo.limit ?? pageSize,
      onPageChange: setPage,
      loading: isFetching,
    };
  }, [draft.page, pageSize, setPage]);

  return {
    ...draft, setSearch, debouncedSearch, setActiveStatus, setPage, resetToFirstPage, filters, buildPagination,
  };
}
