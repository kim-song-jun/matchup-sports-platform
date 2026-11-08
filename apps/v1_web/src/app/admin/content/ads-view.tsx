'use client';

import { useState } from 'react';
import { ExternalLink, Eye, Pencil, Plus, Power, Rocket } from 'lucide-react';
import {
  AdminCardList,
  AdminEmpty,
  AdminFilterBar,
  AdminStatusPill,
  AdminToasts,
  useAdminToast,
} from '@/components/admin';
import { ConfirmModal } from '@/components/v1-ui/confirm-modal';
import {
  useV1AdminAdCampaign,
  useV1AdminAdCampaigns,
  useV1PublishAdCampaign,
  useV1StopAdCampaign,
} from '@/hooks/use-v1-ads';
import { useAdminCanWrite } from '@/hooks/use-admin-can-write';
import { useAdminListQuery } from '@/hooks/use-admin-list-query';
import { adCampaignStatusLabel, adCampaignStatusPillKey } from '@/lib/admin-labels';
import { resolveAdLink } from '@/lib/ad-link';
import type { V1AdCampaign, V1AdCampaignListFilters, V1AdCampaignListItem, V1AdCampaignStatus } from '@/types/ads';
import { AdDetail } from './ads-view-detail';
import { AdForm } from './ads-view-form';
import { adErrorMessage, channelSummary, formatKstDateTime, formatWindowRange, statsLine } from './ads-view-model';

type EditorMode = 'view' | 'create' | 'edit';
type PendingAction = { kind: 'publish' | 'stop'; campaign: V1AdCampaign };

const PAGE_SIZE = 20;

const STATUS_CHIPS: Array<{ value: '' | V1AdCampaignStatus; label: string }> = [
  { value: '', label: '전체' },
  { value: 'published', label: adCampaignStatusLabel('published') },
  { value: 'draft', label: adCampaignStatusLabel('draft') },
  { value: 'stopped', label: adCampaignStatusLabel('stopped') },
];

const CARD_BUTTON =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)] hover:border-blue-300 hover:text-[var(--blue700)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2';

/** The copy with the highest version: a list row, the detail response and the last write response can each be a refetch behind. */
function newest(candidates: Array<V1AdCampaign | null | undefined>): V1AdCampaign | null {
  return candidates.reduce<V1AdCampaign | null>(
    (best, candidate) => (candidate && (!best || candidate.version > best.version) ? candidate : best),
    null,
  );
}

function toAdStatus(value: string): V1AdCampaignStatus | undefined {
  return value === 'draft' || value === 'published' || value === 'stopped' ? value : undefined;
}

/** What the owner should look at before publishing: each channel's window and a link to open, since the server cannot check a target exists. */
function PublishChecklist({ campaign }: { campaign: V1AdCampaign }) {
  const channels = [
    ['배너', campaign.banner],
    ['팝업', campaign.popup],
  ] as const;
  return (
    <div className="flex flex-col gap-2 text-[length:var(--font-size-label)] text-[var(--text-body)]">
      <ul className="flex flex-col gap-2">
        {channels.map(([name, creative]) => {
          if (!creative) return null;
          const link = resolveAdLink(creative.linkUrl);
          return (
            <li key={name} className="tm-on-tint rounded-lg bg-[var(--surface-soft)] px-3 py-2">
              <p className="font-semibold">{name}</p>
              <p className="text-[var(--text-muted)]">
                {formatKstDateTime(creative.startAt)} ~ {formatKstDateTime(creative.endAt)}
              </p>
              {link ? (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex min-h-[44px] w-fit items-center gap-1.5 break-all font-semibold text-[var(--blue700)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
                >
                  <ExternalLink size={14} className="shrink-0" aria-hidden="true" />
                  {name} 링크 열어 보기
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-[length:var(--font-size-caption)] leading-5 text-[var(--text-muted)]">
        내부 링크는 서버가 대상이 실제로 있는지 확인하지 않아요. 게시 전에 링크를 눌러 열리는지 확인해 주세요.
      </p>
    </div>
  );
}

/**
 * 광고 탭 본문 — 배너·팝업 캠페인 목록과 오른쪽 상세·편집 칸. 허브가 owner 에게만 탭을 보여 주고,
 * 서버가 owner 만 받는 진짜 경계다(여기는 화면 정리).
 */
export function AdsView() {
  const { search, setSearch, activeStatus, setActiveStatus, setPage, filters: listFilters, buildPagination } =
    useAdminListQuery({ pageSize: PAGE_SIZE });
  const [selectedId, setSelectedId] = useState('');
  const [mode, setMode] = useState<EditorMode>('view');
  const [editTarget, setEditTarget] = useState<V1AdCampaign | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastWritten, setLastWritten] = useState<V1AdCampaign | null>(null);

  const { toasts, showToast } = useAdminToast();
  const canWrite = useAdminCanWrite();

  const status = toAdStatus(activeStatus);
  const filters: V1AdCampaignListFilters = {
    page: listFilters.page,
    limit: listFilters.limit,
    ...(listFilters.q ? { q: listFilters.q } : {}),
    ...(status ? { status } : {}),
  };
  const listQuery = useV1AdminAdCampaigns(filters);
  const detailQuery = useV1AdminAdCampaign(selectedId);
  const publishCampaign = useV1PublishAdCampaign();
  const stopCampaign = useV1StopAdCampaign();
  const acting = publishCampaign.isPending || stopCampaign.isPending;

  const rows = listQuery.data?.items ?? [];
  const summary = listQuery.data?.summary;
  const copiesOf = (id: string) =>
    [detailQuery.data?.campaign, lastWritten, ...rows].filter((copy) => copy?.id === id);
  const selected = selectedId ? newest(copiesOf(selectedId)) : null;
  const statusOptions = STATUS_CHIPS.map((chip) => ({
    ...chip,
    count: chip.value ? summary?.byStatus[chip.value] : summary?.total,
  }));

  function openView(campaign: V1AdCampaign) {
    setSelectedId(campaign.id);
    setMode('view');
  }

  function openCreate() {
    setSelectedId('');
    setEditTarget(null);
    setMode('create');
  }

  function openEdit(campaign: V1AdCampaign) {
    setSelectedId(campaign.id);
    setEditTarget(campaign);
    setMode('edit');
  }

  async function reloadEditTarget() {
    const result = await detailQuery.refetch();
    if (result.error) throw result.error;
    if (result.data) setEditTarget(result.data.campaign);
  }

  function ask(kind: PendingAction['kind'], campaign: V1AdCampaign) {
    setActionError(null);
    setPending({ kind, campaign });
  }

  /** The newest copy on screen — a background refetch may have bumped the version since the owner clicked. */
  const latestOf = (snapshot: V1AdCampaign) => newest([snapshot, ...copiesOf(snapshot.id)]) ?? snapshot;

  async function confirmPending() {
    if (!pending) return;
    const target = latestOf(pending.campaign);
    try {
      const { campaign } = pending.kind === 'publish'
        ? await publishCampaign.mutateAsync({ campaignId: target.id, expectedVersion: target.version })
        : await stopCampaign.mutateAsync(target.id);
      setPending(null);
      setLastWritten(campaign);
      setSelectedId(campaign.id);
      setMode('view');
      showToast(pending.kind === 'publish' ? '광고를 게시했어요.' : '광고를 중단했어요.', 'success');
    } catch (error) {
      setActionError(adErrorMessage(error, pending.kind === 'publish' ? '광고를 게시하지 못했어요.' : '광고를 중단하지 못했어요.'));
    }
  }

  const pendingCampaign = pending ? latestOf(pending.campaign) : null;
  const hasFilter = Boolean(listFilters.q || status);
  const errorMessage = listQuery.isError ? adErrorMessage(listQuery.error, '광고 목록을 불러오지 못했어요.') : undefined;

  const asideLabel = mode === 'view' ? '광고 상세 조회' : mode === 'edit' ? '광고 수정' : '광고 생성';

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          disabled={!canWrite || acting}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 text-[length:var(--font-size-body-sm)] font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2"
        >
          <Plus size={17} aria-hidden="true" />
          새 광고
        </button>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="flex min-w-0 flex-col gap-4" aria-label="광고 전체 목록">
          <AdminFilterBar
            searchLabel="광고 검색"
            searchPlaceholder="캠페인·광고주 검색"
            searchValue={search}
            onSearchChange={setSearch}
            statusOptions={statusOptions}
            activeStatus={activeStatus}
            onStatusChange={setActiveStatus}
          />
          <AdminCardList<V1AdCampaignListItem>
            rows={rows}
            keyExtractor={(row) => row.id}
            loading={listQuery.isPending && rows.length === 0}
            error={errorMessage}
            onRetry={() => void listQuery.refetch()}
            empty={
              <AdminEmpty
                title={hasFilter ? '조건에 맞는 광고가 없어요' : '광고가 없어요'}
                description={hasFilter ? '검색어나 상태를 바꿔 보세요.' : '새 광고를 만들어 배너와 팝업에 걸어 보세요.'}
              />
            }
            skeletonCards={4}
            actionLayout="compact"
            pagination={buildPagination(listQuery.data?.pageInfo, listQuery.isFetching)}
            minCardWidth="100%"
            renderActions={(row) => (
              <>
                <button type="button" onClick={() => openView(row)} className={CARD_BUTTON}>
                  <Eye size={15} aria-hidden="true" /> 조회
                </button>
                <button type="button" onClick={() => openEdit(row)} disabled={!canWrite || acting} className={CARD_BUTTON}>
                  <Pencil size={15} aria-hidden="true" /> 수정
                </button>
                {row.status === 'published' ? (
                  <button type="button" onClick={() => ask('stop', row)} disabled={!canWrite || acting} className={CARD_BUTTON}>
                    <Power size={15} aria-hidden="true" /> 중단
                  </button>
                ) : (
                  <button type="button" onClick={() => ask('publish', row)} disabled={!canWrite || acting} className={CARD_BUTTON}>
                    <Rocket size={15} aria-hidden="true" /> 게시
                  </button>
                )}
              </>
            )}
            card={(row) => ({
              title: `${row.title} (${row.advertiserName})`,
              subtitle: `${formatWindowRange(row)} · ${channelSummary(row)}`,
              statusNode: <AdminStatusPill status={adCampaignStatusPillKey(row.status)} label={adCampaignStatusLabel(row.status)} />,
              description: <span className="tabular-nums">{statsLine(row)}</span>,
            })}
          />
        </section>

        {/* 편집 칸은 두 채널 입력이라 화면보다 길다 — 고정된 채로 아래가 잘리지 않게 칸 안에서 스크롤한다. */}
        <aside
          className="h-fit rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] p-4 xl:sticky xl:top-6 xl:max-h-[calc(100dvh-3rem)] xl:overflow-y-auto"
          aria-label={asideLabel}
        >
          {mode === 'view' ? (
            <AdDetail
              campaign={selected}
              detail={detailQuery.data}
              loading={Boolean(selectedId) && detailQuery.isPending}
              statsError={detailQuery.isError ? adErrorMessage(detailQuery.error, '성과를 불러오지 못했어요.') : undefined}
              canWrite={canWrite}
              busy={acting}
              onEdit={() => selected && openEdit(selected)}
              onPublish={() => selected && ask('publish', selected)}
              onStop={() => selected && ask('stop', selected)}
            />
          ) : (
            <AdForm
              key={mode === 'edit' && editTarget ? `${editTarget.id}:${editTarget.version}` : 'create'}
              campaign={mode === 'edit' ? editTarget : null}
              canWrite={canWrite}
              onClose={() => setMode('view')}
              onSaved={(saved) => {
                setLastWritten(saved);
                setSelectedId(saved.id);
                setMode('view');
                setPage(1);
              }}
              onReload={reloadEditTarget}
              showToast={showToast}
            />
          )}
        </aside>
      </div>

      {pending && pendingCampaign ? (
        <ConfirmModal
          open
          title={pending.kind === 'publish' ? '광고를 게시할까요?' : '광고를 중단할까요?'}
          message={pending.kind === 'publish'
            ? `‘${pendingCampaign.title}’ 광고를 게시해요. 기간이 시작된 채널은 바로 사용자에게 보여요.`
            : `‘${pendingCampaign.title}’ 광고를 중단해요. 새로 여는 화면부터 사라지고, 이미 열린 화면에는 최대 30초 남을 수 있어요. 다시 게시할 수 있어요.`}
          details={pending.kind === 'publish' ? <PublishChecklist campaign={pendingCampaign} /> : undefined}
          confirmLabel={pending.kind === 'publish' ? '게시' : '중단'}
          tone={pending.kind === 'stop' ? 'danger' : 'default'}
          busy={acting}
          error={actionError}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        />
      ) : null}

      <AdminToasts toasts={toasts} />
    </>
  );
}
