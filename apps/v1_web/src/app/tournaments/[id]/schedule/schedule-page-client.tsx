'use client';

import { AppChrome } from '@/components/v1-ui/shell';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { usePublicTournamentSchedule } from '@/components/public-game-records/use-public-game-records';
import { ScheduleContent } from '@/components/public-game-records/schedule-content';

function ScheduleSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 120, borderRadius: 12 }} />
      <div className="tm-skeleton" style={{ height: 220, borderRadius: 12 }} />
    </div>
  );
}

export function SchedulePageClient({ tournamentId }: { tournamentId: string }) {
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePublicTournamentSchedule(tournamentId);

  if (isLoading) {
    return (
      <AppChrome title="경기 일정" backHref={`/tournaments/${tournamentId}`} activeTab="tournaments">
        <ScheduleSkeleton />
      </AppChrome>
    );
  }

  const firstPage = data?.pages[0];
  if (isError || !firstPage) {
    const msg = extractErrorMessage(error, '경기 일정을 불러오지 못했어요.');
    return (
      <AppChrome title="경기 일정" backHref={`/tournaments/${tournamentId}`} activeTab="tournaments">
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

  // 공유 링크로 바로 들어온 방문자는 "경기 일정" 만으로는 어느 대회인지 알 수 없다.
  // page.tsx 의 metadata.title 은 이미 대회명을 붙이고 있는데 화면 헤더만 제네릭이었다.
  // 로딩·에러 분기에는 아직 대회명이 없으므로 그때는 종전 문구를 그대로 쓴다.
  return (
    <AppChrome
      title={combined.tournamentTitle ? `${combined.tournamentTitle} 경기 일정` : '경기 일정'}
      backHref={`/tournaments/${tournamentId}`}
      activeTab="tournaments"
    >
      <ScheduleContent
        tournamentId={tournamentId}
        data={combined}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
      />
    </AppChrome>
  );
}
