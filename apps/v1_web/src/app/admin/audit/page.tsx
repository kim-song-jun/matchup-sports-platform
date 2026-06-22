'use client';

import { useEffect, useState } from 'react';
import { useV1AdminActionLogs, useV1AdminStatusChangeLogs } from '@/hooks/use-v1-api';
import type { AdminListFilters, V1AdminLog, V1AdminStatusChangeLog } from '@/types/api';
import { adminActionLabel, adminTargetTypeLabel } from '@/lib/admin-labels';
import {
  AdminCardList,
  AdminEmpty,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableSkeleton,
} from '@/components/admin';
import { Clock, User, Hash, Tag } from 'lucide-react';

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

// ── Load-more shared UI ───────────────────────────────────────────────────
function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex items-center justify-center h-[44px] px-6 bg-white border border-gray-200 rounded-xl text-[var(--font-size-body-sm)] text-gray-700 font-medium hover:border-blue-300 hover:text-blue-600 transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

  const errorMessage = isError && rows.length === 0 ? '감사 로그를 불러오지 못했어요.' : undefined;

  return (
    <div className="flex flex-col gap-3">
      <AdminCardList<V1AdminLog>
        rows={rows}
        keyExtractor={(r) => r.actionLogId}
        card={(row) => ({
          title: adminActionLabel(row.actionType),
          subtitle: `${adminTargetTypeLabel(row.targetType)} ${shortId(row.targetId)}`,
          statusNode: (
            <AdminStatusPill
              status={row.targetType}
              label={adminTargetTypeLabel(row.targetType)}
            />
          ),
          meta: [
            { icon: <Clock size={14} aria-hidden="true" />, label: formatDateTime(row.createdAt) },
            { icon: <User size={14} aria-hidden="true" />, label: shortId(row.adminUserId) },
            { icon: <Hash size={14} aria-hidden="true" />, label: shortId(row.targetId) },
            { icon: <Tag size={14} aria-hidden="true" />, label: row.reason ?? '—' },
          ],
        })}
        loading={isPending && rows.length === 0}
        empty={
          <AdminEmpty
            title="로그가 없어요"
            description="해당 조건의 운영 활동이 없어요."
          />
        }
        error={errorMessage}
        onRetry={() => void refetch()}
        skeletonCards={8}
      />
      {hasMore && <LoadMoreButton onClick={loadMore} loading={isPending} />}
      {isPending && rows.length > 0 && <AdminTableSkeleton rows={4} />}
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

  const errorMessage =
    isError && rows.length === 0 ? '상태 변경 로그를 불러오지 못했어요.' : undefined;

  return (
    <div className="flex flex-col gap-3">
      <AdminCardList<V1AdminStatusChangeLog>
        rows={rows}
        keyExtractor={(r) => r.statusChangeLogId}
        card={(row) => ({
          title: `${adminTargetTypeLabel(row.targetType)} ${shortId(row.targetId)}`,
          statusNode: (
            <span className="flex items-center gap-1 flex-wrap">
              <AdminStatusPill status={row.fromStatus} />
              <span className="text-gray-400 text-[var(--font-size-micro)]" aria-hidden="true">→</span>
              <AdminStatusPill status={row.toStatus} />
            </span>
          ),
          meta: [
            {
              icon: <Clock size={14} aria-hidden="true" />,
              label: formatDateTime(row.createdAt),
            },
            {
              icon: <User size={14} aria-hidden="true" />,
              label: shortId(row.adminUserId ?? row.actorUserId),
            },
            {
              icon: <Tag size={14} aria-hidden="true" />,
              label: row.reason ?? '—',
            },
          ],
          tone:
            row.toStatus === 'cancelled' || row.toStatus === 'blocked' || row.toStatus === 'deleted'
              ? 'danger'
              : row.toStatus === 'suspended' || row.toStatus === 'withdrawal_pending'
                ? 'warning'
                : undefined,
        })}
        loading={isPending && rows.length === 0}
        empty={
          <AdminEmpty
            title="로그가 없어요"
            description="해당 조건의 상태 변경 기록이 없어요."
          />
        }
        error={errorMessage}
        onRetry={() => void refetch()}
        skeletonCards={8}
      />
      {hasMore && <LoadMoreButton onClick={loadMore} loading={isPending} />}
      {isPending && rows.length > 0 && <AdminTableSkeleton rows={4} />}
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
                'px-4 min-h-[44px] rounded-lg text-[var(--font-size-label)] font-medium transition-colors',
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
                'inline-flex items-center px-3 min-h-[44px] rounded-full text-[var(--font-size-label)] font-medium transition-colors',
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
