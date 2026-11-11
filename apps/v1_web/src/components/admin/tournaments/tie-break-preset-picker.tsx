'use client';

import { useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { TieBreakCustomSheet } from '@/components/admin/tournaments/tie-break-custom-sheet';
import {
  TOURNAMENT_TIE_BREAK_PRESETS,
  formatTournamentTieBreakRule,
  matchTieBreakPreset,
} from '@/lib/tournament-tie-break';
import type { V1TournamentTieBreakOrder } from '@/types/api';

type TieBreakPresetPickerProps = {
  order: V1TournamentTieBreakOrder;
  onChange: (order: V1TournamentTieBreakOrder) => void;
  disabled?: boolean;
  /** 순서를 못 바꿀 때 서버가 준 사유. 있으면 모든 카드가 꺼진다. */
  lockedReason?: string | null;
};

const CUSTOM_VALUE = 'custom';

/** 대회 만들기·정보 수정이 함께 쓰는 「동점일 때 순서」 — 프리셋 카드 셋과 「직접 정하기」. 저장은 언제나 순서 배열이다. */
export function TieBreakPresetPicker({ order, onChange, disabled = false, lockedReason = null }: TieBreakPresetPickerProps) {
  const headingId = useId();
  const hintId = useId();
  const lockId = useId();
  const groupName = useId();
  const [sheetOpen, setSheetOpen] = useState(false);
  const frozen = disabled || lockedReason !== null;
  const matched = matchTieBreakPreset(order);
  const selected = matched?.key ?? CUSTOM_VALUE;

  return (
    <section aria-labelledby={headingId} className="grid gap-2">
      <h3 id={headingId} className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)]">동점일 때 순서</h3>
      <p id={hintId} className="tm-text-caption text-[var(--text-muted)]">
        승점이 같을 때 어떤 규정으로 순위를 가를지 골라요. 모든 조별리그가 이 규정을 따라요.
      </p>
      <div
        role="radiogroup"
        aria-labelledby={headingId}
        aria-describedby={lockedReason !== null ? `${hintId} ${lockId}` : hintId}
        className="grid gap-2 xl:grid-cols-4"
      >
        {TOURNAMENT_TIE_BREAK_PRESETS.map((preset, index) => (
          <PresetCard
            key={preset.key}
            name={groupName}
            checked={selected === preset.key}
            disabled={frozen}
            title={preset.name}
            badge={index === 0 ? '기본' : null}
            rule={formatTournamentTieBreakRule(preset.order)}
            onSelect={() => onChange([...preset.order])}
          />
        ))}
        <PresetCard
          name={groupName}
          checked={selected === CUSTOM_VALUE}
          disabled={frozen}
          title="직접 정하기"
          badge={null}
          rule={selected === CUSTOM_VALUE ? formatTournamentTieBreakRule(order) : '기준을 한 칸씩 옮겨서 정해요'}
          onSelect={() => setSheetOpen(true)}
          alwaysFire
        />
      </div>
      <p className="tm-text-caption text-[var(--text-muted)]">끝까지 같으면 추첨으로 정하고, 진출이 갈리는 자리는 운영자가 직접 골라요.</p>
      {lockedReason !== null ? (
        <p id={lockId} role="status" className="flex items-start gap-1 tm-text-caption text-[var(--text-muted)]">
          <Lock aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{lockedReason}</span>
        </p>
      ) : null}
      <TieBreakCustomSheet
        open={sheetOpen}
        initialOrder={order}
        onCancel={() => setSheetOpen(false)}
        onApply={(next) => {
          onChange(next);
          setSheetOpen(false);
        }}
      />
    </section>
  );
}

function PresetCard({
  name,
  checked,
  disabled,
  title,
  badge,
  rule,
  onSelect,
  alwaysFire = false,
}: {
  name: string;
  checked: boolean;
  disabled: boolean;
  title: string;
  badge: string | null;
  rule: string;
  onSelect: () => void;
  /** 「직접 정하기」는 이미 골라져 있어도 누르면 시트를 다시 열어야 한다. */
  alwaysFire?: boolean;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer flex-col gap-1 rounded-xl border px-3 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--blue500)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${checked ? 'border-[var(--blue500)] bg-[var(--tint-blue)]' : 'border-[var(--border)] bg-[var(--card-surface)]'}`}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={onSelect}
          onClick={alwaysFire && checked ? onSelect : undefined}
        />
        <span
          aria-hidden="true"
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${checked ? 'border-[var(--blue500)]' : 'border-[var(--grey400)]'}`}
        >
          {checked ? <span className="h-2.5 w-2.5 rounded-full bg-[var(--blue500)]" /> : null}
        </span>
        <span className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">{title}</span>
        {badge !== null ? (
          <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[length:var(--font-size-micro)] font-semibold text-[var(--text-muted)]">{badge}</span>
        ) : null}
      </span>
      <span className="tm-text-caption pl-7 text-[var(--text-muted)]">{rule}</span>
    </label>
  );
}
