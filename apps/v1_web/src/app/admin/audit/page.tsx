'use client';

import { useEffect, useState } from 'react';
import { useV1AdminActionLogs, useV1AdminStatusChangeLogs } from '@/hooks/use-v1-api';
import type { AdminListFilters, V1AdminLog, V1AdminStatusChangeLog } from '@/types/api';
import { adminActionLabel, adminTargetTypeLabel } from '@/lib/admin-labels';
import {
  AdminDataTable,
  AdminEmpty,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableSkeleton,
} from '@/components/admin';
import type { AdminTableColumn } from '@/components/admin';

// ── Types ─────────────────────────────────────────────────────────────────
type TargetTypeFilter = '' | 'user' | 'match' | 'team' | 'team_match' | 'tournament';

interface FilterOption {
  value: TargetTypeFilter;
  label: string;
}

type TabKey = 'action' | 'status';

interface Tab {
  key: TabKey;
  label: string;
}

// ── Constants ─────────────────────────────────────────────────────────────
const TARGET_TYPE_OPTIONS: FilterOption[] = [
  { value: '', label: '전체' },
  { value: 'user', label: '회원' },
  { value: 'match', label: '매치' },
  { value: 'team', label: '팀' },
  { value: 'team_match', label: '팀매치' },
  { value: 'tournament', label: '대회' },
];

const TABS: Tab[] = [
  { key: 'action', label: '운영 활동' },
  { key: 'status', label: '상태 변경' },
];

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

function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  return `…${id.slice(-8)}`;
}

// ── Action log columns ────────────────────────────────────────────────────
const ACTION_LOG_COLUMNS: AdminTableColumn<V1AdminLog>[] = [
  {
    key: 'createdAt',
    header: '시각',
    render: (row) => (
      <time dateTime={row.createdAt} className="text-[13px] text-gray-600 tabular-nums">
        {formatDateTime(row.createdAt)}
      </time>
    ),
  },
  {
    key: 'adminUserId',
    header: '관리자',
    render: (row) => (
      <span className="text-[13px] text-gray-700 font-mono">{shortId(row.adminUserId)}</span>
    ),
  },
  {
    key: 'actionType',
    header: '액션',
    render: (row) => (
      <span className="text-[13px] text-gray-800 font-medium">{adminActionLabel(row.actionType)}</span>
    ),
  },
  {
    key: 'target',
    header: '대상',
    render: (row) => (
      <span className="flex items-center gap-1.5">
        <AdminStatusPill status={row.targetType} label={adminTargetTypeLabel(row.targetType)} />
        <span className="font-mono text-[12px] text-gray-400">{shortId(row.targetId)}</span>
      </span>
    ),
  },
  {
    key: 'reason',
    header: '사유',
    render: (row) => (
      <span className="text-[13px] text-gray-500 max-w-[200px] truncate block">
        {row.reason ?? '—'}
      </span>
    ),
  },
];

// ── Status change log columns ─────────────────────────────────────────────
const STATUS_LOG_COLUMNS: AdminTableColumn<V1AdminStatusChangeLog>[] = [
  {
    key: 'createdAt',
    header: '시각',
    render: (row) => (
      <time dateTime={row.createdAt} className="text-[13px] text-gray-600 tabular-nums">
        {formatDateTime(row.createdAt)}
      </time>
    ),
  },
  {
    key: 'targetType',
    header: '대상',
    render: (row) => <AdminStatusPill status={row.targetType} label={adminTargetTypeLabel(row.targetType)} />,
  },
  {
    key: 'statusChange',
    header: '변경',
    render: (row) => (
      <span className="flex items-center gap-1.5 flex-wrap">
        <AdminStatusPill status={row.fromStatus} />
        <span className="text-gray-400 text-[11px]" aria-hidden="true">→</span>
        <AdminStatusPill status={row.toStatus} />
      </span>
    ),
  },
  {
    key: 'actor',
    header: '처리자',
    render: (row) => (
      <span className="text-[13px] text-gray-700 font-mono">
        {shortId(row.adminUserId ?? row.actorUserId)}
      </span>
    ),
  },
  {
    key: 'reason',
    header: '사유',
    render: (row) => (
      <span className="text-[13px] text-gray-500 max-w-[200px] truncate block">
        {row.reason ?? '—'}
      </span>
    ),
  },
];

// ── Error / load-more shared UI ───────────────────────────────────────────
function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 py-10 px-4 flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-red-500 font-medium">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-sm text-blue-500 hover:text-blue-600 underline underline-offset-2 min-h-[44px] px-3 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
      >
        다시 시도하기
      </button>
    </div>
  );
}

function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center justify-center h-[44px] px-6 bg-white border border-gray-200 rounded-xl text-[14px] text-gray-700 font-medium hover:border-blue-300 hover:text-blue-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? '불러오는 중…' : '더 보기'}
      </button>
    </div>
  );
}

// ── Action log panel ──────────────────────────────────────────────────────
function ActionLogPanel({ targetType }: { targetType: TargetTypeFilter }) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<V1AdminLog[]>([]);

  // Reset on filter change
  useEffect(() => {
    setRows([]);
    setCursor(undefined);
  }, [targetType]);

  const filters: AdminListFilters = {
    ...(targetType ? { targetType } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 20,
  };

  const { data, isPending, isError, refetch } = useV1AdminActionLogs(filters);

  // Append new data to accumulated rows
  useEffect(() => {
    if (!data?.items?.length) return;
    setRows((prev) => {
      const existingIds = new Set(prev.map((r) => r.actionLogId));
      const next = data.items.filter((r) => !existingIds.has(r.actionLogId));
      return next.length > 0 ? [...prev, ...next] : prev;
    });
  }, [data]);

  const hasMore = !!(data?.nextCursor ?? data?.pageInfo?.nextCursor);

  function loadMore() {
    const next = data?.nextCursor ?? data?.pageInfo?.nextCursor;
    if (next) setCursor(next);
  }

  if (isPending && rows.length === 0) return <AdminTableSkeleton rows={8} cols={5} />;
  if (isError && rows.length === 0) {
    return (
      <PanelError message="감사 로그를 불러오지 못했어요." onRetry={() => refetch()} />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AdminDataTable<V1AdminLog>
        columns={ACTION_LOG_COLUMNS}
        rows={rows}
        keyExtractor={(r) => r.actionLogId}
        empty={
          <AdminEmpty
            title="로그가 없어요"
            description="해당 조건의 운영 활동이 없어요."
          />
        }
      />
      {hasMore && <LoadMoreButton onClick={loadMore} loading={isPending} />}
    </div>
  );
}

// ── Status change log panel ───────────────────────────────────────────────
function StatusLogPanel({ targetType }: { targetType: TargetTypeFilter }) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<V1AdminStatusChangeLog[]>([]);

  // Reset on filter change
  useEffect(() => {
    setRows([]);
    setCursor(undefined);
  }, [targetType]);

  const filters: AdminListFilters = {
    ...(targetType ? { targetType } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 20,
  };

  const { data, isPending, isError, refetch } = useV1AdminStatusChangeLogs(filters);

  // Append new data to accumulated rows
  useEffect(() => {
    if (!data?.items?.length) return;
    setRows((prev) => {
      const existingIds = new Set(prev.map((r) => r.statusChangeLogId));
      const next = data.items.filter((r) => !existingIds.has(r.statusChangeLogId));
      return next.length > 0 ? [...prev, ...next] : prev;
    });
  }, [data]);

  const hasMore = !!(data?.nextCursor ?? data?.pageInfo?.nextCursor);

  function loadMore() {
    const next = data?.nextCursor ?? data?.pageInfo?.nextCursor;
    if (next) setCursor(next);
  }

  if (isPending && rows.length === 0) return <AdminTableSkeleton rows={8} cols={5} />;
  if (isError && rows.length === 0) {
    return (
      <PanelError
        message="상태 변경 로그를 불러오지 못했어요."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AdminDataTable<V1AdminStatusChangeLog>
        columns={STATUS_LOG_COLUMNS}
        rows={rows}
        keyExtractor={(r) => r.statusChangeLogId}
        empty={
          <AdminEmpty
            title="로그가 없어요"
            description="해당 조건의 상태 변경 기록이 없어요."
          />
        }
      />
      {hasMore && <LoadMoreButton onClick={loadMore} loading={isPending} />}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function AdminAuditPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('action');
  const [targetType, setTargetType] = useState<TargetTypeFilter>('');

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    setTargetType(''); // Reset filter on tab switch
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="운영 도구"
        title="감사 로그"
        description="관리자 액션과 상태 변경 이력을 확인해요."
      />

      {/* ── Tab segmented control ─────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="감사 로그 종류"
        className="flex items-center gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              id={`audit-tab-${tab.key}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`audit-panel-${tab.key}`}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={[
                'px-4 min-h-[44px] rounded-lg text-[13px] font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Target type filter chips ──────────────────────────────── */}
      <div
        role="group"
        aria-label="대상 유형 필터"
        className="flex items-center gap-1.5 flex-wrap mb-5"
      >
        {TARGET_TYPE_OPTIONS.map((opt) => {
          const isActive = targetType === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTargetType(opt.value)}
              aria-pressed={isActive}
              className={[
                'inline-flex items-center px-3 h-[34px] rounded-full text-[13px] font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                isActive
                  ? 'bg-blue-500 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600',
              ].join(' ')}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab panels ───────────────────────────────────────────── */}
      {TABS.map((tab) => (
        <div
          key={tab.key}
          id={`audit-panel-${tab.key}`}
          role="tabpanel"
          aria-labelledby={`audit-tab-${tab.key}`}
          hidden={activeTab !== tab.key}
        >
          {tab.key === 'action' ? (
            <ActionLogPanel targetType={targetType} />
          ) : (
            <StatusLogPanel targetType={targetType} />
          )}
        </div>
      ))}
    </>
  );
}
