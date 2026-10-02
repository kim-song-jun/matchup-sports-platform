'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useV1AdminLeagueMatchList, useV1AdminTournaments } from '@/hooks/use-v1-api';
import type { V1Tournament } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminDateTime } from '@/lib/date-utils';
import { AdminDataTable, AdminLeagueStatePill, AdminStatusPill, AdminFilterBar, AdminEmpty, AdminTableSkeleton } from '@/components/admin';
import type { LeagueStateKey } from '@/lib/v1-status-labels';

const STATUS_OPTIONS = [
  { value: 'in_progress', label: '진행 중' },
  { value: 'open', label: '접수 중' },
  { value: '', label: '전체' },
] as const;

const LIMIT = 50;

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
} & (
  | { readonly kind: 'tournament'; readonly status: string }
  | { readonly kind: 'league'; readonly status: LeagueStateKey }
);

const KIND_LABEL: Record<OpsRow['kind'], string> = { tournament: '대회', league: '리그' };

/**
 * 리그가 이 필터에 걸리는지. 리그에는 신청 단계(`open`)가 없어(서버의 리그↔대회 상태 매핑 참고)
 * "접수 중" 필터에서는 항상 빠진다 — 누락이 아니라 그 상태가 리그에 없는 것이다.
 */
function leagueMatchesStatus(state: string, activeStatus: string): boolean {
  if (activeStatus === '') return true;
  if (activeStatus === 'in_progress') return state === 'active';
  return false;
}

function startsAtMs(row: OpsRow): number {
  if (row.startsAt === null) return Number.NEGATIVE_INFINITY;
  const ms = new Date(row.startsAt).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/**
 * T6-3 — `/admin/tournaments`(CRUD 목록)의 "상세 보기"를 거쳐야만 ops 셸에 들어갈 수
 * 있었다(nav→목록→상세→바로가기, 3홉). D-15가 원하는 "대회·리그 현장 운영" 진입은 그 CRUD
 * 화면을 거칠 이유가 없으므로, 이 피커는 곧장 `/admin/live/.../operations`로
 * 연결한다. 기본 상태 필터를 in_progress로 두는 이유는 이 화면의 목적이 "지금 뛰고
 * 있는 대회의 운영 콘솔에 빨리 들어가는 것"이라 대기/완료 대회로 스크롤하게 만들
 * 이유가 없기 때문이다.
 *
 * 리그는 `/admin/tournaments` 가 돌려주지 않는다(서버가 그 목록을 대회 종류로 고정한다) —
 * 리그 목록은 리그 관리가 쓰는 `/admin/league-matches` 에서 따로 받아 이 표에서 합친다.
 * 리그 id 가 곧 운영 셸의 대회 id 라서 링크 모양은 대회와 같다.
 */
export function TournamentOpsPickerClient() {
  const [activeStatus, setActiveStatus] = useState<string>('in_progress');

  const tournaments = useV1AdminTournaments({
    ...(activeStatus ? { status: activeStatus as V1Tournament['status'] } : {}),
    limit: LIMIT,
  });
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
    }));
    const leagueRows: OpsRow[] = (leagues.data?.items ?? [])
      .filter((row) => leagueMatchesStatus(row.state, activeStatus))
      .map((row) => ({
        key: `league:${row.leagueId}`,
        kind: 'league' as const,
        id: row.leagueId,
        title: row.title,
        venue: null,
        status: row.state,
        startsAt: row.startsOn,
      }));
    return [...tournamentRows, ...leagueRows].sort((left, right) => startsAtMs(right) - startsAtMs(left));
  }, [tournaments.data, leagues.data, activeStatus]);

  const isPending = tournaments.isPending || leagues.isPending;
  const isInitialLoad = isPending && rows.length === 0;
  const failed = tournaments.isError ? tournaments.error : leagues.isError ? leagues.error : null;
  const errorMessage =
    tournaments.isError || leagues.isError ? extractErrorMessage(failed, '대회·리그 목록을 불러오지 못했어요.') : undefined;

  return (
    <div className="tm-content-enter flex flex-col gap-4">
      <AdminFilterBar
        hideSearch
        searchValue=""
        onSearchChange={() => undefined}
        statusOptions={[...STATUS_OPTIONS]}
        activeStatus={activeStatus}
        onStatusChange={setActiveStatus}
      />

      {isInitialLoad ? (
        <AdminTableSkeleton rows={5} />
      ) : (
        <AdminDataTable<OpsRow>
          rows={rows}
          keyExtractor={(row) => row.key}
          tableMaxWidth="max-w-none"
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
                        row.kind === 'league'
                          ? 'bg-[var(--tint-blue)] text-[var(--blue700)]'
                          : 'bg-[var(--surface-soft)] text-[var(--text-muted)]',
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
              header: '시작 일정',
              width: 'w-[168px]',
              render: (row) => (
                <span className="whitespace-nowrap text-[var(--text-muted)]">
                  {row.startsAt ? formatAdminDateTime(row.startsAt) : '미정'}
                </span>
              ),
            },
          ]}
          renderActions={(row) => (
            <Link
              href={`/admin/live/${encodeURIComponent(row.id)}/operations`}
              aria-label={`${row.title} 운영 콘솔 열기`}
              // 전수검수: hover:bg-[var(--blue100)](raw, dark: 짝 없음)이 다크에서 밝은
              // blue700 텍스트와 겹쳐 대비 1.99:1까지 붕괴 — 다크 대응된 --blue100
              // 토큰(rgba 틴트)으로 교체.
              className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium text-[var(--blue700)] bg-[var(--blue50)] hover:bg-[var(--blue100)] transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              운영 콘솔 열기
            </Link>
          )}
          loading={isInitialLoad}
          empty={<AdminEmpty title="해당 상태의 대회·리그가 없어요" description="필터를 바꿔 보세요." />}
          error={errorMessage}
          onRetry={() => {
            void tournaments.refetch();
            void leagues.refetch();
          }}
          skeletonRows={5}
        />
      )}
    </div>
  );
}
