'use client';

import { useImperativeHandle, useMemo } from 'react';
import { SixTeamModeField } from '@/components/admin/bracket-canvas/six-team-mode-field';
import {
  PeriodSettingsFields,
  periodSummaryText,
  usePeriodSettingsDraft,
} from '@/components/admin/tournament-period-settings-editor';
import { SixTeamOrderEditor } from '@/components/admin/tournaments/six-team-order-editor';
import { StageTieBreakSettings } from '@/components/admin/tournaments/stage-tie-break-settings';
import { TieBreakPresetPicker } from '@/components/admin/tournaments/tie-break-preset-picker';
import type { TournamentPeriodPhase } from '@/hooks/use-tournament-period-settings';
import { useV1AdminBracket, useV1AdminTournament, useV1LineupSizeOptions } from '@/hooks/use-v1-api';
import { josa } from '@/lib/korean';
import { saveStep } from '@/lib/sequential-save';
import { DEFAULT_TEAM_FOUL_THRESHOLD, parseTeamFoulThresholdInput, resolveTeamFoulThreshold, TEAM_FOUL_THRESHOLD_ERROR } from '@/lib/team-foul-counter';
import { TOURNAMENT_PERIOD_PHASES, tournamentPeriodPhaseShortLabel } from '@/lib/tournament-period-phases';
import {
  DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER,
  DEFAULT_TOURNAMENT_TIE_BREAK_ORDER,
  formatTournamentTieBreakRule,
  sameSixTeamOrder,
  sameTieBreakOrder,
  tieBreakOrderName,
  tieBreakOrderOf,
} from '@/lib/tournament-tie-break';
import type { V1SixTeamCriterion, V1SubstitutionMode, V1Tournament, V1TournamentTieBreakOrder, V1UpdateTournamentPayload } from '@/types/api';
import { useTournamentAdmin } from '../tournament-admin-context';
import { substitutionPolicyLabel } from '../tournament-detail-shared';
import { ChoiceButtons, DEFAULT_BADGE, FormGroup, SPORT_DEFAULT_BADGE, TextField, infoFieldId, useSectionDraft } from './form-kit';
import type { InfoSectionDefinition, InfoSectionFormProps, InfoSummaryRow } from './types';

const SUSPENSION_ERROR = '출전정지 기준은 1~20 사이의 정수로 적어 주세요.';
const SUBSTITUTION_LABEL: Record<V1SubstitutionMode, string> = { limited: '횟수 제한', rolling: '자유 교체' };
const SIX_TEAM_MODE_NAME = { on: '6강 · 승리팀 중 1팀 결승 직행', off: '일반 토너먼트' };

const isStarted = (tournament: V1Tournament) => tournament.status === 'in_progress' || tournament.status === 'completed';
const isSixTeamEligible = (tournament: V1Tournament) => tournament.format === 'knockout' && tournament.teamCount === 6;
const numberText = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));

/** 비우면 null(적용 안 함). 숫자가 아니거나 범위 밖이면 저장을 막는다 — 오타가 조용히 「끔」 으로 가지 않게. */
function parseSuspension(raw: string): number | null | 'invalid' {
  if (!raw.trim()) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 20 ? parsed : 'invalid';
}

interface RulesDraft {
  lineupMaxPlayers: number | null;
  substitutionMode: V1SubstitutionMode | null;
  maxSubstitutions: string;
  tieBreakOrder: V1TournamentTieBreakOrder;
  sixTeamMode: boolean;
  sixTeamOrder: V1SixTeamCriterion[];
  yellowLimit: string;
  redSuspension: string;
  teamFoulThreshold: string;
}

const toDraft = (tournament: V1Tournament): RulesDraft => ({
  lineupMaxPlayers: tournament.lineupMaxPlayers,
  substitutionMode: tournament.substitutionMode,
  maxSubstitutions: numberText(tournament.maxSubstitutions),
  tieBreakOrder: tieBreakOrderOf(tournament),
  sixTeamMode: tournament.sixTeamMode ?? false,
  sixTeamOrder: [...(tournament.sixTeamDirectFinalOrder ?? DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER)],
  yellowLimit: numberText(tournament.yellowAccumulationLimit),
  redSuspension: numberText(tournament.redCardSuspensionMatches),
  teamFoulThreshold: numberText(tournament.teamFoulThreshold),
});

const noteCls = 'text-[length:var(--font-size-caption)] text-[var(--text-muted)]';

function RulesForm({ base, disabled, ref, onDirtyChange }: InfoSectionFormProps) {
  const { showToast } = useTournamentAdmin();
  const { data: bracket } = useV1AdminBracket(base.id);
  const stagePhases = useMemo(() => {
    const inBracket = new Set(bracket?.groups.map((group) => group.phase));
    return TOURNAMENT_PERIOD_PHASES.map((option) => option.value).filter((phase): phase is TournamentPeriodPhase => inBracket.has(phase));
  }, [bracket]);
  const periods = usePeriodSettingsDraft({ tournamentId: base.id, stagePhases });
  const { draft, set, fail, errorFor } = useSectionDraft(base, toDraft, onDirtyChange, periods.dirty);
  const options = useV1LineupSizeOptions(base.sportId);
  // 단계마다 다른 순서는 고르는 즉시 저장되고 저장마다 단계 구성 revision 이 오른다 — 이 칸만 살아 있는 대회를 본다.
  const { data: live } = useV1AdminTournament(base.id);
  const stageTieBreak = live?.stageTieBreak ?? base.stageTieBreak;
  const stagePlanRevision = live?.stagePlanRevision ?? base.stagePlanRevision ?? 0;

  const started = isStarted(base);
  const sixTeamEligible = isSixTeamEligible(base);
  const showTieBreak = base.format !== 'knockout';
  const ids = {
    maxSubstitutions: infoFieldId('maxSubstitutions'),
    yellowLimit: infoFieldId('yellowAccumulationLimit'),
    redSuspension: infoFieldId('redCardSuspensionMatches'),
    teamFoulThreshold: infoFieldId('teamFoulThreshold'),
  };

  useImperativeHandle(ref, () => ({
    buildSteps(ctx) {
      if (periods.invalid) return fail(periods.invalid.fieldId, periods.invalid.message);

      const changes: Omit<V1UpdateTournamentPayload, 'expectedVersion'> = {};
      if (!started) {
        if (draft.lineupMaxPlayers !== null && draft.lineupMaxPlayers !== base.lineupMaxPlayers) {
          changes.lineupMaxPlayers = draft.lineupMaxPlayers;
        }
        if (draft.substitutionMode !== null && draft.substitutionMode !== base.substitutionMode) {
          changes.substitutionMode = draft.substitutionMode;
        }
        // 자유 교체에는 횟수가 없다 — 함께 보내면 서버가 거절한다.
        if (draft.substitutionMode === 'limited') {
          const count = Number(draft.maxSubstitutions);
          if (!/^\d+$/.test(draft.maxSubstitutions) || count > 50) {
            return fail(ids.maxSubstitutions, '허용 교체 횟수는 0~50 사이로 입력해 주세요.');
          }
          if (count !== base.maxSubstitutions) changes.maxSubstitutions = count;
        }
      }

      // 바뀐 때만 보낸다 — 결과가 확정돼 순서가 잠긴 대회에서 다른 칸만 고칠 때 걸리지 않게. 기본 순서는 null(되돌리기)이다.
      if (showTieBreak && !sameTieBreakOrder(draft.tieBreakOrder, tieBreakOrderOf(base))) {
        changes.tieBreakOrder = sameTieBreakOrder(draft.tieBreakOrder, DEFAULT_TOURNAMENT_TIE_BREAK_ORDER) ? null : draft.tieBreakOrder;
      }
      if (sixTeamEligible) {
        if (draft.sixTeamMode !== (base.sixTeamMode ?? false)) changes.sixTeamMode = draft.sixTeamMode;
        const savedOrder = base.sixTeamDirectFinalOrder ?? DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER;
        if (draft.sixTeamMode && !sameSixTeamOrder(draft.sixTeamOrder, savedOrder)) {
          changes.sixTeamDirectFinalOrder = sameSixTeamOrder(draft.sixTeamOrder, DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER) ? null : draft.sixTeamOrder;
        }
      }

      const yellowLimit = parseSuspension(draft.yellowLimit);
      if (yellowLimit === 'invalid') return fail(ids.yellowLimit, SUSPENSION_ERROR);
      const redSuspension = parseSuspension(draft.redSuspension);
      if (redSuspension === 'invalid') return fail(ids.redSuspension, SUSPENSION_ERROR);
      const teamFoulThreshold = parseTeamFoulThresholdInput(draft.teamFoulThreshold);
      if (teamFoulThreshold === 'invalid') return fail(ids.teamFoulThreshold, TEAM_FOUL_THRESHOLD_ERROR);
      // 비운 칸은 null 을 명시적으로 보낸다 — 안 보내면 서버가 「안 건드림」 으로 읽어 한 번 켠 기준을 끌 수 없다.
      if (yellowLimit !== (base.yellowAccumulationLimit ?? null)) changes.yellowAccumulationLimit = yellowLimit;
      if (redSuspension !== (base.redCardSuspensionMatches ?? null)) changes.redCardSuspensionMatches = redSuspension;
      if (teamFoulThreshold !== (base.teamFoulThreshold ?? null)) changes.teamFoulThreshold = teamFoulThreshold;

      const steps = periods.buildSteps(ctx.patchPeriods);
      if (Object.keys(changes).length > 0) {
        steps.push(saveStep('rules', '경기 규칙', changes, () => ctx.patchTournament(changes)));
      }
      return { ok: true, steps };
    },
  }));

  /** 선택지를 못 쓰는 이유 — 쓸 수 있으면 null. */
  const optionsNote = (subject: '출전 인원' | '교체', current: string | null): { text: string; tone: 'muted' | 'warning' | 'error' } | null => {
    const now = current ? ` 지금 ${current}.` : '';
    if (started) {
      const what = subject === '출전 인원' ? '출전 인원을' : '교체 방식을';
      return { text: `대회가 시작된 뒤에는 ${what} 바꿀 수 없어요.${now}`, tone: 'warning' };
    }
    if (options.isPending) return { text: '선택지를 불러오는 중이에요…', tone: 'muted' };
    if (options.isError || !options.data) {
      return { text: `${subject} 선택지를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.${now}`, tone: 'error' };
    }
    if (!options.data.supported) {
      return { text: `이 종목은 아직 ${subject === '출전 인원' ? '출전 인원을' : '교체 방식을'} 고를 수 없어요.`, tone: 'muted' };
    }
    return null;
  };
  const noteToneCls = { muted: 'text-[var(--text-muted)]', warning: 'text-[var(--orange700)]', error: 'text-[var(--red700)]' };
  const lineupNote = optionsNote('출전 인원', base.lineupMaxPlayers !== null ? `${base.lineupMaxPlayers}명이에요` : null);
  const substitutionNote = optionsNote(
    '교체',
    base.substitutionMode !== null
      ? josa(substitutionPolicyLabel(base.substitutionMode, base.maxSubstitutions), ['이에요', '예요'])
      : null,
  );
  const lineupIsDefault = options.data?.defaultMaxPlayers != null && draft.lineupMaxPlayers === options.data.defaultMaxPlayers;

  return (
    <div>
      <FormGroup title="출전 인원" badge={lineupIsDefault ? SPORT_DEFAULT_BADGE : undefined} hint="한 경기에 경기장에 서는 인원이에요(골키퍼 포함).">
        {lineupNote ? (
          <p className={`text-[length:var(--font-size-caption)] ${noteToneCls[lineupNote.tone]}`}>{lineupNote.text}</p>
        ) : (
          <ChoiceButtons
            label="출전 인원"
            options={(options.data?.options ?? []).map((value) => ({ value, label: `${value}명` }))}
            value={draft.lineupMaxPlayers}
            onChange={(value) => set('lineupMaxPlayers', value)}
            disabled={disabled}
          />
        )}
      </FormGroup>

      <FormGroup title="경기 시간">
        <PeriodSettingsFields draft={periods} disabled={disabled} stagePlan={base.stagePlan} />
      </FormGroup>

      <FormGroup title="교체" hint="자유 교체는 나간 선수도 다시 들어갈 수 있어요.">
        {substitutionNote ? (
          <p className={`text-[length:var(--font-size-caption)] ${noteToneCls[substitutionNote.tone]}`}>{substitutionNote.text}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <ChoiceButtons
              label="교체"
              options={(options.data?.substitutionModes ?? []).map((mode) => ({ value: mode, label: SUBSTITUTION_LABEL[mode] }))}
              value={draft.substitutionMode}
              onChange={(mode) => {
                set('substitutionMode', mode);
                if (mode === 'limited' && draft.maxSubstitutions === '') {
                  set('maxSubstitutions', numberText(options.data?.defaultMaxSubstitutions));
                }
              }}
              disabled={disabled}
            />
            {draft.substitutionMode === 'limited' ? (
              <TextField
                id={ids.maxSubstitutions}
                label="허용 교체 횟수"
                unit="회"
                inputMode="numeric"
                value={draft.maxSubstitutions}
                onChange={(value) => set('maxSubstitutions', value)}
                disabled={disabled}
                error={errorFor(ids.maxSubstitutions)}
              />
            ) : null}
          </div>
        )}
      </FormGroup>

      {showTieBreak ? (
        <FormGroup>
          <TieBreakPresetPicker
            order={draft.tieBreakOrder}
            onChange={(order) => set('tieBreakOrder', order)}
            disabled={disabled}
            lockedReason={base.tieBreakOrderBlockedReason ?? null}
          />
          {stageTieBreak ? (
            <div className="mt-4">
              <StageTieBreakSettings
                tournamentId={base.id}
                stageTieBreak={stageTieBreak}
                stagePlanRevision={stagePlanRevision}
                canWrite={!disabled}
                showToast={showToast}
              />
            </div>
          ) : null}
        </FormGroup>
      ) : null}

      {sixTeamEligible ? (
        <FormGroup>
          <div className="flex flex-col gap-4">
            <SixTeamModeField
              eligible
              value={draft.sixTeamMode}
              onChange={(value) => set('sixTeamMode', value)}
              disabled={disabled || Boolean(base.sixTeamBracket)}
            />
            {draft.sixTeamMode ? (
              <SixTeamOrderEditor
                order={draft.sixTeamOrder}
                onChange={(order) => set('sixTeamOrder', order)}
                disabled={disabled}
                lockedReason={base.sixTeamDirectFinalOrderBlockedReason ?? null}
              />
            ) : null}
          </div>
        </FormGroup>
      ) : null}

      <FormGroup title="징계">
        <div className="flex flex-col gap-4">
          <TextField
            id={ids.yellowLimit}
            label="경고 누적 출전정지"
            unit="장"
            inputMode="numeric"
            value={draft.yellowLimit}
            onChange={(value) => set('yellowLimit', value)}
            disabled={disabled}
            placeholder="없음"
            hint="이만큼 쌓이면 다음 1경기를 쉬어요. 비우면 적용하지 않아요."
            error={errorFor(ids.yellowLimit)}
          />
          <TextField
            id={ids.redSuspension}
            label="퇴장 출전정지"
            unit="경기"
            inputMode="numeric"
            value={draft.redSuspension}
            onChange={(value) => set('redSuspension', value)}
            disabled={disabled}
            placeholder="없음"
            hint="퇴장 1번에 쉬는 경기 수예요. 비우면 적용하지 않아요."
            error={errorFor(ids.redSuspension)}
          />
          <TextField
            id={ids.teamFoulThreshold}
            label="팀 파울 기준"
            unit="개"
            inputMode="numeric"
            value={draft.teamFoulThreshold}
            onChange={(value) => set('teamFoulThreshold', value)}
            disabled={disabled}
            placeholder={String(DEFAULT_TEAM_FOUL_THRESHOLD)}
            hint={`이 개수부터 경기 화면이 10m 프리킥을 알려요. 비우면 ${DEFAULT_TEAM_FOUL_THRESHOLD}개예요.`}
            error={errorFor(ids.teamFoulThreshold)}
          />
        </div>
      </FormGroup>
      {started ? null : <p className={`pt-2 ${noteCls}`}>첫 경기가 시작되면 출전 인원과 교체는 바꿀 수 없어요.</p>}
    </div>
  );
}

function samePeriodMinutes(
  periods: ReadonlyArray<{ durationMinutes: number }> | null | undefined,
  defaults: ReadonlyArray<{ durationMinutes: number }> | undefined,
): boolean {
  return Boolean(
    periods?.length && defaults?.length === periods.length && periods.every((period, index) => period.durationMinutes === defaults[index].durationMinutes),
  );
}

export const rulesSection: InfoSectionDefinition = {
  key: 'rules',
  rows({ tournament, lineupOptions, periods }) {
    const rows: InfoSummaryRow[] = [];
    rows.push({
      key: 'lineup',
      label: '출전 인원',
      value: tournament.lineupMaxPlayers === null ? '정하지 않음' : `${tournament.lineupMaxPlayers}명`,
      ...(tournament.lineupMaxPlayers !== null && tournament.lineupMaxPlayers === lineupOptions?.defaultMaxPlayers ? { badge: SPORT_DEFAULT_BADGE } : {}),
    });

    if (periods) {
      const differing = periods.stageOverrides.map((override) => tournamentPeriodPhaseShortLabel(override.phase));
      rows.push({
        key: 'periods',
        label: '경기 시간',
        value: periods.requiresDurationInput ? '각 길이를 입력해 주세요' : periodSummaryText(periods.periods),
        ...(samePeriodMinutes(periods.periods, lineupOptions?.defaultPeriods) ? { badge: SPORT_DEFAULT_BADGE } : {}),
        note: differing.length > 0 ? `${differing.join('·')}만 다른 시간이에요.` : '모든 단계가 같은 시간이에요.',
      });
    } else {
      rows.push({ key: 'periods', label: '경기 시간', value: '불러오는 중이에요' });
    }

    const substitutionIsDefault =
      tournament.substitutionMode !== null &&
      tournament.substitutionMode === lineupOptions?.defaultSubstitutionMode &&
      (tournament.substitutionMode === 'rolling' || tournament.maxSubstitutions === lineupOptions.defaultMaxSubstitutions);
    rows.push({
      key: 'substitution',
      label: '교체',
      value: substitutionPolicyLabel(tournament.substitutionMode, tournament.maxSubstitutions),
      ...(substitutionIsDefault ? { badge: SPORT_DEFAULT_BADGE } : {}),
    });

    if (tournament.format !== 'knockout') {
      const order = tieBreakOrderOf(tournament);
      rows.push({
        key: 'tieBreak',
        label: '순위 정하는 순서',
        value: tieBreakOrderName(order),
        note: formatTournamentTieBreakRule(order),
        ...(sameTieBreakOrder(order, DEFAULT_TOURNAMENT_TIE_BREAK_ORDER) ? { badge: DEFAULT_BADGE } : {}),
      });
    }
    if (isSixTeamEligible(tournament)) {
      rows.push({ key: 'sixTeam', label: '6강 방식', value: tournament.sixTeamMode ? SIX_TEAM_MODE_NAME.on : SIX_TEAM_MODE_NAME.off });
    }

    const yellow = tournament.yellowAccumulationLimit;
    const red = tournament.redCardSuspensionMatches;
    const suspension = [yellow != null ? `경고 누적 ${yellow}장` : null, red != null ? `퇴장 ${red}경기` : null].filter(Boolean);
    rows.push({
      key: 'discipline',
      label: '징계',
      value: `팀 파울 ${resolveTeamFoulThreshold(tournament.teamFoulThreshold)}개`,
      ...(tournament.teamFoulThreshold == null ? { badge: DEFAULT_BADGE } : {}),
      note: suspension.length > 0 ? `${suspension.join(' · ')} 출전정지` : '경고 누적·퇴장 출전정지는 정하지 않았어요.',
    });
    return rows;
  },
  Form: RulesForm,
};
