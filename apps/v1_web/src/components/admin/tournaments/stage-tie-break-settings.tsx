'use client';

import { useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { TieBreakCustomSheet } from '@/components/admin/tournaments/tie-break-custom-sheet';
import { AlertBanner } from '@/components/v1-ui/primitives';
import { useV1SetStageTieBreakOrder } from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import {
  CUSTOM_TIE_BREAK_NAME,
  TOURNAMENT_TIE_BREAK_PRESETS,
  formatTournamentTieBreakRule,
  matchTieBreakPreset,
  tieBreakOrderName,
} from '@/lib/tournament-tie-break';
import type { V1StageTieBreakItem, V1StageTieBreakView, V1TournamentTieBreakOrder } from '@/types/api';

const INHERIT = 'inherit';
const CUSTOM_OPEN = 'custom-open';
const CUSTOM_CURRENT = 'custom-current';

type StageTieBreakSettingsProps = {
  tournamentId: string;
  stageTieBreak: V1StageTieBreakView;
  /** 단계 구성과 같은 revision. 저장할 때 expectedRevision 으로 보낸다. */
  stagePlanRevision: number;
  canWrite: boolean;
  showToast?: (message: string, tone?: 'success' | 'error') => void;
};

/** 어드민 정보 화면의 「단계별 동점 순서」 — 단계마다 select 하나, 고르면 바로 저장한다. */
export function StageTieBreakSettings({ tournamentId, stageTieBreak, stagePlanRevision, canWrite, showToast }: StageTieBreakSettingsProps) {
  const headingId = useId();
  const save = useV1SetStageTieBreakOrder(tournamentId);
  const [error, setError] = useState<string | null>(null);
  const [sheetStageKey, setSheetStageKey] = useState<string | null>(null);
  const sheetStage = stageTieBreak.stages.find((stage) => stage.stageKey === sheetStageKey) ?? null;

  const persist = (stage: V1StageTieBreakItem, order: V1TournamentTieBreakOrder | null) => {
    setError(null);
    save.mutate(
      { stageKey: stage.stageKey, expectedRevision: stagePlanRevision, order },
      {
        onSuccess: () => showToast?.('단계별 동점 순서를 저장했어요.', 'success'),
        onError: (err) => setError(extractErrorMessage(err, '단계별 동점 순서를 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.')),
      },
    );
  };

  const handleSelect = (stage: V1StageTieBreakItem, value: string) => {
    if (value === CUSTOM_OPEN) {
      setSheetStageKey(stage.stageKey);
      return;
    }
    if (value === CUSTOM_CURRENT) return;
    if (value === INHERIT) {
      if (stage.order !== null) persist(stage, null);
      return;
    }
    const preset = TOURNAMENT_TIE_BREAK_PRESETS.find((candidate) => candidate.key === value);
    if (preset) persist(stage, [...preset.order]);
  };

  return (
    <section aria-labelledby={headingId} className="mb-6 grid gap-4 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] px-5 py-4">
      <div>
        <h2 id={headingId} className="text-[length:var(--font-size-label)] font-bold text-[var(--text-strong)]">단계별 동점 순서</h2>
        <p className="mt-1 tm-text-caption text-[var(--text-muted)]">
          특정 조별리그만 다른 규정을 쓰려면 고르세요. 고르지 않으면 대회 규정({tieBreakOrderName(stageTieBreak.tournamentOrder)})을 따라요.
        </p>
      </div>
      {error !== null ? <AlertBanner message={error} /> : null}
      <ul className="grid gap-4">
        {stageTieBreak.stages.map((stage, index) => (
          <StageRow
            key={stage.stageKey}
            index={index}
            stage={stage}
            tournamentOrder={stageTieBreak.tournamentOrder}
            disabled={!canWrite || save.isPending}
            onSelect={(value) => handleSelect(stage, value)}
          />
        ))}
      </ul>
      <TieBreakCustomSheet
        open={sheetStage !== null}
        initialOrder={sheetStage?.resolvedOrder ?? stageTieBreak.tournamentOrder}
        busy={save.isPending}
        onCancel={() => setSheetStageKey(null)}
        onApply={(order) => {
          if (sheetStage) persist(sheetStage, order);
          setSheetStageKey(null);
        }}
      />
    </section>
  );
}

function StageRow({
  index,
  stage,
  tournamentOrder,
  disabled,
  onSelect,
}: {
  index: number;
  stage: V1StageTieBreakItem;
  tournamentOrder: V1TournamentTieBreakOrder;
  disabled: boolean;
  onSelect: (value: string) => void;
}) {
  const selectId = useId();
  const noteId = useId();
  const label = `${index + 1}단계 · ${stage.stageName}`;

  if (!stage.ranked) {
    return (
      <li className="grid gap-1">
        <span className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)]">{label}</span>
        <p className="tm-text-caption text-[var(--text-muted)]">토너먼트는 승부로 가려서 동점 순서가 없어요.</p>
      </li>
    );
  }

  const locked = stage.lockedReason !== null;
  const matched = stage.order === null ? null : matchTieBreakPreset(stage.order);
  const value = stage.order === null ? INHERIT : matched?.key ?? CUSTOM_CURRENT;

  return (
    <li className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={selectId} className="text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-body)]">{label}</label>
        {locked ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[length:var(--font-size-micro)] font-semibold text-[var(--text-muted)]">
            <Lock aria-hidden="true" className="h-3 w-3" />
            잠김
          </span>
        ) : stage.order !== null ? (
          <span className="rounded-full bg-[var(--tint-blue)] px-2 py-0.5 text-[length:var(--font-size-micro)] font-semibold text-[var(--blue700)]">따로 정함</span>
        ) : null}
      </div>
      <select
        id={selectId}
        aria-describedby={noteId}
        value={value}
        disabled={disabled || locked}
        onChange={(event) => onSelect(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card-surface)] px-3 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--blue500)] disabled:cursor-not-allowed"
      >
        <option value={INHERIT}>대회 설정 따름 · {tieBreakOrderName(tournamentOrder)}</option>
        {TOURNAMENT_TIE_BREAK_PRESETS.map((preset) => (
          <option key={preset.key} value={preset.key}>{preset.name}</option>
        ))}
        {value === CUSTOM_CURRENT ? <option value={CUSTOM_CURRENT}>{CUSTOM_TIE_BREAK_NAME}</option> : null}
        <option value={CUSTOM_OPEN}>직접 정하기…</option>
      </select>
      <p id={noteId} className="tm-text-caption text-[var(--text-muted)]">
        {locked ? stage.lockedReason : formatTournamentTieBreakRule(stage.resolvedOrder)}
      </p>
    </li>
  );
}
