'use client';

import { useState } from 'react';
import { AppChrome } from '@/components/v1-ui/shell';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { usePublicTeamRecords } from '@/components/public-game-records/use-public-game-records';
import { TeamRecordsContent } from '@/components/public-game-records/team-records-content';
import type { TeamRecordTypeFilter } from '@/components/public-game-records/types';

function RecordsSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 90, borderRadius: 12 }} />
      <div className="tm-skeleton" style={{ height: 200, borderRadius: 12 }} />
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

  if (isLoading) {
    return (
      <AppChrome title="팀 전적" backHref={`/teams/${teamId}`} activeTab="teams" desktopHead>
        <RecordsSkeleton />
      </AppChrome>
    );
  }

  const firstPage = data?.pages[0];
  if (isError || !firstPage) {
    const msg = extractErrorMessage(error, '팀 전적을 불러오지 못했어요.');
    return (
      <AppChrome title="팀 전적" backHref={`/teams/${teamId}`} activeTab="teams" desktopHead>
        <div style={{ padding: '40px 20px' }}>
          <ErrorState message={msg} onRetry={() => void refetch()} />
        </div>
      </AppChrome>
    );
  }

  const combined = {
    ...firstPage,
    items: data.pages.flatMap((page) => page.items),
  };

  // 공유 링크로 들어온 방문자에게 "팀 전적"만 보여주면 어느 팀인지 알 수 없다.
  // 로딩·에러 분기에는 아직 팀명이 없으므로 그때는 종전 문구를 그대로 쓴다.
  return (
    <AppChrome
      title={combined.teamName ? `${combined.teamName} 전적` : '팀 전적'}
      backHref={`/teams/${teamId}`}
      activeTab="teams"
      desktopHead
    >
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
    </AppChrome>
  );
}
