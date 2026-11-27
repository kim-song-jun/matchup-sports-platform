'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, RefreshCw, TriangleAlert } from 'lucide-react';
import { ScopedLink as Link } from '@/components/providers/navigation-scope';
import { AdminEmpty } from '@/components/admin/admin-empty';
import { AdminListSkeleton } from '@/components/admin/admin-skeleton';
import { buildLeagueFixtureTitles } from '@/components/tournament-result-review/fixture-label';
import { OpsPageHeader } from '@/components/tournament-ops/ops-page-header';
import { canAssignOperations, useTournamentOpsRole } from '@/components/tournament-ops/role-context';
import { ErrorState } from '@/components/v1-ui/primitives';
import { SegmentedTabs } from '@/components/v1-ui/segmented-tabs';
import { useV1Tournament, useV1TournamentFields, useV1TournamentStaffAssignments } from '@/hooks/use-v1-api';
import { DESKTOP_LIST_MEDIA_QUERY, useMediaQuery } from '@/hooks/use-media-query';
import { extractErrorMessage } from '@/lib/error-message';
import { resolveTournamentLiveBase } from '@/lib/tournament-live-routes';
import { competitionFixtureName } from '@/lib/tournament-round-label';
import type { V1TournamentOperationsBoardItem } from '@/types/api';
import { BoardCardView } from './board-card';
import { FieldChips } from './field-chips';
import { MatchInfoSheet } from './match-info-sheet';
import { OperationsListView } from './operations-list-view';
import { OperationsPhoneList } from './operations-phone-list';
import { OperationsTimeline } from './operations-timeline';
import {
  NO_FIELD_KEY,
  buildBoardCards,
  buildFieldColumns,
  formatDayLabel,
  kstDayKey,
  kstTimeLabel,
  listMatchDays,
  pickBoardDay,
  usesFieldStaff,
  type BoardCard,
} from './ops-board-model';
import { useOperationsBoardAll } from './use-operations-board-all';

const TEAM_TBD = '팀 미정';
const MAX_FIELD_COLUMNS = 3;
const CLOCK_INTERVAL_MS = 30_000;

/** 팀이 정해진 쪽은 팀 이름, 아니면 자리 이름(「A조 1위」)이다. */
function sideName(registrationId: string | null | undefined, teamName: string | null | undefined, slotLabel: string | null | undefined): string {
  if (!registrationId) return slotLabel || TEAM_TBD;
  return teamName && teamName !== 'TBD' ? teamName : TEAM_TBD;
}

const CONTROL_BUTTON =
  'inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-label)] font-medium text-[var(--text-body)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

interface Props {
  tournamentId: string;
}

export function OperationsBoardClient({ tournamentId }: Props) {
  const pathname = usePathname();
  // 두 표면(어드민·스태프)에서 같이 쓰므로 링크는 지금 표면을 따라간다. 스태프 표면의 콘솔은 돌아올 곳을 쿼리로 안다.
  const liveBase = resolveTournamentLiveBase(pathname, tournamentId);
  const consoleQuery = liveBase.startsWith('/admin/') ? '' : '?from=board';
  const role = useTournamentOpsRole();
  const isDesktop = useMediaQuery(DESKTOP_LIST_MEDIA_QUERY);
  const bundleHeadingId = useId();

  const board = useOperationsBoardAll(tournamentId);
  const tournament = useV1Tournament(tournamentId);
  const fields = useV1TournamentFields(tournamentId);
  const staff = useV1TournamentStaffAssignments(tournamentId);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const [view, setView] = useState<'timeline' | 'list'>('timeline');
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [fieldPick, setFieldPick] = useState<string[] | null>(null);
  const [onlyChecks, setOnlyChecks] = useState(false);
  const [infoFixtureId, setInfoFixtureId] = useState<string | null>(null);

  const fixturesById = useMemo(() => new Map((tournament.data?.fixtures ?? []).map((f) => [f.id, f] as const)), [tournament.data?.fixtures]);
  const leagueTitles = useMemo(() => buildLeagueFixtureTitles(tournament.data?.leagueFixtures), [tournament.data?.leagueFixtures]);

  const labelFor = useCallback(
    (item: V1TournamentOperationsBoardItem) => {
      const fixture = fixturesById.get(item.fixtureId);
      let title: string;
      if (fixture || (item.homeTeamName && item.awayTeamName)) {
        const home = sideName(item.homeRegistrationId, fixture?.homeTeamName ?? item.homeTeamName, fixture?.homeSlotLabel);
        const away = sideName(item.awayRegistrationId, fixture?.awayTeamName ?? item.awayTeamName, fixture?.awaySlotLabel);
        title = `${home} vs ${away}`;
      } else {
        title = leagueTitles.get(item.fixtureId) ?? (typeof item.fixtureNumber === 'number' ? `${item.fixtureNumber}번 경기` : '경기');
      }
      const subtitle = item.round
        ? competitionFixtureName({ displayTitle: item.displayTitle, groupName: item.groupName, round: item.round, legNumber: item.legNumber })
        : '';
      return { title, subtitle };
    },
    [fixturesById, leagueTitles],
  );

  const staffItems = useMemo(() => staff.data?.items ?? [], [staff.data?.items]);
  const registeredFields = useMemo(() => fields.data?.items ?? [], [fields.data?.items]);

  const cards = useMemo(() => {
    const liveWarnings = new Map((board.data?.liveWarnings ?? []).map((entry) => [entry.fixtureId, entry.warnings] as const));
    return buildBoardCards({ items: board.data?.items ?? [], liveWarnings, labelFor, staff: staffItems, role, now });
  }, [board.data, labelFor, staffItems, role, now]);

  const todayKey = kstDayKey(now.toISOString());
  const nowLabel = kstTimeLabel(now.toISOString());
  const days = useMemo(() => listMatchDays(cards), [cards]);
  const activeDay = pickedDay !== null && days.includes(pickedDay) ? pickedDay : pickBoardDay(days, todayKey);
  const dayIndex = activeDay === null ? -1 : days.indexOf(activeDay);

  const columnsAll = useMemo(() => buildFieldColumns(cards, activeDay, registeredFields, staffItems), [cards, activeDay, registeredFields, staffItems]);
  // 구장 수는 실제 구장만 센다. 구장 미정 열은 골라서 거르는 대상이 아니라 늘 보이고 늘 센다.
  const fieldColumns = columnsAll.filter((column) => column.key !== NO_FIELD_KEY);
  const noFieldColumn = columnsAll.find((column) => column.key === NO_FIELD_KEY);
  const multiPick = isDesktop && fieldColumns.length > MAX_FIELD_COLUMNS;
  const chipColumns = multiPick ? fieldColumns : columnsAll;
  const validPick = (fieldPick ?? []).filter((key) => chipColumns.some((column) => column.key === key));
  const selectedKeys = multiPick
    ? validPick.length > 0
      ? validPick
      : fieldColumns.slice(0, MAX_FIELD_COLUMNS).map((column) => column.key)
    : validPick.slice(0, 1);
  const visibleColumns = multiPick
    ? [...fieldColumns.filter((column) => selectedKeys.includes(column.key)), ...(noFieldColumn ? [noFieldColumn] : [])]
    : selectedKeys.length === 0
      ? columnsAll
      : columnsAll.filter((column) => selectedKeys.includes(column.key));
  const passesFieldFilter = (card: BoardCard) =>
    selectedKeys.length === 0 || selectedKeys.includes(card.fieldKey) || (multiPick && card.fieldKey === NO_FIELD_KEY);

  const scopeCards = cards.filter((card) => (card.dayKey === activeDay || card.dayKey === null) && passesFieldFilter(card));
  const checkCount = scopeCards.filter((card) => card.checks.length > 0).length;
  const shown = onlyChecks ? scopeCards.filter((card) => card.checks.length > 0) : scopeCards;
  const dayShown = shown.filter((card) => card.dayKey !== null);
  const unscheduledShown = shown.filter((card) => card.dayKey === null);

  const dayCards = cards.filter((card) => card.dayKey === activeDay);
  const endedCount = dayCards.filter((card) => card.state === 'result-pending' || card.state === 'result-done' || card.state === 'result-void').length;
  const liveCount = dayCards.filter((card) => card.state === 'live').length;
  const remainingCount = dayCards.filter((card) => card.state === 'scheduled').length;

  const infoCard = infoFixtureId === null ? null : (cards.find((card) => card.fixtureId === infoFixtureId) ?? null);
  const openInfo = useCallback((card: BoardCard) => setInfoFixtureId(card.fixtureId), []);
  const renderCard = (card: BoardCard, showField = false) => (
    <BoardCardView key={card.fixtureId} card={card} liveBase={liveBase} consoleQuery={consoleQuery} showField={showField} onOpenInfo={openInfo} />
  );

  const isRefreshing = board.isFetching || fields.isFetching || staff.isFetching;
  const refresh = () => {
    void board.refetch();
    void fields.refetch();
    void staff.refetch();
    void tournament.refetch();
  };

  const loading = board.isPending || tournament.isPending || fields.isPending || staff.isPending;
  const publicHref = tournament.data?.kind === 'regular_league' ? `/league-matches/${tournamentId}` : `/tournaments/${tournamentId}`;
  const showStaffHint = staff.isSuccess && !usesFieldStaff(staffItems) && canAssignOperations(role) && cards.length > 0;
  const phoneColumn = !isDesktop && selectedKeys.length === 1 ? columnsAll.find((column) => column.key === selectedKeys[0]) : undefined;
  const nowTimeLabel = activeDay !== null && activeDay === todayKey ? nowLabel : null;
  const eyebrowDay = activeDay === null ? '' : ` · ${formatDayLabel(activeDay)}`;

  return (
    <div className="tm-content-enter flex flex-col gap-5">
      <OpsPageHeader
        tournamentTitle={`${tournament.data?.title ?? '대회 운영'}${eyebrowDay}`}
        title="운영 보드"
        description={`끝남 ${endedCount} · 진행 중 ${liveCount} · 남은 경기 ${remainingCount} · ${nowLabel} 기준 · 15초마다 새로 고쳐요`}
        action={
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={refresh} disabled={isRefreshing} className={CONTROL_BUTTON}>
              <RefreshCw size={16} aria-hidden="true" className={isRefreshing ? 'animate-spin' : ''} />
              새로고침
            </button>
            <Link href={publicHref} target="_blank" rel="noopener noreferrer" className={CONTROL_BUTTON}>
              참가자 화면 보기
              <ExternalLink size={14} aria-hidden="true" />
              <span className="sr-only">(새 탭에서 열려요)</span>
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-surface)]">
          <AdminListSkeleton rows={6} />
        </div>
      ) : board.isError && !board.data ? (
        <ErrorState message={extractErrorMessage(board.error, '운영 보드를 불러오지 못했어요.')} onRetry={refresh} />
      ) : cards.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-surface)]">
          <AdminEmpty title="아직 대진이 없어요" description="대진을 만들면 여기에서 경기를 운영해요." />
        </div>
      ) : (
        <>
          {showStaffHint ? (
            <p className="flex items-center gap-2 rounded-xl bg-[var(--tint-orange)] px-3 py-2 text-[length:var(--font-size-label)] text-[var(--orange700)]">
              <TriangleAlert size={16} aria-hidden="true" className="shrink-0" />
              <span>
                구장 담당자가 아직 없어요.{' '}
                <Link href={`${liveBase}/staff`} className="font-semibold underline underline-offset-2">
                  스태프·구장
                </Link>
                에서 배정해요.
              </span>
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {chipColumns.length > 1 ? (
              <FieldChips
                columns={chipColumns}
                mode={multiPick ? 'multi' : 'single'}
                selected={selectedKeys}
                maxSelected={multiPick ? MAX_FIELD_COLUMNS : undefined}
                onChange={setFieldPick}
                ariaLabel="구장 고르기"
              />
            ) : null}
            <button
              type="button"
              aria-pressed={onlyChecks}
              onClick={() => setOnlyChecks((on) => !on)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-[length:var(--font-size-label)] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 ${
                onlyChecks
                  ? 'border-[var(--orange500)] bg-[var(--tint-orange)] text-[var(--orange700)]'
                  : 'border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-body)] hover:bg-[var(--surface-soft)]'
              }`}
            >
              <TriangleAlert size={14} aria-hidden="true" />
              확인할 것 {checkCount}
            </button>
            <div className="ml-auto w-full sm:w-auto sm:min-w-44">
              <SegmentedTabs
                role="tablist"
                ariaLabel="보기 방식"
                activeId={view}
                onSelect={(id) => setView(id === 'list' ? 'list' : 'timeline')}
                items={[
                  { id: 'timeline', label: '시간표' },
                  { id: 'list', label: '목록' },
                ]}
              />
            </div>
          </div>

          {days.length > 1 && activeDay !== null ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={dayIndex <= 0} onClick={() => setPickedDay(days[dayIndex - 1])} className={CONTROL_BUTTON}>
                <ChevronLeft size={16} aria-hidden="true" />
                이전 경기일
              </button>
              <span className="min-w-24 text-center font-semibold tabular-nums text-[var(--text-strong)]">{formatDayLabel(activeDay)}</span>
              <button type="button" disabled={dayIndex >= days.length - 1} onClick={() => setPickedDay(days[dayIndex + 1])} className={CONTROL_BUTTON}>
                다음 경기일
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              {days.includes(todayKey) && activeDay !== todayKey ? (
                <button type="button" onClick={() => setPickedDay(todayKey)} className={CONTROL_BUTTON}>
                  오늘
                </button>
              ) : null}
            </div>
          ) : null}

          {shown.length === 0 ? (
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-surface)]">
              <AdminEmpty title="조건에 맞는 경기가 없어요" description="다른 구장이나 날짜를 골라 보세요." />
            </div>
          ) : view === 'list' ? (
            <OperationsListView
              cards={[...dayShown, ...unscheduledShown]}
              isDesktop={isDesktop}
              liveBase={liveBase}
              consoleQuery={consoleQuery}
              onOpenInfo={openInfo}
            />
          ) : (
            <>
              {isDesktop ? (
                <OperationsTimeline columns={visibleColumns} cards={dayShown} nowTimeLabel={nowTimeLabel} renderCard={(card) => renderCard(card)} />
              ) : (
                <>
                  {phoneColumn ? (
                    <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">
                      {`${phoneColumn.name} · ${phoneColumn.staffLine}${phoneColumn.expiresLabel === null ? '' : ` · ${phoneColumn.expiresLabel}`} · 경기 ${phoneColumn.count}`}
                    </p>
                  ) : null}
                  <OperationsPhoneList
                    cards={dayShown}
                    showField={selectedKeys.length === 0 && columnsAll.length > 1}
                    nowTimeLabel={nowTimeLabel}
                    renderCard={renderCard}
                  />
                </>
              )}
              {unscheduledShown.length > 0 ? (
                <section aria-labelledby={bundleHeadingId} className="flex flex-col gap-2">
                  <h2 id={bundleHeadingId} className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
                    시간 미정 {unscheduledShown.length}
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{unscheduledShown.map((card) => renderCard(card, true))}</div>
                </section>
              ) : null}
            </>
          )}
        </>
      )}

      <MatchInfoSheet
        card={infoCard}
        allCards={cards}
        fields={registeredFields}
        canAssignField={canAssignOperations(role)}
        liveBase={liveBase}
        consoleQuery={consoleQuery}
        onClose={() => setInfoFixtureId(null)}
      />
    </div>
  );
}
