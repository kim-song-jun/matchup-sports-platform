'use client';

import { useMemo, useState } from 'react';
import type { V1PromotionRule } from '@/types/league-series';

const inputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-muted)] focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
const labelClass = 'mb-2 block text-sm font-semibold text-[var(--text-strong)]';

/** 미리보기에 쓰는 팀 수 표본. 실제 리그 팀 수가 아니라 규칙 감각을 잡기 위한 예시다. */
const PREVIEW_TEAM_COUNTS = [5, 8, 12] as const;

interface PromotionRuleFormProps {
  value: V1PromotionRule;
  /** 시리즈의 티어 수. 1부/최하위는 한쪽 방향이 없어 미리보기가 달라진다. */
  tierCount: number;
  onChange: (next: V1PromotionRule) => void;
  disabled?: boolean;
}

/**
 * 규칙이 실제로 몇 팀을 움직이는지 계산한다 — 서버의 baseSlots 와 같은 식이다.
 * 어드민이 저장 전에 결과를 볼 수 있어야 "0.2가 무슨 뜻인지" 묻지 않는다.
 */
export function previewSlots(rule: V1PromotionRule, teamCount: number): number {
  // 서버 baseSlots 와 동일하게 빈 티어는 0 이다 — minSlots 를 적용하면 팀이 없는데도
  // "1팀 승격"으로 보인다.
  if (teamCount === 0) return 0;
  const minSlots = rule.minSlots ?? 1;
  if (rule.mode === 'fixed') return Math.max(minSlots, rule.fixedCount ?? minSlots);
  const raw = teamCount * (rule.ratio ?? 0);
  const rounded =
    rule.rounding === 'floor' ? Math.floor(raw) : rule.rounding === 'round' ? Math.round(raw) : Math.ceil(raw);
  return Math.max(minSlots, rounded);
}

export interface TierSlotPreview {
  promoteCount: number;
  relegateCount: number;
  skippedByMajorityGuard: boolean;
}

/**
 * 티어 하나의 승격·강등 수와 과반 가드 판정 — 서버 `tierSlotCounts`
 * (apps/v1_api/src/league-matches/league-promotion.ts)의 정확한 사본이다.
 *
 * 이전 버전은 티어 위치를 모른 채 언제나 `slots * 2 > floor(n/2)` 로 판정했다. 그래서
 * "1부는 승격이 없다 / 최하위는 강등이 없다 / 단일 티어는 승강 자체가 없다"를 반영하지
 * 못해 서버와 어긋났다 — 24개 조합 중 15개 불일치. 폼이 허용하는 값으로 재현된다:
 * minSlots=3·8팀이면 폼은 "승강을 건너뛰어요"라고 경고하지만 서버는 실제로 1부에서
 * 3팀을 강등시킨다. 어드민이 "아무 일도 안 일어난다"고 믿는 설정이 8팀 중 3팀을
 * 내리는 설정이었다. 두 곳의 식이 다르면 반드시 다시 갈리므로 서버 함수를 그대로 옮긴다.
 */
export function tierSlotPreview(
  rule: V1PromotionRule,
  tier: number,
  tierCount: number,
  teamCount: number,
): TierSlotPreview {
  if (teamCount === 0) return { promoteCount: 0, relegateCount: 0, skippedByMajorityGuard: false };

  const override = rule.tierOverrides?.[String(tier)];
  const slots = previewSlots(rule, teamCount);
  const canPromote = tier > 1;
  const canRelegate = tier < tierCount;

  let promoteCount = Math.min(canPromote ? (override?.promote ?? slots) : 0, teamCount);
  let relegateCount = Math.min(canRelegate ? (override?.relegate ?? slots) : 0, teamCount);

  const skippedByMajorityGuard = promoteCount + relegateCount > Math.floor(teamCount / 2);
  if (skippedByMajorityGuard) {
    promoteCount = 0;
    relegateCount = 0;
  }
  return { promoteCount, relegateCount, skippedByMajorityGuard };
}

export function PromotionRuleForm({ value, tierCount, onChange, disabled = false }: PromotionRuleFormProps) {
  // 숫자 입력을 지우는 순간 Number('') === 0 이 규칙에 박히면 서버가 422 로 거부한다.
  // 그렇다고 즉시 최솟값으로 되돌리면 "20"을 "5"로 고치려고 지웠을 때 커서 앞에 1 이 남아
  // "15"가 되어버린다. 그래서 화면에 보이는 문자열(draft)과 실제 규칙 값을 분리하고,
  // 파싱에 성공했을 때만 규칙을 갱신한다 — 지운 상태는 화면에만 남고 규칙은 직전 유효값을 지킨다.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draftOf = (key: string, fallback: number) => drafts[key] ?? String(fallback);

  const commitNumber = (key: string, raw: string, min: number, apply: (parsed: number) => void) => {
    setDrafts((prev) => ({ ...prev, [key]: raw }));
    const parsed = Number(raw);
    if (raw.trim() === '' || !Number.isFinite(parsed) || parsed < min) return;
    apply(parsed);
  };

  // 티어마다 결과가 다르다(1부는 승격 없음 · 최하위는 강등 없음)이므로 티어별로 보여준다.
  // "8팀 리그 → 승격 2 · 강등 2" 한 줄만 띄우면 1부·최하위에서 실제로 무슨 일이
  // 일어나는지 어드민이 알 수 없다.
  const previews = useMemo(
    () =>
      PREVIEW_TEAM_COUNTS.map((teamCount) => ({
        teamCount,
        tiers: Array.from({ length: tierCount }, (_, i) => ({
          tier: i + 1,
          ...tierSlotPreview(value, i + 1, tierCount, teamCount),
        })),
      })),
    [value, tierCount],
  );

  return (
    <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--card-surface)] p-4">
      <h3 className="text-sm font-bold text-[var(--text-strong)]">승강 규칙</h3>
      <p className="mt-1 text-xs text-[var(--text-muted)]">
        시즌이 끝나면 이 규칙으로 승격·강등 후보를 계산해요. 계산 결과는 확정 전에 직접 고칠 수 있어요.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="promotion-mode">
            기준
          </label>
          <select
            id="promotion-mode"
            className={inputClass}
            value={value.mode}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, mode: e.target.value as V1PromotionRule['mode'] })}
          >
            <option value="ratio">팀 수 비례</option>
            <option value="fixed">고정 팀 수</option>
          </select>
        </div>

        {value.mode === 'ratio' ? (
          <div>
            <label className={labelClass} htmlFor="promotion-ratio">
              비율 (%)
            </label>
            <input
              id="promotion-ratio"
              type="number"
              min={1}
              max={50}
              step={1}
              className={inputClass}
              disabled={disabled}
              value={draftOf('ratio', Math.round((value.ratio ?? 0.2) * 100))}
              onChange={(e) =>
                commitNumber('ratio', e.target.value, 1, (percent) => {
                  if (percent > 50) return;
                  onChange({ ...value, ratio: percent / 100 });
                })
              }
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">1~50%. 절반을 넘으면 리그가 성립하지 않아요.</p>
          </div>
        ) : (
          <div>
            <label className={labelClass} htmlFor="promotion-fixed">
              승강 팀 수
            </label>
            <input
              id="promotion-fixed"
              type="number"
              min={1}
              step={1}
              className={inputClass}
              disabled={disabled}
              value={draftOf('fixedCount', value.fixedCount ?? 1)}
              onChange={(e) =>
                commitNumber('fixedCount', e.target.value, 1, (parsed) =>
                  onChange({ ...value, fixedCount: Math.trunc(parsed) }),
                )
              }
            />
          </div>
        )}

        {value.mode === 'ratio' && (
          <div>
            <label className={labelClass} htmlFor="promotion-rounding">
              소수점 처리
            </label>
            <select
              id="promotion-rounding"
              className={inputClass}
              value={value.rounding ?? 'ceil'}
              disabled={disabled}
              onChange={(e) => onChange({ ...value, rounding: e.target.value as V1PromotionRule['rounding'] })}
            >
              <option value="ceil">올림 (12팀 → 3팀)</option>
              <option value="round">반올림 (12팀 → 2팀)</option>
              <option value="floor">내림 (12팀 → 2팀)</option>
            </select>
          </div>
        )}

        <div>
          <label className={labelClass} htmlFor="promotion-min">
            최소 승강 팀 수
          </label>
          <input
            id="promotion-min"
            type="number"
            min={1}
            step={1}
            className={inputClass}
            disabled={disabled}
            value={draftOf('minSlots', value.minSlots ?? 1)}
            onChange={(e) =>
              commitNumber('minSlots', e.target.value, 1, (parsed) =>
                onChange({ ...value, minSlots: Math.trunc(parsed) }),
              )
            }
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-[var(--surface-muted)] p-3">
        <p className="text-xs font-semibold text-[var(--text-strong)]">이 규칙이면 이렇게 움직여요</p>
        <ul className="mt-2 space-y-2">
          {previews.map((preview) => (
            <li key={preview.teamCount} className="text-xs text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text-strong)]">티어마다 {preview.teamCount}팀일 때</span>
              <ul className="mt-1 space-y-1 pl-3">
                {preview.tiers.map((tier) => (
                  <li key={tier.tier} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-[var(--text-strong)]">{tier.tier}부</span>
                    <span aria-hidden="true">→</span>
                    {tier.skippedByMajorityGuard ? (
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                        ! 잔류 팀이 과반에 못 미쳐 승강을 건너뛰어요
                      </span>
                    ) : tier.promoteCount === 0 && tier.relegateCount === 0 ? (
                      <span>승강 없음</span>
                    ) : (
                      <span>
                        {tier.promoteCount > 0 && `승격 ${tier.promoteCount}팀`}
                        {tier.promoteCount > 0 && tier.relegateCount > 0 && ' · '}
                        {tier.relegateCount > 0 && `강등 ${tier.relegateCount}팀`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
