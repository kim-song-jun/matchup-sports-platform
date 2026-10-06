'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useV1AdminTeamMatches,
  useV1ChangeTeamMatchStatus,
} from '@/hooks/use-v1-api';
import type { V1AdminTeamMatchRow } from '@/types/api';
import { formatAdminDateTimeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useAdminUrlListQuery } from '../use-admin-url-list-query';
import {
  AdminPageHeader,
  AdminFilterBar,
  AdminDataTable,
  AdminStatusPill,
  AdminReasonModal,
  AdminEmpty,
  STATUS_META,
  useAdminToast,
  AdminToasts,
} from '@/components/admin';

// ── Status filter options ─────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'recruiting', label: '모집 중' },
  { value: 'closed', label: '마감' },
  { value: 'matched', label: '매칭됨' },
  { value: 'cancelled', label: '취소됨' },
  { value: 'completed', label: '완료' },
  { value: 'archived', label: '보관' },
];

const REASON_MODAL_STATUS_OPTIONS = [
  { value: 'recruiting', label: STATUS_META['recruiting']?.label ?? '모집 중' },
  { value: 'closed', label: STATUS_META['closed']?.label ?? '마감' },
  { value: 'matched', label: STATUS_META['matched']?.label ?? '매칭됨' },
  { value: 'cancelled', label: STATUS_META['cancelled']?.label ?? '취소됨' },
  { value: 'archived', label: STATUS_META['archived']?.label ?? '보관' },
];

const KIND_OPTIONS = [
  { value: '', label: '전체 경기' },
  { value: 'friendly', label: '친선 경기' },
  { value: 'league', label: '정규 리그' },
  { value: 'tournament', label: '대회' },
] as const;

const PAGE_SIZE = 20;

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdminTeamMatchesPage() {
  // useSearchParams는 Suspense 경계가 필요하다 (users/matches 페이지와 동일 구조)
  return (
    <Suspense fallback={null}>
      <AdminTeamMatchesPageContent />
    </Suspense>
  );
}

function AdminTeamMatchesPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // ── Admin capabilities ─────────────────────────────────────────────
  const canWrite = useAdminCanWrite();
  const [activeKind, setActiveKind] = useState<(typeof KIND_OPTIONS)[number]['value']>(
    KIND_OPTIONS.find((option) => option.value === searchParams.get('kind'))?.value ?? '',
  );

  // ── Filter state — 검색 debounce·상태 필터·page 리셋은 공용 훅이 담당 ─────
  // (백엔드 q 지원이 이번에 추가되어 hideSearch도 함께 해제한다 — 제목·호스트 팀명 검색)
  // 조건은 URL에 남아 상세에 다녀와도 유지되고, 허용 목록에 없는 ?status= 는 '전체'로 떨어진다.
  const {
    search,
    setSearch,
    activeStatus,
    setActiveStatus,
    filters,
    resetToFirstPage,
    buildPagination,
  } = useAdminUrlListQuery(STATUS_OPTIONS, PAGE_SIZE);

  const { data, isPending, isFetching, isError, error, refetch } = useV1AdminTeamMatches({ ...filters, ...(activeKind ? { kind: activeKind } : {}) });
  const rows = data?.items ?? [];
  const pageInfo = data?.pageInfo;
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? data?.summary.byStatus[option.value] : data?.summary.total,
  }));

  // ── Moderation modal ───────────────────────────────────────────────
  const [modalRow, setModalRow] = useState<V1AdminTeamMatchRow | null>(null);
  const mutation = useV1ChangeTeamMatchStatus();

  // ── Toast ──────────────────────────────────────────────────────────
  const { toasts, showToast } = useAdminToast();

  const handleModalSubmit = (status: string, reason: string) => {
    if (!modalRow) return;
    mutation.mutate(
      { id: modalRow.teamMatchId, status, reason },
      {
        onSuccess: () => {
          setModalRow(null);
          showToast('팀매치 상태를 변경했어요.', 'success');
          // 방금 바꾼 행이 최신 상태로 다시 그려지도록 첫 페이지부터 받아온다.
          resetToFirstPage();
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '처리 중 오류가 발생했어요.'), 'error');
        },
      },
    );
  };

  // ── Loading / error for initial load ───────────────────────────────
  const isInitialLoad = isPending && rows.length === 0;

  return (
    <>
      <AdminPageHeader
        eyebrow="플랫폼"
        title="팀매치 관리"
        description="친선·리그·대회 경기를 함께 조회해요. 리그·대회 경기는 해당 운영 화면에서 관리해요."
        action={
          canWrite ? (
            <Link
              href="/admin/team-matches/new"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 text-[length:var(--font-size-body-sm)] font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              모집 만들기
            </Link>
          ) : null
        }
      />

      {/* Filter bar — chip 높이 min-h-[44px] + 페이지 간 리듬 통일 */}
      <div className="tm-content-enter mb-4">
        <AdminFilterBar
          searchLabel="경기 제목·참가 팀명 검색"
          searchPlaceholder="경기 제목·참가 팀명 검색"
          searchValue={search}
          onSearchChange={setSearch}
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={setActiveStatus}
          rightSlot={
            <label className="inline-flex min-h-[44px] items-center gap-2 text-[length:var(--font-size-label)] text-[var(--text-body)]">
              경기 유형
              <select
                value={activeKind}
                onChange={(event) => {
                  const next = KIND_OPTIONS.find((option) => option.value === event.target.value);
                  if (!next) return;
                  setActiveKind(next.value);
                  // 경기 유형도 URL에 남긴다 — 검색·상태와 함께 상세 왕복 뒤에 복원된다(MD-QA #21).
                  const url = new URL(window.location.href);
                  if (next.value) url.searchParams.set('kind', next.value);
                  else url.searchParams.delete('kind');
                  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
                  resetToFirstPage();
                }}
                className="min-h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[var(--text-strong)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                {KIND_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          }
        />
      </div>

      {/* Card list */}
      <AdminDataTable<V1AdminTeamMatchRow>
        rows={rows}
        keyExtractor={(r) => r.teamMatchId}
        // 상세 라우트가 생겼다 — 목록에서 갈 길이 없으면 ⌘K 로만 도달한다.
        onRowClick={(row) => router.push(`/admin/team-matches/${encodeURIComponent(row.teamMatchId)}`)}
        rowClickLabel={(row) => `${row.title} 상세 보기`}
        tableMaxWidth="max-w-none"
        rowTone={(row) =>
          row.status === 'cancelled' ? 'danger' : row.status === 'archived' ? 'warning' : undefined
        }
        columns={[
          {
            key: 'startAt',
            header: '시작',
            width: 'w-[132px]',
            render: (row) => (
              <span className="whitespace-nowrap text-[var(--text-muted)]">{formatAdminDateTimeShort(row.startAt)}</span>
            ),
          },
          {
            key: 'status',
            header: '상태',
            width: 'w-[104px]',
            render: (row) => <AdminStatusPill status={row.status} />,
          },
          {
            key: 'title',
            header: '팀매칭',
            render: (row) => (
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  {/* 리그는 팀매치를 묶는 컨테이너다 — 어느 리그 소속인지 목록에서 바로 보이지
                      않으면 운영자는 단발 경기와 리그전을 구분하지 못한다. 색만으로 알리지
                      않도록 '리그' 글자를 함께 둔다. */}
                  {row.league && (
                    <Link
                      href={`/admin/league-matches/${encodeURIComponent(row.league.leagueId)}`}
                      onClick={(event) => event.stopPropagation()}
                      title={row.league.title}
                      aria-label={`정규 리그 ${row.league.title} 상세 보기`}
                      className="group inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-[length:var(--font-size-micro)] font-bold text-[var(--blue700)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                    >
                      <span className="rounded-full bg-[var(--blue50)] px-2 py-0.5 group-hover:bg-[var(--tint-blue)]">정규 리그</span>
                    </Link>
                  )}
                  {!row.league && row.tournament && (
                    <Link
                      href={`/admin/tournaments/${encodeURIComponent(row.tournament.tournamentId)}`}
                      onClick={(event) => event.stopPropagation()}
                      title={row.tournament.title}
                      aria-label={`대회 ${row.tournament.title} 상세 보기`}
                      className="group inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-[length:var(--font-size-micro)] font-bold text-[var(--blue700)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                    >
                      <span className="rounded-full bg-[var(--blue50)] px-2 py-0.5 group-hover:bg-[var(--tint-blue)]">대회</span>
                    </Link>
                  )}
                  <span className="block truncate font-medium text-[var(--text-strong)]" title={row.title}>
                    {row.title}
                  </span>
                </div>
                <span className="block truncate text-[length:var(--font-size-micro)] text-[var(--text-muted)]">
                  {row.league ? `${row.league.title} · ` : row.tournament ? `${row.tournament.title} · ` : ''}
                  {row.hostTeamName && row.approvedApplicantTeamName
                    ? `${row.hostTeamName} vs ${row.approvedApplicantTeamName}`
                    : row.hostTeamName ?? row.approvedApplicantTeamName ?? '플랫폼 모집'}
                </span>
              </div>
            ),
          },
          {
            key: 'sportName',
            header: '종목',
            width: 'w-[96px]',
            render: (row) => <span className="text-[var(--text-muted)]">{row.sportName}</span>,
          },
          {
            key: 'createdAt',
            header: '생성',
            width: 'w-[132px]',
            render: (row) => (
              <span className="whitespace-nowrap text-[var(--text-muted)]">{formatAdminDateTimeShort(row.createdAt)}</span>
            ),
          },
        ]}
        renderActions={(row) => (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {row.platformManaged && !row.league && !row.tournament && row.status === 'recruiting' && row.pendingApplicationCount > 0 && (
              <Link
                href={`/admin/team-matches/${encodeURIComponent(row.teamMatchId)}`}
                aria-label={`${row.title} 대기 신청 ${row.pendingApplicationCount}건 관리`}
                className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-blue-500 px-3 text-[length:var(--font-size-label)] font-semibold text-white transition-colors hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                신청 {row.pendingApplicationCount}건 관리
              </Link>
            )}
            {(row.league || row.tournament) && (
              <Link
                href={row.league
                  ? `/admin/league-matches/${encodeURIComponent(row.league.leagueId)}`
                  : `/admin/tournaments/${encodeURIComponent(row.tournament!.tournamentId)}`}
                className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-lg bg-[var(--surface-soft)] px-3 text-[length:var(--font-size-label)] font-medium text-[var(--text-body)] transition-colors hover:bg-[var(--border)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                {row.league ? '리그 관리' : '대회 관리'}
              </Link>
            )}
            {canWrite && !row.league && !row.tournament && (
              <button
                type="button"
                onClick={() => setModalRow(row)}
                aria-label={`${row.title} 상태 변경`}
                className={[
                  'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium',
                  'tm-on-tint text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--border)] transition-colors whitespace-nowrap',
                  'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                ].join(' ')}
              >
                상태 변경
              </button>
            )}
          </div>
        )}
        loading={isInitialLoad}
        pagination={buildPagination(pageInfo, isFetching)}
        empty={
          <AdminEmpty
            title="검색 결과가 없어요"
            description="필터를 변경해 보세요."
          />
        }
        error={
          isError && rows.length === 0
            ? extractErrorMessage(error, '팀매치 목록을 불러오지 못했어요.')
            : undefined
        }
        onRetry={() => void refetch()}
        skeletonRows={8}
      />

      {/* 페이지 이동 실패는 목록이 비어 보이지 않으므로 따로 알린다. */}
      {isError && rows.length > 0 && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <p className="text-[length:var(--font-size-label)] text-red-500" role="alert">
            {extractErrorMessage(error, '목록을 불러오지 못했어요.')}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="inline-flex items-center h-[44px] px-6 rounded-xl text-[length:var(--font-size-body-sm)] font-medium text-[var(--text-body)] bg-[var(--card-surface)] border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            {isFetching ? '불러오는 중…' : '다시 시도'}
          </button>
        </div>
      )}

      {/* Moderation modal */}
      <AdminReasonModal
        open={!!modalRow}
        title="팀매치 상태 변경"
        currentStatus={REASON_MODAL_STATUS_OPTIONS.some((option) => option.value === modalRow?.status) ? modalRow?.status : undefined}
        statusOptions={REASON_MODAL_STATUS_OPTIONS}
        onSubmit={handleModalSubmit}
        onClose={() => setModalRow(null)}
        pending={mutation.isPending}
      />

      {/* Toasts */}
      <AdminToasts toasts={toasts} />
    </>
  );
}
