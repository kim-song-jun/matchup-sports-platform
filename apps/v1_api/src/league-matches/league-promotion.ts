import type { LeagueStanding } from './league-standings';

// ── 승강(승격·강등) 계산 — 순수 함수 ────────────────────────────────────────
// DB 를 모른다. 확정된 순위표(calculateLeagueStandings 결과)와 어드민이 설정한
// 규칙만 받아서 티어별 승격/강등/잔류를 계산한다.
//
// 승강 규칙은 코드에 하드코딩하지 않는다 — 어드민이 시리즈마다 설정하고
// 계산 결과도 개별 수정한 뒤 최종 승인해야 반영된다(Task 153).

export type PromotionMode = 'ratio' | 'fixed';
export type PromotionRounding = 'ceil' | 'floor' | 'round';
export type PromotionKind = 'promoted' | 'relegated' | 'stayed' | 'withdrawn';

/** 티어별 슬롯 수 직접 지정. 지정한 항목만 규칙 계산을 덮어쓴다. */
export interface PromotionTierOverride {
  promote?: number;
  relegate?: number;
}

/** 어드민이 시리즈 생성/수정 시 입력하는 규칙. V1LeagueSeries.promotionRuleJson 에 저장된다. */
export interface PromotionRule {
  mode: PromotionMode;
  /** mode=ratio 일 때 팀 수 대비 비율. 0 < ratio <= 0.5 */
  ratio?: number;
  rounding?: PromotionRounding;
  /** 계산값이 0 이어도 최소 이만큼은 승강한다. 1 이상. */
  minSlots?: number;
  /** mode=fixed 일 때 티어 팀 수와 무관한 고정 슬롯 수. */
  fixedCount?: number;
  /** 키는 티어 번호 문자열("1" = 최상위). */
  tierOverrides?: Record<string, PromotionTierOverride>;
}

export const DEFAULT_PROMOTION_RULE: Readonly<PromotionRule> = Object.freeze({
  mode: 'ratio',
  ratio: 0.2,
  rounding: 'ceil',
  minSlots: 1,
});

export interface PromotionEntry {
  teamId: string;
  tier: number;
  position: number;
  /** 규칙이 계산한 값. 어드민 수정 전 원본 — 감사 추적용으로 항상 보존한다. */
  computedKind: PromotionKind;
  /** 이 팀이 다음 시즌에 속할 티어. */
  toTier: number;
}

export interface TierPromotionResult {
  tier: number;
  teamCount: number;
  promoteCount: number;
  relegateCount: number;
  /** 잔류 과반 가드에 걸려 이 티어의 승강을 건너뛰었는지. */
  skippedByMajorityGuard: boolean;
  entries: PromotionEntry[];
  /** 다른 티어에서 들어오고 나가는 팀까지 반영한 다음 시즌 예상 팀 수. */
  nextSeasonTeamCount: number;
}

export interface PromotionWarning {
  tier: number;
  code: 'MAJORITY_GUARD_SKIPPED' | 'EMPTY_TIER';
  message: string;
}

export interface PromotionPlan {
  tierCount: number;
  tiers: TierPromotionResult[];
  warnings: PromotionWarning[];
}

export interface TierStandingsInput {
  /** 1 = 최상위(1부). */
  tier: number;
  /** position 오름차순으로 정렬된 확정 순위표. */
  standings: readonly LeagueStanding[];
}

export interface PromotionRuleValidationError {
  field: string;
  message: string;
}

/**
 * 규칙 설정값 검증. 잘못된 규칙은 저장 자체를 막는다 —
 * 시즌이 끝난 뒤에 발견하면 이미 늦다.
 */
export function validatePromotionRule(rule: PromotionRule): PromotionRuleValidationError[] {
  const errors: PromotionRuleValidationError[] = [];

  if (rule.mode !== 'ratio' && rule.mode !== 'fixed') {
    errors.push({ field: 'mode', message: 'mode 는 ratio 또는 fixed 여야 해요.' });
  }

  if (rule.mode === 'ratio') {
    const ratio = rule.ratio;
    if (typeof ratio !== 'number' || Number.isNaN(ratio)) {
      errors.push({ field: 'ratio', message: 'mode=ratio 일 때 ratio 는 필수예요.' });
    } else if (ratio <= 0 || ratio > 0.5) {
      // 0.5 초과면 한 시즌에 과반이 이동한다 — 리그가 성립하지 않는다.
      errors.push({ field: 'ratio', message: 'ratio 는 0 초과 0.5 이하여야 해요.' });
    }
  }

  if (rule.mode === 'fixed') {
    const fixedCount = rule.fixedCount;
    if (typeof fixedCount !== 'number' || !Number.isInteger(fixedCount) || fixedCount < 1) {
      errors.push({ field: 'fixedCount', message: 'mode=fixed 일 때 fixedCount 는 1 이상 정수여야 해요.' });
    }
  }

  if (rule.rounding !== undefined && !['ceil', 'floor', 'round'].includes(rule.rounding)) {
    errors.push({ field: 'rounding', message: 'rounding 은 ceil, floor, round 중 하나여야 해요.' });
  }

  if (rule.minSlots !== undefined && (!Number.isInteger(rule.minSlots) || rule.minSlots < 1)) {
    errors.push({ field: 'minSlots', message: 'minSlots 는 1 이상 정수여야 해요.' });
  }

  for (const [tierKey, override] of Object.entries(rule.tierOverrides ?? {})) {
    const tier = Number(tierKey);
    if (!Number.isInteger(tier) || tier < 1) {
      errors.push({ field: `tierOverrides.${tierKey}`, message: '티어 키는 1 이상 정수여야 해요.' });
    }
    for (const slotKey of ['promote', 'relegate'] as const) {
      const value = override[slotKey];
      if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
        errors.push({
          field: `tierOverrides.${tierKey}.${slotKey}`,
          message: '슬롯 수는 0 이상 정수여야 해요.',
        });
      }
    }
  }

  return errors;
}

function applyRounding(value: number, rounding: PromotionRounding): number {
  if (rounding === 'floor') return Math.floor(value);
  if (rounding === 'round') return Math.round(value);
  return Math.ceil(value);
}

/** 티어 하나의 기본 슬롯 수. 승격·강등에 같은 값을 쓴다(override 가 없다면). */
function baseSlots(rule: PromotionRule, teamCount: number): number {
  if (teamCount === 0) return 0;
  const minSlots = rule.minSlots ?? 1;
  if (rule.mode === 'fixed') {
    return Math.max(minSlots, rule.fixedCount ?? minSlots);
  }
  const raw = teamCount * (rule.ratio ?? 0);
  return Math.max(minSlots, applyRounding(raw, rule.rounding ?? 'ceil'));
}

/**
 * 승강 계획 계산.
 *
 * - 1부(tier=1)는 승격 없음, 최하위 티어는 강등 없음.
 * - 한 티어에서 `승격 + 강등 > floor(팀수/2)` 이면 그 티어의 승강을 통째로 건너뛴다.
 *   3팀 리그에서 1승격 1강등이면 중간 1팀만 잔류하는데, 그건 리그가 아니다.
 * - 승격 수와 강등 수가 티어마다 다를 수 있어 다음 시즌 팀 수는 변한다. 고정 정원제가
 *   아니므로 정상 동작이며, 어드민이 확정 전에 볼 수 있도록 nextSeasonTeamCount 로 돌려준다.
 */
export function calculatePromotions(input: {
  tierCount: number;
  rule: PromotionRule;
  tiers: readonly TierStandingsInput[];
}): PromotionPlan {
  const { tierCount, rule } = input;
  const warnings: PromotionWarning[] = [];

  const byTier = new Map<number, TierStandingsInput>();
  for (const entry of input.tiers) byTier.set(entry.tier, entry);

  // 1차 패스 — 티어별 슬롯 수와 가드 판정
  interface TierPass {
    tier: number;
    teamCount: number;
    promoteCount: number;
    relegateCount: number;
    skipped: boolean;
    sorted: readonly LeagueStanding[];
  }
  const passes: TierPass[] = [];

  for (let tier = 1; tier <= tierCount; tier += 1) {
    const sorted = [...(byTier.get(tier)?.standings ?? [])].sort((a, b) => a.position - b.position);
    const teamCount = sorted.length;

    if (teamCount === 0) {
      warnings.push({ tier, code: 'EMPTY_TIER', message: `${tier}부에 참가 팀이 없어요.` });
      passes.push({ tier, teamCount: 0, promoteCount: 0, relegateCount: 0, skipped: false, sorted });
      continue;
    }

    const override = rule.tierOverrides?.[String(tier)];
    const slots = baseSlots(rule, teamCount);

    // 1부는 위가 없으니 승격 없음. 최하위는 아래가 없으니 강등 없음.
    const canPromote = tier > 1;
    const canRelegate = tier < tierCount;

    let promoteCount = canPromote ? (override?.promote ?? slots) : 0;
    let relegateCount = canRelegate ? (override?.relegate ?? slots) : 0;

    promoteCount = Math.min(promoteCount, teamCount);
    relegateCount = Math.min(relegateCount, teamCount);

    const guardLimit = Math.floor(teamCount / 2);
    const skipped = promoteCount + relegateCount > guardLimit;
    if (skipped) {
      warnings.push({
        tier,
        code: 'MAJORITY_GUARD_SKIPPED',
        message:
          `${tier}부는 팀이 ${teamCount}개뿐이라 승격 ${promoteCount} · 강등 ${relegateCount} 을 적용하면 ` +
          `잔류 팀이 과반에 못 미쳐요. 이 티어의 승강은 건너뛰었어요.`,
      });
      promoteCount = 0;
      relegateCount = 0;
    }

    passes.push({ tier, teamCount, promoteCount, relegateCount, skipped, sorted });
  }

  // 2차 패스 — 팀별 kind 배정 + 다음 시즌 예상 팀 수
  const tiers: TierPromotionResult[] = passes.map((pass) => {
    const entries: PromotionEntry[] = pass.sorted.map((standing, index) => {
      const fromTop = index;
      const fromBottom = pass.teamCount - 1 - index;

      let computedKind: PromotionKind = 'stayed';
      let toTier = pass.tier;

      if (fromTop < pass.promoteCount) {
        computedKind = 'promoted';
        toTier = pass.tier - 1;
      } else if (fromBottom < pass.relegateCount) {
        computedKind = 'relegated';
        toTier = pass.tier + 1;
      }

      return { teamId: standing.teamId, tier: pass.tier, position: standing.position, computedKind, toTier };
    });

    return {
      tier: pass.tier,
      teamCount: pass.teamCount,
      promoteCount: pass.promoteCount,
      relegateCount: pass.relegateCount,
      skippedByMajorityGuard: pass.skipped,
      entries,
      nextSeasonTeamCount: 0, // 아래에서 채운다
    };
  });

  const passByTier = new Map(passes.map((p) => [p.tier, p]));
  for (const result of tiers) {
    const above = passByTier.get(result.tier - 1);
    const below = passByTier.get(result.tier + 1);
    result.nextSeasonTeamCount =
      result.teamCount -
      result.promoteCount -
      result.relegateCount +
      (above?.relegateCount ?? 0) +
      (below?.promoteCount ?? 0);
  }

  return { tierCount, tiers, warnings };
}
