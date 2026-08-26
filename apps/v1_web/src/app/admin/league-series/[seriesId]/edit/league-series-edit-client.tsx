'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminEmpty, AdminPageHeader, AdminPageSkeleton, AdminToasts, useAdminToast } from '@/components/admin';
import { PromotionRuleForm } from '@/components/admin/promotion-rule-form';
import { useV1AdminLeagueSeries, useV1MasterRegions, useV1MasterSports, useV1UpdateLeagueSeries } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import type { V1PromotionRule } from '@/types/league-series';

const inputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
const readOnlyInputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-muted)]';
const labelClass = 'mb-1.5 block text-sm font-semibold text-[var(--text-strong)]';

export default function LeagueSeriesEditClient({ seriesId }: { seriesId: string }) {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const { data: series, isPending, isError, refetch } = useV1AdminLeagueSeries(seriesId);
  const { data: sports } = useV1MasterSports();
  const { data: regions } = useV1MasterRegions();
  const updateSeries = useV1UpdateLeagueSeries(seriesId);

  const [title, setTitle] = useState('');
  const [tierCount, setTierCount] = useState(1);
  const [promotionRule, setPromotionRule] = useState<V1PromotionRule | null>(null);
  // 서버 값으로 폼을 채우는 건 데이터가 처음 도착했을 때 한 번뿐이어야 한다 — invalidate
  // 로 refetch 가 다시 돌 때마다 이 effect 가 또 실행되면 사용자가 고치던 값을 덮어쓴다.
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (series && !initialized) {
      setTitle(series.title);
      setTierCount(series.tierCount);
      setPromotionRule(series.promotionRule);
      setInitialized(true);
    }
  }, [series, initialized]);

  if (isPending || !initialized) {
    return <AdminPageSkeleton />;
  }
  if (isError || series === undefined || promotionRule === null) {
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

  const sportName = sports?.find((s) => s.id === series.sportId)?.name ?? series.sportId;
  const regionName = regions?.find((r) => r.id === series.regionId)?.name ?? series.regionId;
  const canSubmit = title.trim() !== '' && !updateSeries.isPending;
  const isShrinkingTiers = tierCount < series.tierCount;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    updateSeries.mutate(
      { title: title.trim(), tierCount, promotionRule },
      {
        onSuccess: () => {
          showToast('리그 체계를 수정했어요.', 'success');
          router.push(`/admin/league-series/${seriesId}`);
        },
        // 서버가 티어 축소 시 고아 리그를 검증해 이미 해요체 문구를 내려준다
        // (예: "이미 2부까지 리그가 만들어져 있어서 티어 수를 줄일 수 없어요.") — 그대로 보여준다.
        onError: (error) => showToast(extractErrorMessage(error, '리그 체계를 수정하지 못했어요.'), 'error'),
      },
    );
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="플랫폼"
        title="리그 체계 수정"
        description={`${sportName} · ${regionName} — 종목·지역은 만든 뒤에는 바꿀 수 없어요.`}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--card-surface)] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="series-title">
                이름
              </label>
              <input
                id="series-title"
                className={inputClass}
                value={title}
                maxLength={100}
                placeholder="예) 강남구 풋살 리그"
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="series-sport">
                종목
              </label>
              <input id="series-sport" className={readOnlyInputClass} value={sportName} disabled readOnly />
            </div>

            <div>
              <label className={labelClass} htmlFor="series-region">
                지역
              </label>
              <input id="series-region" className={readOnlyInputClass} value={regionName} disabled readOnly />
            </div>

            <div className="sm:col-span-2">
              <label className={labelClass} htmlFor="series-tier-count">
                티어 수
              </label>
              <select
                id="series-tier-count"
                className={inputClass}
                value={tierCount}
                onChange={(e) => setTierCount(Number(e.target.value))}
              >
                <option value={1}>1개 (1부만 — 승강 없음)</option>
                <option value={2}>2개 (1부 · 2부)</option>
                <option value={3}>3개 (1부 · 2부 · 3부)</option>
              </select>
              {isShrinkingTiers ? (
                <p className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                  ! 이미 하위 티어에 리그가 만들어져 있으면 저장이 막혀요. 먼저 해당 리그를 정리해 주세요.
                </p>
              ) : (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  팀이 많지 않은 종목·지역은 티어를 적게 두는 편이 나아요. 티어를 쪼갤수록 리그당 팀이 줄어들어요.
                </p>
              )}
            </div>
          </div>
        </div>

        {tierCount > 1 && (
          <PromotionRuleForm value={promotionRule} tierCount={tierCount} onChange={setPromotionRule} />
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push(`/admin/league-series/${seriesId}`)}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-strong)]"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-blue-500 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {updateSeries.isPending ? '저장하는 중…' : '저장'}
          </button>
        </div>
      </form>

      <AdminToasts toasts={toasts} />
    </div>
  );
}
