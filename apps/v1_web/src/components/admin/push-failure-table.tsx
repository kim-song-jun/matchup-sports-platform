'use client';

import { CheckCircle2 } from 'lucide-react';
import { useV1AckPushFailures, useV1RecentPushFailures } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { formatAdminDateTime } from '@/lib/date-utils';
import { AdminDataTable, AdminEmpty } from '@/components/admin';
import type { AdminTableColumn } from '@/components/admin';
import type { V1PushFailureSummary } from '@/types/api';

// ── Component ─────────────────────────────────────────────────────────────
export function PushFailureTable() {
  const { data: failures, isLoading, isError, error, refetch } = useV1RecentPushFailures();
  const ackMutation = useV1AckPushFailures();

  const columns: AdminTableColumn<V1PushFailureSummary>[] = [
    {
      key: 'userIdHash',
      header: '사용자',
      render: (failure) => (
        <span className="font-mono text-[var(--font-size-label)] text-gray-700">
          {failure.userIdHash}
        </span>
      ),
    },
    {
      key: 'endpointSuffix',
      header: '구독',
      render: (failure) => (
        <span className="font-mono text-[var(--font-size-label)] text-gray-500">
          …{failure.endpointSuffix}
        </span>
      ),
    },
    {
      key: 'statusCode',
      header: '상태 코드',
      align: 'center',
      width: 'w-[88px]',
      render: (failure) => (
        <span className="tabular-nums text-gray-700">{failure.statusCode ?? '—'}</span>
      ),
    },
    {
      key: 'occurredAt',
      header: '발생 시각',
      render: (failure) => (
        <span className="text-gray-500 whitespace-nowrap">{formatAdminDateTime(failure.occurredAt)}</span>
      ),
    },
    {
      key: 'ack',
      header: '확인',
      align: 'center',
      width: 'w-[88px]',
      render: (failure) =>
        failure.acknowledgedAt ? (
          <span className="inline-flex items-center gap-1 text-[var(--font-size-micro)] font-semibold text-gray-500">
            <CheckCircle2 size={13} aria-hidden="true" />
            확인됨
          </span>
        ) : (
          <button
            type="button"
            onClick={() => ackMutation.mutate([failure.id])}
            disabled={ackMutation.isPending}
            className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[var(--font-size-label)] font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            aria-label={`${failure.userIdHash} 실패 알림 확인`}
          >
            확인
          </button>
        ),
    },
  ];

  return (
    <AdminDataTable<V1PushFailureSummary>
      columns={columns}
      rows={failures ?? []}
      keyExtractor={(failure) => failure.id}
      loading={isLoading}
      error={isError ? extractErrorMessage(error, '실패 기록을 불러오지 못했어요.') : undefined}
      onRetry={() => void refetch()}
      empty={<AdminEmpty title="최근 실패 기록이 없어요" description="웹 푸시 발송 실패가 발생하면 여기에 표시돼요." />}
    />
  );
}
