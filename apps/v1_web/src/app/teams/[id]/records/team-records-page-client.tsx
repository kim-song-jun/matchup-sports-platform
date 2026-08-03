'use client';

import { AppChrome } from '@/components/v1-ui/shell';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { usePublicTeamRecords } from '@/components/public-game-records/use-public-game-records';
import { TeamRecordsContent } from '@/components/public-game-records/team-records-content';

function RecordsSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 90, borderRadius: 12 }} />
      <div className="tm-skeleton" style={{ height: 200, borderRadius: 12 }} />
    </div>
  );
}

export function TeamRecordsPageClient({ teamId }: { teamId: string }) {
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePublicTeamRecords(teamId);

  if (isLoading) {
    return (
      <AppChrome title="팀 전적" backHref={`/teams/${teamId}`} activeTab="teams">
        <RecordsSkeleton />
      </AppChrome>
    );
  }

  const firstPage = data?.pages[0];
  if (isError || !firstPage) {
    const msg = extractErrorMessage(error, '팀 전적을 불러오지 못했어요.');
    return (
      <AppChrome title="팀 전적" backHref={`/teams/${teamId}`} activeTab="teams">
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

  return (
    <AppChrome title="팀 전적" backHref={`/teams/${teamId}`} activeTab="teams">
      <TeamRecordsContent
        data={combined}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
      />
    </AppChrome>
  );
}
