'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { AdminPageHeader, AdminStatusPill, AdminToasts, useAdminToast } from '@/components/admin';
import { PromotionCommitPanel } from '@/components/admin/promotion-commit-panel';
import {
  useV1AdminLeagueSeries,
  useV1CommitLeaguePromotions,
  useV1PreviewLeaguePromotions,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1CommitPromotionEntry, V1PromotionPreviewResponse } from '@/types/league-series';

export default function AdminLeagueSeriesDetailPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = use(params);
  const { toasts, showToast } = useAdminToast();
  const { data: series, isPending, isError, refetch } = useV1AdminLeagueSeries(seriesId);
  const [preview, setPreview] = useState<V1PromotionPreviewResponse | null>(null);

  const previewPromotions = useV1PreviewLeaguePromotions(seriesId);
  const commitPromotions = useV1CommitLeaguePromotions(seriesId);

  const handlePreview = (seasonNo: number) => {
    previewPromotions.mutate(seasonNo, {
      onSuccess: (result) => {
        setPreview(result);
        // 이미 확정된 시즌은 다시 확정할 수 없다 — commit 이 409 로 막히므로 미리 알린다.
        if (result.alreadyDecided) showToast('이미 승강이 확정된 시즌이에요.', 'error');
      },
      onError: (error) => showToast(extractErrorMessage(error, '승강 후보를 계산하지 못했어요.'), 'error'),
    });
  };

  const handleCommit = (entries: V1CommitPromotionEntry[]) => {
    if (preview === null) return;
    commitPromotions.mutate(
      { seasonNo: preview.seasonNo, body: { entries } },
      {
        onSuccess: (result) => {
          setPreview(null);
          void refetch();
          showToast(
            `${result.nextSeasonNo}시즌 리그 ${result.nextSeasonLeagues.length}개를 만들었어요.`,
            'success',
          );
        },
        onError: (error) => showToast(extractErrorMessage(error, '승강을 확정하지 못했어요.'), 'error'),
      },
    );
  };

  if (isPending) {
    return <p className="p-4 text-sm text-[var(--text-muted)]">불러오는 중…</p>;
  }
  if (isError || series === undefined) {
    return (
      <div className="p-4">
        <p className="text-sm text-[var(--text-muted)]">리그 체계를 불러오지 못했어요.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-2 inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const rule = series.promotionRule;
  const ruleSummary =
    series.tierCount === 1
      ? '티어가 하나라 승강이 없어요.'
      : rule.mode === 'ratio'
        ? `팀 수의 ${Math.round((rule.ratio ?? 0) * 100)}% (최소 ${rule.minSlots ?? 1}팀) 승격·강등`
        : `${rule.fixedCount ?? 1}팀 고정 승격·강등`;

  return (
    <div>
      <AdminPageHeader
        eyebrow="리그 체계"
        title={series.title}
        description={`${series.tierLabels.join(' · ')} · ${ruleSummary}`}
        action={<AdminStatusPill status={series.state} />}
      />

      {series.seasons.length === 0 ? (
        <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--card-surface)] p-6 text-center">
          <p className="text-sm font-semibold text-[var(--text-strong)]">아직 시즌이 없어요</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            첫 시즌은 승강 이력이 없어서 티어별 팀을 직접 배정해야 해요.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {series.seasons.map((season) => (
            <section
              key={season.seasonNo}
              className="rounded-2xl border border-[var(--border-strong)] bg-[var(--card-surface)] p-4"
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-[var(--text-strong)]">{season.seasonNo}시즌</h2>
                {series.tierCount > 1 && (
                  <button
                    type="button"
                    onClick={() => handlePreview(season.seasonNo)}
                    disabled={previewPromotions.isPending}
                    className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-strong)] disabled:opacity-50"
                  >
                    {previewPromotions.isPending ? '계산하는 중…' : '승강 후보 계산'}
                  </button>
                )}
              </header>

              {!season.allCompleted && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  아직 진행 중인 리그가 있어요. 모든 경기 결과가 확정돼야 승강을 계산할 수 있어요.
                </p>
              )}

              <ul className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {season.tiers.map((tier) => (
                  <li
                    key={tier.leagueId}
                    className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-muted)] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-blue-100 px-1.5 py-0.5 text-2xs font-bold text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                        {tier.tierLabel ?? '단일'}
                      </span>
                      <AdminStatusPill status={tier.state} />
                    </div>
                    <Link
                      href={`/admin/league-matches/${tier.leagueId}`}
                      className="mt-2 block truncate text-sm font-semibold text-[var(--blue700)]"
                    >
                      {tier.title}
                    </Link>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">{tier.teamCount}팀</p>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {preview !== null && (
        <div className="mt-6">
          <h2 className="mb-3 text-base font-bold text-[var(--text-strong)]">
            {preview.seasonNo}시즌 승강 확정
          </h2>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            규칙이 계산한 결과예요. 다음 시즌에 참가하지 않는 팀은 &lsquo;불참&rsquo;으로 바꿔 주세요.
          </p>
          <PromotionCommitPanel
            preview={preview}
            submitting={commitPromotions.isPending}
            onCommit={handleCommit}
          />
        </div>
      )}

      <AdminToasts toasts={toasts} />
    </div>
  );
}
