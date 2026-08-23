'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  useV1AdminTeamMatches,
  useV1AdminMe,
  useV1ChangeTeamMatchStatus,
} from '@/hooks/use-v1-api';
import type { V1AdminTeamMatchRow } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { useAdminListQuery } from '@/hooks/use-admin-list-query';
import { Activity, Clock, Calendar } from 'lucide-react';
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

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDateTime(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

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
  { value: 'completed', label: STATUS_META['completed']?.label ?? '완료' },
  { value: 'archived', label: STATUS_META['archived']?.label ?? '보관' },
];

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
  const initialStatus = searchParams.get('status') ?? '';
  // ── Admin capabilities ─────────────────────────────────────────────
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;

  // ── Filter state — 검색 debounce·상태 필터·page 리셋은 공용 훅이 담당 ─────
  // (백엔드 q 지원이 이번에 추가되어 hideSearch도 함께 해제한다 — 제목·호스트 팀명 검색)
  const {
    search,
    setSearch,
    activeStatus,
    setActiveStatus,
    filters,
    resetToFirstPage,
    buildPagination,
  } = useAdminListQuery({ initialStatus, pageSize: PAGE_SIZE });

  const { data, isPending, isFetching, isError, error, refetch } = useV1AdminTeamMatches(filters);
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
        description="플랫폼 내 모든 팀매치의 상태를 필터링하고 관리해요."
      />

      {/* Filter bar — chip 높이 min-h-[44px] + 페이지 간 리듬 통일 */}
      <div className="mb-4">
        <AdminFilterBar
          searchLabel="경기 제목·호스트 팀명 검색"
          searchPlaceholder="경기 제목·호스트 팀명 검색"
          searchValue={search}
          onSearchChange={setSearch}
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={setActiveStatus}
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
              <span className="whitespace-nowrap text-[var(--text-muted)]">{formatDateTime(row.startAt)}</span>
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
                <div className="flex min-w-0 items-center gap-1.5">
                  {/* 리그는 팀매치를 묶는 컨테이너다 — 어느 리그 소속인지 목록에서 바로 보이지
                      않으면 운영자는 단발 경기와 리그전을 구분하지 못한다. 색만으로 알리지
                      않도록 '리그' 글자를 함께 둔다. */}
                  {row.league && (
                    <Link
                      href={`/admin/league-matches/${encodeURIComponent(row.league.leagueId)}`}
                      onClick={(event) => event.stopPropagation()}
                      title={row.league.title}
                      aria-label={`정규 리그 ${row.league.title} 상세 보기`}
                      className="shrink-0 rounded-full bg-[var(--blue50)] px-2 py-0.5 text-[length:var(--font-size-micro)] font-bold text-[var(--blue700)] hover:bg-[var(--tint-blue)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                    >
                      정규 리그
                    </Link>
                  )}
                  <span className="block truncate font-medium text-[var(--text-strong)]" title={row.title}>
                    {row.title}
                  </span>
                </div>
                <span className="block truncate text-[length:var(--font-size-micro)] text-[var(--text-muted)]">
                  {row.league ? `${row.league.title} · ${row.hostTeamName}` : row.hostTeamName}
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
              <span className="whitespace-nowrap text-[var(--text-muted)]">{formatDateTime(row.createdAt)}</span>
            ),
          },
        ]}
        renderActions={
          canWrite
            ? (row) => (
                <button
                  type="button"
                  onClick={() => setModalRow(row)}
                  aria-label={`${row.title} 상태 변경`}
                  className={[
                    'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium',
                    'text-[var(--text-muted)] bg-[var(--surface-soft)] hover:bg-[var(--border)] transition-colors whitespace-nowrap',
                    'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                  ].join(' ')}
                >
                  상태 변경
                </button>
              )
            : undefined
        }
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
        <div className="mt-4 flex flex-col items-center gap-1.5">
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
        currentStatus={modalRow?.status}
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
