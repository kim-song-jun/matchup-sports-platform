'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AdminEmpty, AdminPageHeader, AdminPageSkeleton, AdminStatusPill, AdminToasts, useAdminToast } from '@/components/admin';
import { PromotionCommitPanel } from '@/components/admin/promotion-commit-panel';
import { SeasonSeedPanel } from '@/components/admin/season-seed-panel';
import {
  useV1AdminLeagueSeries,
  useV1CommitLeaguePromotions,
  useV1PreviewLeaguePromotions,
  useV1SeedLeagueSeason,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1CommitPromotionEntry, V1PromotionPreviewResponse, V1SeedSeasonPayload } from '@/types/league-series';

export default function LeagueSeriesDetailClient({ seriesId }: { seriesId: string }) {
  const { toasts, showToast } = useAdminToast();
  const { data: series, isPending, isError, refetch } = useV1AdminLeagueSeries(seriesId);
  const [preview, setPreview] = useState<V1PromotionPreviewResponse | null>(null);
  // 새 preview 가 올 때마다 증가시켜 PromotionCommitPanel 을 remount 한다 — 패널이 들고 있는
  // 수정 상태(overrides)가 남으면 다시 계산한 순위표에 옛 선택이 그대로 얹힌다.
  // 같은 시즌을 재계산하는 경우도 순위가 바뀌었을 수 있으므로 seasonNo 가 아니라 카운터를 쓴다.
  const [previewNonce, setPreviewNonce] = useState(0);

  const previewPromotions = useV1PreviewLeaguePromotions(seriesId);
  const commitPromotions = useV1CommitLeaguePromotions(seriesId);
  const seedSeason = useV1SeedLeagueSeason(seriesId);

  const handleSeed = (payload: V1SeedSeasonPayload) => {
    seedSeason.mutate(
      payload,
      {
        onSuccess: (result) => {
          void refetch();
          showToast(`${result.seasonNo}시즌 리그 ${result.leagues.length}개를 만들었어요.`, 'success');
        },
        onError: (error) => showToast(extractErrorMessage(error, '시즌을 만들지 못했어요.'), 'error'),
      },
    );
  };

  const handlePreview = (seasonNo: number) => {
    previewPromotions.mutate(seasonNo, {
      onSuccess: (result) => {
        setPreview(result);
        setPreviewNonce((n) => n + 1);
        // 이미 확정된 시즌은 다시 확정할 수 없다 — commit 이 409 로 막히므로 미리 알린다.
        if (result.alreadyDecided) showToast('이미 승강이 확정된 시즌이에요.', 'error');
      },
      onError: (error) => showToast(extractErrorMessage(error, '승강 후보를 계산하지 못했어요.'), 'error'),
    });
  };

  const handleCommit = (entries: V1CommitPromotionEntry[]) => {
    if (preview === null) return;
    commitPromotions.mutate(
      // preview 를 만든 규칙의 지문을 함께 보낸다 — 그 사이 어드민이 규칙을 바꿨다면
      // 서버가 409 PROMOTION_RULE_CHANGED 로 막고 다시 계산하게 한다.
      { seasonNo: preview.seasonNo, body: { entries, ruleFingerprint: preview.ruleFingerprint } },
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
    return <AdminPageSkeleton />;
  }
  if (isError || series === undefined) {
    return (
      <AdminEmpty
        title="리그 체계를 불러오지 못했어요"
        description="네트워크 상태를 확인하고 다시 시도해 주세요."
        action={
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-strong)]"
          >
            다시 시도
          </button>
        }
      />
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
        action={
          <div className="flex flex-wrap items-center gap-2">
            <AdminStatusPill status={series.state} />
            {/* 수정 화면으로 가는 유일한 진입점이다 — 이 링크가 없으면 이름 오타나 승강 규칙을
                고칠 방법이 아예 없다(PATCH API·훅은 완성돼 있는데 소비처가 0개였다, 감사 H-8). */}
            <Link
              href={`/admin/league-series/${series.id}/edit`}
              className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-strong)]"
            >
              수정
            </Link>
          </div>
        }
      />

      {series.seasons.length === 0 ? (
        <SeasonSeedPanel
          seriesTitle={series.title}
          tierCount={series.tierCount}
          sportId={series.sportId}
          submitting={seedSeason.isPending}
          onSeed={handleSeed}
        />
      ) : (
        <div className="space-y-4">
          {series.seasons.map((season) => {
            // 응답에 '확정' 필드가 따로 없다 — 하지만 확정(commitPromotions)은 항상 같은
            // 트랜잭션에서 다음 시즌 리그를 만든다(그 경로가 유일하다: seedSeason 은 1시즌만
            // 만든다). 그래서 seasons 목록에 다음 시즌 번호가 있다는 것 자체가 "이 시즌은 이미
            // 확정됐다"는 뜻이다 — 백엔드에 새 필드를 추가하지 않고 이미 있는 데이터로 유도.
            const decided = series.seasons.some((other) => other.seasonNo === season.seasonNo + 1);
            return (
            <section
              key={season.seasonNo}
              className="rounded-2xl border border-[var(--border-strong)] bg-[var(--card-surface)] p-4"
            >
              <header className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-bold text-[var(--text-strong)]">{season.seasonNo}시즌</h2>
                  {decided && <AdminStatusPill status="confirmed" label="승강 확정됨" />}
                </span>
                {series.tierCount > 1 && !decided && (
                  // 시즌이 안 끝났으면 서버가 409 LEAGUE_SEASON_NOT_FINISHED 로 막는다.
                  // 예전에는 이 버튼이 열려 있고 아래 문구로만 경고해서, 문구는 "계산할 수
                  // 없어요"라고 하는데 눌리면 계산이 되는 모순이 있었다(그때는 서버 게이트도
                  // 대진 0건을 통과시켰다). 화면과 서버가 같은 조건을 쓰게 맞춘다.
                  <button
                    type="button"
                    onClick={() => handlePreview(season.seasonNo)}
                    disabled={previewPromotions.isPending || !season.allCompleted}
                    aria-describedby={season.allCompleted ? undefined : `season-${season.seasonNo}-gate`}
                    className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-strong)] disabled:opacity-50"
                  >
                    {previewPromotions.isPending ? '계산하는 중…' : '승강 후보 계산'}
                  </button>
                )}
              </header>

              {decided ? (
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  다음 시즌 리그가 이미 만들어졌어요. 아래 {season.seasonNo + 1}시즌 카드에서 결과를 볼 수 있어요.
                </p>
              ) : (
                !season.allCompleted && (
                  <p id={`season-${season.seasonNo}-gate`} className="mt-2 text-xs text-[var(--text-muted)]">
                    아직 끝나지 않은 리그가 있어요. 모든 티어가 종료돼야 승강을 계산할 수 있어요.
                  </p>
                )
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
            );
          })}
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
            key={previewNonce}
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
