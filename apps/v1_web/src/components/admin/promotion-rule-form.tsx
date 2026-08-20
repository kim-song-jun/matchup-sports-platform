'use client';

import { useMemo } from 'react';
import type { V1PromotionRule } from '@/types/league-series';

const inputClass =
  'h-[44px] w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-surface)] px-3 text-sm text-[var(--text-strong)] placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50';
const labelClass = 'mb-1.5 block text-sm font-semibold text-[var(--text-strong)]';

/** 미리보기에 쓰는 팀 수 표본. 실제 리그 팀 수가 아니라 규칙 감각을 잡기 위한 예시다. */
const PREVIEW_TEAM_COUNTS = [5, 8, 12] as const;

interface PromotionRuleFormProps {
  value: V1PromotionRule;
  onChange: (next: V1PromotionRule) => void;
  disabled?: boolean;
}

/**
 * 규칙이 실제로 몇 팀을 움직이는지 계산한다 — 서버의 baseSlots 와 같은 식이다.
 * 어드민이 저장 전에 결과를 볼 수 있어야 "0.2가 무슨 뜻인지" 묻지 않는다.
 */
export function previewSlots(rule: V1PromotionRule, teamCount: number): number {
  const minSlots = rule.minSlots ?? 1;
  if (rule.mode === 'fixed') return Math.max(minSlots, rule.fixedCount ?? minSlots);
  const raw = teamCount * (rule.ratio ?? 0);
  const rounded =
    rule.rounding === 'floor' ? Math.floor(raw) : rule.rounding === 'round' ? Math.round(raw) : Math.ceil(raw);
  return Math.max(minSlots, rounded);
}

/** 잔류 과반 가드 — 승격+강등이 팀 수의 절반을 넘으면 서버가 그 티어를 건너뛴다. */
export function hitsMajorityGuard(rule: V1PromotionRule, teamCount: number): boolean {
  const slots = previewSlots(rule, teamCount);
  return slots * 2 > Math.floor(teamCount / 2);
}

export function PromotionRuleForm({ value, onChange, disabled = false }: PromotionRuleFormProps) {
  const previews = useMemo(
    () =>
      PREVIEW_TEAM_COUNTS.map((teamCount) => ({
        teamCount,
        slots: previewSlots(value, teamCount),
        guarded: hitsMajorityGuard(value, teamCount),
      })),
    [value],
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
              value={Math.round((value.ratio ?? 0.2) * 100)}
              onChange={(e) => {
                const percent = Number(e.target.value);
                onChange({ ...value, ratio: Number.isFinite(percent) ? percent / 100 : undefined });
              }}
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
              value={value.fixedCount ?? 1}
              onChange={(e) => onChange({ ...value, fixedCount: Number(e.target.value) })}
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
            value={value.minSlots ?? 1}
            onChange={(e) => onChange({ ...value, minSlots: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-[var(--surface-muted)] p-3">
        <p className="text-xs font-semibold text-[var(--text-strong)]">이 규칙이면 이렇게 움직여요</p>
        <ul className="mt-2 space-y-1">
          {previews.map((preview) => (
            <li key={preview.teamCount} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text-strong)]">{preview.teamCount}팀 리그</span>
              <span aria-hidden="true">→</span>
              <span>
                승격 {preview.slots}팀 · 강등 {preview.slots}팀
              </span>
              {preview.guarded && (
                <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  ! 잔류 팀이 과반에 못 미쳐 승강을 건너뛰어요
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
