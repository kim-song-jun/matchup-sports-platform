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
      <div className="tm-skeleton" style={{ height: 120, borderRadius: 'var(--radius-control)' }} />
      <div className="tm-skeleton" style={{ height: 220, borderRadius: 'var(--radius-control)' }} />
    </div>
  );
}

export function SchedulePageClient({
  tournamentId,
  isLeague = false,
}: {
  tournamentId: string;
  /** 정규 리그 시즌인가. 단계 어휘와 선수 기록 섹션 노출을 가른다 — 아래 각 사용처 참조. */
  isLeague?: boolean;
}) {
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    usePublicTournamentSchedule(tournamentId);
  // **리그는 선수 기록을 집계할 수 없다.** 리그 참가자는 `userId` 로 이어져 있지 않아
  // 득점·도움을 사람 단위로 합칠 근거가 없다. 빈 표를 그리면 "아직 기록이 없다"로
  // 읽히는데 사실은 **집계 자체가 불가능**한 것이라, 조회도 렌더도 하지 않는다.
  const playerRecords = usePublicTournamentPlayerRecords(tournamentId, { enabled: !isLeague });
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
        isLeague={isLeague}
      />
      {/* 회고 STATS-1 — 대회 개인 득점·도움 랭킹. ScheduleContent 컨테이너와 같은
          좌우 20px 리듬. 기록이 없으면 아무것도(래퍼 여백 포함) 그리지 않는다 —
          래퍼는 containerStyle로 컴포넌트 안에서 내용과 함께만 렌더된다. */}
      {/* 리그에서는 이 섹션을 아예 그리지 않는다 — 위 `playerRecords` 주석 참조. */}
      {isLeague ? null : (
      <TournamentPlayerRecordsSections
        goals={playerRecords.data?.goals}
        assists={playerRecords.data?.assists}
        isLoading={playerRecords.isLoading}
        isError={playerRecords.isError}
        errorMessage={extractErrorMessage(playerRecords.error, '기록을 불러오지 못했어요.')}
        onRetry={() => void playerRecords.refetch()}
        emptyBehavior="hide"
        containerStyle={{ padding: '0 20px 40px', display: 'flex', flexDirection: 'column', gap: 20 }}
      />
      )}
    </AppChrome>
  );
}
