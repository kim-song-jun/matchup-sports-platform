'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { pickAllowedParam } from '../pick-allowed-param';

type Draft = {
  readonly search: string;
  readonly activeStatus: string;
  readonly activeCategory: string;
  readonly activeReportReason: string;
  readonly activeReportedTeamId: string;
};
type Options = ReadonlyArray<{ readonly value: string }>;
type QueryOptions = {
  readonly statuses: Options;
  readonly categories: Options;
  readonly reportReasons: Options;
};

function readDraft(query: string, options: QueryOptions): Draft {
  const params = new URLSearchParams(query);
  const activeCategory = pickAllowedParam(params.get('category'), options.categories);
  return {
    search: params.get('q') ?? '',
    activeStatus: pickAllowedParam(params.get('status'), options.statuses),
    activeCategory,
    // 다른 분류에서 보이지 않는 신고 사유로 결과를 좁히지 않는다.
    activeReportReason: activeCategory === 'report'
      ? pickAllowedParam(params.get('reportReason'), options.reportReasons) : '',
    activeReportedTeamId: params.get('reportedTeamId') ?? '',
  };
}

function draftQuery(draft: Draft): string {
  const query = new URLSearchParams();
  if (draft.search) query.set('q', draft.search);
  if (draft.activeStatus) query.set('status', draft.activeStatus);
  if (draft.activeCategory) query.set('category', draft.activeCategory);
  if (draft.activeCategory === 'report' && draft.activeReportReason) {
    query.set('reportReason', draft.activeReportReason);
  }
  if (draft.activeReportedTeamId) query.set('reportedTeamId', draft.activeReportedTeamId);
  // 문의 목록의 page는 계속 URL에 저장하지 않는다. 상세 복귀는 첫 페이지부터 조회한다.
  return query.toString();
}

function writeDraft(draft: Draft) {
  const query = draftQuery(draft);
  const { pathname, hash } = window.location;
  // null을 넘겨 Next의 native History 경계가 내부 router state를 복사하도록 한다.
  // 같은 history 항목을 동기 갱신하므로 입력 직후 상세를 열어도 draft가 남는다.
  window.history.replaceState(null, '', `${pathname}${query ? `?${query}` : ''}${hash}`);
}

/** 문의 목록만 입력을 즉시 보존하고 API 검색에는 기존 300ms debounce를 적용한다. */
export function useInquiryListQuery({ statuses, categories, reportReasons }: QueryOptions) {
  const query = useSearchParams().toString();
  const fromUrl = useMemo(
    () => readDraft(query, { statuses, categories, reportReasons }),
    [query, statuses, categories, reportReasons],
  );
  const [draft, setDraft] = useState(fromUrl);
  const latestDraft = useRef(draft);
  const [debouncedSearch, setDebouncedSearch] = useState(fromUrl.search.trim());
  const [page, setPage] = useState(1);

  useEffect(() => {
    // native History 갱신을 Next가 반영하기 전의 오래된 query는 최신 입력을 덮지 않는다.
    if (query !== new URLSearchParams(window.location.search).toString()) return;
    const current = latestDraft.current;
    if (current.search !== fromUrl.search || current.activeStatus !== fromUrl.activeStatus
      || current.activeCategory !== fromUrl.activeCategory
      || current.activeReportReason !== fromUrl.activeReportReason
      || current.activeReportedTeamId !== fromUrl.activeReportedTeamId) {
      latestDraft.current = fromUrl;
      setDraft(fromUrl);
      setDebouncedSearch(fromUrl.search.trim());
      setPage(1);
    }
    // 직접 입력한 잘못된 enum/숨은 사유는 기존처럼 URL에서도 정리한다.
    if (query !== draftQuery(fromUrl)) writeDraft(fromUrl);
  }, [query, fromUrl]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(draft.search.trim()), 300);
    return () => clearTimeout(timer);
  }, [draft.search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, draft.activeStatus, draft.activeCategory,
    draft.activeReportReason, draft.activeReportedTeamId]);

  const updateDraft = useCallback((patch: Partial<Draft>) => {
    // 빠른 연속 입력·필터 토글은 router snapshot이 아닌 가장 최근 draft에 병합한다.
    const merged = { ...latestDraft.current, ...patch };
    const next = { ...merged, activeReportReason: merged.activeCategory === 'report' ? merged.activeReportReason : '' };
    latestDraft.current = next;
    setDraft(next);
    writeDraft(next);
  }, []);

  const setSearch = useCallback((search: string) => updateDraft({ search }), [updateDraft]);
  const setActiveStatus = useCallback((activeStatus: string) => updateDraft({ activeStatus }), [updateDraft]);
  const setActiveCategory = useCallback((activeCategory: string) => updateDraft({ activeCategory }), [updateDraft]);
  const setActiveReportReason = useCallback((activeReportReason: string) => updateDraft({ activeReportReason }), [updateDraft]);
  const setActiveReportedTeamId = useCallback((activeReportedTeamId: string) => updateDraft({ activeReportedTeamId }), [updateDraft]);

  return {
    ...draft, debouncedSearch, page, setPage, setSearch, setActiveStatus,
    setActiveCategory, setActiveReportReason, setActiveReportedTeamId,
  };
}
