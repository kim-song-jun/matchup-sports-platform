import { BadRequestException } from '@nestjs/common';
import type { CompetitionConfig } from './competition-config.types';
import { REQUIRED_TIE_BREAK_ORDER } from './competition-config.presets';

export type TieBreakOrder = CompetitionConfig['tieBreak']['order'];

export const TIE_BREAK_ORDER_INVALID = 'TIE_BREAK_ORDER_INVALID';

/** The criteria an operator can reorder; points always lead and the seeded draw always closes. */
const MOVABLE_CRITERIA = ['head_to_head', 'goal_difference', 'goals_for', 'fair_play'] as const;

/**
 * A tournament's own tie-break order, stored beside the tournament instead of in the shared
 * (content-hashed) competition config version. `null`/`undefined` means the default order.
 * Throws on a stored value that is not a valid order rather than silently ranking by the default.
 */
export function assertValidTieBreakOrder(value: unknown): TieBreakOrder {
  if (!Array.isArray(value) || value.length !== REQUIRED_TIE_BREAK_ORDER.length) {
    throw invalidOrder('동점일 때 순서는 승점과 추첨을 포함해 6가지 기준을 모두 담아야 해요.');
  }
  const [first, ...rest] = value;
  const last = rest.pop();
  if (first !== 'points') throw invalidOrder('동점일 때 순서는 승점으로 시작해야 해요.');
  if (last !== 'seeded_draw') throw invalidOrder('동점일 때 순서는 추첨으로 끝나야 해요.');
  const movable = new Set<unknown>(rest);
  const complete = movable.size === MOVABLE_CRITERIA.length && MOVABLE_CRITERIA.every((criterion) => movable.has(criterion));
  if (!complete) throw invalidOrder('맞대결·득실차·다득점·페어플레이를 한 번씩만 담아 주세요.');
  return value as TieBreakOrder;
}

export function resolveTieBreakOrder(stored: unknown): TieBreakOrder {
  return stored === null || stored === undefined ? REQUIRED_TIE_BREAK_ORDER : assertValidTieBreakOrder(stored);
}

/** What an admin write persists: the default order is stored as `null` so an untouched tournament and one reset to default look the same. */
export function normalizeTieBreakOrderForStorage(value: unknown): TieBreakOrder | null {
  if (value === null) return null;
  const order = assertValidTieBreakOrder(value);
  return order.every((criterion, index) => criterion === REQUIRED_TIE_BREAK_ORDER[index]) ? null : order;
}

/** Every standings calculation of a tournament goes through this so they all rank by the same order. */
export function withTournamentTieBreakOrder(config: CompetitionConfig, stored: unknown): CompetitionConfig {
  if (stored === null || stored === undefined) return config;
  return { ...config, tieBreak: { ...config.tieBreak, order: assertValidTieBreakOrder(stored) } };
}

function invalidOrder(message: string) {
  return new BadRequestException({ code: TIE_BREAK_ORDER_INVALID, message });
}
