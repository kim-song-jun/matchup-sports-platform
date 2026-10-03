'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { useShellOverride } from '@/components/v1-ui/shell-override';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { withFromPath, sanitizeRedirectPath } from '@/lib/session-storage';
import { usePublicUserRecords } from '@/components/public-game-records/use-public-game-records';
import { UserRecordsContent, type UserRecordTabFilter } from '@/components/public-game-records/user-records-content';

function RecordsSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 90, borderRadius: 'var(--radius-control)' }} />
      <div className="tm-skeleton" style={{ height: 200, borderRadius: 'var(--radius-control)' }} />
    </div>
  );
}

function recordTabFromQuery(value: string | null): UserRecordTabFilter {
  return value === 'league' || value === 'tournament' || value === 'friendly' || value === 'personal' ? value : 'all';
}

export function UserRecordsPageClient({ userId }: { userId: string }) {
  // Task 166 BE-4: 팀 전적과 같은 4탭 + '개인'(본인 전용, 서버 API와 무관 — user-records-content.tsx 참고).
  // '전체'와 '개인'은 로컬 값이라 서버로 보내지 않는다('개인'은 애초에 이 API가 모르는 값이다).
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const urlType = recordTabFromQuery(searchParams.get('type'));
  const recordsPath = `/users/${encodeURIComponent(userId)}/records`;
  const [selection, setSelection] = useState({ userId, type: urlType });
  const selectedType = selection.userId === userId ? selection.type : urlType;
  useEffect(() => {
    // 빠른 연속 선택 뒤 늦게 도착한 이전 query는 현재 URL의 초안을 덮어쓰지 않는다.
    if (window.location.pathname === recordsPath && new URLSearchParams(window.location.search).toString() !== queryString) return;
    setSelection({ userId, type: urlType });
  }, [userId, urlType, queryString, recordsPath]);
  const serverType = selectedType === 'all' || selectedType === 'personal' ? undefined : selectedType;
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePublicUserRecords(userId, undefined, serverType);

  const firstPage = data?.pages[0];
  const confirmedOwner = firstPage?.userId === userId && firstPage.viewerIsOwner === true;
  const activeType = selectedType === 'personal' && !confirmedOwner ? 'all' : selectedType;

  const changeType = (type: UserRecordTabFilter) => {
    if (type === 'personal' && !confirmedOwner) return;
    const onRecordsPath = window.location.pathname === recordsPath;
    const params = new URLSearchParams(onRecordsPath ? window.location.search : queryString);
    const returnFrom = sanitizeRedirectPath(params.get('from'));
    params.delete('from');
    if (type === 'all') params.delete('type');
    else params.set('type', type);
    const query = params.toString();
    const hash = onRecordsPath ? window.location.hash : '';
    setSelection({ userId, type });
    // Next의 native-history 연동을 사용한다. null은 Next 검색 상태와 앱 history stamp를 함께 갱신한다.
    window.history.replaceState(null, '', withFromPath(`${recordsPath}${query ? `?${query}` : ''}${hash}`, returnFrom));
  };

  // 공유 링크로 들어온 방문자에게 "활동 기록"만 보여주면 누구의 기록인지 알 수 없다.
  // page.tsx 의 metadata.title 은 이미 닉네임을 붙이고 있었는데 화면 헤더만 제네릭이었다.
  // 공개 신원으로 쓸 수 있는 값은 닉네임뿐이며(D-03/D-11), 없으면 종전 문구를 그대로 둔다.
  // Hooks 규칙: loading/error 조기 return보다 위에서 항상 호출한다(fetch된 제목 패턴,
  // app-shell-promotion.md §1.9). 로딩/에러 중엔 firstPage가 없어 fragment의 기본값
  // ('활동 기록')이 그대로 유지된다.
  // 마이페이지 등 프로필을 거치지 않고 바로 들어오는 진입점을 위한 `?from=`
  // 오버라이드 — public-profile-client.tsx와 동일 패턴(route-chrome backHref는
  // 검색 파라미터를 못 받는다).
  const fromPath = sanitizeRedirectPath(searchParams.get('from'));
  const returnParams = new URLSearchParams(queryString);
  if (activeType === 'all') returnParams.delete('type');
  else returnParams.set('type', activeType);
  returnParams.delete('from');
  const returnQuery = returnParams.toString();
  const selfHref = withFromPath(`${recordsPath}${returnQuery ? `?${returnQuery}` : ''}`, fromPath);
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
      selfHref={selfHref}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={() => void fetchNextPage()}
      activeType={activeType}
      onChangeType={changeType}
    />
  );
}
