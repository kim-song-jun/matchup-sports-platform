'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Calendar, Clock, Users, Coins } from 'lucide-react';
import { useV1AdminTournaments } from '@/hooks/use-v1-api';
import type { V1Tournament } from '@/types/api';
import { formatAdminKstDateTimeShort, formatEntryFee } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useAdminUrlListQuery } from '../use-admin-url-list-query';
import { pickAllowedParam } from '../pick-allowed-param';
import {
  AdminPageHeader,
  AdminDataTable,
  AdminStatusPill,
  AdminFilterBar,
  AdminEmpty,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import { ADMIN_VISIBILITY_OPTIONS, AdminVisibilityFilter } from '@/components/admin/admin-visibility-filter';
import { AdminVisibilityBadge, TournamentRowVisibilityAction } from '@/components/admin/competition-visibility-row-action';
import { tournamentVisibilityHiddenReason } from '@/components/admin/tournaments/tournament-visibility-control';
import { MockSeedPanel } from '@/components/admin/tournaments/mock-seed-panel';

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDateRange(startStr: string | null, endStr: string | null): { start: string; end: string | null } {
  const start = formatAdminKstDateTimeShort(startStr);
  if (start === '—') return { start, end: null };
  const end = formatAdminKstDateTimeShort(endStr);
  if (end === '—' || end === start) return { start, end: null };
  return { start, end };
}

// ── Status filter options ─────────────────────────────────────────────────

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'draft', label: '초안' },
  { value: 'open', label: '접수 중' },
  { value: 'closed', label: '마감' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '취소됨' },
];

const PAGE_SIZE = 20;

// ── Page ──────────────────────────────────────────────────────────────────

export default function AdminTournamentsPage() {
  // useSearchParams(조건을 URL에 두는 목록 훅)는 Suspense 경계가 필요하다 (users/matches 페이지와 동일 구조)
  return (
    <Suspense fallback={null}>
      <AdminTournamentsPageContent />
    </Suspense>
  );
}

function AdminTournamentsPageContent() {
  const canWrite = useAdminCanWrite();

  // 검색 debounce·상태 필터·page 리셋은 공용 훅이 담당 (M1 표준 — users/teams와 동일).
  // 조건(?q=&status=&page=)은 URL에 남아 상세에 다녀와도 유지된다(MD-QA #21).
  const { search, setSearch, activeStatus, setActiveStatus, filters, buildPagination, resetToFirstPage } =
    useAdminUrlListQuery(STATUS_OPTIONS, PAGE_SIZE);

  // 공개 여부 필터도 ?visibility= 로 URL 에 남긴다. 공용 훅은 다른 URL 파라미터를 건드리지 않는다.
  const query = useSearchParams().toString();
  const [visibility, setVisibilityState] = useState(() =>
    pickAllowedParam(new URLSearchParams(query).get('visibility'), ADMIN_VISIBILITY_OPTIONS));
  useEffect(() => {
    // Next 가 늦게 전달한 오래된 snapshot 은 실제 주소와 다르므로 무시한다(공용 훅과 같은 가드).
    if (query !== new URLSearchParams(window.location.search).toString()) return;
    setVisibilityState(pickAllowedParam(new URLSearchParams(query).get('visibility'), ADMIN_VISIBILITY_OPTIONS));
  }, [query]);
  const setVisibility = useCallback((next: string) => {
    setVisibilityState(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('visibility', next);
    else url.searchParams.delete('visibility');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    resetToFirstPage();
  }, [resetToFirstPage]);

  const { toasts, showToast } = useAdminToast();

  const { data, isPending, isFetching, isError, error, refetch } =
    useV1AdminTournaments(visibility ? { ...filters, visibility } : filters);
  const rows = data?.items ?? [];
  const pageInfo = data?.pageInfo;
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? data?.summary.byStatus[option.value] : data?.summary.total,
  }));

  const isInitialLoad = isPending && rows.length === 0;

  const errorMessage =
    isError && rows.length === 0
      ? extractErrorMessage(error, '대회 목록을 불러오지 못했어요.')
      : undefined;

  return (
    <>
      <MockSeedPanel />
      <AdminPageHeader
        eyebrow="플랫폼"
        title="대회 관리"
        description="플랫폼 내 모든 대회의 상태를 필터링하고 관리해요."
        action={
          canWrite ? (
            <Link
              href="/admin/tournaments/new"
              className="inline-flex items-center gap-2 h-[44px] px-4 rounded-xl text-[length:var(--font-size-label)] font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              // 앵커에서는 Tailwind 글자색이 죽는다 — anchor-text-color.test.ts 참조
              style={{ color: 'var(--static-white)' }}
              aria-label="새 대회 만들기"
            >
              <Plus size={16} aria-hidden="true" />
              대회 만들기
            </Link>
          ) : undefined
        }
      />

      <div className="tm-content-enter flex flex-col gap-4">
        {/* "backend has no q" 주석 때문에 검색이 죽어 있었다 — 백엔드는 처음부터
            q(제목 contains, insensitive)를 지원한다. tournaments-admin.service.ts list 참조 */}
        <AdminFilterBar
          searchLabel="대회명 검색"
          searchPlaceholder="대회명 검색"
          searchValue={search}
          onSearchChange={setSearch}
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={setActiveStatus}
          rightSlot={<AdminVisibilityFilter value={visibility} onChange={setVisibility} />}
        />

        {/* Card list */}
        {isInitialLoad ? (
          <AdminTableSkeleton rows={8} />
        ) : (
          <AdminDataTable<V1Tournament>
            rows={rows}
            keyExtractor={(r) => r.id}
            pagination={buildPagination(pageInfo, isFetching)}
            tableMaxWidth="max-w-none"
            fitContainer
            dense
            rowTone={(row) =>
              row.status === 'cancelled' ? 'danger' : row.status === 'closed' ? 'warning' : undefined
            }
            columns={[
              {
                key: 'schedule',
                header: '일정',
                // Start and end stack on two lines so the column's min width is one timestamp, not the whole range.
                width: 'w-[112px]',
                render: (row) => {
                  const { start, end } = formatDateRange(row.scheduledAt, row.scheduledEndAt);
                  return (
                    <span className="block text-[var(--text-muted)]">
                      <span className="block whitespace-nowrap">{start}</span>
                      {' '}
                      {end ? <span className="block whitespace-nowrap">~ {end}</span> : null}
                    </span>
                  );
                },
              },
              {
                key: 'status',
                header: '상태',
                width: 'w-[104px]',
                render: (row) => <AdminStatusPill status={row.status} />,
              },
              {
                key: 'visibility',
                header: '공개',
                width: 'w-[112px]',
                render: (row) => (
                  <AdminVisibilityBadge
                    isPublic={row.isPublic ?? true}
                    hiddenReason={tournamentVisibilityHiddenReason(row.status)}
                  />
                ),
              },
              {
                key: 'title',
                header: '대회',
                render: (row) => (
                  <div className="min-w-[160px]">
                    <span className="block truncate font-medium text-[var(--text-strong)]" title={row.title}>
                      {row.title}
                    </span>
                    {row.venue ? (
                      <span className="block truncate text-[length:var(--font-size-micro)] text-[var(--text-muted)]">
                        {row.venue}
                      </span>
                    ) : null}
                  </div>
                ),
              },
              {
                key: 'deadline',
                header: '접수 마감',
                width: 'w-[124px]',
                render: (row) => (
                  <span className="whitespace-nowrap text-[var(--text-muted)]">
                    {formatAdminKstDateTimeShort(row.registrationDeadlineAt)}
                  </span>
                ),
              },
              {
                key: 'registrationCount',
                header: '참가팀',
                align: 'center',
                width: 'w-[80px]',
                render: (row) => (
                  <span className="tabular-nums text-[var(--text-muted)]">{row.registrationCount}</span>
                ),
              },
              {
                key: 'entryFee',
                header: '참가비',
                align: 'right',
                width: 'w-[112px]',
                render: (row) => (
                  <span className="tabular-nums whitespace-nowrap text-[var(--text-muted)]">
                    {formatEntryFee(row.entryFee)}
                  </span>
                ),
              },
            ]}
            renderActions={(row) => (
              <>
                <TournamentRowVisibilityAction
                  tournamentId={row.id}
                  title={row.title}
                  status={row.status}
                  isPublic={row.isPublic ?? true}
                  onToast={showToast}
                />
                <Link
                  href={`/admin/tournaments/${row.id}`}
                  aria-label={`${row.title} 상세 보기`}
                  className={[
                    'inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg',
                    'tm-on-tint text-[length:var(--font-size-label)] font-medium text-[var(--text-muted)] bg-[var(--surface-soft)]',
                    'hover:bg-[var(--grey300)] transition-colors whitespace-nowrap',
                    'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                  ].join(' ')}
                >
                  상세 보기
                </Link>
              </>
            )}
            loading={isInitialLoad}
            empty={
              <AdminEmpty
                title="검색 결과가 없어요"
                description="필터를 변경해 보세요."
              />
            }
            error={errorMessage}
            onRetry={() => void refetch()}
            skeletonRows={8}
          />
        )}

        {/* Load more */}
        {/* 페이지 이동 실패는 목록이 비어 보이지 않으므로 따로 알린다. */}
        {isError && rows.length > 0 && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-[length:var(--font-size-label)] text-[var(--red700)]" role="alert">
              {extractErrorMessage(error, '목록을 불러오지 못했어요.')}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className={[
                'h-[44px] px-6 rounded-xl text-[length:var(--font-size-label)] font-semibold transition-colors',
                'border border-[var(--border)] text-[var(--text-body)] bg-[var(--card-surface)] hover:bg-[var(--surface-soft)]',
                'disabled:opacity-50',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
              ].join(' ')}
            >
              {isFetching ? '불러오는 중…' : '다시 시도'}
            </button>
          </div>
        )}

      </div>

      <AdminToasts toasts={toasts} />
    </>
  );
}
