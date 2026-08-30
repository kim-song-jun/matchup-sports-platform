'use client';

import { AppChrome } from '@/components/v1-ui/shell';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { usePublicMatch } from '@/components/public-game-records/use-public-game-records';
import { MatchDetailContent } from '@/components/public-game-records/match-detail-content';
import { AttestRequestsSection } from '@/components/public-game-records/attest-requests';
import { ClaimMyRecordSection } from '@/components/public-game-records/claim-my-record';

function MatchSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 140, borderRadius: 'var(--radius-control)' }} />
      <div className="tm-skeleton" style={{ height: 180, borderRadius: 'var(--radius-control)' }} />
    </div>
  );
}

/** 참가팀 매니저에게만 보이는 라인업 관리 CTA. 이 화면은 공개 기록 페이지라
 * 히든/존재하지 않는 픽스처를 동일한 404로 처리해야 하는 계약(부모 page.tsx의
 * notFound(), public-game-records.test.tsx가 고정) 때문에 공개 시점 이전에는
 * 이 CTA 자체가 렌더될 기회가 없다 — 공개 이후에만 여기서 보인다. 공개 시점
 * 전 사전 준비는 /tournaments/:id/matches/:fixtureId/lineup 을 직접 아는
 * 경로로만 가능하다(후속 작업: 대회 "내 경기" 목록에서 바로 진입).
 * 403(비참가자)이면 조용히 아무것도 렌더하지 않는다. */
export function MatchPageClient({ tournamentId, fixtureId }: { tournamentId: string; fixtureId: string }) {
  const { data, isLoading, isError, error, refetch } = usePublicMatch(tournamentId, fixtureId);

  if (isLoading) {
    return (
      <AppChrome title="경기 기록" backHref={`/tournaments/${tournamentId}/bracket`} activeTab="tournaments" desktopHead>
        <MatchSkeleton />
      </AppChrome>
    );
  }

  if (isError || !data) {
    const msg = extractErrorMessage(error, '경기 정보를 찾을 수 없어요.');
    return (
      <AppChrome title="경기 기록" backHref={`/tournaments/${tournamentId}/bracket`} activeTab="tournaments" desktopHead>
        <div style={{ padding: '0 16px 40px' }}>
          <ErrorState message={msg} onRetry={() => void refetch()} />
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome title="경기 기록" backHref={`/tournaments/${tournamentId}/bracket`} activeTab="tournaments" desktopHead>
      <MatchDetailContent data={data} />
      <div style={{ padding: '0 16px' }}>
        {/* 기록 연결 승인함 (attest UI C안): 다른 참가자의 연결 신청을 확인·승인하는
            반대쪽 절반. 신청 알림의 착지 화면이기도 하다 — 요청이 있을 때만 보인다. */}
        <AttestRequestsSection gameId={data.gameId} />
        {/* Task 154 P0-5: 라인업에 이름만 있고 계정 연결이 안 된 선수가 자기 기록을
            가져오는 입구. [P1-d] 예전에는 라인업 관리 CTA 아래에 뒀는데 그 CTA 가
            사라졌다(경기별 라인업 화면 제거) -- 이제는 경기 기록 바로 아래이고,
            "명단을 보고 내가 없네를 깨달은 직후"라는 자리 자체는 그대로다. */}
        <ClaimMyRecordSection tournamentId={tournamentId} fixtureId={fixtureId} />
      </div>
    </AppChrome>
  );
}
