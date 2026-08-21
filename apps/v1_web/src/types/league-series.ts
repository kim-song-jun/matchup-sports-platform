// 리그 체계(시리즈) — 티어(1부/2부/3부) + 시즌 + 승강. Task 153.
// 화면 문구는 A/B/C 가 아니라 국내 생활체육 관행대로 "N부"다.

export type V1PromotionMode = 'ratio' | 'fixed';
export type V1PromotionRounding = 'ceil' | 'floor' | 'round';
export type V1PromotionKind = 'promoted' | 'relegated' | 'stayed' | 'withdrawn';
export type V1LeagueSeriesState = 'draft' | 'active' | 'archived';

export interface V1PromotionTierOverride {
  promote?: number;
  relegate?: number;
}

/** 어드민이 시리즈마다 설정하는 승강 규칙. 코드에 하드코딩된 값이 아니다. */
export interface V1PromotionRule {
  mode: V1PromotionMode;
  ratio?: number;
  rounding?: V1PromotionRounding;
  minSlots?: number;
  fixedCount?: number;
  tierOverrides?: Record<string, V1PromotionTierOverride>;
}

export const V1_DEFAULT_PROMOTION_RULE: V1PromotionRule = {
  mode: 'ratio',
  ratio: 0.2,
  rounding: 'ceil',
  minSlots: 1,
};

export interface V1LeagueSeries {
  id: string;
  title: string;
  sportId: string;
  regionId: string;
  tierCount: number;
  /** ['1부', '2부', ...] — 서버가 만들어 준다. 프론트에서 다시 조립하지 않는다. */
  tierLabels: string[];
  promotionRule: V1PromotionRule;
  state: V1LeagueSeriesState;
  createdAt: string;
}

export interface V1LeagueSeriesListItem extends V1LeagueSeries {
  sport: { id: string; name: string };
  region: { id: string; name: string };
  leagueCount: number;
}

export interface V1LeagueSeriesSeasonTier {
  leagueId: string;
  title: string;
  tier: number | null;
  tierLabel: string | null;
  state: 'draft' | 'active' | 'completed';
  startsOn: string;
  endsOn: string;
  teamCount: number;
}

export interface V1LeagueSeriesSeason {
  seasonNo: number;
  allCompleted: boolean;
  tiers: V1LeagueSeriesSeasonTier[];
}

export interface V1LeagueSeriesDetail extends V1LeagueSeries {
  seasons: V1LeagueSeriesSeason[];
}

export interface V1CreateLeagueSeriesPayload {
  title: string;
  sportId: string;
  regionId: string;
  tierCount: number;
  promotionRule?: V1PromotionRule;
}

export interface V1UpdateLeagueSeriesPayload {
  title?: string;
  tierCount?: number;
  promotionRule?: V1PromotionRule;
}

export interface V1SeedSeasonTier {
  tier: number;
  title: string;
  teamIds: string[];
}

export interface V1SeedSeasonPayload {
  tiers: V1SeedSeasonTier[];
  /** 시즌 기간. 생략하면 서버가 오늘 + 90일로 채운다. 이후 시즌은 이 길이를 승계한다. */
  startsOn?: string;
  endsOn?: string;
}

export interface V1SeedSeasonResult {
  seriesId: string;
  seasonNo: number;
  leagues: Array<{ id: string; title: string; tier: number | null; seasonNo: number | null; state: string }>;
}

export interface V1PromotionWarning {
  tier: number;
  code: 'MAJORITY_GUARD_SKIPPED' | 'EMPTY_TIER';
  message: string;
}

export interface V1PromotionPreviewEntry {
  teamId: string;
  teamName: string;
  tier: number;
  position: number;
  /** 규칙이 계산한 값. 어드민이 수정해도 이 값은 그대로 남아 비교 기준이 된다. */
  computedKind: V1PromotionKind;
  toTier: number;
  toTierLabel: string;
}

export interface V1PromotionPreviewTier {
  tier: number;
  tierLabel: string;
  leagueId: string | null;
  teamCount: number;
  promoteCount: number;
  relegateCount: number;
  skippedByMajorityGuard: boolean;
  nextSeasonTeamCount: number;
  entries: V1PromotionPreviewEntry[];
}

export interface V1PromotionPreviewResponse {
  seriesId: string;
  seasonNo: number;
  rule: V1PromotionRule;
  /** 이 preview 를 만든 규칙의 지문. commit 에 그대로 실어 보내 규칙 변경을 감지한다. */
  ruleFingerprint: string;
  alreadyDecided: boolean;
  warnings: V1PromotionWarning[];
  tiers: V1PromotionPreviewTier[];
}

export interface V1CommitPromotionEntry {
  teamId: string;
  fromTier: number;
  kind: V1PromotionKind;
  overrideNote?: string;
}

export interface V1CommitPromotionsPayload {
  entries: V1CommitPromotionEntry[];
  /** preview 응답의 ruleFingerprint. 불일치 시 서버가 409 PROMOTION_RULE_CHANGED 로 막는다. */
  ruleFingerprint?: string;
}

export interface V1CommitPromotionsResult {
  seriesId: string;
  seasonNo: number;
  nextSeasonNo: number;
  decidedCount: number;
  overriddenCount: number;
  nextSeasonLeagues: Array<{ id: string; tier: number; tierLabel: string; teamCount: number }>;
}
