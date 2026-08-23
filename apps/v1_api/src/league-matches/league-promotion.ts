import { createHash } from 'node:crypto';
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
  // ── 순위 근거 (감사 H-5) ─────────────────────────────────────────────────
  // calculateLeagueStandings 가 이미 계산해 넘겨준 값을 그대로 옮겨 담을 뿐이다 --
  // 별도 계산을 만들지 않는다. 어드민 승강 확정 화면이 "왜 이 팀이 3위인가"를
  // preview 응답만 보고 설명할 수 있어야, 관리자 화면을 벗어나 공개 순위표 주소를
  // 손으로 조합해 나가지 않아도 된다.
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
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
    // DTO 의 @IsObject() 는 tierOverrides 자체만 보고 그 안의 값은 검사하지 않는다.
    // null 이 들어오면 아래 override[slotKey] 가 TypeError 로 터져 500 이 나가고,
    // 숫자·문자열이면 조용히 무시돼 어드민이 설정했다고 믿는 값이 사라진다.
    // 둘 다 여기서 막는다.
    if (override === null || typeof override !== 'object' || Array.isArray(override)) {
      errors.push({ field: `tierOverrides.${tierKey}`, message: '티어 override 는 { promote, relegate } 객체여야 해요.' });
      continue;
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

export interface TierSlotCounts {
  promoteCount: number;
  relegateCount: number;
  skippedByMajorityGuard: boolean;
}

/**
 * 티어 하나의 승격·강등 슬롯 수와 과반 가드 판정. **승강 계산의 단일 소스**다.
 *
 * calculatePromotions 와 어드민 규칙 폼(promotion-rule-form.tsx)이 둘 다 이 식을 쓴다 —
 * 폼이 자기 나름의 근사식(항상 2*slots)을 들고 있었을 때, 티어 위치를 모르는 탓에
 * "1부는 승격이 없다 / 최하위는 강등이 없다 / 단일 티어는 승강 자체가 없다"를 반영하지
 * 못해 24개 조합 중 15개가 서버와 어긋났다(예: minSlots=3·8팀에서 폼은 "승강 건너뜀"이라
 * 경고했지만 서버는 실제로 1부에서 3팀을 강등시켰다). 식이 두 벌이면 반드시 다시 갈린다.
 */
export function tierSlotCounts(
  rule: PromotionRule,
  tier: number,
  tierCount: number,
  teamCount: number,
): TierSlotCounts {
  if (teamCount === 0) return { promoteCount: 0, relegateCount: 0, skippedByMajorityGuard: false };

  const override = rule.tierOverrides?.[String(tier)];
  const slots = baseSlots(rule, teamCount);

  // 1부는 위가 없으니 승격 없음. 최하위는 아래가 없으니 강등 없음.
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

/**
 * 순위 인덱스(0-based, position 오름차순) 하나가 승격·강등·잔류 중 어디에 해당하는지
 * 판정한다. `tierSlotCounts` 와 짝을 이루는 두 번째 단일 소스다 -- 승강 여부를 계산하는
 * 곳이 `calculatePromotions` 하나만이 아니게 되면서(공개 순위표의 "예상 승강 경계",
 * Task 153 Wave 2 감사 H-2) 각자 fromTop/fromBottom 식을 다시 쓰면 반드시 갈린다.
 */
export function classifyPromotionKind(
  index: number,
  teamCount: number,
  promoteCount: number,
  relegateCount: number,
): PromotionKind {
  const fromTop = index;
  const fromBottom = teamCount - 1 - index;
  if (fromTop < promoteCount) return 'promoted';
  if (fromBottom < relegateCount) return 'relegated';
  return 'stayed';
}

/** kind 가 정해졌을 때 다음 시즌 티어. 1부 승격/최하위 강등처럼 갈 곳이 없는 조합은 호출부가 막아야 한다. */
export function resolvePromotionToTier(fromTier: number, kind: PromotionKind): number {
  if (kind === 'promoted') return fromTier - 1;
  if (kind === 'relegated') return fromTier + 1;
  return fromTier;
}

/**
 * 저장된 `V1LeagueSeries.promotionRuleJson`(Json 컬럼, 타입 `unknown`)을 안전하게
 * `PromotionRule` 로 해석한다. null 이거나 객체가 아니면 기본 규칙으로 폴백한다.
 *
 * 어드민 승강 확정 서비스(`LeagueSeriesAdminService`)와 공개 순위표의 예상 승강 경계
 * (`LeagueMatchPublicService`, Task 153 Wave 2)가 이 함수 하나를 공유한다 -- 두 곳이
 * 각자 파싱하면 한쪽만 고친 폴백 규칙이 서로 어긋날 수 있다.
 */
export function resolvePromotionRule(raw: unknown): PromotionRule {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_PROMOTION_RULE };
  return raw as PromotionRule;
}

/**
 * 규칙의 내용 지문. preview 응답에 실어 보내고 commit 이 되돌려 받아, 그 사이에 어드민이
 * 규칙을 바꿨는지 감지한다.
 *
 * 이게 없으면 규칙 변경이 조용히 통과한다 — fromTier 는 규칙과 무관하게 그대로라
 * PROMOTION_ENTRIES_TIER_MISMATCH 가 못 잡고, 서버가 새 규칙으로 다시 계산한
 * computedKind 와 어드민이 보고 결정한 옛 값이 달라져 **손대지도 않은 팀이
 * overriddenByAdmin=true 로 박제된다**(alpha 실측: 수정 0건인데 overriddenCount=2).
 * 감사 추적이 목적인 필드가 감사할 수 없는 값이 되는 셈이다.
 */
export function promotionRuleFingerprint(rule: PromotionRule): string {
  // JSON.stringify 는 키 삽입 순서를 그대로 쓰므로 같은 규칙도 다른 문자열이 될 수 있다.
  // 키를 정렬해 정규화한 뒤 해시한다.
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonical(v)]),
    );
  };
  return createHash('sha256').update(JSON.stringify(canonical(rule))).digest('hex');
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

    // 슬롯 수·가드 판정은 tierSlotCounts 가 단독으로 소유한다(프론트 규칙 폼과 공용).
    const { promoteCount, relegateCount, skippedByMajorityGuard } = tierSlotCounts(rule, tier, tierCount, teamCount);

    if (skippedByMajorityGuard) {
      // 경고 문구에는 가드에 걸린 "원래 적용하려던" 수를 보여줘야 어드민이 왜 건너뛰었는지 안다.
      const override = rule.tierOverrides?.[String(tier)];
      const slots = baseSlots(rule, teamCount);
      const wouldPromote = Math.min(tier > 1 ? (override?.promote ?? slots) : 0, teamCount);
      const wouldRelegate = Math.min(tier < tierCount ? (override?.relegate ?? slots) : 0, teamCount);
      warnings.push({
        tier,
        code: 'MAJORITY_GUARD_SKIPPED',
        message:
          `${tier}부는 팀이 ${teamCount}개뿐이라 승격 ${wouldPromote} · 강등 ${wouldRelegate} 을 적용하면 ` +
          `잔류 팀이 과반에 못 미쳐요. 이 티어의 승강은 건너뛰었어요.`,
      });
    }

    passes.push({ tier, teamCount, promoteCount, relegateCount, skipped: skippedByMajorityGuard, sorted });
  }

  // 2차 패스 — 팀별 kind 배정 + 다음 시즌 예상 팀 수
  const tiers: TierPromotionResult[] = passes.map((pass) => {
    const entries: PromotionEntry[] = pass.sorted.map((standing, index) => {
      const computedKind = classifyPromotionKind(index, pass.teamCount, pass.promoteCount, pass.relegateCount);
      const toTier = resolvePromotionToTier(pass.tier, computedKind);

      return {
        teamId: standing.teamId,
        tier: pass.tier,
        position: standing.position,
        computedKind,
        toTier,
        points: standing.points,
        played: standing.played,
        wins: standing.wins,
        draws: standing.draws,
        losses: standing.losses,
        goalsFor: standing.goalsFor,
        goalsAgainst: standing.goalsAgainst,
        goalDifference: standing.goalsFor - standing.goalsAgainst,
      };
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
