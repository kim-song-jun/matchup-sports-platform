'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { withFromPath, sanitizeRedirectPath } from '@/lib/session-storage';
import { usePublicTeamRecords } from '@/components/public-game-records/use-public-game-records';
import { TeamRecordsContent } from '@/components/public-game-records/team-records-content';
import type { TeamRecordTypeFilter } from '@/components/public-game-records/types';

function RecordsSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 90, borderRadius: 'var(--radius-control)' }} />
      <div className="tm-skeleton" style={{ height: 200, borderRadius: 'var(--radius-control)' }} />
    </div>
  );
}

function recordTypeFromQuery(value: string | null): TeamRecordTypeFilter {
  return value === 'league' || value === 'tournament' || value === 'friendly' ? value : 'all';
}

function recordSeasonFromQuery(value: string | null): string | undefined {
  return value !== null && /^[0-9]{4}$/.test(value) ? value : undefined;
}

export function TeamRecordsPageClient({ teamId }: { teamId: string }) {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const urlType = recordTypeFromQuery(searchParams.get('type'));
  const urlSeason = recordSeasonFromQuery(searchParams.get('season'));
  const recordsPath = `/teams/${encodeURIComponent(teamId)}/records`;
  const [selection, setSelection] = useState({ teamId, type: urlType, season: urlSeason });
  const activeType = selection.teamId === teamId ? selection.type : urlType;
  // '전체 시즌'은 서버 season을 생략하는 상태다. 두 조건을 함께 보관해야 연속 선택도 유지된다.
  const activeSeason = selection.teamId === teamId ? selection.season : urlSeason;
  useEffect(() => {
    // 이전 query가 늦게 반영돼도 URL에 이미 저장한 최신 선택을 되돌리지 않는다.
    if (window.location.pathname === recordsPath && new URLSearchParams(window.location.search).toString() !== queryString) return;
    setSelection({ teamId, type: urlType, season: urlSeason });
  }, [teamId, urlType, urlSeason, queryString, recordsPath]);

  const changeFilters = (changes: { readonly type?: TeamRecordTypeFilter; readonly season?: string | undefined }) => {
    const onRecordsPath = window.location.pathname === recordsPath;
    const params = new URLSearchParams(onRecordsPath ? window.location.search : queryString);
    const type = changes.type ?? recordTypeFromQuery(params.get('type'));
    const season = 'season' in changes ? changes.season : recordSeasonFromQuery(params.get('season'));
    const returnFrom = sanitizeRedirectPath(params.get('from'));
    params.delete('from');
    if (type === 'all') params.delete('type');
    else params.set('type', type);
    if (season === undefined) params.delete('season');
    else params.set('season', season);
    const query = params.toString();
    const hash = onRecordsPath ? window.location.hash : '';
    setSelection({ teamId, type, season });
    // Next의 native history 연동으로 검색 상태와 앱 history stamp를 함께 갱신한다.
    window.history.replaceState(null, '', withFromPath(`${recordsPath}${query ? `?${query}` : ''}${hash}`, returnFrom));
  };

  const { data, isPending, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePublicTeamRecords(teamId, activeSeason, activeType === 'all' ? undefined : activeType);

  const firstPage = data?.pages[0];

  // 공유 링크로 들어온 방문자에게 "팀 전적"만 보여주면 어느 팀인지 알 수 없다.
  // 로딩·에러 중(firstPage 없음)엔 아직 팀명이 없으므로 테이블의 "팀 전적" 기본값이
  // 그대로 쓰인다(route-chrome/fragments/teams.ts, §1.9 "결합 제목" 하위유형).
  // 팀 상세가 받은 출처를 이어받아 왔으면 뒤로가기를 그 팀 상세(출처 포함)로 돌린다.
  const fromPath = sanitizeRedirectPath(searchParams.get('from'));
  const returnParams = new URLSearchParams(queryString);
  returnParams.delete('from');
  if (activeType === 'all') returnParams.delete('type');
  else returnParams.set('type', activeType);
  if (activeSeason === undefined) returnParams.delete('season');
  else returnParams.set('season', activeSeason);
  const returnQuery = returnParams.toString();
  const selfHref = withFromPath(`${recordsPath}${returnQuery ? `?${returnQuery}` : ''}`, fromPath);
  useShellOverride({
    ...(firstPage?.teamName ? { title: `${firstPage.teamName} 전적` } : {}),
  });

  // isPending — 서버 렌더에서 isLoading 은 false 라 아래 오류 분기로 떨어진다(대회 상세와 같다).
  if (isPending) {
    return <RecordsSkeleton />;
  }

  if (isError || !firstPage) {
    const msg = extractErrorMessage(error, '팀 전적을 불러오지 못했어요.');
    return (
      <div style={{ padding: '40px 20px' }}>
        <ErrorState message={msg} onRetry={() => void refetch()} />
      </div>
    );
  }

  const combined = {
    ...firstPage,
    items: data.pages.flatMap((page) => page.items),
  };

  return (
    <TeamRecordsContent
      data={combined}
      selfHref={selfHref}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={() => void fetchNextPage()}
      activeType={activeType}
      onChangeType={(type) => changeFilters({ type })}
      activeSeason={activeSeason}
      onChangeSeason={(season) => changeFilters({ season })}
    />
  );
}
