import { BadRequestException } from '@nestjs/common';
import type { CompetitionConfig } from './competition-config.types';
import { TOURNAMENT_TIE_BREAK_PRESETS, DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER, type SixTeamDirectFinalCriterion } from './tournament-tie-break-presets';

export type TieBreakOrder = CompetitionConfig['tieBreak']['order'];

export const TIE_BREAK_ORDER_INVALID = 'TIE_BREAK_ORDER_INVALID';
export const SIX_TEAM_ORDER_INVALID = 'SIX_TEAM_ORDER_INVALID';

/** The criteria an operator can reorder; points always lead and the seeded draw always closes. */
const MOVABLE_CRITERIA = ['head_to_head', 'goal_difference', 'goals_for', 'fewest_goals_against', 'fair_play'] as const;
/** Orders saved before MD-QA #186 had no fewest-goals-against slot. */
const LEGACY_MOVABLE_CRITERIA = ['head_to_head', 'goal_difference', 'goals_for', 'fair_play'] as const;

/**
 * The platform default: the first preset. Equal to the pre-#186 default with fewest goals against read just before the
 * seeded draw — after goal difference and goals for it can never separate teams, so no ranking changes.
 */
export const DEFAULT_TIE_BREAK_ORDER: TieBreakOrder = [...TOURNAMENT_TIE_BREAK_PRESETS[0].order];

/**
 * A tournament's (or stage's) own tie-break order, stored beside the tournament instead of in the shared
 * (content-hashed) competition config version. Accepts the current 7-slot order and the legacy 6-slot order (read as
 * fewest goals against inserted just before the seeded draw); always returns the 7-slot order.
 * Throws on a stored value that is not a valid order rather than silently ranking by the default.
 */
export function assertValidTieBreakOrder(value: unknown): TieBreakOrder {
  if (!Array.isArray(value) || (value.length !== DEFAULT_TIE_BREAK_ORDER.length && value.length !== DEFAULT_TIE_BREAK_ORDER.length - 1)) {
    throw invalidOrder('동점일 때 순서는 승점과 추첨을 포함해 7가지 기준을 모두 담아야 해요.');
  }
  const [first, ...rest] = value;
  const last = rest.pop();
  if (first !== 'points') throw invalidOrder('동점일 때 순서는 승점으로 시작해야 해요.');
  if (last !== 'seeded_draw') throw invalidOrder('동점일 때 순서는 추첨으로 끝나야 해요.');
  const expected: readonly string[] = value.length === DEFAULT_TIE_BREAK_ORDER.length ? MOVABLE_CRITERIA : LEGACY_MOVABLE_CRITERIA;
  const movable = new Set<unknown>(rest);
  const complete = movable.size === expected.length && expected.every((criterion) => movable.has(criterion));
  if (!complete) throw invalidOrder('맞대결·득실차·다득점·최소 실점·페어플레이를 한 번씩만 담아 주세요.');
  const middle = rest as TieBreakOrder;
  return expected === MOVABLE_CRITERIA
    ? ['points', ...middle, 'seeded_draw']
    : ['points', ...middle, 'fewest_goals_against', 'seeded_draw'];
}

export function resolveTieBreakOrder(stored: unknown): TieBreakOrder {
  return stored === null || stored === undefined ? [...DEFAULT_TIE_BREAK_ORDER] : assertValidTieBreakOrder(stored);
}

/** A stage's order: its own row when present, otherwise the tournament's (which falls back to the platform default). */
export function resolveStageTieBreakOrder(tournamentStored: unknown, stageStored: unknown): TieBreakOrder {
  return stageStored === null || stageStored === undefined ? resolveTieBreakOrder(tournamentStored) : assertValidTieBreakOrder(stageStored);
}

export function sameTieBreakOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((criterion, index) => criterion === right[index]);
}

/** What an admin write persists: the default order is stored as `null` so an untouched tournament and one reset to default look the same. */
export function normalizeTieBreakOrderForStorage(value: unknown): TieBreakOrder | null {
  if (value === null) return null;
  const order = assertValidTieBreakOrder(value);
  return sameTieBreakOrder(order, DEFAULT_TIE_BREAK_ORDER) ? null : order;
}

/** Every standings calculation of a tournament goes through this so they all rank by the same order. */
export function withTournamentTieBreakOrder(config: CompetitionConfig, stored: unknown): CompetitionConfig {
  if (stored === null || stored === undefined) return config;
  return { ...config, tieBreak: { ...config.tieBreak, order: assertValidTieBreakOrder(stored) } };
}

/** 6강 결승 직행 비교 순서. 세 기준을 한 번씩 담아야 하고, null/undefined 는 기본 순서다. */
export function resolveSixTeamDirectFinalOrder(stored: unknown): SixTeamDirectFinalCriterion[] {
  if (stored === null || stored === undefined) return [...DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER];
  const values = new Set<unknown>(Array.isArray(stored) ? stored : []);
  const valid = Array.isArray(stored) && stored.length === DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER.length
    && values.size === stored.length && DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER.every((criterion) => values.has(criterion));
  if (!valid) {
    throw new BadRequestException({ code: SIX_TEAM_ORDER_INVALID, message: '결승 직행팀 고르는 순서는 다득점·득실차·최소 실점을 한 번씩 담아 주세요.' });
  }
  return [...stored] as SixTeamDirectFinalCriterion[];
}

/** 기본 순서는 null 로 저장해 손대지 않은 대회와 기본값으로 되돌린 대회가 같아 보이게 한다. */
export function normalizeSixTeamDirectFinalOrderForStorage(value: unknown): SixTeamDirectFinalCriterion[] | null {
  if (value === null) return null;
  const order = resolveSixTeamDirectFinalOrder(value);
  return sameTieBreakOrder(order, DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER) ? null : order;
}

function invalidOrder(message: string) {
  return new BadRequestException({ code: TIE_BREAK_ORDER_INVALID, message });
}
