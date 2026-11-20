'use client';

import { useState } from 'react';
import { useAdminPushHistory } from '@/hooks/use-admin-push-history';
import { formatAdminDateTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { adminPushTargetLabel } from '@/lib/admin-labels';
import type { AdminPushHistoryItem } from '@/types/admin-push-history';
import type { V1AdminPushSendTarget } from '@/types/api';
import { AdminDataTable, type AdminTableColumn } from './admin-data-table';
import { AdminEmpty } from './admin-empty';
import { AdminInlineError } from './admin-inline-error';
import { PushHistoryDetail } from './push-history-detail';

const columns: AdminTableColumn<AdminPushHistoryItem>[] = [
  { key: 'title', header: '제목', render: (row) => <span className="block max-w-sm whitespace-pre-wrap break-words font-semibold">{row.title ?? '제목 미보관'}</span> },
  { key: 'createdAt', header: '발송 시각', render: (row) => formatAdminDateTime(row.createdAt) },
  { key: 'target', header: '대상', render: (row) => adminPushTargetLabel(row.target) },
  { key: 'sender', header: '발송자', render: (row) => row.sender.name ?? '미보관' },
  { key: 'sent', header: '알림함 생성', render: (row) => row.sent === null ? '미보관' : `${row.sent.toLocaleString()}건` },
];
const buttonClass = 'min-h-[44px] rounded-xl px-4 text-[length:var(--font-size-label)] font-semibold text-[var(--blue600)] hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50';

export function PushHistoryView() {
  const [target, setTarget] = useState<V1AdminPushSendTarget | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const query = useAdminPushHistory(target);
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[length:var(--font-size-label)] text-[var(--text-muted)]">관리자가 직접 보낸 푸시 이력이에요. 자동 경기·채팅 알림은 포함하지 않아요.</p>
        <select aria-label="발송 대상 필터" value={target ?? ''} onChange={(event) => setTarget(event.target.value === '' ? undefined : event.target.value as V1AdminPushSendTarget)} className="min-h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-label)] text-[var(--text-strong)] focus-visible:outline-2 focus-visible:outline-blue-500">
          <option value="">모든 발송</option><option value="broadcast">전체 발송</option><option value="user">특정 회원</option>
        </select>
      </div>
      <AdminDataTable columns={columns} rows={rows} keyExtractor={(row) => row.id} loading={query.isPending}
        error={query.isError && !query.data ? extractErrorMessage(query.error, '발송 이력을 불러오지 못했어요.') : undefined}
        onRetry={() => void query.refetch()} fitContainer tableMaxWidth="max-w-none"
        empty={<AdminEmpty title="발송 이력이 없어요" description="선택한 대상에 해당하는 수동 발송 기록이 없어요." />}
        renderActions={(row) => <button type="button" className={buttonClass} aria-label={`${row.title ?? '제목 미보관'} 발송 상세 보기`} onClick={() => { setSelectedId(row.id); setOpen(true); }}>내용 보기</button>}
      />
      {query.isError && query.data && <AdminInlineError message="최신 이력을 불러오지 못했어요. 현재 보관된 목록을 표시하고 있어요." onRetry={() => void query.refetch()} />}
      {query.hasNextPage && <div className="flex justify-center"><button type="button" className={buttonClass} disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? '불러오는 중…' : '이력 더 보기'}</button></div>}
      <PushHistoryDetail id={selectedId} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
