'use client';

import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState } from '@/components/v1-ui/primitives';
import { usePublicTournamentSchedule } from '@/components/public-game-records/use-public-game-records';
import { fixtureStatusLabel, resultStateLabel } from '@/components/public-game-records/format';
import { v1Get } from '@/lib/api-client';
import { formatTournamentDateTimeShort } from '@/lib/date-utils';
import type { V1LeagueOverallStandingsResponse } from '@/types/api';
import { LeagueProgress } from './league-progress';

export function LeagueProgressSummary({ tournamentId }: { tournamentId: string }) {
  // 조회한 페이지의 경기 수 대신 상세와 같은 전체 일정 집계를 사용한다.
  const query = useQuery({
    queryKey: ['v1', 'league-overall-standings', tournamentId],
    queryFn: () => v1Get<V1LeagueOverallStandingsResponse>(`/tournaments/${tournamentId}/standings/overall`),
    retry: false,
  });
  return (
    <div style={{ padding: 'var(--spacing-4)' }}>
      {query.isError ? <ErrorState message="진행률을 불러오지 못했어요." onRetry={() => void query.refetch()} />
        : query.isPending ? <div className="tm-skeleton" aria-label="진행률 불러오는 중" style={{ height: 'var(--size-control-md)' }} />
        : <LeagueProgress progress={query.data.progress} />}
    </div>
  );
}

export function LeagueTeamFixturesDetail({ tournamentId, teamId }: { tournamentId: string; teamId: string | null }) {
  // 일정 탭과 같은 무한 쿼리를 공유한다. 아직 읽지 않은 페이지를 경기 없음으로 판정하지 않는다.
  const query = usePublicTournamentSchedule(tournamentId);
  const entries = [...new Map((query.data?.pages.flatMap((page) => [...page.items, ...page.unscheduled]) ?? [])
    .map((entry) => [entry.fixtureId, entry])).values()]
    .filter((entry) => teamId !== null && (entry.home?.teamId === teamId || entry.away?.teamId === teamId))
    .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''));
  const more = Boolean(query.hasNextPage);

  if (query.isError && !query.isFetchNextPageError) return <ErrorState message="경기 전적을 불러오지 못했어요." onRetry={() => void query.refetch()} />;
  if (query.isPending) return <div className="tm-skeleton" aria-label="경기 전적 불러오는 중" style={{ height: 'var(--size-control-md)' }} />;

  return (
    <div>
      {entries.length === 0 && !more ? <EmptyState title="배정된 경기가 아직 없어요" sub="일정이 확정되면 이 팀의 경기가 여기에 표시돼요." /> : (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)', listStyle: 'none', margin: 0, padding: 0 }}>
          {entries.map((entry) => {
            const home = entry.home?.teamId === teamId;
            const opponent = (home ? entry.away : entry.home)?.teamName ?? '비공개';
            const scored = home ? entry.score?.home : entry.score?.away;
            const conceded = home ? entry.score?.away : entry.score?.home;
            const official = entry.scoreStatus === 'official' && entry.resultState !== 'void' && entry.status !== 'cancelled';
            const hasScore = entry.scoreStatus !== 'unavailable' && scored !== undefined && conceded !== undefined;
            const result = official && hasScore ? (scored > conceded ? '승' : scored < conceded ? '패' : '무') : null;
            const state = entry.status === 'cancelled' || entry.scoreStatus === 'live'
              ? fixtureStatusLabel(entry.status)
              : entry.resultState === 'void' || entry.resultState === 'corrected' || entry.scoreStatus === 'pending'
                ? resultStateLabel(entry.resultState) : null;
            return (
              <li key={entry.fixtureId} className="tm-text-caption tm-on-tint" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--spacing-2)', padding: 'var(--spacing-2) var(--spacing-3)', borderRadius: 'var(--radius-chip)', background: 'var(--surface-soft)' }}>
                <span style={{ color: 'var(--text-caption)' }}>{home ? '홈' : '원정'}</span>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere', color: 'var(--text-strong)', fontWeight: 600 }}>{opponent}</span>
                <span className="tab-num" style={{ color: 'var(--text-strong)', fontWeight: 700 }}>
                  {state} {result} {hasScore && entry.status !== 'cancelled' && entry.resultState !== 'void' ? `${scored}-${conceded}` : formatTournamentDateTimeShort(entry.scheduledAt) ?? '시간 미정'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {query.isFetchNextPageError ? <ErrorState message="다음 경기 전적을 불러오지 못했어요." onRetry={() => void query.fetchNextPage()} /> : more ? (
        <button type="button" className="tm-btn tm-btn-sm tm-btn-ghost" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()} style={{ marginTop: 'var(--spacing-2)', minHeight: 'var(--size-control-md)' }}>
          {query.isFetchingNextPage ? '불러오는 중…' : '경기 전적 더 보기'}
        </button>
      ) : null}
    </div>
  );
}
