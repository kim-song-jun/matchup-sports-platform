'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button } from '@/components/v1-ui/button';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { revealAndFocus } from '@/components/v1-ui/reveal-and-focus';
import { SIDE_SHEET_DISCARD_CONFIRM, SideSheet } from '@/components/v1-ui/side-sheet';
import {
  usePatchPeriods,
  useTournamentPeriodSettings,
  type TournamentPeriodPhase,
  type TournamentPeriodSetting,
  type TournamentPeriodSettingsResponse,
} from '@/hooks/use-tournament-period-settings';
import { extractErrorCode, extractErrorMessage } from '@/lib/error-message';
import { onlyDigits } from '@/lib/number-format';
import { runSaveSteps, saveStep, type SavedSteps, type SaveStep } from '@/lib/sequential-save';
import {
  periodLabels,
  switchPeriodCount,
  TOURNAMENT_PERIOD_PHASES,
  tournamentPeriodPhaseLabel,
  tournamentPeriodPhaseShortLabel,
} from '@/lib/tournament-period-phases';
import { hasValidPeriodDurations } from '@/lib/tournament-periods';
import type { StagePlan } from '@/types/stage-plan';

const INVALID_MESSAGE = '경기 시간은 1분 이상으로 입력해 주세요.';
const STEP_LABEL = '경기 시간';

/** 편집의 기준 — 시트를 열고 처음 받은 값. 저장에 성공한 부분만 그 값으로 옮겨 간다. */
interface PeriodBase {
  defaultMinutes: string[];
  stages: Partial<Record<TournamentPeriodPhase, string[]>>;
}

function minutesOf(periods: TournamentPeriodSetting[] | null, legacyPeriodCount: number | null): string[] {
  if (periods) return periods.map((period) => String(period.durationMinutes));
  return Array.from({ length: legacyPeriodCount ?? 0 }, () => '');
}

function baseOf(settings: TournamentPeriodSettingsResponse): PeriodBase {
  return {
    defaultMinutes: minutesOf(settings.periods, settings.legacyPeriodCount),
    stages: Object.fromEntries(
      settings.stageOverrides.map((override) => [override.phase, minutesOf(override.periods, override.legacyPeriodCount)]),
    ),
  };
}

const sameMinutes = (a: readonly string[], b: readonly string[] | undefined) =>
  b !== undefined && a.length === b.length && a.every((value, index) => Number(value) === Number(b[index]) && value !== '' && b[index] !== '');
const toPeriods = (minutes: readonly string[]) => minutes.map((value) => ({ durationMinutes: Number(value) }));
const formatMinutes = (minutes: readonly (string | number)[]) => minutes.map((value) => `${value}분`).join(' / ');

/** 요약 한 줄 — 「전·후반 20분 / 20분」「단판 40분」. 전·후반도 단판도 아닌 옛 설정은 개수를 앞에 붙인다. */
export function periodSummaryText(periods: ReadonlyArray<{ durationMinutes: number }> | null | undefined): string {
  if (!periods?.length) return '정하지 않음';
  const minutes = formatMinutes(periods.map((period) => period.durationMinutes));
  if (periods.length === 1) return `단판 ${minutes}`;
  if (periods.length === 2) return `전·후반 ${minutes}`;
  return `${periods.length}부 · ${minutes}`;
}

export interface PeriodSettingsDraft {
  dirty: boolean;
  /** 저장을 막는 칸 — 고친 칸만 본다. 손대지 않은 옛 설정은 다른 저장을 막지 않는다. */
  invalid: { fieldId: string; message: string } | null;
  /** 바뀐 것만 순서대로(기본 → 단계). 바뀐 게 없거나 막힌 칸이 있으면 비어 있다. */
  buildSteps(patchPeriods: ReturnType<typeof usePatchPeriods>): SaveStep[];
}

interface StageRow {
  phase: TournamentPeriodPhase;
  /** null 이면 위 시간을 그대로 쓴다. */
  minutes: string[] | null;
  expanded: boolean;
}

export function usePeriodSettingsDraft({
  tournamentId,
  stagePhases,
  enabled = true,
}: {
  tournamentId: string;
  /** 지금 대진에 있는 단계 — 이 단계와 이미 따로 정한 단계만 줄로 보여 준다. */
  stagePhases: readonly TournamentPeriodPhase[];
  enabled?: boolean;
}): PeriodSettingsDraft & {
  query: UseQueryResult<TournamentPeriodSettingsResponse>;
  tournamentId: string;
  ready: boolean;
  defaultMinutes: string[];
  setDefaultMinute(index: number, value: string): void;
  setDefaultCount(count: 1 | 2): void;
  stages: StageRow[];
  expandStage(phase: TournamentPeriodPhase): void;
  setStageMinute(phase: TournamentPeriodPhase, index: number, value: string): void;
  setStageCount(phase: TournamentPeriodPhase, count: 1 | 2): void;
  inheritStage(phase: TournamentPeriodPhase): void;
} {
  const query = useTournamentPeriodSettings(tournamentId, { enabled });
  const [base, setBase] = useState<PeriodBase | null>(null);
  if (base === null && query.data) setBase(baseOf(query.data));
  const [defaultEdit, setDefaultEdit] = useState<string[] | null>(null);
  const [stageEdits, setStageEdits] = useState<Partial<Record<TournamentPeriodPhase, string[] | null>>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<TournamentPeriodPhase>>(() => new Set());

  const defaultMinutes = defaultEdit ?? base?.defaultMinutes ?? [];
  const stageValue = (phase: TournamentPeriodPhase): string[] | null =>
    phase in stageEdits ? (stageEdits[phase] ?? null) : (base?.stages[phase] ?? null);
  const hasStageRows = query.data?.kind === 'regular_tournament';
  const stages: StageRow[] = hasStageRows
    ? TOURNAMENT_PERIOD_PHASES.filter(
        ({ value }) => stagePhases.includes(value) || base?.stages[value] !== undefined || hasCustomEdit(stageEdits, value),
      ).map(({ value }) => ({ phase: value, minutes: stageValue(value), expanded: expanded.has(value) }))
    : [];

  const defaultChanged = defaultEdit !== null && !sameMinutes(defaultEdit, base?.defaultMinutes);
  const changedStages = stages.filter(({ phase, minutes }) => {
    if (!(phase in stageEdits)) return false;
    const saved = base?.stages[phase];
    return minutes === null ? saved !== undefined : !sameMinutes(minutes, saved);
  });

  let invalid: PeriodSettingsDraft['invalid'] = null;
  if (defaultChanged && !hasValidPeriodDurations(defaultMinutes)) {
    const index = defaultMinutes.findIndex((value) => !hasValidPeriodDurations([value]));
    invalid = { fieldId: periodInputId('default', Math.max(index, 0)), message: INVALID_MESSAGE };
  }
  for (const { phase, minutes } of changedStages) {
    if (invalid || minutes === null || hasValidPeriodDurations(minutes)) continue;
    const index = minutes.findIndex((value) => !hasValidPeriodDurations([value]));
    invalid = { fieldId: periodInputId(phase, Math.max(index, 0)), message: INVALID_MESSAGE };
  }

  const editStage = (phase: TournamentPeriodPhase, next: string[] | null) =>
    setStageEdits((current) => ({ ...current, [phase]: next }));
  /** 펼친 줄에 보이는 값 — 따로 정한 시간이 없으면 위 시간에서 시작한다. */
  const shownStageMinutes = (phase: TournamentPeriodPhase) => stageValue(phase) ?? defaultMinutes;

  return {
    query,
    tournamentId,
    ready: base !== null,
    dirty: defaultChanged || changedStages.length > 0,
    invalid,
    defaultMinutes,
    setDefaultMinute: (index, value) =>
      setDefaultEdit(defaultMinutes.map((current, at) => (at === index ? onlyDigits(value) : current))),
    setDefaultCount: (count) => setDefaultEdit(switchPeriodCount(defaultMinutes, count)),
    stages,
    expandStage: (phase) => setExpanded((current) => new Set(current).add(phase)),
    setStageMinute: (phase, index, value) =>
      editStage(phase, shownStageMinutes(phase).map((current, at) => (at === index ? onlyDigits(value) : current))),
    setStageCount: (phase, count) => editStage(phase, switchPeriodCount(shownStageMinutes(phase), count)),
    inheritStage: (phase) => {
      editStage(phase, null);
      setExpanded((current) => {
        const next = new Set(current);
        next.delete(phase);
        return next;
      });
    },
    buildSteps(patchPeriods) {
      if (invalid) return [];
      const steps: SaveStep[] = [];
      // 저장된 부분은 기준을 그 값으로 옮긴다 — 뒤 단계가 실패한 뒤 값을 되돌려도 「바뀐 게 없음」으로 읽지 않게.
      if (defaultChanged) {
        const saved = defaultMinutes;
        const periods = toPeriods(saved);
        steps.push(
          saveStep('periods:default', STEP_LABEL, periods, async () => {
            await patchPeriods({ periods });
            setBase((current) => current && { ...current, defaultMinutes: saved });
            setDefaultEdit(null);
          }),
        );
      }
      for (const { phase, minutes } of changedStages) {
        const change = minutes === null ? { phase, inheritDefault: true } : { phase, periods: toPeriods(minutes) };
        steps.push(
          saveStep(`periods:${phase}`, STEP_LABEL, change, async () => {
            await patchPeriods(change);
            setBase((current) => {
              if (!current) return current;
              const { [phase]: _removed, ...rest } = current.stages;
              return { ...current, stages: minutes === null ? rest : { ...rest, [phase]: minutes } };
            });
            setStageEdits((current) => {
              const { [phase]: _saved, ...rest } = current;
              return rest;
            });
          }),
        );
      }
      return steps;
    },
  };
}

function hasCustomEdit(edits: Partial<Record<TournamentPeriodPhase, string[] | null>>, phase: TournamentPeriodPhase): boolean {
  return edits[phase] !== undefined && edits[phase] !== null;
}

const periodInputId = (scope: 'default' | TournamentPeriodPhase, index: number) => `period-${scope}-${index}`;

const segmentCls = (selected: boolean) =>
  `inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border px-4 text-[length:var(--font-size-body-sm)] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 ${
    selected
      ? 'border-blue-500 bg-[var(--blue50)] text-[var(--blue700)]'
      : 'border-[var(--border)] bg-[var(--card-surface)] text-[var(--text-body)] hover:bg-[var(--surface-soft)]'
  }`;

function SplitButtons({
  label,
  count,
  onChange,
  disabled,
}: {
  label: string;
  count: number;
  onChange: (count: 1 | 2) => void;
  disabled: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-2">
      <button type="button" aria-pressed={count === 2} disabled={disabled} onClick={() => onChange(2)} className={segmentCls(count === 2)}>
        전·후반
      </button>
      <button type="button" aria-pressed={count === 1} disabled={disabled} onClick={() => onChange(1)} className={segmentCls(count === 1)}>
        단판
      </button>
    </div>
  );
}

function MinuteInputs({
  scope,
  namePrefix,
  minutes,
  onChange,
  disabled,
  invalidFieldId,
}: {
  scope: 'default' | TournamentPeriodPhase;
  /** 단계 줄은 칸 이름 앞에 단계 이름을 붙여 기본 칸과 구분한다. */
  namePrefix?: string;
  minutes: readonly string[];
  onChange: (index: number, value: string) => void;
  disabled: boolean;
  invalidFieldId: string | undefined;
}) {
  const labels = periodLabels(minutes.length);
  return (
    <div className="grid grid-cols-2 gap-3">
      {minutes.map((value, index) => {
        const id = periodInputId(scope, index);
        const invalid = invalidFieldId === id;
        return (
          <div key={id} className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={id} className="text-[length:var(--font-size-label)] font-semibold text-[var(--text-body)]">
              {namePrefix ? <span className="sr-only">{namePrefix} </span> : null}
              {labels[index]}
            </label>
            <div className="relative">
              <input
                id={id}
                type="text"
                inputMode="numeric"
                value={value}
                onChange={(event) => onChange(index, event.target.value)}
                disabled={disabled}
                aria-invalid={invalid}
                className={`h-[44px] w-full rounded-xl border bg-[var(--card-surface)] px-3 pr-10 text-[length:var(--font-size-body-sm)] text-[var(--text-strong)] focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 ${
                  invalid ? 'border-[var(--red700)] focus:border-[var(--red700)]' : 'border-[var(--border)] focus:border-blue-500'
                }`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[length:var(--font-size-label)] text-[var(--text-muted)]">분</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const hintCls = 'text-[length:var(--font-size-caption)] text-[var(--text-muted)]';
const groupTitleCls = 'text-[length:var(--font-size-body-sm)] font-bold text-[var(--text-strong)]';

/** 경기 시간 입력 — 기본 시간과, 대진에 있는 단계마다 다르게 정하는 줄. 저장은 호출부의 「저장」 한 번이 맡는다. */
export function PeriodSettingsFields({
  draft,
  disabled,
  stagePlan,
}: {
  draft: ReturnType<typeof usePeriodSettingsDraft>;
  disabled: boolean;
  stagePlan?: StagePlan | null;
}) {
  const settings = draft.query.data;
  if (!settings || !draft.ready) {
    if (draft.query.isError) {
      return (
        <div className="flex items-center justify-between gap-3">
          <p role="status" className={hintCls}>경기 시간을 불러오지 못했어요.</p>
          <Button type="button" variant="neutral" size="sm" onClick={() => void draft.query.refetch()}>
            다시 시도
          </Button>
        </div>
      );
    }
    return <p role="status" className={hintCls}>경기 시간을 불러오는 중이에요.</p>;
  }

  const { defaultMinutes } = draft;
  const total = hasValidPeriodDurations(defaultMinutes) ? defaultMinutes.reduce((sum, value) => sum + Number(value), 0) : null;
  const canSplit = defaultMinutes.length === 1 || defaultMinutes.length === 2;
  const invalidFieldId = draft.invalid?.fieldId;
  const hasNarrowerOverrides = settings.groupOverrides.length > 0 || (settings.matchOverrideCount ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {canSplit ? (
          <SplitButtons label="경기 시간 나누기" count={defaultMinutes.length} onChange={draft.setDefaultCount} disabled={disabled} />
        ) : null}
        <MinuteInputs scope="default" minutes={defaultMinutes} onChange={draft.setDefaultMinute} disabled={disabled} invalidFieldId={invalidFieldId} />
        {invalidFieldId?.startsWith('period-default-') ? (
          <p className="text-[length:var(--font-size-caption)] text-[var(--red700)]">{INVALID_MESSAGE}</p>
        ) : (
          <p className={hintCls}>{total !== null ? `한 경기 ${total}분 · 연장은 빼고 정해요.` : '연장은 빼고 정해요.'}</p>
        )}
        {settings.requiresDurationInput ? (
          <p className="text-[length:var(--font-size-caption)] text-[var(--orange700)]">
            이전 설정에는 몇 번으로 나누는지만 저장돼 있어요. 새 경기를 만들기 전에 각 길이를 입력해 주세요.
          </p>
        ) : null}
      </div>

      {draft.stages.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className={groupTitleCls}>단계마다 다르게</p>
          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            {draft.stages.map(({ phase, minutes, expanded }) => {
              const shortLabel = tournamentPeriodPhaseShortLabel(phase);
              const shown = minutes ?? defaultMinutes;
              return (
                <div
                  key={phase}
                  role="group"
                  aria-label={`${shortLabel} 경기 시간`}
                  className="border-b border-[var(--border)] px-3 py-2 last:border-b-0"
                >
                  <div className="flex min-h-[44px] items-center gap-3">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[length:var(--font-size-body-sm)] font-semibold text-[var(--text-strong)]">
                        {tournamentPeriodPhaseLabel(phase)}
                      </span>
                      <span className={hintCls}>{minutes === null ? '위 시간 그대로' : formatMinutes(minutes)}</span>
                    </span>
                    {expanded ? null : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`${shortLabel} 경기 시간 바꾸기`}
                        disabled={disabled}
                        onClick={() => draft.expandStage(phase)}
                      >
                        바꾸기
                      </Button>
                    )}
                  </div>
                  {expanded ? (
                    <div className="mt-2 flex flex-col gap-3 pb-2">
                      {shown.length === 1 || shown.length === 2 ? (
                        <SplitButtons
                          label={`${shortLabel} 경기 시간 나누기`}
                          count={shown.length}
                          onChange={(count) => draft.setStageCount(phase, count)}
                          disabled={disabled}
                        />
                      ) : null}
                      <MinuteInputs
                        scope={phase}
                        namePrefix={shortLabel}
                        minutes={shown}
                        onChange={(index, value) => draft.setStageMinute(phase, index, value)}
                        disabled={disabled}
                        invalidFieldId={invalidFieldId}
                      />
                      {invalidFieldId?.startsWith(`period-${phase}-`) ? (
                        <p className="text-[length:var(--font-size-caption)] text-[var(--red700)]">{INVALID_MESSAGE}</p>
                      ) : null}
                      <div>
                        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => draft.inheritStage(phase)}>
                          위 시간 그대로 쓰기
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className={hintCls}>
            {stagePlan ? '시작 전 경기에만 적용돼요. 단계·편성에 따로 정한 시간이 먼저 적용돼요.' : '시작 전 경기에만 적용돼요.'}
          </p>
        </div>
      ) : (
        <p className={hintCls}>시작 전 경기에만 적용돼요.</p>
      )}

      {hasNarrowerOverrides ? (
        <div aria-label="따로 정한 경기 시간 안내" className={hintCls}>
          <p>
            {settings.kind === 'regular_league'
              ? '따로 정한 경기는 위 시간을 바꿔도 그대로 유지돼요.'
              : '따로 정한 조·경기는 위 시간을 바꿔도 그대로 유지돼요.'}
          </p>
          <ul className="mt-1 space-y-1">
            {settings.groupOverrides.length > 0 ? (
              <li>따로 정한 조: {settings.groupOverrides.map((group) => group.name).join(', ')}</li>
            ) : null}
            {(settings.matchOverrideCount ?? 0) > 0 ? <li>따로 정한 경기: {settings.matchOverrideCount}개</li> : null}
          </ul>
        </div>
      ) : null}

      {settings.compositionOverrides?.length ? (
        <div aria-label="단계·편성별 경기 시간 안내" className="flex flex-col gap-1">
          <p className={groupTitleCls}>단계·편성별 경기 시간</p>
          <ul className={`space-y-1 ${hintCls}`}>
            {settings.compositionOverrides.map((override) => {
              const stage = stagePlan?.stages.find((candidate) =>
                override.scope === 'stage' ? candidate.key === override.key : candidate.pools.some((pool) => pool.key === override.key),
              );
              const pool = stage?.pools.find((candidate) => candidate.key === override.key);
              const label = override.scope === 'stage' ? `${stage?.name ?? '단계'} 전체` : `${stage?.name ?? '단계'} · ${pool?.name ?? '편성'}`;
              return (
                <li key={`${override.scope}:${override.key}`}>
                  {label} · {formatMinutes(override.periods.map((period) => period.durationMinutes))}
                </li>
              );
            })}
          </ul>
          <Link
            href={`/admin/tournaments/${draft.tournamentId}/bracket`}
            className="inline-flex min-h-11 items-center text-[length:var(--font-size-caption)] text-[var(--text-body)] underline underline-offset-2"
          >
            단계·편성 경기 시간 수정
          </Link>
        </div>
      ) : null}
    </div>
  );
}

interface TournamentPeriodSettingsEditorProps {
  tournamentId: string;
  canWrite: boolean;
  showToast: (message: string, variant?: 'success' | 'error') => void;
  stagePlan?: StagePlan | null;
}

const cardCls = 'mb-6 rounded-2xl border border-[var(--border)] bg-[var(--card-surface)] px-5 py-4';

/** 경기 시간 카드 — 평소엔 요약만, 「수정」 은 시트에서. 리그 경기 규칙 화면이 쓴다. */
export function TournamentPeriodSettingsEditor({ tournamentId, canWrite, showToast, stagePlan }: TournamentPeriodSettingsEditorProps) {
  const query = useTournamentPeriodSettings(tournamentId);
  const [open, setOpen] = useState(false);

  return (
    <section aria-label="경기 시간" className={cardCls}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[length:var(--font-size-label)] font-bold text-[var(--text-strong)]">경기 시간</h2>
          <p className="mt-1 text-[length:var(--font-size-body-sm)] text-[var(--text-muted)]">
            {query.isPending
              ? '경기 시간을 불러오는 중이에요.'
              : query.isError || !query.data
                ? '경기 시간을 불러오지 못했어요.'
                : query.data.requiresDurationInput
                  ? '각 길이를 입력해 주세요.'
                  : periodSummaryText(query.data.periods)}
          </p>
        </div>
        {query.isError ? (
          <Button type="button" variant="neutral" size="sm" onClick={() => void query.refetch()}>
            다시 시도
          </Button>
        ) : canWrite && query.data ? (
          <Button type="button" variant="neutral" size="sm" aria-label="경기 시간 수정" onClick={() => setOpen(true)}>
            수정
          </Button>
        ) : null}
      </div>
      {open ? (
        <PeriodSettingsSheet
          tournamentId={tournamentId}
          stagePlan={stagePlan}
          onClose={() => setOpen(false)}
          onSaved={() => showToast('경기 시간을 저장했어요.', 'success')}
        />
      ) : null}
    </section>
  );
}

function PeriodSettingsSheet({
  tournamentId,
  stagePlan,
  onClose,
  onSaved,
}: {
  tournamentId: string;
  stagePlan?: StagePlan | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const draft = usePeriodSettingsDraft({ tournamentId, stagePhases: [] });
  const patchPeriods = usePatchPeriods(tournamentId);
  const savedStepsRef = useRef<SavedSteps>(new Map());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { confirm, ConfirmModal } = useConfirm();

  const save = async () => {
    if (draft.invalid) {
      setMessage(draft.invalid.message);
      revealAndFocus(document.getElementById(draft.invalid.fieldId));
      return;
    }
    const steps = draft.buildSteps(patchPeriods);
    if (steps.length === 0) {
      onClose();
      return;
    }
    setMessage(null);
    setSaving(true);
    const outcome = await runSaveSteps(steps, savedStepsRef.current, (error) =>
      extractErrorCode(error) === 'TOURNAMENT_VERSION_CONFLICT'
        ? '다른 곳에서 먼저 저장돼서 이번 저장은 반영되지 않았어요. 입력한 내용은 그대로 두었어요. 다시 저장해 주세요.'
        : extractErrorMessage(error, '경기 시간 저장에 실패했어요.'),
    );
    setSaving(false);
    if (outcome.status === 'failed') {
      setMessage(outcome.message);
      return;
    }
    onSaved();
    onClose();
  };

  const cancel = async () => {
    if (!(draft.dirty || saving) || (await confirm(SIDE_SHEET_DISCARD_CONFIRM))) onClose();
  };

  return (
    <>
      <SideSheet
        open
        title="경기 시간"
        onClose={onClose}
        dirty={draft.dirty || saving}
        footer={
          <div className="flex flex-col gap-2">
            {message ? <p role="alert" className="text-[length:var(--font-size-label)] text-[var(--red700)]">{message}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="neutral" className="flex-1" onClick={() => void cancel()}>
                취소
              </Button>
              <Button type="button" variant="primary" className="flex-1" disabled={saving || !draft.ready} onClick={() => void save()}>
                {saving ? '저장 중…' : '저장'}
              </Button>
            </div>
          </div>
        }
      >
        <PeriodSettingsFields draft={draft} disabled={saving} stagePlan={stagePlan} />
      </SideSheet>
      {ConfirmModal}
    </>
  );
}
