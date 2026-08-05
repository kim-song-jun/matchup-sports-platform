'use client';

import { AppChrome } from '@/components/v1-ui/shell';
import { ErrorState } from '@/components/v1-ui/primitives';
import { extractErrorMessage } from '@/lib/error-message';
import { usePublicMatch } from '@/components/public-game-records/use-public-game-records';
import { MatchDetailContent } from '@/components/public-game-records/match-detail-content';

function MatchSkeleton() {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="tm-skeleton" style={{ height: 140, borderRadius: 12 }} />
      <div className="tm-skeleton" style={{ height: 180, borderRadius: 12 }} />
    </div>
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
        <div style={{ padding: '40px 20px' }}>
          <ErrorState message={msg} onRetry={() => void refetch()} />
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome title="경기 기록" backHref={`/tournaments/${tournamentId}/schedule`} activeTab="tournaments" desktopHead>
      <MatchDetailContent data={data} />
    </AppChrome>
  );
}
