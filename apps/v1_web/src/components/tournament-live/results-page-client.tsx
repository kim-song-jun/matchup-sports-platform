'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { ScopedLink as Link } from '@/components/providers/navigation-scope';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { OpsPageHeader } from '@/components/tournament-ops/ops-page-header';
import { overdueFixtureIdsOf, partitionResultFixtures } from '@/components/tournament-ops/result-partition';
import { buildLeagueFixtureTitles, resolveFixtureLabel } from '@/components/tournament-result-review/fixture-label';
import { describeResultReviewError } from '@/components/tournament-result-review/result-review-copy';
import { ErrorState } from '@/components/v1-ui/primitives';
import { DESKTOP_LIST_MEDIA_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import { useTournamentEndedFixtures } from '@/hooks/use-tournament-result-review';
import { useV1Tournament } from '@/hooks/use-v1-api';
import { resolveTournamentLiveBase } from '@/lib/tournament-live-routes';
import { ResultFixtureList, type ResultListItem } from './result-fixture-list';
import { ResultPanel } from './result-panel';

/** 끝난 경기의 결과를 확정하거나 고치는 한 화면. 옛 결과 검토·결과 정정 화면을 합쳤다. */
export function ResultsPageClient({ tournamentId }: { tournamentId: string }) {
  const pathname = usePathname();
  const liveBase = resolveTournamentLiveBase(pathname, tournamentId);
  const searchParams = useSearchParams();
  const deepLinkFixtureId = searchParams.get('fixtureId');
  const isDesktop = useMediaQuery(DESKTOP_LIST_MEDIA_QUERY);

  const tournament = useV1Tournament(tournamentId);
  const ended = useTournamentEndedFixtures(tournamentId);

  const [pickedFixtureId, setPickedFixtureId] = useState<string | null>(deepLinkFixtureId);
  const [fromDeepLink, setFromDeepLink] = useState(deepLinkFixtureId !== null);
  const [phoneShowsPanel, setPhoneShowsPanel] = useState(deepLinkFixtureId !== null);
  const [officializedFixtureId, setOfficializedFixtureId] = useState<string | null>(null);
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);

  // 같은 화면에서 뒤로·앞으로 이동하면 쿼리만 바뀐다 — 새 딥링크를 따른다.
  useEffect(() => {
    setPickedFixtureId(deepLinkFixtureId);
    setFromDeepLink(deepLinkFixtureId !== null);
    setPhoneShowsPanel(deepLinkFixtureId !== null);
    setOfficializedFixtureId(null);
  }, [deepLinkFixtureId, tournamentId]);

  const teamNamesByFixtureId = useMemo(() => {
    const map = new Map<string, { home: string; away: string }>();
    for (const fixture of tournament.data?.fixtures ?? []) {
      map.set(fixture.id, { home: fixture.homeTeamName ?? '미정', away: fixture.awayTeamName ?? '미정' });
    }
    return map;
  }, [tournament.data?.fixtures]);
  const leagueTitles = useMemo(() => buildLeagueFixtureTitles(tournament.data?.leagueFixtures), [tournament.data?.leagueFixtures]);
  const titleFor = useCallback(
    (item: ResultListItem) => resolveFixtureLabel(item, teamNamesByFixtureId.get(item.fixtureId), leagueTitles).title,
    [teamNamesByFixtureId, leagueTitles],
  );

  const { pending, confirmed } = useMemo(
    () => partitionResultFixtures(ended.data?.items ?? [], overdueFixtureIdsOf(ended.data?.liveWarnings)),
    [ended.data],
  );
  const all = useMemo(() => [...pending, ...confirmed], [pending, confirmed]);
  // 고른 경기가 목록에 없으면(딥링크 경기가 아직 안 끝났거나 이미 처리됨) 첫 확정 대기로 대신하고 이유를 알린다.
  const selected = all.find((item) => item.fixtureId === pickedFixtureId) ?? pending[0] ?? null;
  const pickMissing = ended.isSuccess && pickedFixtureId !== null && !all.some((item) => item.fixtureId === pickedFixtureId);

  const select = (item: ResultListItem) => {
    setPickedFixtureId(item.fixtureId);
    setFromDeepLink(false);
    setPhoneShowsPanel(true);
    setOfficializedFixtureId(null);
    setTimeout(() => panelHeadingRef.current?.focus(), 0);
  };

  const showList = isDesktop || !phoneShowsPanel || pickMissing || selected === null;
  const showPanel = selected !== null && (isDesktop || (phoneShowsPanel && !pickMissing));

  return (
    <div className="tm-content-enter flex flex-col gap-4">
      <OpsPageHeader
        tournamentTitle={tournament.data?.title}
        title="결과"
        description="끝난 경기의 결과를 확정하거나 고쳐요."
        action={ended.isSuccess ? <p className="shrink-0 pt-1 text-[length:var(--font-size-label)] text-[var(--text-muted)]">끝난 경기 {all.length}</p> : undefined}
      />

      {officializedFixtureId !== null && officializedFixtureId === selected?.fixtureId ? (
        <p role="status" className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">
          공식 결과로 확정했어요.
        </p>
      ) : pickMissing ? (
        <p role="status" className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">
          전달받은 경기는 지금 목록에 없어요. 아직 끝나지 않았거나 이미 처리됐을 수 있어요.
        </p>
      ) : null}

      {ended.isPending ? (
        <AdminListSkeleton rows={5} />
      ) : ended.isError ? (
        <ErrorState message={describeResultReviewError(ended.error)} onRetry={() => void ended.refetch()} />
      ) : all.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-surface)]">
          <AdminEmpty
            title="아직 끝난 경기가 없어요"
            description="경기가 끝나면 여기에서 결과를 확정해요."
            action={
              <Link href={`${liveBase}/operations`} className="inline-flex min-h-11 items-center font-semibold text-[var(--blue700)] underline underline-offset-2">
                운영 보드로 가기
              </Link>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:items-start">
          {showList ? (
            <ResultFixtureList
              pending={pending}
              confirmed={confirmed}
              selectedFixtureId={selected?.fixtureId ?? null}
              onSelect={select}
              titleFor={titleFor}
              boardHref={`${liveBase}/operations`}
            />
          ) : null}
          {showPanel ? (
            <div className="flex min-w-0 flex-col gap-3">
              {!isDesktop ? (
                <button
                  type="button"
                  onClick={() => setPhoneShowsPanel(false)}
                  className="inline-flex min-h-11 items-center gap-1 self-start rounded-lg text-[length:var(--font-size-label)] font-semibold text-[var(--blue700)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                  목록으로
                </button>
              ) : null}
              <h2 ref={panelHeadingRef} tabIndex={-1} className="text-[length:var(--font-size-body-lg)] font-semibold text-[var(--text-strong)] outline-none">
                {titleFor(selected)}
              </h2>
              <ResultPanel
                key={selected.gameId}
                gameId={selected.gameId}
                tournamentId={tournamentId}
                isRegularLeague={tournament.data?.kind === 'regular_league'}
                autoOpenFix={fromDeepLink && selected.fixtureId === deepLinkFixtureId}
                onSaved={() => void ended.refetch()}
                onOfficialized={() => {
                  setPickedFixtureId(selected.fixtureId);
                  setOfficializedFixtureId(selected.fixtureId);
                }}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
