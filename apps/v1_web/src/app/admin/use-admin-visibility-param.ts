'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ADMIN_VISIBILITY_OPTIONS } from '@/components/admin/admin-visibility-filter';
import { pickAllowedParam } from './pick-allowed-param';

/**
 * 공개 여부 필터(`?visibility=`)를 URL 에 남기는 목록 상태. `useAdminUrlListQuery` 는 다른 URL
 * 파라미터를 건드리지 않으므로 이 훅이 따로 읽고 쓴다. 허용 값(전체·공개·숨김) 밖의 값은 전체로 본다.
 */
export function useAdminVisibilityParam(resetToFirstPage: () => void): [string, (next: string) => void] {
  const query = useSearchParams().toString();
  const [visibility, setVisibilityState] = useState(() =>
    pickAllowedParam(new URLSearchParams(query).get('visibility'), ADMIN_VISIBILITY_OPTIONS));
  useEffect(() => {
    // Next 가 늦게 전달한 오래된 snapshot 은 실제 주소와 다르므로 무시한다(공용 훅과 같은 가드).
    if (query !== new URLSearchParams(window.location.search).toString()) return;
    setVisibilityState(pickAllowedParam(new URLSearchParams(query).get('visibility'), ADMIN_VISIBILITY_OPTIONS));
  }, [query]);
  const setVisibility = useCallback((next: string) => {
    setVisibilityState(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('visibility', next);
    else url.searchParams.delete('visibility');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    resetToFirstPage();
  }, [resetToFirstPage]);
  return [visibility, setVisibility];
}
