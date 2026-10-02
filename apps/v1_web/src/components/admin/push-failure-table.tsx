'use client';

import { useV1AckPushFailures, useV1RecentPushFailures } from '@/hooks/use-v1-api';
import { formatAdminDateTime } from '@/lib/date-utils';
import { FailureLogTable } from './failure-log-table';
import type { AdminTableColumn } from '@/components/admin';
import type { V1PushFailureSummary } from '@/types/api';

// 도메인 컬럼만 정의한다 — ack 열·로딩·에러·빈 상태는 FailureLogTable 골격 소관
// (sms-failure-table 과 98% 동일 복제였던 것을 골격으로 수렴).
const COLUMNS: AdminTableColumn<V1PushFailureSummary>[] = [
  {
    key: 'userIdHash',
    header: '사용자',
    render: (failure) => (
      <span className="font-mono text-[length:var(--font-size-label)] text-[var(--text-body)]">
        {failure.userIdHash}
      </span>
    ),
  },
  {
    key: 'endpointSuffix',
    header: '구독',
    render: (failure) => (
      <span className="font-mono text-[length:var(--font-size-label)] text-[var(--text-muted)]">
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
      <span className="tabular-nums text-[var(--text-body)]">{failure.statusCode ?? '—'}</span>
    ),
  },
  {
    key: 'occurredAt',
    header: '발생 시각',
    render: (failure) => (
      <span className="text-[var(--text-muted)] whitespace-nowrap">{formatAdminDateTime(failure.occurredAt)}</span>
    ),
  },
];

// ── Component ─────────────────────────────────────────────────────────────
export function PushFailureTable() {
  const { data: failures, isLoading, isError, error, refetch } = useV1RecentPushFailures();
  const ackMutation = useV1AckPushFailures();

  return (
    <FailureLogTable<V1PushFailureSummary>
      columns={COLUMNS}
      rows={failures ?? []}
      isLoading={isLoading}
      isError={isError}
      error={error}
      onRetry={() => void refetch()}
      onAck={(ids) => ackMutation.mutate(ids)}
      ackPending={ackMutation.isPending}
      ackAriaLabel={(failure) => `${failure.userIdHash} 실패 알림 확인`}
      emptyTitle="최근 실패 기록이 없어요"
      emptyDescription="웹 푸시 발송 실패가 발생하면 여기에 표시돼요."
    />
  );
}
