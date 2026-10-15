import type { PlaceValue } from '@/lib/place';
import { validTeamMatchPeriodMinutes } from '@/lib/team-match-periods';
import type { TeamMatchCreateViewModel } from './team-matches.types';
import type { V1TeamMatchEdit, V1TeamMatchPeriod, V1TeamMatchPeriodInput, V1TeamMatchRuleOptions } from '@/types/api';

export type TeamMatchRuleDraft = {
  hostTeamId: string;
  sportId: string;
  competitionConfigVersionId: string | null;
  mode: 'custom' | 'default';
  periods: readonly V1TeamMatchPeriodInput[] | null;
  confirmed: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isPeriod(value: unknown): value is V1TeamMatchPeriodInput {
  return isRecord(value) && typeof value.durationMinutes === 'number' && Number.isFinite(value.durationMinutes);
}
export function validTeamMatchPeriods(periods: readonly V1TeamMatchPeriodInput[] | null | undefined): boolean {
  return Boolean(periods && (periods.length === 1 || periods.length === 2)
    && periods.every((period) => validTeamMatchPeriodMinutes(period.durationMinutes)));
}
export function readTeamMatchRuleDraft(value: unknown): TeamMatchRuleDraft | undefined {
  if (!isRecord(value) || typeof value.hostTeamId !== 'string' || typeof value.sportId !== 'string'
    || typeof value.confirmed !== 'boolean') return undefined;
  if (value.mode === 'default' && value.periods === null && value.competitionConfigVersionId === null) {
    return { hostTeamId: value.hostTeamId, sportId: value.sportId, competitionConfigVersionId: null,
      mode: 'default', periods: null, confirmed: value.confirmed };
  }
  if (value.mode !== 'custom' || typeof value.competitionConfigVersionId !== 'string'
    || !value.competitionConfigVersionId || !Array.isArray(value.periods) || !value.periods.every(isPeriod)) return undefined;
  return { hostTeamId: value.hostTeamId, sportId: value.sportId, competitionConfigVersionId: value.competitionConfigVersionId,
    mode: 'custom', periods: value.periods.map(({ durationMinutes }) => ({ durationMinutes })), confirmed: value.confirmed };
}
export function ruleDraftForOptions(options: V1TeamMatchRuleOptions): TeamMatchRuleDraft {
  return { hostTeamId: options.hostTeamId, sportId: options.sportId,
    competitionConfigVersionId: options.competitionConfigVersionId, mode: 'custom',
    periods: options.periods.map(({ durationMinutes }) => ({ durationMinutes })), confirmed: false };
}
export function ruleDraftForEdit(edit: V1TeamMatchEdit): TeamMatchRuleDraft | undefined {
  if (!edit.competitionConfigVersionId || !edit.form.periods) return undefined;
  return { hostTeamId: edit.form.hostTeamId, sportId: edit.form.sportId,
    competitionConfigVersionId: edit.competitionConfigVersionId, mode: 'custom',
    periods: edit.form.periods.map(({ durationMinutes }) => ({ durationMinutes })), confirmed: true };
}
export function ruleDraftMatches(rule: TeamMatchRuleDraft | undefined, hostTeamId: string, sportId: string): boolean {
  return Boolean(rule && rule.hostTeamId === hostTeamId && rule.sportId === sportId);
}
export function teamMatchRuleSummary(rule: TeamMatchRuleDraft | undefined): string {
  if (!rule) return '경기 규칙을 확인해 주세요';
  if (rule.mode === 'default') return '기존 기본 규칙을 사용해요';
  if (!validTeamMatchPeriods(rule.periods)) return '경기 시간을 다시 입력해 주세요';
  return rule.periods?.length === 1
    ? '단판 · ' + rule.periods[0].durationMinutes + '분'
    : '전후반 · 전반 ' + rule.periods?.[0].durationMinutes + '분 · 후반 ' + rule.periods?.[1].durationMinutes + '분';
}
export function teamMatchSavedRuleSummary(periods: readonly V1TeamMatchPeriod[] | null | undefined): string {
  if (!periods?.length) return '저장된 경기 규칙 정보가 없어요.';
  if (periods.length === 1 && periods[0].code === 'SINGLE_PERIOD' && !periods[0].extraTime) {
    return '단판 · ' + periods[0].durationMinutes + '분';
  }
  if (periods.length === 2 && periods[0].code === 'FIRST_HALF' && periods[1].code === 'SECOND_HALF'
    && !periods[0].extraTime && !periods[1].extraTime) {
    return '전후반 · 전반 ' + periods[0].durationMinutes + '분 · 후반 ' + periods[1].durationMinutes + '분';
  }
  return periods.map((period) => period.label + ' ' + period.durationMinutes + '분').join(' · ');
}
export function teamMatchEditDraftKey(teamMatchId: string): string {
  return 'teameet:v1:team-match-edit-draft:v1:' + teamMatchId;
}

export type TeamMatchStoredEditDraft = {
  teamMatchId: string;
  version: string;
  competitionConfigVersionId: string | null;
  draft: TeamMatchCreateViewModel['draft'];
  regionId: string;
  rulesChanged: boolean;
  touched: boolean;
};
function isPlace(value: unknown): value is PlaceValue | null {
  if (value === null) return true;
  if (!isRecord(value) || typeof value.name !== 'string') return false;
  if (value.kind === 'manual') return value.address === undefined || value.address === null || typeof value.address === 'string';
  return value.kind === 'picked' && (value.address === null || typeof value.address === 'string')
    && typeof value.latitude === 'number' && Number.isFinite(value.latitude)
    && typeof value.longitude === 'number' && Number.isFinite(value.longitude)
    && value.provider === 'kakao' && typeof value.providerPlaceId === 'string';
}
function isEditDraft(value: unknown): value is TeamMatchCreateViewModel['draft'] {
  if (!isRecord(value)) return false;
  return ['title', 'description', 'grade', 'format', 'uniform', 'gender', 'imageUrl', 'date', 'startTime', 'endTime', 'deadlineDate', 'deadlineTime']
    .every((field) => typeof value[field] === 'string')
    && (value.endDate === undefined || typeof value.endDate === 'string')
    && (value.listImageUrl === undefined || typeof value.listImageUrl === 'string')
    && Array.isArray(value.style) && value.style.every((item) => typeof item === 'string')
    && typeof value.cost === 'number' && Number.isFinite(value.cost)
    && typeof value.opponentCost === 'number' && Number.isFinite(value.opponentCost)
    && isPlace(value.place)
    && (value.rules === undefined || readTeamMatchRuleDraft(value.rules) !== undefined);
}
export function readTeamMatchEditDraft(value: unknown, edit: V1TeamMatchEdit): TeamMatchStoredEditDraft | null {
  if (!isRecord(value) || value.teamMatchId !== edit.teamMatchId || value.version !== edit.version
    || value.competitionConfigVersionId !== edit.competitionConfigVersionId || typeof value.regionId !== 'string'
    || typeof value.rulesChanged !== 'boolean' || typeof value.touched !== 'boolean' || !isEditDraft(value.draft)) return null;
  if (value.draft.rules && (!ruleDraftMatches(value.draft.rules, edit.form.hostTeamId, edit.form.sportId)
    || value.draft.rules.mode !== 'custom'
    || value.draft.rules.competitionConfigVersionId !== edit.competitionConfigVersionId)) return null;
  if (value.rulesChanged && !value.draft.rules) return null;
  return { teamMatchId: edit.teamMatchId, version: edit.version,
    competitionConfigVersionId: edit.competitionConfigVersionId, regionId: value.regionId,
    rulesChanged: value.rulesChanged, touched: value.touched,
    draft: { ...value.draft, rules: readTeamMatchRuleDraft(value.draft.rules) } };
}
