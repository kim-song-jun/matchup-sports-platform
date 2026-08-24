'use client';

import { AppChrome } from '@/components/v1-ui/shell';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { usePublicTournamentPlayerRecords, usePublicTournamentSchedule } from '@/components/public-game-records/use-public-game-records';
import { TournamentPlayerRecordsSections } from '@/components/public-game-records/player-records-sections';
import { ScheduleContent } from '@/components/public-game-records/schedule-content';
import { useV1MyTournamentFixtures } from '@/hooks/use-v1-api';

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
  const playerRecords = usePublicTournamentPlayerRecords(tournamentId);
  // 로그인한 팀장에게만 자기 팀 경기가 얹힌다 — 비로그인·비참가자는 401/빈 응답이라
  // 화면이 종전과 똑같다(공개 일정은 이 조회와 무관하게 그려진다).
  const myFixtures = useV1MyTournamentFixtures(tournamentId);

  if (isLoading) {
    return (
      <AppChrome title="경기 일정" backHref={`/tournaments/${tournamentId}`} activeTab="tournaments" desktopHead>
        <ScheduleSkeleton />
      </AppChrome>
    );
  }

  const firstPage = data?.pages[0];
  if (isError || !firstPage) {
    const msg = extractErrorMessage(error, '경기 일정을 불러오지 못했어요.');
    return (
      <AppChrome title="경기 일정" backHref={`/tournaments/${tournamentId}`} activeTab="tournaments" desktopHead>
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
  // desktopHead 가 없으면 데스크톱에서 이 title(h1)이 아예 렌더되지 않아 대회명이
  // 화면 어디에도 안 보였다(2026-08-05 페르소나 검수 visitor-03에서 확인) — 3개 분기 모두에 추가.
  return (
    <AppChrome
      title={combined.tournamentTitle ? `${combined.tournamentTitle} 경기 일정` : '경기 일정'}
      backHref={`/tournaments/${tournamentId}`}
      activeTab="tournaments"
      desktopHead
    >
      <ScheduleContent
        tournamentId={tournamentId}
        data={combined}
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
        myFixtures={myFixtures.data}
      />
      {/* 회고 STATS-1 — 대회 개인 득점·도움 랭킹. ScheduleContent 컨테이너와 같은
          좌우 20px 리듬. 기록이 없으면 아무것도 그리지 않는다(emptyBehavior=hide). */}
      <div style={{ padding: '0 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <TournamentPlayerRecordsSections
          goals={playerRecords.data?.goals}
          assists={playerRecords.data?.assists}
          isLoading={playerRecords.isLoading}
          isError={playerRecords.isError}
          errorMessage={extractErrorMessage(playerRecords.error, '기록을 불러오지 못했어요.')}
          onRetry={() => void playerRecords.refetch()}
          emptyBehavior="hide"
        />
      </div>
    </AppChrome>
  );
}
