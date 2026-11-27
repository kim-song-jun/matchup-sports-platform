'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import { useV1AdminLeagueMatchList, useV1AdminTournaments } from '@/hooks/use-v1-api';
import { useV1DataSource } from '@/components/providers/v1-data-source';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminKstDateTime } from '@/lib/date-utils';
import { v1Keys } from '@/lib/query-keys';
import { AdminDataTable, AdminLeagueStatePill, AdminStatusPill, AdminFilterBar, AdminEmpty, AdminListSkeleton } from '@/components/admin';
import { ErrorState } from '@/components/v1-ui/primitives';
import { fetchOperationsBoardAll } from '@/components/tournament-live/use-operations-board-all';
import { formatDayLabel, kstDayKey } from '@/components/tournament-live/ops-board-model';
import type { LeagueStateKey } from '@/lib/v1-status-labels';

const LIMIT = 100;
const MAX_TODAY_CANDIDATES = 8;
const NOT_RUNNABLE_TOURNAMENT_STATUSES: readonly string[] = ['draft', 'completed', 'cancelled'];

/**
 * 운영 진입 목록의 한 행 — 대회와 리그가 같은 표에 섞여 나온다.
 *
 * `status` 는 원천의 어휘를 그대로 들고(대회 `in_progress`, 리그 `active`), 알약이 같은 사실을
 * 같은 말로 그린다 — 리그는 `AdminLeagueStatePill`(상태 모델의 "진행 중").
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
  | { readonly kind: 'tournament'; readonly status: string }
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
        { key: 'status', header: '상태', width: 'w-[104px]', render: (row) => (row.kind === 'league' ? <AdminLeagueStatePill state={row.status} /> : <AdminStatusPill status={row.status} />) },
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
  const autoOpened = useRef(false);

  const tournaments = useV1AdminTournaments({ limit: LIMIT });
  const leagues = useV1AdminLeagueMatchList();

  const rows = useMemo<OpsRow[]>(() => {
    const tournamentRows: OpsRow[] = (tournaments.data?.items ?? []).map((row) => ({
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
    const leagueRows: OpsRow[] = (leagues.data?.items ?? []).map((row) => ({
      key: `league:${row.leagueId}`,
      kind: 'league' as const,
      id: row.leagueId,
      title: row.title,
      venue: null,
      status: row.state,
      startsAt: row.startsOn,
      endsAt: row.endsOn,
      runnable: row.state === 'active',
    }));
    return [...tournamentRows, ...leagueRows].sort((left, right) => startsAtMs(right) - startsAtMs(left));
  }, [tournaments.data, leagues.data]);

  const listsSettled = !tournaments.isPending && !leagues.isPending;
  const listFailed = tournaments.isError || leagues.isError;

  const candidates = useMemo(
    () => rows.filter((row) => row.runnable && coversToday(row.startsAt, row.endsAt, todayKey)).slice(0, MAX_TODAY_CANDIDATES),
    [rows, todayKey],
  );
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
  const todayRows = candidates.filter((_, index) =>
    boards[index]?.data?.items.some((item) => item.scheduledAt && kstDayKey(item.scheduledAt) === todayKey),
  );
  const soleTodayId = todayRows.length === 1 ? todayRows[0].id : null;

  const pick = searchParams.get('pick') === '1';
  useEffect(() => {
    if (autoOpened.current || pick || !todaySettled || listFailed || soleTodayId === null) return;
    autoOpened.current = true;
    router.replace(`/admin/live/${encodeURIComponent(soleTodayId)}/operations`);
  }, [pick, todaySettled, listFailed, soleTodayId, router]);

  const needle = search.trim().toLowerCase();
  const matches = (row: OpsRow) => needle === '' || row.title.toLowerCase().includes(needle);
  const shownToday = todayRows.filter(matches);
  const shownAll = rows.filter(matches);

  if (listFailed) {
    const failed = tournaments.isError ? tournaments.error : leagues.error;
    return (
      <ErrorState
        message={extractErrorMessage(failed, '대회·리그 목록을 불러오지 못했어요.')}
        onRetry={() => {
          void tournaments.refetch();
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
        {listsSettled ? <OpsTable rows={shownAll} empty="찾는 대회·리그가 없어요" /> : <AdminListSkeleton rows={5} />}
      </section>
    </div>
  );
}
