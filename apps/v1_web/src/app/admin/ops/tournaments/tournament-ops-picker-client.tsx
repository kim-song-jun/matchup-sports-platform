'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useV1AdminTournaments } from '@/hooks/use-v1-api';
import type { V1Tournament } from '@/types/api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminDateTime } from '@/lib/date-utils';
import { AdminDataTable, AdminStatusPill, AdminFilterBar, AdminEmpty, AdminTableSkeleton } from '@/components/admin';

const STATUS_OPTIONS = [
  { value: 'in_progress', label: '진행 중' },
  { value: 'open', label: '접수 중' },
  { value: '', label: '전체' },
] as const;

const LIMIT = 50;

/**
 * T6-3 — `/admin/tournaments`(CRUD 목록)의 "상세 보기"를 거쳐야만 ops 셸에 들어갈 수
 * 있었다(nav→목록→상세→바로가기, 3홉). D-15가 원하는 "대회 현장 운영" 진입은 그 CRUD
 * 화면을 거칠 이유가 없으므로, 이 피커는 곧장 `/tournament-ops/.../operations`로
 * 연결한다. 기본 상태 필터를 in_progress로 두는 이유는 이 화면의 목적이 "지금 뛰고
 * 있는 대회의 운영 콘솔에 빨리 들어가는 것"이라 대기/완료 대회로 스크롤하게 만들
 * 이유가 없기 때문이다.
 */
export function TournamentOpsPickerClient() {
  const [activeStatus, setActiveStatus] = useState<string>('in_progress');

  const { data, isPending, isError, error, refetch } = useV1AdminTournaments({
    ...(activeStatus ? { status: activeStatus as V1Tournament['status'] } : {}),
    limit: LIMIT,
  });
  const rows = data?.items ?? [];
  const isInitialLoad = isPending && rows.length === 0;
  const errorMessage = isError ? extractErrorMessage(error, '대회 목록을 불러오지 못했어요.') : undefined;

  return (
    <div className="flex flex-col gap-4">
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
        <AdminDataTable<V1Tournament>
          rows={rows}
          keyExtractor={(row) => row.id}
          tableMaxWidth="max-w-none"
          columns={[
            { key: 'status', header: '상태', width: 'w-[104px]', render: (row) => <AdminStatusPill status={row.status} /> },
            {
              key: 'title',
              header: '대회',
              render: (row) => (
                <div className="min-w-0">
                  <span className="block truncate font-medium text-gray-900" title={row.title}>{row.title}</span>
                  {row.venue ? <span className="block truncate text-[var(--font-size-micro)] text-gray-500">{row.venue}</span> : null}
                </div>
              ),
            },
            {
              key: 'schedule',
              header: '시작 일정',
              width: 'w-[168px]',
              render: (row) => (
                <span className="whitespace-nowrap text-gray-500">
                  {row.scheduledAt ? formatAdminDateTime(row.scheduledAt) : '미정'}
                </span>
              ),
            },
          ]}
          renderActions={(row) => (
            <Link
              href={`/tournament-ops/tournaments/${encodeURIComponent(row.id)}/operations?from=admin`}
              aria-label={`${row.title} 운영 콘솔 열기`}
              className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              운영 콘솔 열기
            </Link>
          )}
          loading={isInitialLoad}
          empty={<AdminEmpty title="해당 상태의 대회가 없어요" description="필터를 바꿔 보세요." />}
          error={errorMessage}
          onRetry={() => void refetch()}
          skeletonRows={5}
        />
      )}
    </div>
  );
}
