'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Clock, Eye, MonitorUp, Pencil, Plus, Trash2, X } from 'lucide-react';
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
import {
  useV1AdminMe,
  useV1AdminPopupDetail,
  useV1AdminPopups,
  useV1CreateAdminPopup,
  useV1DeleteAdminPopup,
  useV1UpdateAdminPopup,
} from '@/hooks/use-v1-api';
import { v1Get } from '@/lib/api-client';
import { extractErrorMessage } from '@/lib/error-message';
import { isSafePopupLink, POPUP_TARGET_LABELS, POPUP_TARGET_OPTIONS } from '@/lib/popup-targets';
import type {
  AdminListFilters,
  CursorPage,
  V1AdminPopupCreatePayload,
  V1AdminPopupRow,
  V1AdminPopupStatus,
  V1PopupTargetScreen,
} from '@/types/api';
import { noticeSummary } from '../notices/notice-summary';

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

function formatDateTime(value: string | null | undefined) {
  if (!value) return '미게시';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

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
  return targetScreens.map((screen) => POPUP_TARGET_LABELS[screen]).join(', ');
}

export default function AdminPopupsPage() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeStatus, setActiveStatus] = useState('');
  const [extraRows, setExtraRows] = useState<V1AdminPopupRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<EditorMode>('view');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<V1AdminPopupStatus>('published');
  const [targetScreens, setTargetScreens] = useState<V1PopupTargetScreen[]>(['home']);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [displayStartAt, setDisplayStartAt] = useState('');
  const [displayEndAt, setDisplayEndAt] = useState('');

  const { toasts, showToast } = useAdminToast();
  const { data: adminMe } = useV1AdminMe();
  const canWrite = adminMe?.capabilities.includes('status:write') ?? false;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setExtraRows([]);
    setNextCursor(null);
  }, [activeStatus, debouncedSearch]);

  const filters: AdminListFilters = {
    ...(activeStatus ? { status: activeStatus } : {}),
    ...(debouncedSearch ? { q: debouncedSearch } : {}),
    limit: 20,
  };
  const listQuery = useV1AdminPopups(filters);
  const detailQuery = useV1AdminPopupDetail(selectedId);
  const createPopup = useV1CreateAdminPopup();
  const updatePopup = useV1UpdateAdminPopup();
  const deletePopup = useV1DeleteAdminPopup();
  const isSaving = createPopup.isPending || updatePopup.isPending;
  const isMutating = isSaving || deletePopup.isPending;

  useEffect(() => {
    if (listQuery.data) {
      setNextCursor(listQuery.data.nextCursor ?? listQuery.data.pageInfo?.nextCursor ?? null);
    }
  }, [listQuery.data]);

  const rows = [...(listQuery.data?.items ?? []), ...extraRows];
  const selectedPopup = detailQuery.data?.popup ?? rows.find((row) => row.popupId === selectedId) ?? null;

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await v1Get<CursorPage<V1AdminPopupRow>>('/admin/popups', { ...filters, cursor: nextCursor });
      setExtraRows((previous) => [...previous, ...page.items]);
      setNextCursor(page.nextCursor ?? page.pageInfo?.nextCursor ?? null);
    } catch (error) {
      showToast(extractErrorMessage(error, '추가 팝업을 불러오지 못했어요.'), 'error');
    } finally {
      setLoadingMore(false);
    }
  }

  function openView(row: V1AdminPopupRow) {
    setSelectedId(row.popupId);
    setMode('view');
  }

  function openCreate() {
    setSelectedId('');
    setTitle('');
    setBody('');
    setStatus('published');
    setTargetScreens(['home']);
    setLinkUrl('');
    setLinkLabel('');
    setDisplayStartAt('');
    setDisplayEndAt('');
    setMode('create');
  }

  function openEdit(row: V1AdminPopupRow) {
    setSelectedId(row.popupId);
    setTitle(row.title);
    setBody(row.body);
    setStatus(row.status);
    setTargetScreens(row.targetScreens);
    setLinkUrl(row.linkUrl ?? '');
    setLinkLabel(row.linkLabel ?? '');
    setDisplayStartAt(toDateTimeLocal(row.displayStartAt));
    setDisplayEndAt(toDateTimeLocal(row.displayEndAt));
    setMode('edit');
  }

  function closeEditor() {
    setMode('view');
    if (!selectedId) {
      setTitle('');
      setBody('');
    }
  }

  function submitPopup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: V1AdminPopupCreatePayload = {
      audience: 'public',
      title: title.trim(),
      body: body.trim(),
      targetScreens,
      linkUrl: linkUrl.trim() || null,
      linkLabel: linkLabel.trim() || null,
      status,
      displayStartAt: toIsoOrNull(displayStartAt),
      displayEndAt: toIsoOrNull(displayEndAt),
    };
    if (!payload.title || !payload.body) {
      showToast('제목과 본문을 입력해 주세요.', 'error');
      return;
    }
    if (targetScreens.length === 0) {
      showToast('노출할 화면을 하나 이상 선택해 주세요.', 'error');
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
          setMode('view');
          setSelectedId(popup.popupId);
          setExtraRows([]);
          showToast('팝업을 수정했어요.', 'success');
        },
        onError: (error) => showToast(extractErrorMessage(error, '팝업 수정에 실패했어요.'), 'error'),
      });
      return;
    }

    createPopup.mutate(payload, {
      onSuccess: ({ popup }) => {
        setMode('view');
        setSelectedId(popup.popupId);
        setExtraRows([]);
        showToast(status === 'published' ? '팝업을 공개했어요.' : status === 'archived' ? '팝업을 비공개로 저장했어요.' : '팝업 초안을 저장했어요.', 'success');
      },
      onError: (error) => showToast(extractErrorMessage(error, '팝업 생성에 실패했어요.'), 'error'),
    });
  }

  function removePopup(row: V1AdminPopupRow) {
    if (!window.confirm(`“${row.title}” 팝업을 삭제할까요? 삭제한 내용은 복구할 수 없어요.`)) return;
    deletePopup.mutate(row.popupId, {
      onSuccess: () => {
        if (selectedId === row.popupId) setSelectedId('');
        setMode('view');
        setExtraRows([]);
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
      <AdminPageHeader
        eyebrow="콘텐츠 운영"
        title="팝업 관리"
        description="팝업의 노출 화면, 이동 링크, 게시 기간을 관리해요."
        action={(
          <button
            type="button"
            onClick={openCreate}
            disabled={!canWrite || isMutating}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
          >
            <Plus size={17} aria-hidden="true" />
            새 팝업
          </button>
        )}
      />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="팝업 전체 목록">
          <AdminFilterBar
            searchLabel="팝업 검색"
            searchPlaceholder="제목·본문 검색"
            searchValue={search}
            onSearchChange={setSearch}
            statusOptions={STATUS_OPTIONS}
            activeStatus={activeStatus}
            onStatusChange={setActiveStatus}
          />

          <AdminCardList<V1AdminPopupRow>
            rows={rows}
            keyExtractor={(row) => row.popupId}
            loading={listQuery.isPending && rows.length === 0}
            error={errorMessage}
            onRetry={() => void listQuery.refetch()}
            empty={<AdminEmpty title="팝업이 없어요" description="새 팝업을 만들어 필요한 화면에 안내해 보세요." />}
            skeletonCards={6}
            renderActions={(row) => (
              <>
                <button type="button" onClick={() => openView(row)} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 hover:border-blue-300 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2">
                  <Eye size={15} aria-hidden="true" /> 조회
                </button>
                <button type="button" onClick={() => openEdit(row)} disabled={!canWrite || isMutating} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 hover:border-blue-300 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2">
                  <Pencil size={15} aria-hidden="true" /> 수정
                </button>
                <button type="button" onClick={() => removePopup(row)} disabled={!canWrite || isMutating} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-red-100 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-2">
                  <Trash2 size={15} aria-hidden="true" /> 삭제
                </button>
              </>
            )}
            card={(row) => ({
              title: row.title,
              subtitle: `${formatTargetScreens(row.targetScreens)} · ${formatDisplayWindow(row.displayStartAt, row.displayEndAt)}`,
              statusNode: <AdminStatusPill status={row.status} label={STATUS_LABEL[row.status]} />,
              meta: [
                { icon: <MonitorUp size={14} aria-hidden="true" />, label: row.status === 'published' ? `${row.targetScreens.length}개 화면 노출` : '미노출' },
                { icon: <Clock size={14} aria-hidden="true" />, label: formatDateTime(row.updatedAt) },
              ],
              description: noticeSummary(row.body),
            })}
          />

          {nextCursor ? (
            <div className="flex justify-center">
              <button type="button" onClick={loadMore} disabled={loadingMore} className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-sm font-medium text-gray-700 hover:border-blue-300 hover:text-blue-600 disabled:opacity-50">
                {loadingMore ? '불러오는 중...' : '더 보기'}
              </button>
            </div>
          ) : null}
          {loadingMore ? <AdminTableSkeleton rows={3} /> : null}
        </section>

        <aside className="h-fit rounded-2xl border border-gray-100 bg-white p-4 xl:sticky xl:top-6" aria-label={mode === 'view' ? '팝업 상세 조회' : mode === 'edit' ? '팝업 수정' : '팝업 생성'}>
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
              body={body}
              status={status}
              targetScreens={targetScreens}
              linkUrl={linkUrl}
              linkLabel={linkLabel}
              displayStartAt={displayStartAt}
              displayEndAt={displayEndAt}
              canWrite={canWrite}
              saving={isSaving}
              onTitleChange={setTitle}
              onBodyChange={setBody}
              onStatusChange={setStatus}
              onTargetScreensChange={setTargetScreens}
              onLinkUrlChange={setLinkUrl}
              onLinkLabelChange={setLinkLabel}
              onDisplayStartAtChange={setDisplayStartAt}
              onDisplayEndAtChange={setDisplayEndAt}
              onCancel={closeEditor}
              onSubmit={submitPopup}
            />
          )}
        </aside>
      </div>

      <AdminToasts toasts={toasts} />
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
          <p className="text-xs font-semibold text-blue-600">팝업 상세</p>
          <h2 className="mt-1 text-lg font-bold text-gray-900">{popup.title}</h2>
        </div>
        <AdminStatusPill status={popup.status} label={STATUS_LABEL[popup.status]} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-gray-50 p-3 text-sm">
        <div><dt className="text-xs text-gray-400">게시일</dt><dd className="mt-1 text-gray-700">{formatDateTime(popup.publishedAt)}</dd></div>
        <div><dt className="text-xs text-gray-400">수정일</dt><dd className="mt-1 text-gray-700">{formatDateTime(popup.updatedAt)}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-gray-400">노출 기간</dt><dd className="mt-1 text-gray-700">{formatDisplayWindow(popup.displayStartAt, popup.displayEndAt)}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-gray-400">노출 화면</dt><dd className="mt-1 text-gray-700">{formatTargetScreens(popup.targetScreens)}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-gray-400">이동 링크</dt><dd className="mt-1 break-all text-gray-700">{popup.linkUrl ? `${popup.linkLabel ?? '자세히 보기'} · ${popup.linkUrl}` : '없음'}</dd></div>
      </dl>
      <div className="mt-4 max-h-[360px] overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray-100 p-4 text-sm leading-7 text-gray-700">{popup.body}</div>
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
  body,
  status,
  targetScreens,
  linkUrl,
  linkLabel,
  displayStartAt,
  displayEndAt,
  canWrite,
  saving,
  onTitleChange,
  onBodyChange,
  onStatusChange,
  onTargetScreensChange,
  onLinkUrlChange,
  onLinkLabelChange,
  onDisplayStartAtChange,
  onDisplayEndAtChange,
  onCancel,
  onSubmit,
}: {
  mode: Exclude<EditorMode, 'view'>;
  title: string;
  body: string;
  status: V1AdminPopupStatus;
  targetScreens: V1PopupTargetScreen[];
  linkUrl: string;
  linkLabel: string;
  displayStartAt: string;
  displayEndAt: string;
  canWrite: boolean;
  saving: boolean;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onStatusChange: (value: V1AdminPopupStatus) => void;
  onTargetScreensChange: (value: V1PopupTargetScreen[]) => void;
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
        <div><p className="text-xs font-semibold text-blue-600">화면 안내 팝업</p><h2 className="mt-1 text-lg font-bold text-gray-900">{mode === 'create' ? '새 팝업 생성' : '팝업 수정'}</h2></div>
        <button type="button" onClick={onCancel} disabled={saving} aria-label="편집 닫기" className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500">
          <X size={19} aria-hidden="true" />
        </button>
      </div>
      <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
        <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-gray-700">제목</span><input value={title} onChange={(event) => onTitleChange(event.target.value)} maxLength={120} disabled={!canWrite || saving} required className="h-[44px] rounded-xl border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50" placeholder="팝업 제목" /></label>
        <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-gray-700">공개 상태</span><select value={status} onChange={(event) => onStatusChange(event.target.value as V1AdminPopupStatus)} disabled={!canWrite || saving} className="h-[44px] rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50">{EDITABLE_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <fieldset className="rounded-xl border border-gray-200 p-3">
          <legend className="px-1 text-sm font-semibold text-gray-700">노출 화면</legend>
          <p className="mb-3 text-xs leading-5 text-gray-500">팝업을 보여줄 화면을 하나 이상 선택해 주세요. 상세·등록 화면도 해당 영역에 포함돼요.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {POPUP_TARGET_OPTIONS.map((option) => {
              const checked = targetScreens.includes(option.value);
              return (
                <label key={option.value} className="flex min-h-[48px] cursor-pointer items-start gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:border-blue-200">
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
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                  <span><span className="block text-sm font-medium text-gray-700">{option.label}</span><span className="block text-xs text-gray-400">{option.description}</span></span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-gray-700">이동 링크 <span className="font-normal text-gray-400">(선택)</span></span><input value={linkUrl} onChange={(event) => onLinkUrlChange(event.target.value)} maxLength={500} disabled={!canWrite || saving} className="h-[44px] min-w-0 rounded-xl border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50" placeholder="/matches 또는 https://..." /></label>
          <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-gray-700">버튼 문구 <span className="font-normal text-gray-400">(선택)</span></span><input value={linkLabel} onChange={(event) => onLinkLabelChange(event.target.value)} maxLength={40} disabled={!canWrite || saving} className="h-[44px] min-w-0 rounded-xl border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50" placeholder="자세히 보기" /></label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-gray-700">노출 시작</span><input type="datetime-local" value={displayStartAt} onChange={(event) => onDisplayStartAtChange(event.target.value)} disabled={!canWrite || saving} className="h-[44px] min-w-0 rounded-xl border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50" /></label>
          <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-gray-700">노출 종료</span><input type="datetime-local" value={displayEndAt} min={displayStartAt || undefined} onChange={(event) => onDisplayEndAtChange(event.target.value)} disabled={!canWrite || saving} className="h-[44px] min-w-0 rounded-xl border border-gray-200 px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50" /></label>
        </div>
        <label className="flex flex-col gap-1.5"><span className="text-sm font-semibold text-gray-700">본문</span><textarea value={body} onChange={(event) => onBodyChange(event.target.value)} maxLength={5000} rows={10} disabled={!canWrite || saving} required className="resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm leading-6 text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-50" placeholder="선택한 화면에 표시할 내용을 입력해 주세요." /></label>
        <p className="rounded-xl bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500">각 화면에서는 공개 상태이고 노출 기간 안에 있는 팝업 중 가장 최근 항목 하나를 보여줘요. 내부 링크는 /로 시작하고 외부 링크는 https://만 사용할 수 있어요.</p>
        <button type="submit" disabled={!canWrite || saving} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-500 px-4 text-sm font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2">{saving ? '저장 중...' : mode === 'create' ? '팝업 생성' : '수정 저장'}</button>
      </form>
    </div>
  );
}
