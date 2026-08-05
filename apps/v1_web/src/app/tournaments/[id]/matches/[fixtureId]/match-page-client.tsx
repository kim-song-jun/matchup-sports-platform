'use client';

import Link from 'next/link';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { usePublicMatch } from '@/components/public-game-records/use-public-game-records';
import { MatchDetailContent } from '@/components/public-game-records/match-detail-content';
import { useV1FixtureLineupAccess } from '@/hooks/use-v1-api';

function MatchSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 140, borderRadius: 12 }} />
      <div className="tm-skeleton" style={{ height: 180, borderRadius: 12 }} />
    </div>
  );
}

/** 참가팀 매니저에게만 보이는 라인업 관리 CTA. 공개 기록(usePublicMatch)은
 * visibilityPolicy(공개 시점) 이전엔 404를 던지므로 — 팀은 공개 시점 전에
 * 라인업을 미리 준비하고 싶을 수 있어 그 성패와 무관하게 항상 시도한다.
 * 403(비참가자)이면 조용히 아무것도 렌더하지 않는다. */
function LineupManagementCta({ tournamentId, fixtureId }: { tournamentId: string; fixtureId: string }) {
  const access = useV1FixtureLineupAccess(tournamentId, fixtureId);
  if (access.data?.mySideId === null || access.data?.mySideId === undefined) return null;
  return (
    <Card pad={16} style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="tm-text-body-lg">라인업</div>
          <div className="tm-text-caption" style={{ marginTop: 4, color: 'var(--text-muted)' }}>
            선발·후보 명단을 작성하고 제출하세요.
          </div>
        </div>
        <Link
          className="tm-btn tm-btn-sm tm-btn-primary"
          href={`/tournaments/${tournamentId}/matches/${fixtureId}/lineup`}
          style={{ flexShrink: 0, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
        >
          라인업 관리
        </Link>
      </div>
    </Card>
  );
}

export function MatchPageClient({ tournamentId, fixtureId }: { tournamentId: string; fixtureId: string }) {
  const { data, isLoading, isError, error, refetch } = usePublicMatch(tournamentId, fixtureId);

  if (isLoading) {
    return (
      <AppChrome title="경기 기록" backHref={`/tournaments/${tournamentId}/schedule`} activeTab="tournaments" desktopHead>
        <MatchSkeleton />
      </AppChrome>
    );
  }

  if (isError || !data) {
    const msg = extractErrorMessage(error, '경기 정보를 찾을 수 없어요.');
    return (
      <AppChrome title="경기 기록" backHref={`/tournaments/${tournamentId}/schedule`} activeTab="tournaments" desktopHead>
        <div style={{ padding: '0 16px 40px' }}>
          <ErrorState message={msg} onRetry={() => void refetch()} />
          <LineupManagementCta tournamentId={tournamentId} fixtureId={fixtureId} />
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome title="경기 기록" backHref={`/tournaments/${tournamentId}/schedule`} activeTab="tournaments" desktopHead>
      <MatchDetailContent data={data} />
      <div style={{ padding: '0 16px' }}>
        <LineupManagementCta tournamentId={tournamentId} fixtureId={fixtureId} />
      </div>
    </AppChrome>
  );
}
