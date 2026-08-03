'use client';

import { AppChrome } from '@/components/v1-ui/shell';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { usePublicUserRecords } from '@/components/public-game-records/use-public-game-records';
import { UserRecordsContent } from '@/components/public-game-records/user-records-content';

function RecordsSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 90, borderRadius: 12 }} />
      <div className="tm-skeleton" style={{ height: 200, borderRadius: 12 }} />
    </div>
  );
}

export function UserRecordsPageClient({ userId }: { userId: string }) {
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePublicUserRecords(userId);

  if (isLoading) {
    return (
      <AppChrome title="활동 기록" activeTab="teams" bottomNav={false} backHref={`/users/${userId}`}>
        <RecordsSkeleton />
      </AppChrome>
    );
  }

  const firstPage = data?.pages[0];
  if (isError || !firstPage) {
    const msg = extractErrorMessage(error, '활동 기록을 불러오지 못했어요.');
    return (
      <AppChrome title="활동 기록" activeTab="teams" bottomNav={false} backHref={`/users/${userId}`}>
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
    <AppChrome title="활동 기록" activeTab="teams" bottomNav={false} backHref={`/users/${userId}`}>
      <UserRecordsContent
        data={combined}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
      />
    </AppChrome>
  );
}
