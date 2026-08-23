'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AdminDataTable,
  AdminEmpty,
  AdminFilterBar,
  AdminPageHeader,
  AdminStatusPill,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import { useV1AdminInquiries } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { INQUIRY_REPORT_REASON_OPTIONS, inquiryReportReasonLabel } from '@/lib/v1-status-labels';
import type {
  AdminListFilters,
  V1AdminInquiryRow,
  V1InquiryCategory,
  V1InquiryReportReason,
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

// 신고 사유는 분류가 'report'일 때만 의미가 있다 — 다른 분류에서는 항상 null이라 보여줄 게 없다.
const REPORT_REASON_OPTIONS: Array<{ value: '' | V1InquiryReportReason; label: string }> = [
  { value: '', label: '전체 사유' },
  ...INQUIRY_REPORT_REASON_OPTIONS,
];

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
  if (row.isGuest) return '비회원';
  return row.requesterName ?? row.requesterEmail ?? row.userId?.slice(0, 8) ?? '알 수 없음';
}

function requesterContact(row: V1AdminInquiryRow) {
  const email = row.isGuest ? row.guestEmail : row.requesterEmail;
  const phone = row.isGuest ? row.guestPhone : null;
  if (email && phone) return `${email} · ${phone}`;
  return email ?? phone ?? '-';
}

const PAGE_SIZE = 20;

export default function AdminInquiriesPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [activeReportReason, setActiveReportReason] = useState('');
  // 커서 누적 대신 페이지 단위 교체다 — 목록 어디쯤인지와 총량이 보여야 한다.
  const [page, setPage] = useState(1);
  const { toasts, showToast } = useAdminToast();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, activeStatus, activeCategory, activeReportReason]);

  // 분류가 'report'를 벗어나면 사유 필터는 보이지 않는데, 선택값이 남아 있으면 안 보이는
  // 필터가 목록을 계속 좁혀 "왜 결과가 없지?"를 만든다 — 분류를 바꿀 때 항상 함께 초기화한다.
  function handleCategoryChange(value: string) {
    setActiveCategory(value);
    if (value !== 'report') setActiveReportReason('');
  }

  const filters: AdminListFilters = {
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(activeStatus ? { status: activeStatus } : {}),
    ...(activeCategory ? { category: activeCategory } : {}),
    ...(activeCategory === 'report' && activeReportReason ? { reportReason: activeReportReason } : {}),
    page,
    limit: PAGE_SIZE,
  };

  const { data: firstPage, isPending, isFetching, isError, error, refetch } =
    useV1AdminInquiries(filters);

  const rows = firstPage?.items ?? [];
  const pageInfo = firstPage?.pageInfo;
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
  const reportReasonCounts = firstPage?.summary.byReportReason;
  const reportReasonTotal = reportReasonCounts
    ? Object.values(reportReasonCounts).reduce((sum, count) => sum + count, 0)
    : undefined;
  const reportReasonOptions = REPORT_REASON_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? reportReasonCounts?.[option.value] : reportReasonTotal,
  }));

  return (
    <>
      <AdminPageHeader
        eyebrow="콘텐츠"
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
            <>
              <select
                value={activeCategory}
                onChange={(event) => handleCategoryChange(event.target.value)}
                aria-label="문의 분류 필터"
                className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-body)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} {typeof option.count === 'number' ? option.count.toLocaleString('ko-KR') : '—'}
                  </option>
                ))}
              </select>
              {activeCategory === 'report' ? (
                <select
                  value={activeReportReason}
                  onChange={(event) => setActiveReportReason(event.target.value)}
                  aria-label="신고 사유 필터"
                  className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-body)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  {reportReasonOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} {typeof option.count === 'number' ? option.count.toLocaleString('ko-KR') : '—'}
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          }
        />

        {/* 문의는 제목·분류·상태를 한눈에 훑고 처리 대상을 고르는 목록이다. 카드 그리드로는
            항목이 한둘일 때 화면 대부분이 비고, 제목이 카드 폭에 맞춰 잘렸다. */}
        <AdminDataTable<V1AdminInquiryRow>
          rows={rows}
          keyExtractor={(row) => row.inquiryId}
          loading={isPending && rows.length === 0}
          error={errorMessage}
          onRetry={() => void refetch()}
          empty={<AdminEmpty title="문의가 없어요" description="검색어나 필터를 바꿔서 확인해 보세요." />}
          skeletonRows={8}
          pagination={
            pageInfo?.totalPages
              ? {
                  page: pageInfo.page ?? page,
                  totalPages: pageInfo.totalPages,
                  total: pageInfo.total ?? 0,
                  limit: pageInfo.limit ?? PAGE_SIZE,
                  onPageChange: setPage,
                  loading: isFetching,
                }
              : undefined
          }
          tableMaxWidth="max-w-none"
          rowTone={(row) => (row.status === 'received' ? 'warning' : undefined)}
          columns={[
            {
              key: 'createdAt',
              header: '접수',
              width: 'w-[132px]',
              render: (row) => (
                <span className="whitespace-nowrap text-[var(--text-muted)]">{formatDateTime(row.createdAt)}</span>
              ),
            },
            {
              key: 'status',
              header: '상태',
              width: 'w-[104px]',
              render: (row) => <AdminStatusPill status={row.status} label={STATUS_LABEL[row.status]} />,
            },
            {
              key: 'category',
              header: '분류',
              width: 'w-[96px]',
              render: (row) => (
                <span className="text-[var(--text-muted)]">
                  {CATEGORY_LABEL[row.category]}
                  {row.reportReason ? (
                    <span className="block text-2xs text-[var(--text-muted)]">
                      {inquiryReportReasonLabel(row.reportReason)}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'title',
              header: '제목',
              render: (row) => (
                <Link
                  href={`/admin/inquiries/${row.inquiryId}`}
                  className="block max-w-[420px] truncate font-medium text-[var(--text-strong)] hover:text-[var(--blue700)] hover:underline transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2 rounded"
                  title={row.title}
                >
                  {row.title}
                </Link>
              ),
            },
            {
              key: 'requester',
              header: '문의자',
              width: 'w-[160px]',
              render: (row) => (
                <span className="block truncate text-[var(--text-muted)]" title={requesterContact(row)}>
                  {requesterLabel(row)}
                </span>
              ),
            },
            {
              key: 'replyCount',
              header: '답변',
              align: 'center',
              width: 'w-[64px]',
              render: (row) => <span className="tabular-nums text-[var(--text-muted)]">{row.replyCount}</span>,
            },
          ]}
          renderActions={(row) => (
            <Link
              href={`/admin/inquiries/${row.inquiryId}`}
              className="inline-flex h-[44px] items-center justify-center rounded-lg bg-[var(--surface-soft)] px-3 text-sm font-semibold text-[var(--text-body)] transition-colors hover:bg-[var(--border)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              조회
            </Link>
          )}
        />
      </div>

      <AdminToasts toasts={toasts} />
    </>
  );
}
