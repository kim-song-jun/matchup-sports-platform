'use client';

import { CheckCircle2 } from 'lucide-react';
import { extractErrorMessage } from '@/lib/error-message';
import { AdminDataTable, AdminEmpty } from '@/components/admin';
import type { AdminTableColumn } from '@/components/admin';

/**
 * 실패 로그 테이블 공통 골격 — push-failure-table 과 sms-failure-table 이
 * 컬럼 정의만 다르고 ack 열·로딩·에러·빈 상태 코드가 사실상 동일하게 복제돼
 * 있었다(전수 감사 diff 실측 98%). 도메인 컬럼은 각 테이블 소관으로 남기고,
 * 공통 골격만 여기서 책임진다.
 */
export function FailureLogTable<T extends { id: string; acknowledgedAt: string | null }>({
  columns,
  rows,
  isLoading,
  isError,
  error,
  onRetry,
  onAck,
  ackPending,
  ackAriaLabel,
  emptyTitle,
  emptyDescription,
}: {
  /** 도메인 컬럼(확인 열 제외) — 확인 열은 골격이 항상 마지막에 붙인다 */
  columns: AdminTableColumn<T>[];
  rows: T[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  onAck: (ids: string[]) => void;
  ackPending: boolean;
  /** 같은 유형의 행끼리도 스크린리더에서 구분되게 하는 행별 라벨 */
  ackAriaLabel: (row: T) => string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const allColumns: AdminTableColumn<T>[] = [
    ...columns,
    {
      key: 'ack',
      header: '확인',
      align: 'center',
      width: 'w-[88px]',
      render: (row) =>
        row.acknowledgedAt ? (
          <span className="inline-flex items-center gap-1 text-[length:var(--font-size-micro)] font-semibold text-[var(--text-muted)]">
            <CheckCircle2 size={13} aria-hidden="true" />
            확인됨
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onAck([row.id])}
            disabled={ackPending}
            className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-[length:var(--font-size-label)] font-medium text-[var(--blue700)] bg-[var(--blue50)] hover:bg-[var(--blue100)] transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50"
            aria-label={ackAriaLabel(row)}
          >
            확인
          </button>
        ),
    },
  ];

  return (
    <AdminDataTable<T>
      columns={allColumns}
      rows={rows}
      keyExtractor={(row) => row.id}
      loading={isLoading}
      error={isError ? extractErrorMessage(error, '실패 기록을 불러오지 못했어요.') : undefined}
      onRetry={onRetry}
      empty={<AdminEmpty title={emptyTitle} description={emptyDescription} />}
    />
  );
}
