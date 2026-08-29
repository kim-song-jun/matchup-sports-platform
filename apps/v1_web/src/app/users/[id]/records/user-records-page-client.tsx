'use client';

import { AppChrome } from '@/components/v1-ui/shell';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { usePublicUserRecords } from '@/components/public-game-records/use-public-game-records';
import { UserRecordsContent } from '@/components/public-game-records/user-records-content';

function RecordsSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 90, borderRadius: 'var(--radius-control)' }} />
      <div className="tm-skeleton" style={{ height: 200, borderRadius: 'var(--radius-control)' }} />
    </div>
  );
}

export function UserRecordsPageClient({ userId }: { userId: string }) {
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePublicUserRecords(userId);

  if (isLoading) {
    return (
      <AppChrome title="활동 기록" activeTab="teams" backHref={`/users/${userId}`} desktopHead>
        <RecordsSkeleton />
      </AppChrome>
    );
  }

  const firstPage = data?.pages[0];
  if (isError || !firstPage) {
    const msg = extractErrorMessage(error, '활동 기록을 불러오지 못했어요.');
    return (
      <AppChrome title="활동 기록" activeTab="teams" backHref={`/users/${userId}`} desktopHead>
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

  // 공유 링크로 들어온 방문자에게 "활동 기록"만 보여주면 누구의 기록인지 알 수 없다.
  // page.tsx 의 metadata.title 은 이미 닉네임을 붙이고 있었는데 화면 헤더만 제네릭이었다.
  // 공개 신원으로 쓸 수 있는 값은 닉네임뿐이며(D-03/D-11), 없으면 종전 문구를 그대로 둔다.
  return (
    <AppChrome
      title={combined.nickname ? `${combined.nickname} 님의 활동 기록` : '활동 기록'}
      activeTab="teams"
      backHref={`/users/${userId}`}
      desktopHead
    >
      <UserRecordsContent
        data={combined}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
      />
    </AppChrome>
  );
}
