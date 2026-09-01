'use client';

import { useShellOverride } from '@/components/v1-ui/shell-override';
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

  const firstPage = data?.pages[0];

  // 공유 링크로 들어온 방문자에게 "활동 기록"만 보여주면 누구의 기록인지 알 수 없다.
  // page.tsx 의 metadata.title 은 이미 닉네임을 붙이고 있었는데 화면 헤더만 제네릭이었다.
  // 공개 신원으로 쓸 수 있는 값은 닉네임뿐이며(D-03/D-11), 없으면 종전 문구를 그대로 둔다.
  // Hooks 규칙: loading/error 조기 return보다 위에서 항상 호출한다(fetch된 제목 패턴,
  // app-shell-promotion.md §1.9). 로딩/에러 중엔 firstPage가 없어 fragment의 기본값
  // ('활동 기록')이 그대로 유지된다.
  useShellOverride({
    title: firstPage?.nickname ? `${firstPage.nickname} 님의 활동 기록` : '활동 기록',
  });

  if (isLoading) {
    return <RecordsSkeleton />;
  }

  if (isError || !data || !firstPage) {
    const msg = extractErrorMessage(error, '활동 기록을 불러오지 못했어요.');
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
    <UserRecordsContent
      data={combined}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={() => void fetchNextPage()}
    />
  );
}
