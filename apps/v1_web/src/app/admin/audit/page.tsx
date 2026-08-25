'use client';

import Link from 'next/link';
import { adminAuditActorHref, adminAuditTargetHref } from '@/lib/admin-audit-links';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useModalA11y } from '@/components/v1-ui/use-modal-a11y';
import { useV1AdminActionLogs, useV1AdminStatusChangeLogs } from '@/hooks/use-v1-api';
import type { AdminListFilters, V1AdminLog, V1AdminStatusChangeLog } from '@/types/api';
import { adminActionLabel, adminTargetTypeLabel } from '@/lib/admin-labels';
import { formatAdminDateTimeShort } from '@/lib/date-utils';
import {
  AdminDataTable,
  AdminEmpty,
  AdminFilterBar,
  AdminPageHeader,
  AdminStatusPill,
} from '@/components/admin';
import { useAdminListQuery } from '@/hooks/use-admin-list-query';

// ── Types ─────────────────────────────────────────────────────────────────
/** 필터 칩으로 고를 수 있는 값. 서버가 기록하는 targetType 전체가 아니라 자주 쓰는 것만이다. */
type TargetTypeFilter =
  | ''
  | 'user'
  | 'match'
  | 'team'
  | 'team_match'
  | 'tournament'
  | 'admin'
  | 'notice'
  | 'popup'
  | 'inquiry';

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
/**
 * 필터 칩은 **자주 쓰는 대상만** 고른 목록이다. 백엔드가 기록하는 targetType 은 40종이
 * 넘어서(관리자 설정·약관·푸시 로그 등) 전부 칩으로 늘어놓으면 고르기 더 어려워진다 —
 * 여기 없는 값은 '전체'에 그대로 포함된다.
 */
const TARGET_TYPE_OPTIONS: FilterOption[] = [
  { value: '', label: '전체' },
  { value: 'user', label: '회원' },
  { value: 'match', label: '매치' },
  { value: 'team', label: '팀' },
  { value: 'team_match', label: '팀매치' },
  { value: 'tournament', label: '대회' },
  { value: 'admin', label: '관리자' },
  { value: 'notice', label: '공지' },
  { value: 'popup', label: '팝업' },
  { value: 'inquiry', label: '문의' },
];

const TABS: Tab[] = [
  { key: 'action', label: '운영 활동' },
  { key: 'status', label: '상태 변경' },
];

// ── Helpers ───────────────────────────────────────────────────────────────
function shortId(id: string | null | undefined): string {
  if (!id) return '—';
  return `${id.slice(0, 8)}…`;
}

/** ID 는 축약해 보여주되 전문을 title 로 달아 둔다 — 축약본만으로는 대상을 특정할 수 없다. */
function IdCell({ id, href }: { id: string | null | undefined; href?: string | null }) {
  if (!id) return <span className="text-gray-400">—</span>;
  const cls = 'font-mono text-[length:var(--font-size-micro)]';
  // 링크를 걸 수 있는 대상만 링크가 된다 — 상세 화면이 없거나 targetId 가 그 라우트의
  // id 가 아닌 타입은 그대로 텍스트다(잘못된 링크는 없는 링크보다 나쁘다).
  if (!href) {
    return <span className={`${cls} text-[var(--text-muted)]`} title={id}>{shortId(id)}</span>;
  }
  return (
    <Link
      href={href}
      onClick={(event) => event.stopPropagation()}
      title={id}
      className={`${cls} text-[var(--blue700)] underline underline-offset-2 hover:bg-[var(--blue50)] rounded px-0.5 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2`}
    >
      {shortId(id)}
    </Link>
  );
}

/** 사유는 길면 잘리되 전문을 title 로 보존한다(카드에서는 한 글자만 남아 의미가 사라졌다). */
function ReasonCell({ reason }: { reason: string | null | undefined }) {
  if (!reason) return <span className="text-gray-400">—</span>;
  return (
    <span className="block max-w-[220px] truncate text-[var(--text-muted)]" title={reason}>
      {reason}
    </span>
  );
}

const PAGE_SIZE = 20;

/**
 * 로그 상세. 목록은 폭을 아끼려 ID 를 8자로 줄이고 사유를 잘라 두는데, 조사할 때 필요한 건
 * 잘리지 않은 값이다 — 행을 누르면 전문과 before/after 를 여기서 펼친다.
 */
function LogDetailModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // 조건부 마운트형이라 open은 항상 true — 공용 훅으로 옮기며 이 모달에 없던
  // focus trap과 닫을 때 포커스 복원(WCAG 2.4.3)도 함께 얻는다.
  const { dialogRef, initialFocusRef: closeRef, onBackdropClick } = useModalA11y<HTMLButtonElement>({
    open: true,
    onClose,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-[2px]"
      onClick={onBackdropClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-log-detail-title"
        className="flex max-h-[85vh] w-full max-w-[560px] flex-col overflow-hidden rounded-2xl bg-[var(--card-surface)] shadow-[0_8px_32px_rgba(20,28,45,0.14)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <h2 id="audit-log-detail-title" className="truncate text-[16px] font-bold text-[var(--text-strong)]">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5">
      <dt className="w-[92px] shrink-0 text-[length:var(--font-size-label)] text-[var(--text-muted)]">{label}</dt>
      <dd className="min-w-0 flex-1 break-all text-[length:var(--font-size-body-sm)] text-[var(--text-strong)]">{value}</dd>
    </div>
  );
}

function StateBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">{label}</h3>
      <pre className="max-h-[220px] overflow-auto rounded-xl bg-[var(--surface-soft)] p-3 font-mono text-[length:var(--font-size-micro)] leading-relaxed text-[var(--text-body)]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

function ActionLogDetailModal({ log, onClose }: { log: V1AdminLog | null; onClose: () => void }) {
  if (!log) return null;
  return (
    <LogDetailModal title={adminActionLabel(log.actionType)} onClose={onClose}>
      <dl>
        <DetailRow label="시각" value={formatAdminDateTimeShort(log.createdAt)} />
        <DetailRow label="대상" value={adminTargetTypeLabel(log.targetType)} />
        <DetailRow label="대상 ID" value={<span className="font-mono">{log.targetId ?? '—'}</span>} />
        <DetailRow label="실행자" value={<span className="font-mono">{log.adminUserId ?? '—'}</span>} />
        <DetailRow label="액션" value={<span className="font-mono">{log.actionType}</span>} />
        <DetailRow label="사유" value={log.reason ?? '—'} />
      </dl>
      <StateBlock label="변경 전" value={log.beforeState} />
      <StateBlock label="변경 후" value={log.afterState} />
    </LogDetailModal>
  );
}

function StatusLogDetailModal({
  log,
  onClose,
}: {
  log: V1AdminStatusChangeLog | null;
  onClose: () => void;
}) {
  if (!log) return null;
  return (
    <LogDetailModal
      title={`${adminTargetTypeLabel(log.targetType)} 상태 변경`}
      onClose={onClose}
    >
      <dl>
        <DetailRow label="시각" value={formatAdminDateTimeShort(log.createdAt)} />
        <DetailRow label="대상" value={adminTargetTypeLabel(log.targetType)} />
        <DetailRow label="대상 ID" value={<span className="font-mono">{log.targetId}</span>} />
        <DetailRow
          label="변경"
          value={
            <span className="flex items-center gap-1.5">
              <AdminStatusPill status={log.fromStatus} />
              <span className="text-gray-400" aria-hidden="true">→</span>
              <AdminStatusPill status={log.toStatus} />
            </span>
          }
        />
        <DetailRow
          label="실행자"
          value={<span className="font-mono">{log.adminUserId ?? log.actorUserId ?? '—'}</span>}
        />
        <DetailRow label="사유" value={log.reason ?? '—'} />
      </dl>
    </LogDetailModal>
  );
}

// ── Action log panel ──────────────────────────────────────────────────────
function ActionLogPanel({ targetType }: { targetType: TargetTypeFilter }) {
  // 커서 누적("더 보기") 대신 페이지 단위 교체다. 로그는 "어디쯤 보고 있는지"와 총량을
  // 알아야 조사가 되는데, 누적 목록은 그 감각을 주지 못한다.
  // 페이지 상태·리셋·pagination 조립은 공용 훅 소관 — 두 패널이 각자 재구현하던 로직.
  const { page, resetToFirstPage, buildPagination } = useAdminListQuery({ pageSize: PAGE_SIZE });
  const [selected, setSelected] = useState<V1AdminLog | null>(null);

  useEffect(() => {
    resetToFirstPage();
  }, [targetType, resetToFirstPage]);

  const filters: AdminListFilters = {
    ...(targetType ? { targetType } : {}),
    page,
    limit: PAGE_SIZE,
  };

  const { data, isPending, isFetching, isError, refetch } = useV1AdminActionLogs(filters);
  const rows = data?.items ?? [];
  const pageInfo = data?.pageInfo;

  const errorMessage = isError && rows.length === 0 ? '감사 로그를 불러오지 못했어요.' : undefined;

  return (
    <div className="flex flex-col gap-3">
      {/* 로그는 시간 축을 따라 훑는 데이터다. 카드 그리드로는 같은 항목끼리 세로로
          정렬되지 않아 비교가 안 되고, 좁은 카드 폭에 맞추느라 시각·ID·사유가 모두
          잘려 나갔다(사유는 한 글자만 남았다). 데스크톱은 표, 모바일은 카드 스택으로
          렌더하는 AdminDataTable 로 옮긴다. */}
      <AdminDataTable<V1AdminLog>
        rows={rows}
        keyExtractor={(r) => r.actionLogId}
        tableMaxWidth="max-w-none"
        columns={[
          {
            key: 'createdAt',
            header: '시각',
            width: 'w-[140px]',
            render: (row) => (
              <span className="whitespace-nowrap text-[var(--text-muted)]">{formatAdminDateTimeShort(row.createdAt)}</span>
            ),
          },
          {
            key: 'targetType',
            header: '대상',
            width: 'w-[112px]',
            render: (row) => (
              <AdminStatusPill status={row.targetType} label={adminTargetTypeLabel(row.targetType)} />
            ),
          },
          {
            key: 'action',
            header: '액션',
            render: (row) => (
              <span className="font-medium text-[var(--text-strong)]">{adminActionLabel(row.actionType)}</span>
            ),
          },
          {
            key: 'targetId',
            header: '대상 ID',
            width: 'w-[120px]',
            render: (row) => <IdCell id={row.targetId} href={adminAuditTargetHref(row.targetType, row.targetId)} />,
          },
          {
            key: 'adminUserId',
            header: '실행자',
            width: 'w-[120px]',
            render: (row) => <IdCell id={row.adminUserId} />,
          },
          {
            key: 'reason',
            header: '사유',
            render: (row) => <ReasonCell reason={row.reason} />,
          },
        ]}
        loading={isPending && rows.length === 0}
        empty={
          <AdminEmpty
            title="로그가 없어요"
            description="해당 조건의 운영 활동이 없어요."
          />
        }
        error={errorMessage}
        onRetry={() => void refetch()}
        skeletonRows={8}
        onRowClick={setSelected}
        rowClickLabel={(row) => `${adminActionLabel(row.actionType)} 로그 상세 보기`}
        pagination={buildPagination(pageInfo, isFetching)}
      />

      <ActionLogDetailModal log={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// ── Status change log panel ───────────────────────────────────────────────
function StatusLogPanel({ targetType }: { targetType: TargetTypeFilter }) {
  const { page, resetToFirstPage, buildPagination } = useAdminListQuery({ pageSize: PAGE_SIZE });
  const [selected, setSelected] = useState<V1AdminStatusChangeLog | null>(null);

  useEffect(() => {
    resetToFirstPage();
  }, [targetType, resetToFirstPage]);

  const filters: AdminListFilters = {
    ...(targetType ? { targetType } : {}),
    page,
    limit: PAGE_SIZE,
  };

  const { data, isPending, isFetching, isError, refetch } = useV1AdminStatusChangeLogs(filters);
  const rows = data?.items ?? [];
  const pageInfo = data?.pageInfo;

  const errorMessage =
    isError && rows.length === 0 ? '상태 변경 로그를 불러오지 못했어요.' : undefined;

  return (
    <div className="flex flex-col gap-3">
      <AdminDataTable<V1AdminStatusChangeLog>
        rows={rows}
        keyExtractor={(r) => r.statusChangeLogId}
        tableMaxWidth="max-w-none"
        rowTone={(row) =>
          row.toStatus === 'cancelled' || row.toStatus === 'blocked' || row.toStatus === 'deleted'
            ? 'danger'
            : row.toStatus === 'suspended' || row.toStatus === 'withdrawal_pending'
              ? 'warning'
              : undefined
        }
        columns={[
          {
            key: 'createdAt',
            header: '시각',
            width: 'w-[140px]',
            render: (row) => (
              <span className="whitespace-nowrap text-[var(--text-muted)]">{formatAdminDateTimeShort(row.createdAt)}</span>
            ),
          },
          {
            key: 'targetType',
            header: '대상',
            width: 'w-[112px]',
            render: (row) => (
              <AdminStatusPill status={row.targetType} label={adminTargetTypeLabel(row.targetType)} />
            ),
          },
          {
            key: 'transition',
            header: '변경',
            render: (row) => (
              <span className="flex items-center gap-1 flex-wrap">
                <AdminStatusPill status={row.fromStatus} />
                <span className="text-gray-400 text-[length:var(--font-size-micro)]" aria-hidden="true">→</span>
                <AdminStatusPill status={row.toStatus} />
              </span>
            ),
          },
          {
            key: 'targetId',
            header: '대상 ID',
            width: 'w-[120px]',
            render: (row) => <IdCell id={row.targetId} href={adminAuditTargetHref(row.targetType, row.targetId)} />,
          },
          {
            key: 'actor',
            header: '실행자',
            width: 'w-[120px]',
            render: (row) => (
              <IdCell
                id={row.adminUserId ?? row.actorUserId}
                href={row.adminUserId ? null : adminAuditActorHref(row.actorUserId)}
              />
            ),
          },
          {
            key: 'reason',
            header: '사유',
            render: (row) => <ReasonCell reason={row.reason} />,
          },
        ]}
        loading={isPending && rows.length === 0}
        empty={
          <AdminEmpty
            title="로그가 없어요"
            description="해당 조건의 상태 변경 기록이 없어요."
          />
        }
        error={errorMessage}
        onRetry={() => void refetch()}
        skeletonRows={8}
        onRowClick={setSelected}
        rowClickLabel={(row) => `${adminTargetTypeLabel(row.targetType)} 상태 변경 상세 보기`}
        pagination={buildPagination(pageInfo, isFetching)}
      />

      <StatusLogDetailModal log={selected} onClose={() => setSelected(null)} />
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
        eyebrow="운영"
        title="감사 로그"
        description="관리자 액션과 상태 변경 이력을 확인해요."
      />

      {/* ── Tab segmented control ─────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="감사 로그 종류"
        className="flex items-center gap-1 mb-4 bg-[var(--surface-soft)] p-1 rounded-xl w-fit"
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
                'px-4 min-h-[44px] rounded-lg text-[length:var(--font-size-label)] font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2',
                isActive
                  ? 'bg-[var(--card-surface)] text-[var(--text-strong)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-body)]',
              ].join(' ')}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Target type filter chips — 수제 칩을 공용 AdminFilterBar 로 교체.
          마크업이 AdminFilterBar 의 statusOptions 렌더와 구조적으로 동일했다. ── */}
      <div className="mb-5">
        <AdminFilterBar
          hideSearch
          searchValue=""
          onSearchChange={() => undefined}
          statusOptions={TARGET_TYPE_OPTIONS}
          activeStatus={targetType}
          onStatusChange={(value) => setTargetType(value as TargetTypeFilter)}
        />
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
