'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useV1AdminLeagueMatchList } from '@/hooks/use-v1-api';
import { useV1DataSource } from '@/components/providers/v1-data-source';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminKstDateTime } from '@/lib/date-utils';
import { v1Keys } from '@/lib/query-keys';
import { AdminDataTable, AdminLeagueStatePill, AdminStatusPill, AdminFilterBar, AdminEmpty, AdminListSkeleton } from '@/components/admin';
import { ErrorState } from '@/components/v1-ui/primitives';
import { fetchOperationsBoardAll } from '@/components/tournament-live/use-operations-board-all';
import { formatDayLabel, kstDayKey } from '@/components/tournament-live/ops-board-model';
import type { v1Get } from '@/lib/api-client';
import type { V1AdminTournamentListPage, V1Tournament, V1TournamentStatus } from '@/types/api';
import { tournamentStatusLabel, type LeagueStateKey } from '@/lib/v1-status-labels';

/** 서버 어드민 대회 목록이 한 번에 줄 수 있는 최대 건수. */
const PAGE_SIZE = 50;
const MAX_TODAY_CANDIDATES = 8;
const SEARCH_DEBOUNCE_MS = 300;

const NOT_RUNNABLE_TOURNAMENT_STATUSES: readonly string[] = ['draft', 'completed', 'cancelled'];

/**
 * 목록용 최근 50건과 별개로, 오늘 후보가 될 수 있는 상태(진행 중·접수 중·접수 마감)는 상태 필터로 따로 읽는다 — 서버
 * 목록이 생성 최신순이라 오래전에 만든 진행 중 대회가 최근 50건 밖으로 밀려나도 후보에서 빠지지 않게 한다.
 */
const TOURNAMENT_SOURCES = [
  { name: 'recent', filters: {}, maxPages: 1 },
  { name: 'in_progress', filters: { status: 'in_progress' }, maxPages: 10 },
  { name: 'open', filters: { status: 'open' }, maxPages: 2 },
  { name: 'closed', filters: { status: 'closed' }, maxPages: 2 },
] as const;

/** 커서로 최대 `maxPages` 쪽까지 읽는다. `more` 는 상한에 걸려 서버에 더 남았다는 뜻이다. */
async function fetchTournamentPages(get: typeof v1Get, filters: { status?: string; q?: string }, maxPages: number): Promise<{ items: V1Tournament[]; more: boolean }> {
  const items: V1Tournament[] = [];
  const used = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result: V1AdminTournamentListPage = await get<V1AdminTournamentListPage>('/admin/tournaments', {
      ...filters,
      limit: PAGE_SIZE,
      ...(cursor === null ? {} : { cursor }),
    });
    items.push(...result.items);
    const next: string | null = result.pageInfo?.hasNext ? result.pageInfo.nextCursor : null;
    if (!next || used.has(next)) return { items, more: false };
    used.add(next);
    cursor = next;
  }
  return { items, more: true };
}

/**
 * 운영 진입 목록의 한 행 — 대회와 리그가 같은 표에 섞여 나온다.
 *
 * `status` 는 원천의 어휘를 그대로 들고(대회 `in_progress`, 리그 `active`), 알약이 같은 사실을
 * 같은 말로 그린다 — 대회는 `tournamentStatusLabel`, 리그는 `AdminLeagueStatePill`.
 */
type OpsRow = {
  readonly key: string;
  readonly id: string;
  readonly title: string;
  readonly venue: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  /** 지금 경기를 운영할 수 있는 상태인가(초안·종료·취소·보류는 아니다). */
  readonly runnable: boolean;
} & (
  | { readonly kind: 'tournament'; readonly status: V1TournamentStatus }
  | { readonly kind: 'league'; readonly status: LeagueStateKey }
);

const KIND_LABEL: Record<OpsRow['kind'], string> = { tournament: '대회', league: '리그' };

function startsAtMs(row: OpsRow): number {
  if (row.startsAt === null) return Number.NEGATIVE_INFINITY;
  const ms = new Date(row.startsAt).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/** 대회·리그의 기간(시작~끝, KST 날짜 기준)이 오늘을 덮는가. 끝이 없으면 시작하는 하루만이다. */
export function coversToday(startIso: string | null, endIso: string | null, todayKey: string): boolean {
  if (!startIso) return false;
  const start = kstDayKey(startIso);
  const end = endIso ? kstDayKey(endIso) : start;
  return start <= todayKey && todayKey <= end;
}

function OpsTable({ rows, empty }: { rows: OpsRow[]; empty: string }) {
  return (
    <AdminDataTable<OpsRow>
      rows={rows}
      keyExtractor={(row) => row.key}
      tableMaxWidth="max-w-none"
      actionsHeader="다음 할 일"
      columns={[
        {
          key: 'status',
          header: '상태',
          width: 'w-[104px]',
          render: (row) => (row.kind === 'league' ? <AdminLeagueStatePill state={row.status} /> : <AdminStatusPill status={row.status} label={tournamentStatusLabel(row.status)} />),
        },
        {
          key: 'title',
          header: '대회·리그',
          render: (row) => (
            <div className="min-w-0">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={[
                    'inline-flex shrink-0 rounded-md px-2 py-0.5 text-[length:var(--font-size-micro)] font-semibold',
                    row.kind === 'league' ? 'bg-[var(--tint-blue)] text-[var(--blue700)]' : 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
                  ].join(' ')}
                >
                  {KIND_LABEL[row.kind]}
                </span>
                <span className="block truncate font-medium text-[var(--text-strong)]" title={row.title}>{row.title}</span>
              </span>
              {row.venue ? <span className="block truncate text-[length:var(--font-size-micro)] text-[var(--text-muted)]">{row.venue}</span> : null}
            </div>
          ),
        },
        {
          key: 'schedule',
          header: '첫 경기',
          width: 'w-[168px]',
          render: (row) => <span className="whitespace-nowrap text-[var(--text-muted)]">{row.startsAt ? formatAdminKstDateTime(row.startsAt) : '미정'}</span>,
        },
      ]}
      renderActions={(row) => (
        <Link
          href={`/admin/live/${encodeURIComponent(row.id)}/operations`}
          aria-label={`${row.title} 운영 보드 열기`}
          className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium text-[var(--blue700)] bg-[var(--blue50)] hover:bg-[var(--blue100)] transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          운영 보드 열기
        </Link>
      )}
      empty={<AdminEmpty title={empty} />}
      skeletonRows={3}
    />
  );
}

/**
 * 대회·리그 현장 운영 런처. 오늘 경기가 있는 곳을 위에 올리고, 하나뿐이면 곧장 그 운영 보드를 연다.
 * 「다른 대회 고르기」(`?pick=1`)로 왔을 때는 자동으로 열지 않는다.
 *
 * 리그는 `/admin/tournaments` 가 돌려주지 않는다(서버가 그 목록을 대회 종류로 고정한다) — 리그 목록은 리그
 * 관리가 쓰는 `/admin/league-matches` 에서 따로 받아 합친다. 리그 id 가 곧 운영 셸의 대회 id 라서 링크 모양은 같다.
 * 「오늘」 판정은 기간이 오늘을 덮는 진행 가능한 후보(최대 8곳)의 운영 보드를 읽어 실제 경기 시각으로 한다.
 */
export function TournamentOpsPickerClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { v1Get } = useV1DataSource();
  const todayHeadingId = useId();
  const allHeadingId = useId();
  const [todayKey] = useState(() => kstDayKey(new Date().toISOString()));
  const [search, setSearch] = useState('');
  const [serverNeedle, setServerNeedle] = useState('');
  const autoOpened = useRef(false);

  const tournamentQueries = useQueries({
    queries: TOURNAMENT_SOURCES.map((source) => ({
      queryKey: v1Keys.adminTournaments({ launcher: source.name }),
      queryFn: () => fetchTournamentPages(v1Get, source.filters, source.maxPages),
      retry: false,
    })),
  });
  const leagues = useV1AdminLeagueMatchList();

  // 서버가 이름으로 걸러 주는 검색 — 최근 50건 밖의 오래된 대회도 이름으로는 찾을 수 있게 한다.
  const trimmedSearch = search.trim();
  useEffect(() => {
    const timer = setTimeout(() => setServerNeedle(trimmedSearch), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmedSearch]);
  const searched = useQuery({
    queryKey: v1Keys.adminTournaments({ launcher: 'search', q: serverNeedle }),
    queryFn: () => fetchTournamentPages(v1Get, { q: serverNeedle }, 1),
    enabled: serverNeedle !== '',
    retry: false,
  });

  const tournamentRowsOf = (items: readonly V1Tournament[]): OpsRow[] =>
    items.map((row) => ({
      key: `tournament:${row.id}`,
      kind: 'tournament',
      id: row.id,
      title: row.title,
      venue: row.venue,
      status: row.status,
      startsAt: row.scheduledAt,
      endsAt: row.scheduledEndAt,
      runnable: !NOT_RUNNABLE_TOURNAMENT_STATUSES.includes(row.status),
    }));

  const tournamentData = tournamentQueries.map((query) => query.data);
  const leagueRows = useMemo<OpsRow[]>(
    () =>
      (leagues.data?.items ?? []).map((row) => ({
        key: `league:${row.leagueId}`,
        kind: 'league' as const,
        id: row.leagueId,
        title: row.title,
        venue: null,
        status: row.state,
        startsAt: row.startsOn,
        endsAt: row.endsOn,
        runnable: row.state === 'active',
      })),
    [leagues.data],
  );

  // 오늘 후보는 상태·기간으로만 고른다 — 이름 검색 결과가 후보와 자동 열기를 바꾸지 않는다.
  const baseRows = (() => {
    const byKey = new Map<string, OpsRow>();
    for (const data of tournamentData) for (const row of tournamentRowsOf(data?.items ?? [])) byKey.set(row.key, row);
    for (const row of leagueRows) byKey.set(row.key, row);
    return [...byKey.values()].sort((left, right) => startsAtMs(right) - startsAtMs(left));
  })();
  const rows = (() => {
    if (!serverNeedle || !searched.data) return baseRows;
    const byKey = new Map(baseRows.map((row) => [row.key, row] as const));
    for (const row of tournamentRowsOf(searched.data.items)) byKey.set(row.key, row);
    return [...byKey.values()].sort((left, right) => startsAtMs(right) - startsAtMs(left));
  })();

  const listsSettled = tournamentQueries.every((query) => !query.isPending) && !leagues.isPending;
  const listFailedQuery = tournamentQueries.find((query) => query.isError);
  const listFailed = listFailedQuery !== undefined || leagues.isError;
  const recentTruncated = tournamentData[0]?.more === true;

  const candidatesAll = baseRows.filter(
    (row) => row.runnable && (row.kind === 'tournament' && row.status === 'in_progress' ? true : coversToday(row.startsAt, row.endsAt, todayKey)),
  );
  const candidates = candidatesAll.slice(0, MAX_TODAY_CANDIDATES);
  const candidatesTruncated = candidatesAll.length > MAX_TODAY_CANDIDATES;
  const boards = useQueries({
    queries: candidates.map((row) => ({
      // 운영 보드가 읽는 키와 같아 고르기 화면에서 읽은 것이 보드 첫 화면에도 쓰인다.
      queryKey: [...v1Keys.tournamentOperationsBoardAll(row.id), 'all'] as const,
      queryFn: () => fetchOperationsBoardAll(v1Get, row.id),
      retry: false,
      staleTime: 30_000,
    })),
  });
  const todaySettled = listsSettled && boards.every((query) => !query.isPending);
  const failedBoard = boards.find((query) => query.isError);
  const todayRows = candidates.filter((_, index) =>
    boards[index]?.data?.items.some((item) => item.scheduledAt && kstDayKey(item.scheduledAt) === todayKey),
  );
  // 하나로 확정되려면 모든 후보를 읽었고(실패·생략 없음) 오늘 경기가 있는 곳이 정확히 하나여야 한다.
  const soleTodayId = todayRows.length === 1 && failedBoard === undefined && !candidatesTruncated ? todayRows[0].id : null;

  const pick = searchParams.get('pick') === '1';
  useEffect(() => {
    if (autoOpened.current || pick || !todaySettled || listFailed || soleTodayId === null) return;
    autoOpened.current = true;
    router.replace(`/admin/live/${encodeURIComponent(soleTodayId)}/operations`);
  }, [pick, todaySettled, listFailed, soleTodayId, router]);

  const needle = trimmedSearch.toLowerCase();
  const matches = (row: OpsRow) => needle === '' || row.title.toLowerCase().includes(needle);
  const shownToday = todayRows.filter(matches);
  const shownAll = rows.filter(matches);

  if (listFailed) {
    const failed = listFailedQuery !== undefined ? listFailedQuery.error : leagues.error;
    return (
      <ErrorState
        message={extractErrorMessage(failed, '대회·리그 목록을 불러오지 못했어요.')}
        onRetry={() => {
          for (const query of tournamentQueries) void query.refetch();
          void leagues.refetch();
        }}
      />
    );
  }

  return (
    <div className="tm-content-enter flex flex-col gap-8">
      <section aria-labelledby={todayHeadingId} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id={todayHeadingId} className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">
            오늘 경기 있는 대회·리그{todaySettled ? ` ${shownToday.length}` : ''}
          </h2>
          <span className="text-[length:var(--font-size-label)] tabular-nums text-[var(--text-muted)]">{`${todayKey.slice(0, 4)}. ${formatDayLabel(todayKey)}`}</span>
        </div>
        {failedBoard ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--tint-orange)] px-3 py-2 text-[length:var(--font-size-label)] text-[var(--orange700)]">
            <span>{extractErrorMessage(failedBoard.error, '일부 대회·리그의 오늘 경기를 확인하지 못했어요.')} 목록에서 직접 골라 주세요.</span>
            <button
              type="button"
              onClick={() => {
                for (const query of boards) if (query.isError) void query.refetch();
              }}
              className="min-h-11 rounded-lg px-3 font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              다시 확인하기
            </button>
          </div>
        ) : null}
        {candidatesTruncated ? (
          <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">
            오늘 경기를 확인하는 대회·리그는 {MAX_TODAY_CANDIDATES}곳까지예요. 목록에서 직접 골라 주세요.
          </p>
        ) : null}
        {!todaySettled ? (
          <AdminListSkeleton rows={2} />
        ) : shownToday.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-5 text-[length:var(--font-size-label)] text-[var(--text-muted)]">
            오늘 경기가 있는 대회·리그가 없어요.
          </p>
        ) : (
          <OpsTable rows={shownToday} empty="오늘 경기가 있는 대회·리그가 없어요" />
        )}
      </section>

      <section aria-labelledby={allHeadingId} className="flex flex-col gap-3">
        <h2 id={allHeadingId} className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">
          전체{listsSettled ? ` ${shownAll.length}` : ''}
        </h2>
        <AdminFilterBar
          searchLabel="대회·리그 이름으로 찾기"
          searchPlaceholder="대회·리그 이름으로 찾기"
          searchValue={search}
          onSearchChange={setSearch}
        />
        {recentTruncated ? (
          <p className="text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
            최근 {PAGE_SIZE}건과 진행 중·접수 중 대회를 보여요. 더 오래된 대회는 이름으로 찾아 주세요.
          </p>
        ) : null}
        {listsSettled ? <OpsTable rows={shownAll} empty="찾는 대회·리그가 없어요" /> : <AdminListSkeleton rows={5} />}
      </section>
    </div>
  );
}
