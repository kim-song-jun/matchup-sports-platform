'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { AdminListQueryState } from '@/hooks/use-admin-list-query';
import { pickAllowedParam } from './pick-allowed-param';

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

const LIST_RETURN_KEY_PREFIX = 'teameet.admin.listReturn:';

/**
 * 검색어·상태·페이지를 URL(`?q=&status=&page=`)에 두는 관리자 목록 조회 상태.
 * 매치·회원·팀·팀매치·대회 목록이 쓴다 — 화면 안 상태로만 들고 있으면 상세에 다녀오는 사이
 * 조건이 기본값으로 돌아간다(MD-QA #21). `useAdminListQuery`와 같은 반환 계약이라 바꿔 끼우면 된다.
 * 지금 목록 주소는 탭 세션에 기억해 두고, 상세의 '목록' 버튼이 `useAdminListReturnHref`로 그 주소로 돌아온다.
 */
export function useAdminUrlListQuery(statuses: StatusOptions, pageSize: number): AdminListQueryState {
  const query = useSearchParams().toString();

  useEffect(() => {
    // Next가 replaceState·Back을 반영할 때마다 지금 주소를 기억한다(오래된 snapshot이 아니라 실제 주소).
    try {
      window.sessionStorage.setItem(`${LIST_RETURN_KEY_PREFIX}${window.location.pathname}`, `${window.location.pathname}${window.location.search}`);
    } catch {
      // 저장소가 막힌 환경에선 '목록'이 조건 없는 목록으로 돌아갈 뿐이다.
    }
  }, [query]);
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

/**
 * 상세 화면 '목록' 버튼의 목적지 — 그 목록을 마지막으로 본 주소(검색·필터·페이지 포함).
 * 기억된 주소가 없거나 다른 경로면 조건 없는 목록이다. 저장소는 서버에 없으므로 마운트 뒤에 읽는다.
 */
export function useAdminListReturnHref(listPath: string): string {
  const [href, setHref] = useState(listPath);
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(`${LIST_RETURN_KEY_PREFIX}${listPath}`);
      if (saved && (saved === listPath || saved.startsWith(`${listPath}?`))) setHref(saved);
    } catch {
      // 저장소를 못 읽으면 조건 없는 목록으로 돌아간다.
    }
  }, [listPath]);
  return href;
}
