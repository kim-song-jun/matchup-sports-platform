'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Clock, Pencil, Tag, Users, X } from 'lucide-react';
import {
  AdminDataTable,
  AdminEmpty,
  AdminFilterBar,
  AdminStatusPill,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import { AdminContentPreview } from '@/components/admin/admin-content-preview';
import { RichTextEditor } from '@/components/content/rich-text-editor';
import {
  useV1AdminNotices,
  useV1CreateAdminNotice,
  useV1UpdateAdminNotice,
} from '@/hooks/use-v1-api';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useTemporaryContentAssets } from '@/hooks/use-temporary-content-assets';
import { useAdminListQuery } from '@/hooks/use-admin-list-query';
import { formatAdminDateTimeShort } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { EMPTY_RICH_CONTENT, isRichContentEmpty, resolveRichContent, richContentPlainText } from '@/lib/rich-content';
import type {
  AdminListFilters,
  V1AdminNoticeAudience,
  V1AdminNoticeCategory,
  V1AdminNoticeCreatePayload,
  V1AdminNoticeRow,
  V1AdminNoticeStatus,
} from '@/types/api';
import { noticeSummary } from './notice-summary';

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'published', label: '발행' },
  { value: 'draft', label: '초안' },
  { value: 'archived', label: '보관' },
];

const CATEGORY_OPTIONS: Array<{ value: V1AdminNoticeCategory; label: string }> = [
  { value: '안내', label: '안내' },
  { value: '업데이트', label: '업데이트' },
];

const AUDIENCE_OPTIONS: Array<{ value: V1AdminNoticeAudience; label: string }> = [
  { value: 'public', label: '전체 공개' },
  { value: 'users', label: '회원' },
  { value: 'admins', label: '관리자' },
];

const CREATE_STATUS_OPTIONS: Array<{ value: Extract<V1AdminNoticeStatus, 'draft' | 'published'>; label: string }> = [
  { value: 'published', label: '바로 발행' },
  { value: 'draft', label: '초안 저장' },
];

const statusLabel: Record<V1AdminNoticeStatus, string> = {
  published: '발행',
  draft: '초안',
  archived: '보관',
};

const audienceLabel: Record<V1AdminNoticeAudience, string> = {
  public: '전체 공개',
  users: '회원',
  admins: '관리자',
};

// '미발행' 은 이 화면 전용 폴백 문구라(공용 함수의 '—' 와 다름) 한 줄 래퍼로 보존한다.
const formatPublishedAt = (value: string | null | undefined) =>
  value ? formatAdminDateTimeShort(value) : '미발행';

const PAGE_SIZE = 20;

/**
 * 공지사항 본문. /admin/notices 전용 페이지였다가 콘텐츠 허브(/admin/content)의
 * 탭 본문으로 이식됐다(A안, 2026-08-25) — 페이지 헤더는 허브 소유.
 */
export function NoticesView() {
  // 검색 debounce·상태 필터·page 리셋은 공용 훅이 담당 (M1 표준) — 이 페이지가
  // 손으로 재구현하던 바로 그 로직이다(훅 자체 주석이 경고하는 5벌 복제).
  const {
    search,
    setSearch,
    activeStatus,
    setActiveStatus,
    page,
    setPage,
    resetToFirstPage,
    filters: listFilters,
    buildPagination,
  } = useAdminListQuery({ pageSize: PAGE_SIZE });
  // audience 는 훅 범위 밖의 추가 필터 — 훅과 같은 이유로 바뀌면 첫 페이지로.
  const [activeAudience, setActiveAudience] = useState('');
  useEffect(() => {
    resetToFirstPage();
  }, [activeAudience, resetToFirstPage]);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState(EMPTY_RICH_CONTENT);
  const [audience, setAudience] = useState<V1AdminNoticeAudience>('public');
  const [category, setCategory] = useState<V1AdminNoticeCategory>('안내');
  const [createStatus, setCreateStatus] = useState<Extract<V1AdminNoticeStatus, 'draft' | 'published'>>('published');
  const [editingNotice, setEditingNotice] = useState<V1AdminNoticeRow | null>(null);

  const { toasts, showToast } = useAdminToast();
  const canWrite = useAdminCanWrite();

  const filters: AdminListFilters = {
    ...listFilters,
    ...(activeAudience ? { audience: activeAudience } : {}),
  };

  const { data: firstPage, isPending, isFetching, isError, error, refetch } =
    useV1AdminNotices(filters);
  const createNotice = useV1CreateAdminNotice();
  const updateNotice = useV1UpdateAdminNotice();
  const contentAssets = useTemporaryContentAssets();
  const isSaving = createNotice.isPending || updateNotice.isPending;

  useEffect(() => {
    if (!contentAssets.cleanupError) return;
    showToast(contentAssets.cleanupError, 'error');
    contentAssets.clearCleanupError();
  }, [contentAssets.cleanupError]);


  const rows = firstPage?.items ?? [];
  const pageInfo = firstPage?.pageInfo;
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? firstPage?.summary.byStatus[option.value] : firstPage?.summary.total,
  }));

  function clearForm() {
    setTitle('');
    setContent(EMPTY_RICH_CONTENT);
    setAudience('public');
    setCategory('안내');
    setCreateStatus('published');
    setEditingNotice(null);
  }

  async function cancelForm() {
    await contentAssets.discard();
    clearForm();
  }

  function startEdit(row: V1AdminNoticeRow) {
    void contentAssets.discard();
    setEditingNotice(row);
    setTitle(row.title);
    setContent(resolveRichContent(row.content, row.body));
    setAudience(row.audience);
    setCategory(row.category);
    setCreateStatus(row.status === 'published' ? 'published' : 'draft');
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: V1AdminNoticeCreatePayload = {
      audience,
      category,
      title: title.trim(),
      content,
      status: createStatus,
    };

    if (!payload.title || isRichContentEmpty(content)) {
      showToast('제목과 본문을 입력해 주세요.', 'error');
      return;
    }

    if (editingNotice) {
      updateNotice.mutate({ noticeId: editingNotice.noticeId, body: payload }, {
        onSuccess: () => {
          void contentAssets.commit(content);
          clearForm();
          setPage(1);
          showToast(payload.status === 'published' ? '공지를 수정하고 발행 상태로 저장했어요.' : '공지 수정사항을 초안으로 저장했어요.', 'success');
        },
        onError: (err) => {
          showToast(extractErrorMessage(err, '공지 수정에 실패했어요.'), 'error');
        },
      });
      return;
    }

    createNotice.mutate(payload, {
      onSuccess: () => {
        void contentAssets.commit(content);
        clearForm();
        setPage(1);
        showToast(payload.status === 'published' ? '공지를 발행했어요.' : '공지 초안을 저장했어요.', 'success');
      },
      onError: (err) => {
        showToast(extractErrorMessage(err, '공지 저장에 실패했어요.'), 'error');
      },
    });
  }

  const audienceCounts = firstPage?.summary.byAudience;
  const audienceTotal = audienceCounts
    ? Object.values(audienceCounts).reduce((sum, count) => sum + count, 0)
    : undefined;
  const audienceOptions = [
    { value: '', label: '전체 대상' },
    ...AUDIENCE_OPTIONS,
  ].map((option) => ({
    ...option,
    count: option.value ? audienceCounts?.[option.value] : audienceTotal,
  }));

  const errorMessage = isError ? extractErrorMessage(error, '공지 목록을 불러오지 못했어요.') : undefined;

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex flex-col gap-4 min-w-0" aria-label="공지 목록">
          <AdminFilterBar
            searchLabel="공지 검색"
            searchPlaceholder="제목·본문 검색"
            searchValue={search}
            onSearchChange={setSearch}
            statusOptions={statusOptions}
            activeStatus={activeStatus}
            onStatusChange={setActiveStatus}
            rightSlot={
              <select
                value={activeAudience}
                onChange={(event) => setActiveAudience(event.target.value)}
                aria-label="공지 대상 필터"
                className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-body)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {audienceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} {typeof option.count === 'number' ? option.count.toLocaleString('ko-KR') : '—'}
                  </option>
                ))}
              </select>
            }
          />

          <AdminDataTable<V1AdminNoticeRow>
            rows={rows}
            keyExtractor={(row) => row.noticeId}
            loading={isPending && rows.length === 0}
            error={errorMessage}
            onRetry={() => void refetch()}
            empty={<AdminEmpty title="공지사항이 없어요" description="조건에 맞는 공지가 없어요." />}
            skeletonRows={8}
            pagination={buildPagination(pageInfo, isFetching)}
            renderActions={(row) => (
              <button
                type="button"
                onClick={() => startEdit(row)}
                disabled={!canWrite || isSaving}
                className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)] hover:border-blue-300 hover:text-[var(--blue700)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                <Pencil size={14} aria-hidden="true" />
                수정
              </button>
            )}
            tableMaxWidth="max-w-none"
            rowTone={(row) => (row.status === 'archived' ? 'warning' : undefined)}
            columns={[
              {
                key: 'publishedAt',
                header: '게시',
                width: 'w-[132px]',
                render: (row) => (
                  <span className="whitespace-nowrap text-[var(--text-muted)]">
                    {formatPublishedAt(row.publishedAt)}
                  </span>
                ),
              },
              {
                key: 'status',
                header: '상태',
                width: 'w-[96px]',
                render: (row) => (
                  <AdminStatusPill status={row.status} label={statusLabel[row.status]} />
                ),
              },
              {
                key: 'title',
                header: '제목',
                render: (row) => (
                  <div className="min-w-0">
                    <span className="block truncate font-medium text-[var(--text-strong)]" title={row.title}>
                      {row.title}
                    </span>
                    <span className="block truncate text-[length:var(--font-size-micro)] text-[var(--text-muted)]">
                      {noticeSummary(row.body, row.content)}
                    </span>
                  </div>
                ),
              },
              {
                key: 'audience',
                header: '대상',
                width: 'w-[104px]',
                render: (row) => (
                  <span className="text-[var(--text-muted)]">{audienceLabel[row.audience]}</span>
                ),
              },
              {
                key: 'category',
                header: '분류',
                width: 'w-[104px]',
                render: (row) => (
                  <span className="block truncate text-[var(--text-muted)]">{row.category}</span>
                ),
              },
            ]}
          />
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 h-fit" aria-label={editingNotice ? '공지 수정' : '공지 작성'}>
          <div className="mb-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[length:var(--font-size-body-lg)] font-bold text-[var(--text-strong)]">{editingNotice ? '공지 수정' : '공지 작성'}</h2>
              {editingNotice ? (
                <button
                  type="button"
                  onClick={() => void cancelForm()}
                  disabled={isSaving}
                  className="inline-flex min-h-[32px] items-center justify-center gap-1 rounded-lg px-2 text-[length:var(--font-size-label)] font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--text-body)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                >
                  <X size={14} aria-hidden="true" />
                  취소
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
              {editingNotice ? '선택한 공지의 내용과 발행 상태를 수정해요.' : '공지는 팝업과 별도로 공지 목록에 발행돼요.'}
            </p>
          </div>

          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-2">
              <span className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">제목</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                disabled={!canWrite || isSaving}
                className="h-[44px] rounded-xl border border-[var(--border)] px-3 text-sm text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)] disabled:text-gray-400"
                placeholder="공지 제목"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-2">
                <span className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">대상</span>
                <select
                  value={audience}
                  onChange={(event) => setAudience(event.target.value as V1AdminNoticeAudience)}
                  disabled={!canWrite || isSaving}
                  className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)] disabled:text-gray-400"
                >
                  {AUDIENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2">
                <span className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">상태</span>
                <select
                  value={createStatus}
                  onChange={(event) => setCreateStatus(event.target.value as Extract<V1AdminNoticeStatus, 'draft' | 'published'>)}
                  disabled={!canWrite || isSaving}
                  className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)] disabled:text-gray-400"
                >
                  {CREATE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">분류</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as V1AdminNoticeCategory)}
                disabled={!canWrite || isSaving}
                className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)] disabled:text-gray-400"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>


            <RichTextEditor
              value={content}
              onChange={(document) => {
                setContent(document);
              }}
              onUploadImage={contentAssets.uploadImage}
              disabled={!canWrite || isSaving}
            />

            {!canWrite ? (
              <p className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[length:var(--font-size-caption)] text-[var(--text-muted)]">
                지원 역할은 공지를 조회할 수 있지만 작성할 수 없어요.
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!canWrite || isSaving}
              className="mt-1 inline-flex h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
            >
              {isSaving ? '저장 중...' : editingNotice ? '수정 저장' : '공지 저장'}
            </button>
          </form>
        </section>
      </div>

      <AdminContentPreview
        payload={{
          kind: 'notice',
          title,
          category,
          content,
          body: richContentPlainText(content),
        }}
      />

      <AdminToasts toasts={toasts} />
    </>
  );
}
