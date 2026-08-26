'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminPageHeader, AdminToasts, useAdminToast } from '@/components/admin';
import { PromotionRuleForm } from '@/components/admin/promotion-rule-form';
import { useV1CreateLeagueSeries, useV1MasterRegions, useV1MasterSports } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { V1_DEFAULT_PROMOTION_RULE, type V1PromotionRule } from '@/types/league-series';

const inputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
const labelClass = 'mb-1.5 block text-sm font-semibold text-[var(--text-strong)]';

export default function AdminLeagueSeriesNewPage() {
  const router = useRouter();
  const { toasts, showToast } = useAdminToast();
  const [title, setTitle] = useState('');
  const [sportId, setSportId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [tierCount, setTierCount] = useState(2);
  const [promotionRule, setPromotionRule] = useState<V1PromotionRule>({ ...V1_DEFAULT_PROMOTION_RULE });

  const { data: sports } = useV1MasterSports();
  const { data: regions } = useV1MasterRegions();
  const createSeries = useV1CreateLeagueSeries();

  const canSubmit = title.trim() !== '' && sportId !== '' && regionId !== '' && !createSeries.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    createSeries.mutate(
      { title: title.trim(), sportId, regionId, tierCount, promotionRule },
      {
        onSuccess: (series) => router.push(`/admin/league-series/${series.id}`),
        onError: (error) => showToast(extractErrorMessage(error, '리그 체계를 만들지 못했어요.'), 'error'),
      },
    );
  };

  return (
    <div>
      <AdminPageHeader
        eyebrow="플랫폼"
        title="리그 체계 만들기"
        description="실력별로 나눈 리그를 묶어요. 시즌이 끝나면 순위표를 보고 승격·강등을 계산해 드려요."
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
              <select id="series-sport" className={inputClass} value={sportId} onChange={(e) => setSportId(e.target.value)}>
                <option value="">종목을 선택해 주세요</option>
                {(sports ?? []).map((sport) => (
                  <option key={sport.id} value={sport.id}>
                    {sport.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="series-region">
                지역
              </label>
              <select
                id="series-region"
                className={inputClass}
                value={regionId}
                onChange={(e) => setRegionId(e.target.value)}
              >
                <option value="">지역을 선택해 주세요</option>
                {(regions ?? []).map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </select>
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
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                팀이 많지 않은 종목·지역은 티어를 적게 두는 편이 나아요. 티어를 쪼갤수록 리그당 팀이 줄어들어요.
              </p>
            </div>
          </div>
        </div>

        {tierCount > 1 && (
          <PromotionRuleForm value={promotionRule} tierCount={tierCount} onChange={setPromotionRule} />
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-[var(--border-strong)] px-4 text-sm font-semibold text-[var(--text-strong)]"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex min-h-[44px] items-center rounded-xl bg-blue-500 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {createSeries.isPending ? '만드는 중…' : '리그 체계 만들기'}
          </button>
        </div>
      </form>

      <AdminToasts toasts={toasts} />
    </div>
  );
}
