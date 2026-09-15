'use client';

import { useState } from 'react';
import { useShellOverride } from '@/components/v1-ui/shell-override';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
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

export function TeamRecordsPageClient({ teamId }: { teamId: string }) {
  const [activeType, setActiveType] = useState<TeamRecordTypeFilter>('all');
  // '전체 시즌' 은 로컬 전용 값(undefined)이다 -- 서버 `season` 쿼리 자체를 생략해
  // 팀 전체 기간을 요청한다(U2의 '전체' 탭과 동일한 계약).
  const [activeSeason, setActiveSeason] = useState<string | undefined>(undefined);
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePublicTeamRecords(teamId, activeSeason, activeType === 'all' ? undefined : activeType);

  const firstPage = data?.pages[0];

  // 공유 링크로 들어온 방문자에게 "팀 전적"만 보여주면 어느 팀인지 알 수 없다.
  // 로딩·에러 중(firstPage 없음)엔 아직 팀명이 없으므로 테이블의 "팀 전적" 기본값이
  // 그대로 쓰인다(route-chrome/fragments/teams.ts, §1.9 "결합 제목" 하위유형).
  useShellOverride(firstPage?.teamName ? { title: `${firstPage.teamName} 전적` } : {});

  if (isLoading) {
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
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={() => void fetchNextPage()}
      activeType={activeType}
      onChangeType={setActiveType}
      activeSeason={activeSeason}
      onChangeSeason={setActiveSeason}
    />
  );
}
