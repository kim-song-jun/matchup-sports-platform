'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Clock, Pencil, Tag, Users, X } from 'lucide-react';
import {
  AdminCardList,
  AdminEmpty,
  AdminFilterBar,
  AdminPageHeader,
  AdminStatusPill,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import { AdminContentPreview } from '@/components/admin/admin-content-preview';
import { RichTextEditor } from '@/components/content/rich-text-editor';
import {
  useV1AdminMe,
  useV1AdminNotices,
  useV1CreateAdminNotice,
  useV1UpdateAdminNotice,
} from '@/hooks/use-v1-api';
import { useTemporaryContentAssets } from '@/hooks/use-temporary-content-assets';
import { v1Get } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { EMPTY_RICH_CONTENT, isRichContentEmpty, resolveRichContent, richContentPlainText } from '@/lib/rich-content';
import type {
  AdminListFilters,
  CursorPage,
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

function formatDateTime(value: string | null | undefined) {
  if (!value) return '미발행';
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

export default function AdminNoticesPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState('');
  const [activeAudience, setActiveAudience] = useState('');
  const [extraRows, setExtraRows] = useState<V1AdminNoticeRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState(EMPTY_RICH_CONTENT);
  const [audience, setAudience] = useState<V1AdminNoticeAudience>('public');
  const [category, setCategory] = useState<V1AdminNoticeCategory>('안내');
  const [createStatus, setCreateStatus] = useState<Extract<V1AdminNoticeStatus, 'draft' | 'published'>>('published');
  const [editingNotice, setEditingNotice] = useState<V1AdminNoticeRow | null>(null);

  const { toasts, showToast } = useAdminToast();
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setExtraRows([]);
    setNextCursor(null);
  }, [debouncedSearch, activeStatus, activeAudience]);

  const filters: AdminListFilters = {
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    ...(activeStatus ? { status: activeStatus } : {}),
    ...(activeAudience ? { audience: activeAudience } : {}),
    limit: 20,
  };

  const { data: firstPage, isPending, isError, error, refetch } = useV1AdminNotices(filters);
  const createNotice = useV1CreateAdminNotice();
  const updateNotice = useV1UpdateAdminNotice();
  const contentAssets = useTemporaryContentAssets();
  const isSaving = createNotice.isPending || updateNotice.isPending;

  useEffect(() => {
    if (!contentAssets.cleanupError) return;
    showToast(contentAssets.cleanupError, 'error');
    contentAssets.clearCleanupError();
  }, [contentAssets.cleanupError]);

  useEffect(() => {
    if (firstPage) {
      setNextCursor(firstPage.nextCursor ?? firstPage.pageInfo?.nextCursor ?? null);
    }
  }, [firstPage]);

  const rows = [...(firstPage?.items ?? []), ...extraRows];
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? firstPage?.summary.byStatus[option.value] : firstPage?.summary.total,
  }));

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await v1Get<CursorPage<V1AdminNoticeRow>>('/admin/notices', {
        ...filters,
        cursor: nextCursor,
      });
      setExtraRows((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor ?? page.pageInfo?.nextCursor ?? null);
    } catch (err) {
      showToast(extractErrorMessage(err, '추가 공지를 불러오지 못했어요.'), 'error');
    } finally {
      setLoadingMore(false);
    }
  }

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
          setExtraRows([]);
          setNextCursor(null);
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
        setExtraRows([]);
        setNextCursor(null);
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
      <AdminPageHeader
        title="공지사항 관리"
        description="서비스 공지를 조회하고 운영자가 새 공지를 작성해요."
      />

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
                className="h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {audienceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} {typeof option.count === 'number' ? option.count.toLocaleString('ko-KR') : '—'}
                  </option>
                ))}
              </select>
            }
          />

          <AdminCardList<V1AdminNoticeRow>
            rows={rows}
            keyExtractor={(row) => row.noticeId}
            loading={isPending && rows.length === 0}
            error={errorMessage}
            onRetry={() => void refetch()}
            empty={<AdminEmpty title="공지사항이 없어요" description="조건에 맞는 공지가 없어요." />}
            skeletonCards={8}
            renderActions={(row) => (
              <button
                type="button"
                onClick={() => startEdit(row)}
                disabled={!canWrite || isSaving}
                className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-[var(--font-size-label)] font-semibold text-gray-700 hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                <Pencil size={14} aria-hidden="true" />
                수정
              </button>
            )}
            card={(row) => ({
              title: row.title,
              subtitle: `${audienceLabel[row.audience]} · ${row.category}`,
              statusNode: (
                <span className="flex items-center gap-1.5 flex-wrap justify-end">

                  <AdminStatusPill status={row.status} label={statusLabel[row.status]} />
                </span>
              ),
              meta: [
                { icon: <Users size={14} aria-hidden="true" />, label: audienceLabel[row.audience] },
                { icon: <Tag size={14} aria-hidden="true" />, label: row.category },
                { icon: <Clock size={14} aria-hidden="true" />, label: formatDateTime(row.publishedAt) },
              ],
              description: noticeSummary(row.body, row.content),
              tone: row.status === 'archived' ? 'warning' : undefined,
            })}
          />

          {nextCursor ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex h-[44px] items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-sm font-medium text-gray-700 transition-colors hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
              >
                {loadingMore ? '불러오는 중...' : '더 보기'}
              </button>
            </div>
          ) : null}
          {loadingMore ? <AdminTableSkeleton rows={3} /> : null}
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4 h-fit" aria-label={editingNotice ? '공지 수정' : '공지 작성'}>
          <div className="mb-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-[var(--font-size-body-lg)] font-bold text-gray-900">{editingNotice ? '공지 수정' : '공지 작성'}</h2>
              {editingNotice ? (
                <button
                  type="button"
                  onClick={() => void cancelForm()}
                  disabled={isSaving}
                  className="inline-flex min-h-[32px] items-center justify-center gap-1 rounded-lg px-2 text-[var(--font-size-label)] font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
                >
                  <X size={14} aria-hidden="true" />
                  취소
                </button>
              ) : null}
            </div>
            <p className="mt-1 text-[var(--font-size-caption)] text-gray-500">
              {editingNotice ? '선택한 공지의 내용과 발행 상태를 수정해요.' : '공지는 팝업과 별도로 공지 목록에 발행돼요.'}
            </p>
          </div>

          <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-[var(--font-size-label)] font-semibold text-gray-700">제목</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={120}
                disabled={!canWrite || isSaving}
                className="h-[44px] rounded-xl border border-gray-200 px-3 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
                placeholder="공지 제목"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-[var(--font-size-label)] font-semibold text-gray-700">대상</span>
                <select
                  value={audience}
                  onChange={(event) => setAudience(event.target.value as V1AdminNoticeAudience)}
                  disabled={!canWrite || isSaving}
                  className="h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {AUDIENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[var(--font-size-label)] font-semibold text-gray-700">상태</span>
                <select
                  value={createStatus}
                  onChange={(event) => setCreateStatus(event.target.value as Extract<V1AdminNoticeStatus, 'draft' | 'published'>)}
                  disabled={!canWrite || isSaving}
                  className="h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {CREATE_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-[var(--font-size-label)] font-semibold text-gray-700">분류</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as V1AdminNoticeCategory)}
                disabled={!canWrite || isSaving}
                className="h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50 disabled:text-gray-400"
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
              <p className="rounded-xl bg-gray-50 px-3 py-2 text-[var(--font-size-caption)] text-gray-500">
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
