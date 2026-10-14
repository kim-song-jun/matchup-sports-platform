'use client';

import { useEffect, useState } from 'react';
import { EmptyState, ErrorState, SectionTitle } from '@/components/v1-ui/primitives';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { useV1MyTeams } from '@/hooks/use-v1-api';
import { isUnauthenticatedError } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { hasStoredV1Session } from '@/lib/session-storage';
import { ScheduleContent } from './schedule-content';
import type { PublicScheduleEntry, PublicTournamentScheduleResponse } from './types';

type TeamScope = 'all' | 'mine';
function scopeFromHref(href?: string | null): TeamScope {
  return new URL(href ?? '/', 'https://teameet.invalid').searchParams.get('teamScope') === 'mine' ? 'mine' : 'all';
}

/** Filter memberships before live/round grouping, including time-unset fixtures. */
export function LeagueScheduleContent({ tournamentId, data, fromHref, hasNextPage, isFetchingNextPage, onLoadMore }: {
  tournamentId: string;
  data: PublicTournamentScheduleResponse;
  fromHref?: string | null;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore: () => void;
}) {
  const [sessionReady, setSessionReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [draft, setDraft] = useState(() => ({ tournamentId, scope: scopeFromHref(fromHref), href: fromHref }));
  const scope = draft.tournamentId === tournamentId ? draft.scope : scopeFromHref(fromHref);
  const currentHref = draft.tournamentId === tournamentId ? draft.href : fromHref;
  const teams = useV1MyTeams(undefined, { enabled: sessionReady && hasSession });

  useEffect(() => {
    setHasSession(hasStoredV1Session());
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (!fromHref) return;
    const source = new URL(fromHref, window.location.origin);
    const sync = () => {
      if (source.origin !== window.location.origin || source.pathname !== window.location.pathname) return;
      const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      setDraft({ tournamentId, scope: scopeFromHref(href), href });
    };
    // A delayed router snapshot must not overwrite a click; history events read the actual URL.
    if (source.searchParams.toString() === new URLSearchParams(window.location.search).toString()) sync();
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, [fromHref, tournamentId]);

  function selectScope(next: TeamScope) {
    let href = currentHref;
    if (href) {
      const source = new URL(href, window.location.origin);
      const url = new URL(window.location.href);
      if (source.origin === url.origin && source.pathname === url.pathname) {
        if (next === 'mine') url.searchParams.set('teamScope', 'mine');
        else url.searchParams.delete('teamScope');
        href = `${url.pathname}${url.search}${url.hash}`;
        window.history.replaceState(window.history.state, '', href);
      }
    }
    setDraft({ tournamentId, scope: next, href });
  }

  const myTeamIds = new Set((!hasSession || teams.isError ? [] : teams.data?.items ?? [])
    .filter((team) => team.status === 'active').map((team) => team.teamId));
  const isMine = (entry: PublicScheduleEntry) =>
    (entry.home?.teamId != null && myTeamIds.has(entry.home.teamId)) ||
    (entry.away?.teamId != null && myTeamIds.has(entry.away.teamId));
  const filtered = scope === 'mine'
    ? { ...data, items: data.items.filter(isMine), unscheduled: data.unscheduled.filter(isMine) } : data;
  const count = filtered.items.length + filtered.unscheduled.length;
  const participates = data.standings.some((row) => row.teamId != null && myTeamIds.has(row.teamId));
  const needsLogin = !hasSession || isUnauthenticatedError(teams.error);
  const identityHidden = [...data.items, ...data.unscheduled].some((entry) =>
    (entry.home !== null && entry.home.teamId === null) || (entry.away !== null && entry.away.teamId === null)) ||
    data.standings.some((row) => row.teamId === null);
  const redirect = currentHref ?? `/tournaments/${encodeURIComponent(tournamentId)}/bracket?teamScope=mine`;
  const pendingMine = scope === 'mine' && (!sessionReady || (!needsLogin && (teams.isPending || hasNextPage)));

  let content;
  if (!data.bracketPublished) {
    content = <ScheduleContent tournamentId={tournamentId} data={data} isRegularLeague showStandings={false} />;
  } else if (scope === 'mine' && sessionReady && needsLogin) {
    content = <EmptyState title="내 팀 일정을 보려면 로그인해 주세요" sub="소속된 팀의 경기를 모아서 볼 수 있어요."
      cta="로그인하기" ctaHref={`/login?redirect=${encodeURIComponent(redirect)}`} />;
  } else if (scope === 'mine' && teams.isError) {
    content = <ErrorState title="내 팀 정보를 불러오지 못했어요"
      message={extractErrorMessage(teams.error, '팀 소속 정보를 확인하지 못했어요.')}
      onRetry={() => void teams.refetch()} />;
  } else if (pendingMine) {
    content = <div role="status" aria-label="내 팀 일정 불러오는 중" style={{ padding: 'var(--spacing-5)' }}>
      <p className="tm-text-caption">내 팀 일정을 불러오는 중이에요.</p>
      <div className="tm-skeleton" style={{ height: 'var(--size-control-lg)', borderRadius: 'var(--radius-control)' }} />
    </div>;
  } else if (scope === 'mine' && count === 0) {
    content = <EmptyState
      title={identityHidden ? '참가팀 공개 후 내 팀 일정을 확인할 수 있어요' : participates ? '내 팀에 배정된 경기가 아직 없어요' : '이 리그에 참가하는 내 팀이 없어요'}
      sub={identityHidden ? '지금은 전체 경기 일정을 확인해 주세요.' : participates ? '대진이 배정되면 여기에서 확인할 수 있어요.' : '다른 팀의 경기 일정도 확인해 보세요.'}
      cta="전체 일정 보기" onCta={() => selectScope('all')} />;
  } else {
    content = <ScheduleContent tournamentId={tournamentId} data={filtered} isRegularLeague prioritizeLiveGames
      showStandings={false} showScheduleHeading={false} myTeamIds={myTeamIds} fromHref={currentHref}
      hasNextPage={hasNextPage} isFetchingNextPage={isFetchingNextPage} onLoadMore={onLoadMore} />;
  }

  const canCount = data.bracketPublished && (scope === 'all' || (!pendingMine && !needsLogin && !teams.isError && !identityHidden));
  return <>
    <div style={{ padding: 'var(--spacing-4) var(--spacing-5) 0', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-3)' }}>
      <div role="heading" aria-level={3}><SectionTitle title="경기 일정" /></div>
      <SegmentedTabs items={[{ id: 'all', label: '전체' }, { id: 'mine', label: '내 팀' }]}
        activeId={scope} onSelect={(id) => selectScope(id === 'mine' ? 'mine' : 'all')} ariaLabel="경기 일정 팀 필터" role="tablist" />
      {canCount ? <p className="tm-text-caption" role="status" style={{ margin: 0 }}>
        {hasNextPage ? `불러온 ${count}경기 · 나머지 일정 불러오는 중` : `총 ${count}경기`}
      </p> : null}
    </div>
    {content}
  </>;
}
