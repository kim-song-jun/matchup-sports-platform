'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Clock, Mail, MessageSquareText, Tag, UserRound } from 'lucide-react';
import {
  AdminCardList,
  AdminEmpty,
  AdminFilterBar,
  AdminPageHeader,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import { useV1AdminInquiries } from '@/hooks/use-v1-api';
import { v1Get } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import type {
  AdminListFilters,
  CursorPage,
  V1AdminInquiryRow,
  V1InquiryCategory,
  V1InquiryStatus,
} from '@/types/api';

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'received', label: '접수' },
  { value: 'reviewing', label: '검토' },
  { value: 'answered', label: '답변' },
  { value: 'closed', label: '종결' },
];

const CATEGORY_OPTIONS: Array<{ value: '' | V1InquiryCategory; label: string }> = [
  { value: '', label: '전체 분류' },
  { value: 'account', label: '계정' },
  { value: 'match', label: '매치' },
  { value: 'team', label: '팀' },
  { value: 'tournament', label: '대회' },
  { value: 'payment_refund', label: '결제/환불' },
  { value: 'report', label: '신고' },
  { value: 'other', label: '기타' },
];

const STATUS_LABEL: Record<V1InquiryStatus, string> = {
  received: '접수',
  reviewing: '검토중',
  answered: '답변완료',
  closed: '종결',
};

const CATEGORY_LABEL: Record<V1InquiryCategory, string> = {
  account: '계정',
  match: '매치',
  team: '팀',
  tournament: '대회',
  payment_refund: '결제/환불',
  report: '신고',
  other: '기타',
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function requesterLabel(row: V1AdminInquiryRow) {
  return row.requesterName ?? row.requesterEmail ?? row.userId.slice(0, 8);
}

export default function AdminInquiriesPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [extraRows, setExtraRows] = useState<V1AdminInquiryRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const { toasts, showToast } = useAdminToast();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setExtraRows([]);
    setNextCursor(null);
  }, [debouncedSearch, activeStatus, activeCategory]);

  const filters: AdminListFilters = {
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(activeStatus ? { status: activeStatus } : {}),
    ...(activeCategory ? { category: activeCategory } : {}),
    limit: 20,
  };

  const { data: firstPage, isPending, isError, error, refetch } = useV1AdminInquiries(filters);

  useEffect(() => {
    if (firstPage) {
      setNextCursor(firstPage.nextCursor ?? firstPage.pageInfo?.nextCursor ?? null);
    }
  }, [firstPage]);

  const rows = [...(firstPage?.items ?? []), ...extraRows];
  const errorMessage = isError ? extractErrorMessage(error, '문의 목록을 불러오지 못했어요.') : undefined;
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? firstPage?.summary.byStatus[option.value] : firstPage?.summary.total,
  }));
  const categoryCounts = firstPage?.summary.byCategory;
  const categoryTotal = categoryCounts
    ? Object.values(categoryCounts).reduce((sum, count) => sum + count, 0)
    : undefined;
  const categoryOptions = CATEGORY_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? categoryCounts?.[option.value] : categoryTotal,
  }));

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await v1Get<CursorPage<V1AdminInquiryRow>>('/admin/inquiries', {
        ...filters,
        cursor: nextCursor,
      });
      setExtraRows((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor ?? page.pageInfo?.nextCursor ?? null);
    } catch (err) {
      showToast(extractErrorMessage(err, '추가 문의를 불러오지 못했어요.'), 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        title="문의 관리"
        description="사용자 문의를 확인하고 답변 상태를 관리해요."
      />

      <div className="flex flex-col gap-4">
        <AdminFilterBar
          searchLabel="문의 검색"
          searchPlaceholder="제목, 내용, 사용자 검색"
          searchValue={search}
          onSearchChange={setSearch}
          statusOptions={statusOptions}
          activeStatus={activeStatus}
          onStatusChange={setActiveStatus}
          rightSlot={
            <select
              value={activeCategory}
              onChange={(event) => setActiveCategory(event.target.value)}
              aria-label="문의 분류 필터"
              className="h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} {typeof option.count === 'number' ? option.count.toLocaleString('ko-KR') : '—'}
                </option>
              ))}
            </select>
          }
        />

        <AdminCardList<V1AdminInquiryRow>
          rows={rows}
          keyExtractor={(row) => row.inquiryId}
          loading={isPending && rows.length === 0}
          error={errorMessage}
          onRetry={() => void refetch()}
          empty={<AdminEmpty title="문의가 없어요" description="검색어나 필터를 바꿔서 확인해 보세요." />}
          skeletonCards={8}
          card={(row) => ({
            title: row.title,
            subtitle: requesterLabel(row),
            status: row.status,
            statusLabel: STATUS_LABEL[row.status],
            meta: [
              { icon: <Tag size={14} aria-hidden="true" />, label: CATEGORY_LABEL[row.category] },
              { icon: <UserRound size={14} aria-hidden="true" />, label: requesterLabel(row) },
              { icon: <Mail size={14} aria-hidden="true" />, label: row.requesterEmail ?? '-' },
              { icon: <MessageSquareText size={14} aria-hidden="true" />, label: `답변 ${row.replyCount}` },
              { icon: <Clock size={14} aria-hidden="true" />, label: formatDateTime(row.createdAt) },
            ],
            tone: row.status === 'received' ? 'warning' : undefined,
          })}
          renderActions={(row) => (
            <Link
              href={`/admin/inquiries/${row.inquiryId}`}
              className="inline-flex h-[44px] items-center justify-center rounded-lg bg-gray-100 px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-200 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              조회
            </Link>
          )}
        />

        {nextCursor && !isPending && !isError ? (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="h-[44px] rounded-xl border border-gray-200 bg-white px-6 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              {loadingMore ? '불러오는 중...' : '더 보기'}
            </button>
          </div>
        ) : null}
        {loadingMore ? <AdminTableSkeleton rows={4} /> : null}
      </div>

      <AdminToasts toasts={toasts} />
    </>
  );
}
