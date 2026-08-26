'use client';

import type { FormEvent } from 'react';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Clock, Eye, MonitorUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  AdminCardList,
  AdminEmpty,
  AdminFilterBar,
  AdminStatusPill,
  AdminTableSkeleton,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import { AdminContentPreview } from '@/components/admin/admin-content-preview';
import { RichTextEditor } from '@/components/content/rich-text-editor';
import { RichContentRenderer } from '@/components/content/rich-content-renderer';
import {
  useV1AdminTournaments,
  useV1AdminPopupDetail,
  useV1AdminPopups,
  useV1CreateAdminPopup,
  useV1DeleteAdminPopup,
  useV1UpdateAdminPopup,
} from '@/hooks/use-v1-api';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useTemporaryContentAssets } from '@/hooks/use-temporary-content-assets';
import { useAdminListQuery } from '@/hooks/use-admin-list-query';
import { formatAdminDateTime } from '@/lib/date-utils';
import { extractErrorMessage } from '@/lib/error-message';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { isSafePopupLink, isSafePopupTargetPath, POPUP_TARGET_LABELS, POPUP_TARGET_OPTIONS } from '@/lib/popup-targets';
import { EMPTY_RICH_CONTENT, isRichContentEmpty, resolveRichContent, richContentPlainText } from '@/lib/rich-content';
import type {
  AdminListFilters,
  V1AdminPopupCreatePayload,
  V1AdminPopupRow,
  V1AdminPopupStatus,
  V1PopupTargetScreen,
  V1RichContentDocument,
} from '@/types/api';
import { noticeSummary } from './notice-summary';

type EditorMode = 'view' | 'create' | 'edit';

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'published', label: '공개' },
  { value: 'archived', label: '비공개' },
  { value: 'draft', label: '초안' },
];

const EDITABLE_STATUS_OPTIONS: Array<{
  value: V1AdminPopupStatus;
  label: string;
}> = [
  { value: 'published', label: '공개' },
  { value: 'archived', label: '비공개' },
  { value: 'draft', label: '초안' },
];

const STATUS_LABEL: Record<V1AdminPopupStatus, string> = {
  published: '공개',
  draft: '초안',
  archived: '비공개',
};

// '미게시' 는 이 화면 전용 폴백 문구라(공용 함수의 '—' 와 다름) 한 줄 래퍼로 보존한다.
const formatDateTime = (value: string | null | undefined) => (value ? formatAdminDateTime(value) : '미게시');

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrNull(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function formatDisplayWindow(start: string | null | undefined, end: string | null | undefined) {
  if (!start && !end) return '상시 노출';
  return `${start ? formatDateTime(start) : '즉시'} ~ ${end ? formatDateTime(end) : '종료 없음'}`;
}

function formatTargetScreens(targetScreens: V1PopupTargetScreen[]) {
  return targetScreens.length > 0
    ? targetScreens.map((screen) => POPUP_TARGET_LABELS[screen]).join(', ')
    : '화면 그룹 없음';
}

const PAGE_SIZE = 20;

/**
 * 팝업 관리 본문. /admin/popups 전용 페이지였다가 콘텐츠 허브(/admin/content)의
 * 탭 본문으로 이식됐다(A안, 2026-08-25) — 페이지 헤더는 허브 소유, '새 팝업'
 * 버튼은 폼 상태와 묶여 있어 본문 상단 툴바로 옮겼다.
 *
 * 대회 어드민의 '팝업' 항목이 `?targetPath=/tournaments/<id>` 로 이 화면을 연다 —
 * 대회별 팝업 화면을 따로 두지 않고 전역 팝업 하나로 합쳤기 때문에, 어느 대회의
 * 팝업인지는 경로 프리필로 이어받는다. 이때 화면 그룹 타겟은 비워 둔다(경로 전용):
 * 'tournaments' 를 같이 걸면 그 팝업이 모든 대회 페이지에서 뜬다.
 */
export function PopupsView() {
  return (
    <Suspense fallback={<AdminTableSkeleton rows={6} />}>
      <AdminPopupsPageContent />
    </Suspense>
  );
}

function AdminPopupsPageContent() {
  const searchParams = useSearchParams();
  const requestedTargetPath = searchParams.get('targetPath') ?? '';
  const initialTargetPath = isSafePopupTargetPath(requestedTargetPath) ? requestedTargetPath : '';

  // 검색 debounce·상태 필터·page 리셋은 공용 훅이 담당 (M1 표준 — notices 와 함께
  // 수동 재구현으로 남아 있던 마지막 콘텐츠 목록 2곳을 수렴).
  const {
    search,
    setSearch,
    activeStatus,
    setActiveStatus,
    page,
    setPage,
    filters: listFilters,
    buildPagination,
  } = useAdminListQuery({ pageSize: PAGE_SIZE });
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<EditorMode>(initialTargetPath ? 'create' : 'view');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(EMPTY_RICH_CONTENT);
  const [status, setStatus] = useState<V1AdminPopupStatus>('published');
  const [targetScreens, setTargetScreens] = useState<V1PopupTargetScreen[]>(initialTargetPath ? [] : ['home']);
  const [targetPath, setTargetPath] = useState(initialTargetPath);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [displayStartAt, setDisplayStartAt] = useState('');
  const [displayEndAt, setDisplayEndAt] = useState('');

  const { toasts, showToast } = useAdminToast();
  const canWrite = useAdminCanWrite();

  const filters: AdminListFilters = { ...listFilters };
  const listQuery = useV1AdminPopups(filters);
  const statusOptions = STATUS_OPTIONS.map((option) => ({
    ...option,
    count: option.value ? listQuery.data?.summary.byStatus[option.value] : listQuery.data?.summary.total,
  }));
  const detailQuery = useV1AdminPopupDetail(selectedId);
  const createPopup = useV1CreateAdminPopup();
  const updatePopup = useV1UpdateAdminPopup();
  const deletePopup = useV1DeleteAdminPopup();
  const { confirm: confirmModal, ConfirmModal } = useConfirm();
  const tournamentsQuery = useV1AdminTournaments({ limit: 50 });
  const contentAssets = useTemporaryContentAssets();
  const isSaving = createPopup.isPending || updatePopup.isPending;
  const isMutating = isSaving || deletePopup.isPending;

  useEffect(() => {
    if (!contentAssets.cleanupError) return;
    showToast(contentAssets.cleanupError, 'error');
    contentAssets.clearCleanupError();
  }, [contentAssets.cleanupError]);

  const rows = listQuery.data?.items ?? [];
  const pageInfo = listQuery.data?.pageInfo;
  const selectedPopup = detailQuery.data?.popup ?? rows.find((row) => row.popupId === selectedId) ?? null;

  function openView(row: V1AdminPopupRow) {
    void contentAssets.discard();
    setSelectedId(row.popupId);
    setMode('view');
  }

  function openCreate() {
    void contentAssets.discard();
    setSelectedId('');
    setTitle('');
    setContent(EMPTY_RICH_CONTENT);
    setStatus('published');
    setTargetScreens(['home']);
    setTargetPath('');
    setLinkUrl('');
    setLinkLabel('');
    setDisplayStartAt('');
    setDisplayEndAt('');
    setMode('create');
  }

  function openEdit(row: V1AdminPopupRow) {
    void contentAssets.discard();
    setSelectedId(row.popupId);
    setTitle(row.title);
    setContent(resolveRichContent(row.content, row.body));
    setStatus(row.status);
    setTargetScreens(row.targetScreens);
    setTargetPath(row.targetPaths?.[0] ?? '');
    setLinkUrl(row.linkUrl ?? '');
    setLinkLabel(row.linkLabel ?? '');
    setDisplayStartAt(toDateTimeLocal(row.displayStartAt));
    setDisplayEndAt(toDateTimeLocal(row.displayEndAt));
    setMode('edit');
  }

  async function closeEditor() {
    await contentAssets.discard();
    setMode('view');
    if (!selectedId) {
      setTitle('');
      setContent(EMPTY_RICH_CONTENT);
    }
  }

  function submitPopup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: V1AdminPopupCreatePayload = {
      audience: 'public',
      title: title.trim(),
      content,
      targetScreens,
      targetPaths: targetPath.trim() ? [targetPath.trim()] : [],
      linkUrl: linkUrl.trim() || null,
      linkLabel: linkLabel.trim() || null,
      status,
      displayStartAt: toIsoOrNull(displayStartAt),
      displayEndAt: toIsoOrNull(displayEndAt),
    };
    if (!payload.title || isRichContentEmpty(content)) {
      showToast('제목과 본문을 입력해 주세요.', 'error');
      return;
    }
    if (targetScreens.length === 0 && !targetPath.trim()) {
      showToast('노출할 화면 그룹이나 정확한 경로를 하나 이상 설정해 주세요.', 'error');
      return;
    }
    if (targetPath.trim() && !isSafePopupTargetPath(targetPath.trim())) {
      showToast('정확한 경로는 /로 시작하는 안전한 사용자 화면 경로여야 해요.', 'error');
      return;
    }
    if (payload.linkLabel && !payload.linkUrl) {
      showToast('버튼 문구를 사용하려면 이동 링크를 입력해 주세요.', 'error');
      return;
    }
    if (payload.linkUrl && !isSafePopupLink(payload.linkUrl)) {
      showToast('내부 링크는 /로 시작하고 외부 링크는 https:// 주소만 사용할 수 있어요.', 'error');
      return;
    }
    if (displayStartAt && displayEndAt && new Date(displayEndAt) <= new Date(displayStartAt)) {
      showToast('노출 종료는 노출 시작보다 늦어야 해요.', 'error');
      return;
    }

    if (mode === 'edit' && selectedId) {
      updatePopup.mutate({ popupId: selectedId, body: payload }, {
        onSuccess: ({ popup }) => {
          void contentAssets.commit(content);
          setMode('view');
          setSelectedId(popup.popupId);
          // 방금 바꾼 팝업이 최신 상태로 다시 그려지도록 첫 페이지부터 받아온다.
          setPage(1);
          showToast('팝업을 수정했어요.', 'success');
        },
        onError: (error) => showToast(extractErrorMessage(error, '팝업 수정에 실패했어요.'), 'error'),
      });
      return;
    }

    createPopup.mutate(payload, {
      onSuccess: ({ popup }) => {
        void contentAssets.commit(content);
        setMode('view');
        setSelectedId(popup.popupId);
        // 방금 바꾼 팝업이 최신 상태로 다시 그려지도록 첫 페이지부터 받아온다.
        setPage(1);
        showToast(status === 'published' ? '팝업을 공개했어요.' : status === 'archived' ? '팝업을 비공개로 저장했어요.' : '팝업 초안을 저장했어요.', 'success');
      },
      onError: (error) => showToast(extractErrorMessage(error, '팝업 생성에 실패했어요.'), 'error'),
    });
  }

  async function removePopup(row: V1AdminPopupRow) {
    const confirmed = await confirmModal({
      title: '팝업을 삭제할까요?',
      message: `“${row.title}” 팝업을 삭제해요. 삭제한 내용은 복구할 수 없어요.`,
      confirmLabel: '삭제',
      tone: 'danger',
    });
    if (!confirmed) return;
    deletePopup.mutate(row.popupId, {
      onSuccess: () => {
        if (selectedId === row.popupId) setSelectedId('');
        setMode('view');
        // 방금 바꾼 팝업이 최신 상태로 다시 그려지도록 첫 페이지부터 받아온다.
        setPage(1);
        showToast('팝업을 삭제했어요.', 'success');
      },
      onError: (error) => showToast(extractErrorMessage(error, '팝업 삭제에 실패했어요.'), 'error'),
    });
  }

  const errorMessage = listQuery.isError
    ? extractErrorMessage(listQuery.error, '팝업 목록을 불러오지 못했어요.')
    : undefined;

  return (
    <>
      {/* '새 팝업'은 폼 상태(openCreate)와 묶여 있어 허브 헤더로 못 올라간다 — 본문 툴바로 유지. */}
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          disabled={!canWrite || isMutating}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <Plus size={17} aria-hidden="true" />
          새 팝업
        </button>
      </div>

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="팝업 전체 목록">
          <AdminFilterBar
            searchLabel="팝업 검색"
            searchPlaceholder="제목·본문 검색"
            searchValue={search}
            onSearchChange={setSearch}
            statusOptions={statusOptions}
            activeStatus={activeStatus}
            onStatusChange={setActiveStatus}
          />

          {/* 본문 전문을 카드에 넣어 한 항목이 세로로 길게 늘어나 있었다. 목록은 어떤 팝업이
              어디에 언제 걸려 있는지 훑는 자리이고 본문은 우측 상세에서 본다 — 표로 옮기고
              본문은 제목 아래 한 줄 요약만 남긴다. */}
          <AdminCardList<V1AdminPopupRow>
            rows={rows}
            keyExtractor={(row) => row.popupId}
            loading={listQuery.isPending && rows.length === 0}
            error={errorMessage}
            onRetry={() => void listQuery.refetch()}
            empty={<AdminEmpty title="팝업이 없어요" description="새 팝업을 만들어 필요한 화면에 안내해 보세요." />}
            skeletonCards={6}
            actionLayout="compact"
            pagination={buildPagination(pageInfo, listQuery.isFetching)}
            minCardWidth="100%"
            renderActions={(row) => (
              <>
                <button type="button" onClick={() => openView(row)} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm font-semibold text-[var(--text-body)] hover:border-blue-300 hover:text-[var(--blue700)] focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2">
                  <Eye size={15} aria-hidden="true" /> 조회
                </button>
                <button type="button" onClick={() => openEdit(row)} disabled={!canWrite || isMutating} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm font-semibold text-[var(--text-body)] hover:border-blue-300 hover:text-[var(--blue700)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2">
                  <Pencil size={15} aria-hidden="true" /> 수정
                </button>
                <button type="button" onClick={() => void removePopup(row)} disabled={!canWrite || isMutating} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-[var(--tint-red-border)] bg-[var(--card-surface)] px-3 text-sm font-semibold text-[var(--red700)] hover:bg-[var(--tint-red)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2">
                  <Trash2 size={15} aria-hidden="true" /> 삭제
                </button>
              </>
            )}
            card={(row) => ({
              title: row.title,
              subtitle: formatDisplayWindow(row.displayStartAt, row.displayEndAt),
              statusNode: <AdminStatusPill status={row.status} label={STATUS_LABEL[row.status]} />,
              meta: [
                {
                  icon: <MonitorUp size={14} aria-hidden="true" />,
                  label: row.status === 'published' ? formatTargetScreens(row.targetScreens) : '미노출',
                  wrap: true,
                },
                { icon: <Clock size={14} aria-hidden="true" />, label: formatDateTime(row.updatedAt) },
              ],
              // 본문 미리보기는 목록에서 어떤 팝업인지 가려내는 데 쓰이므로 남긴다. 다만
              // 전문이 그대로 흐르면 한 항목이 세로로 길게 늘어나 목록을 훑을 수 없다 —
              // 두 줄로 잘라 카드 높이를 일정하게 유지한다.
              description: <span className="line-clamp-2">{noticeSummary(row.body)}</span>,
            })}
          />

        </section>

        <aside className="h-fit rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 xl:sticky xl:top-6" aria-label={mode === 'view' ? '팝업 상세 조회' : mode === 'edit' ? '팝업 수정' : '팝업 생성'}>
          {mode === 'view' ? (
            <PopupDetail
              popup={selectedPopup}
              loading={detailQuery.isPending && !!selectedId}
              error={detailQuery.isError ? extractErrorMessage(detailQuery.error, '팝업 상세를 불러오지 못했어요.') : undefined}
              canWrite={canWrite}
              onEdit={selectedPopup ? () => openEdit(selectedPopup) : undefined}
            />
          ) : (
            <PopupForm
              mode={mode}
              title={title}
              content={content}
              status={status}
              targetScreens={targetScreens}
              targetPath={targetPath}
              tournaments={tournamentsQuery.data?.items ?? []}
              linkUrl={linkUrl}
              linkLabel={linkLabel}
              displayStartAt={displayStartAt}
              displayEndAt={displayEndAt}
              canWrite={canWrite}
              saving={isSaving}
              onTitleChange={setTitle}
              onContentChange={(document) => {
                setContent(document);
              }}
              onUploadImage={contentAssets.uploadImage}
              onStatusChange={setStatus}
              onTargetScreensChange={setTargetScreens}
              onTargetPathChange={setTargetPath}
              onLinkUrlChange={setLinkUrl}
              onLinkLabelChange={setLinkLabel}
              onDisplayStartAtChange={setDisplayStartAt}
              onDisplayEndAtChange={setDisplayEndAt}
              onCancel={() => void closeEditor()}
              onSubmit={submitPopup}
            />
          )}
        </aside>
      </div>

      <AdminContentPreview
        payload={{
          kind: 'popup',
          title: mode === 'view' ? selectedPopup?.title ?? '' : title,
          content: mode === 'view'
            ? resolveRichContent(selectedPopup?.content, selectedPopup?.body)
            : content,
          body: mode === 'view'
            ? selectedPopup?.body ?? ''
            : richContentPlainText(content),
          linkUrl: mode === 'view' ? selectedPopup?.linkUrl : linkUrl.trim() || null,
          linkLabel: mode === 'view' ? selectedPopup?.linkLabel : linkLabel.trim() || null,
        }}
      />

      <AdminToasts toasts={toasts} />
      {ConfirmModal}
    </>
  );
}

function PopupDetail({
  popup,
  loading,
  error,
  canWrite,
  onEdit,
}: {
  popup: V1AdminPopupRow | null;
  loading: boolean;
  error?: string;
  canWrite: boolean;
  onEdit?: () => void;
}) {
  if (loading) return <AdminTableSkeleton rows={4} />;
  if (error) return <AdminEmpty title="상세 조회 실패" description={error} />;
  if (!popup) return <AdminEmpty title="팝업을 선택해 주세요" description="목록의 조회 버튼을 누르면 전체 내용을 확인할 수 있어요." />;
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[var(--blue700)]">팝업 상세</p>
          <h2 className="mt-1 text-lg font-bold text-[var(--text-strong)]">{popup.title}</h2>
        </div>
        <AdminStatusPill status={popup.status} label={STATUS_LABEL[popup.status]} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[var(--surface-soft)] p-3 text-sm">
        <div><dt className="text-xs text-[var(--text-muted)]">게시일</dt><dd className="mt-1 text-[var(--text-body)]">{formatDateTime(popup.publishedAt)}</dd></div>
        <div><dt className="text-xs text-[var(--text-muted)]">수정일</dt><dd className="mt-1 text-[var(--text-body)]">{formatDateTime(popup.updatedAt)}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-[var(--text-muted)]">노출 기간</dt><dd className="mt-1 text-[var(--text-body)]">{formatDisplayWindow(popup.displayStartAt, popup.displayEndAt)}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-[var(--text-muted)]">노출 화면</dt><dd className="mt-1 text-[var(--text-body)]">{formatTargetScreens(popup.targetScreens)}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-[var(--text-muted)]">정확한 경로</dt><dd className="mt-1 break-all text-[var(--text-body)]">{popup.targetPaths?.length ? popup.targetPaths.join(', ') : '없음'}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-[var(--text-muted)]">이동 링크</dt><dd className="mt-1 break-all text-[var(--text-body)]">{popup.linkUrl ? `${popup.linkLabel ?? '자세히 보기'} · ${popup.linkUrl}` : '없음'}</dd></div>
      </dl>
      <div className="mt-4 max-h-[440px] overflow-y-auto rounded-xl border border-[var(--border)] p-4 text-sm leading-7 text-[var(--text-body)]">
        <RichContentRenderer content={popup.content} legacyBody={popup.body} />
      </div>
      {canWrite && onEdit ? (
        <button type="button" onClick={onEdit} className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2">
          <Pencil size={16} aria-hidden="true" /> 수정하기
        </button>
      ) : null}
    </div>
  );
}

function PopupForm({
  mode,
  title,
  content,
  status,
  targetScreens,
  targetPath,
  tournaments,
  linkUrl,
  linkLabel,
  displayStartAt,
  displayEndAt,
  canWrite,
  saving,
  onTitleChange,
  onContentChange,
  onUploadImage,
  onStatusChange,
  onTargetScreensChange,
  onTargetPathChange,
  onLinkUrlChange,
  onLinkLabelChange,
  onDisplayStartAtChange,
  onDisplayEndAtChange,
  onCancel,
  onSubmit,
}: {
  mode: Exclude<EditorMode, 'view'>;
  title: string;
  content: V1RichContentDocument;
  status: V1AdminPopupStatus;
  targetScreens: V1PopupTargetScreen[];
  targetPath: string;
  tournaments: Array<{ id: string; title: string }>;
  linkUrl: string;
  linkLabel: string;
  displayStartAt: string;
  displayEndAt: string;
  canWrite: boolean;
  saving: boolean;
  onTitleChange: (value: string) => void;
  onContentChange: (value: V1RichContentDocument) => void;
  onUploadImage: (file: File) => Promise<import('@/types/api').V1AdminContentAsset>;
  onStatusChange: (value: V1AdminPopupStatus) => void;
  onTargetScreensChange: (value: V1PopupTargetScreen[]) => void;
  onTargetPathChange: (value: string) => void;
  onLinkUrlChange: (value: string) => void;
  onLinkLabelChange: (value: string) => void;
  onDisplayStartAtChange: (value: string) => void;
  onDisplayEndAtChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-semibold text-[var(--blue700)]">화면 안내 팝업</p><h2 className="mt-1 text-lg font-bold text-[var(--text-strong)]">{mode === 'create' ? '새 팝업 생성' : '팝업 수정'}</h2></div>
        <button type="button" onClick={onCancel} disabled={saving} aria-label="편집 닫기" className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-soft)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500">
          <X size={19} aria-hidden="true" />
        </button>
      </div>
      <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-[var(--text-body)]">제목</span><input value={title} onChange={(event) => onTitleChange(event.target.value)} maxLength={120} disabled={!canWrite || saving} required className="h-[44px] rounded-xl border border-[var(--border)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)]" placeholder="팝업 제목" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-[var(--text-body)]">공개 상태</span><select value={status} onChange={(event) => onStatusChange(event.target.value as V1AdminPopupStatus)} disabled={!canWrite || saving} className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)]">{EDITABLE_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <fieldset className="rounded-xl border border-[var(--border)] p-3">
          <legend className="px-1 text-sm font-semibold text-[var(--text-body)]">노출 화면</legend>
          <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">팝업을 보여줄 화면을 하나 이상 선택해 주세요. 상세·등록 화면도 해당 영역에 포함돼요.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {POPUP_TARGET_OPTIONS.map((option) => {
              const checked = targetScreens.includes(option.value);
              return (
                <label key={option.value} className="flex min-h-[48px] cursor-pointer items-start gap-2 rounded-lg border border-[var(--border)] px-3 py-2 hover:border-blue-200">
                  <input
                    type="checkbox"
                    value={option.value}
                    checked={checked}
                    disabled={!canWrite || saving}
                    onChange={() => onTargetScreensChange(
                      checked
                        ? targetScreens.filter((screen) => screen !== option.value)
                        : [...targetScreens, option.value],
                    )}
                    className="mt-1 h-4 w-4 rounded border-[var(--border-strong)] text-blue-500 focus:ring-blue-500"
                  />
                  <span><span className="block text-sm font-medium text-[var(--text-body)]">{option.label}</span><span className="block text-xs text-[var(--text-muted)]">{option.description}</span></span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="rounded-xl border border-[var(--border)] p-3">
          <legend className="px-1 text-sm font-semibold text-[var(--text-body)]">정확한 화면 <span className="font-normal text-[var(--text-muted)]">(선택)</span></legend>
          <p className="mb-3 text-xs leading-5 text-[var(--text-muted)]">설정하면 해당 경로에서 화면 그룹 팝업보다 먼저 노출돼요. 대회를 선택하면 상세 경로가 자동으로 입력돼요.</p>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-body)]">특정 대회 상세</span>
            <select
              value={targetPath.startsWith('/tournaments/') ? targetPath.slice('/tournaments/'.length) : ''}
              onChange={(event) => onTargetPathChange(event.target.value ? `/tournaments/${event.target.value}` : '')}
              disabled={!canWrite || saving}
              className="h-[44px] rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)]"
            >
              <option value="">선택하지 않음</option>
              {tournaments.map((tournament) => <option key={tournament.id} value={tournament.id}>{tournament.title}</option>)}
            </select>
          </label>
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-[var(--text-body)]">정확한 내부 경로</span>
            <input
              value={targetPath}
              onChange={(event) => onTargetPathChange(event.target.value)}
              maxLength={500}
              disabled={!canWrite || saving}
              className="h-[44px] rounded-xl border border-[var(--border)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)]"
              placeholder="/tournaments/대회-id"
            />
          </label>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-[var(--text-body)]">이동 링크 <span className="font-normal text-[var(--text-muted)]">(선택)</span></span><input value={linkUrl} onChange={(event) => onLinkUrlChange(event.target.value)} maxLength={500} disabled={!canWrite || saving} className="h-[44px] min-w-0 rounded-xl border border-[var(--border)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)]" placeholder="/matches 또는 https://..." /></label>
          <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-[var(--text-body)]">버튼 문구 <span className="font-normal text-[var(--text-muted)]">(선택)</span></span><input value={linkLabel} onChange={(event) => onLinkLabelChange(event.target.value)} maxLength={40} disabled={!canWrite || saving} className="h-[44px] min-w-0 rounded-xl border border-[var(--border)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)]" placeholder="자세히 보기" /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-[var(--text-body)]">노출 시작</span><input type="datetime-local" value={displayStartAt} onChange={(event) => onDisplayStartAtChange(event.target.value)} disabled={!canWrite || saving} className="h-[44px] min-w-0 rounded-xl border border-[var(--border)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)]" /></label>
          <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-[var(--text-body)]">노출 종료</span><input type="datetime-local" value={displayEndAt} min={displayStartAt || undefined} onChange={(event) => onDisplayEndAtChange(event.target.value)} disabled={!canWrite || saving} className="h-[44px] min-w-0 rounded-xl border border-[var(--border)] px-3 text-sm text-[var(--text-strong)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-[var(--surface-soft)]" /></label>
        </div>
        <RichTextEditor
          value={content}
          onChange={onContentChange}
          onUploadImage={onUploadImage}
          disabled={!canWrite || saving}
        />
        <p className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-xs leading-5 text-[var(--text-muted)]">각 화면에서는 공개 상태이고 노출 기간 안에 있는 팝업 중 가장 최근 항목 하나를 보여줘요. 내부 링크는 /로 시작하고 외부 링크는 https://만 사용할 수 있어요.</p>
        <button type="submit" disabled={!canWrite || saving} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2">{saving ? '저장 중...' : mode === 'create' ? '팝업 생성' : '수정 저장'}</button>
      </form>
    </div>
  );
}
