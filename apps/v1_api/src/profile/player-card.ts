/**
 * 선수 카드 능력치 계산 (Task 155). 산식 근거: `docs/design/task-155-player-card-formula.md`.
 *
 * 이 파일은 **순수 함수만** 둔다 -- DB 접근이 없어야 산식을 테스트에서 직접 때릴 수 있고,
 * 나중에 공유 이미지(next/og) 쪽에서 같은 계산을 재사용할 때 서비스를 끌고 오지 않는다.
 *
 * ## 이 산식이 지켜야 하는 것
 * 1. **지어내지 않는다.** 아래 6개는 전부 실재하는 컬럼에서만 나온다.
 * 2. **표본이 모자라면 숫자를 만들지 않는다.** 1경기 1골이 SHO 99가 되면 카드 전체가
 *    거짓말이 된다 -- 그런 능력치는 잠근다.
 * 3. **잠긴 것은 총점에서 빠진다.** 0으로 넣으면 "아직 안 나온 것"이 "나쁜 것"이 된다.
 */

export const PLAYER_CARD_FORMULA_VERSION = 1;

/** 기록 기반 능력치가 열리는 최소 출전 수. */
export const MIN_APPEARANCES_FOR_RATE_STATS = 3;
/** 후기 기반 능력치가 열리는 최소 후기 수. */
export const MIN_REVIEWS_FOR_METRIC_STATS = 3;

export type PlayerCardStatCode = 'SHO' | 'PAS' | 'APP' | 'SKI' | 'MAN' | 'PUN';
export type PlayerCardPosition = 'FW' | 'MF' | 'DF' | 'GK' | null;
export type PlayerCardTier = 'bronze' | 'silver' | 'gold' | 'special';

export interface PlayerCardInput {
  /** 공개 게이트를 통과한 출전 경기 수(gameId 중복 제거 후). */
  readonly appearances: number;
  readonly goals: number;
  readonly assists: number;
  /** 선발 출전 수. `appearances` 이하여야 한다. */
  readonly startedCount: number;
  readonly position: PlayerCardPosition;
  /**
   * 등번호. **어떤 계산에도 쓰이지 않는다** -- 표시 전용으로 통과시킨다.
   * 카드 응답을 한 곳에서 만들기 위해 여기 두었고, 능력치·총점·등급과 무관하다.
   */
  readonly jerseyNumber: number | null;
  /** 4항목 후기 평균(1~5). 값이 없으면 null. */
  readonly skillScore: number | null;
  readonly mannerScore: number | null;
  readonly punctualityScore: number | null;
  readonly reviewCount: number;
  /** 기록 공개 동의 여부. false 면 기록 3항목이 잠긴다. */
  readonly recordsConsented: boolean;
  /**
   * 이 사용자에게 연결된 경기 참가 기록이 하나라도 있는가.
   *
   * 동의를 켜면 열리는 것이 **실제로 있는지**를 가른다. 연결이 하나도 없는 사람에게
   * "기록 공개를 켜면 열려요" 라고 말하면 켜도 아무것도 안 열리는 거짓 약속이 된다 --
   * alpha 실측(2026-08-24)에서 0경기 사용자가 정확히 그 안내를 받고 있었다.
   */
  readonly hasRecordLinks: boolean;
  /** 저장된 모양 선택. 잠금은 buildPlayerCard 가 다시 판정한다. */
  readonly savedShape?: string | null;
}

export type PlayerCardLockReason =
  | { readonly type: 'appearances'; readonly remaining: number }
  | { readonly type: 'reviews'; readonly remaining: number }
  | { readonly type: 'consent' };

export interface PlayerCardStat {
  readonly code: PlayerCardStatCode;
  readonly label: string;
  /** 잠겨 있으면 null -- 잠긴 능력치에 숫자를 붙이지 않는다. */
  readonly value: number | null;
  readonly unlocked: boolean;
  readonly lockedBy: PlayerCardLockReason | null;
}

export interface PlayerCard {
  readonly formulaVersion: number;
  readonly position: PlayerCardPosition;
  /** 등번호(표시 전용). 라인업 기록이 없으면 null. */
  readonly jerseyNumber: number | null;
  /** 열린 능력치가 하나도 없으면 null. 숫자를 짜내지 않는다. */
  readonly overall: number | null;
  readonly tier: PlayerCardTier;
  /** 카드 모양(코스메틱). 업적으로 열리며 능력치·등급과 무관하다. */
  readonly shape: PlayerCardShape;
  readonly appearances: number;
  readonly stats: readonly PlayerCardStat[];
  /** 열린 능력치 / 전체. 카드 완성도 표시에 쓴다. */
  readonly unlockedCount: number;
  /** 다음에 무엇을 하면 뭐가 열리는지 -- 한 줄 안내용. */
  readonly nextUnlock: { readonly code: PlayerCardStatCode; readonly reason: PlayerCardLockReason } | null;
}

const STAT_LABELS: Record<PlayerCardStatCode, string> = {
  SHO: '골',
  PAS: '도움',
  APP: '출전',
  SKI: '실력',
  MAN: '매너',
  PUN: '시간약속',
};

/**
 * 포지션별 가중치. 미드필더에게 도움이, 골키퍼에게 출전이 더 중요하다 --
 * 같은 가중치로 평균 내면 골키퍼가 구조적으로 낮게 나온다.
 */
const POSITION_WEIGHTS: Record<Exclude<PlayerCardPosition, null> | 'DEFAULT', Record<PlayerCardStatCode, number>> = {
  FW: { SHO: 1.4, PAS: 1.0, APP: 1.0, SKI: 1.2, MAN: 1.0, PUN: 1.0 },
  MF: { SHO: 1.0, PAS: 1.4, APP: 1.0, SKI: 1.2, MAN: 1.0, PUN: 1.0 },
  DF: { SHO: 0.6, PAS: 1.0, APP: 1.2, SKI: 1.2, MAN: 1.0, PUN: 1.0 },
  GK: { SHO: 0.4, PAS: 0.8, APP: 1.4, SKI: 1.2, MAN: 1.0, PUN: 1.0 },
  DEFAULT: { SHO: 1.0, PAS: 1.0, APP: 1.0, SKI: 1.0, MAN: 1.0, PUN: 1.0 },
};

/**
 * 1~99 로 자른다. 0 을 쓰지 않는 이유: 0 은 "측정됐고 최악"으로 읽히는데 실제로는
 * 대부분 "아직 안 나온 것"이고, 그건 자물쇠가 표현한다.
 */
function clamp99(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.max(1, Math.min(99, Math.round(raw)));
}

/**
 * 후기 평균(1~5)을 능력치로. 1점 → 39, 3점 → 69, 5점 → 99.
 * 하한을 39 로 잡은 건 후기 점수가 만점에 몰리는 경향 때문이다 -- 0 부터 펴면
 * 실제 분포가 상단 몇 칸에만 뭉친다.
 */
function fromReviewScore(average: number): number {
  return clamp99(((average - 1) / 4) * 60 + 39);
}

/** 카드 모양(코스메틱). 능력치·등급 계산에 관여하지 않는다. */
export type PlayerCardShape = 'rect' | 'shield';

/** 방패 모양이 열리는 최소 후기 수. */
export const MIN_REVIEWS_FOR_SHIELD_SHAPE = 10;

/**
 * 열려 있는 카드 모양.
 *
 * 기준을 **4항목 후기 건수**로 잡은 이유: 이미 SKI/MAN/PUN 잠금을 푸는 값이라
 * 카드에 보이는 숫자와 업적 조건이 같아진다. 별도 카운터를 만들면 "후기 12개인데
 * 왜 안 열리지" 같은 어긋남이 생긴다.
 */
export function unlockedCardShapes(reviewCount: number): readonly PlayerCardShape[] {
  return reviewCount >= MIN_REVIEWS_FOR_SHIELD_SHAPE ? ['rect', 'shield'] : ['rect'];
}

/**
 * 저장된 선택을 **매번 재판정**해서 실제 적용할 모양을 낸다.
 * 저장값을 그대로 믿지 않는 이유: 후기가 지워져 조건이 깨질 수 있고, 그때 화면만
 * 방패로 남아 있으면 "왜 나는 되는데 남은 안 되지"가 된다.
 */
export function resolveCardShape(saved: string | null | undefined, reviewCount: number): PlayerCardShape {
  const unlocked = unlockedCardShapes(reviewCount);
  return unlocked.includes(saved as PlayerCardShape) ? (saved as PlayerCardShape) : 'rect';
}

export function resolveTier(appearances: number): PlayerCardTier {
  if (appearances >= 30) return 'special';
  if (appearances >= 15) return 'gold';
  if (appearances >= 5) return 'silver';
  return 'bronze';
}

export function buildPlayerCard(input: PlayerCardInput): PlayerCard {
  const appearances = Math.max(0, input.appearances);
  const perGame = (total: number) => (appearances > 0 ? total / appearances : 0);
  const startedRatio = appearances > 0 ? Math.min(1, input.startedCount / appearances) : 0;

  // 기록 3항목은 2층(동의 필요) 데이터다. 동의가 없으면 출전 수와 무관하게 잠근다 --
  // 이 잠금이 곧 "기록 공개를 켜면 3개가 열려요" 라는 이 기능의 목적이다.
  const recordLock = (): PlayerCardLockReason | null => {
    // 연결된 기록이 없으면 동의는 해결책이 아니다. 그 사람에게 필요한 건 경기다.
    // 순서가 중요하다 -- 동의를 먼저 보면 0경기 사용자에게 거짓 약속을 하게 된다.
    if (!input.hasRecordLinks) return { type: 'appearances', remaining: Math.max(1, MIN_APPEARANCES_FOR_RATE_STATS - appearances) };
    if (!input.recordsConsented) return { type: 'consent' };
    return null;
  };
  const rateLock = (): PlayerCardLockReason | null => {
    const consent = recordLock();
    if (consent) return consent;
    if (appearances < MIN_APPEARANCES_FOR_RATE_STATS) {
      return { type: 'appearances', remaining: MIN_APPEARANCES_FOR_RATE_STATS - appearances };
    }
    return null;
  };
  const reviewLock = (): PlayerCardLockReason | null => {
    if (input.reviewCount < MIN_REVIEWS_FOR_METRIC_STATS) {
      return { type: 'reviews', remaining: MIN_REVIEWS_FOR_METRIC_STATS - input.reviewCount };
    }
    return null;
  };

  const appLock = (): PlayerCardLockReason | null => {
    // APP 은 1경기부터 열리므로, 연결이 없을 때의 안내도 "3경기"가 아니라 "1경기"다.
    if (!input.hasRecordLinks) return { type: 'appearances', remaining: 1 };
    if (!input.recordsConsented) return { type: 'consent' };
    if (appearances < 1) return { type: 'appearances', remaining: 1 };
    return null;
  };

  const makeStat = (
    code: PlayerCardStatCode,
    lock: PlayerCardLockReason | null,
    compute: () => number,
  ): PlayerCardStat => ({
    code,
    label: STAT_LABELS[code],
    value: lock === null ? compute() : null,
    unlocked: lock === null,
    lockedBy: lock,
  });

  // 후기 평균이 null 이면(집계 자체가 없으면) 표본 조건을 만족해도 계산할 게 없다.
  const reviewStat = (code: PlayerCardStatCode, average: number | null): PlayerCardStat => {
    const lock = average === null ? { type: 'reviews' as const, remaining: MIN_REVIEWS_FOR_METRIC_STATS } : reviewLock();
    return makeStat(code, lock, () => fromReviewScore(average as number));
  };

  const stats: PlayerCardStat[] = [
    makeStat('SHO', rateLock(), () => clamp99(30 + perGame(input.goals) * 55)),
    makeStat('PAS', rateLock(), () => clamp99(30 + perGame(input.assists) * 60)),
    makeStat('APP', appLock(), () => clamp99(35 + appearances * 2.2 + startedRatio * 15)),
    reviewStat('SKI', input.skillScore),
    reviewStat('MAN', input.mannerScore),
    reviewStat('PUN', input.punctualityScore),
  ];

  const weights = POSITION_WEIGHTS[input.position ?? 'DEFAULT'];
  const unlocked = stats.filter((stat) => stat.unlocked && stat.value !== null);

  // 잠긴 능력치는 평균에서 빠진다. 0 으로 넣으면 후기 없는 사람의 총점이 부당하게 낮아진다.
  let overall: number | null = null;
  if (unlocked.length > 0) {
    let weightedSum = 0;
    let weightTotal = 0;
    for (const stat of unlocked) {
      const weight = weights[stat.code];
      weightedSum += (stat.value as number) * weight;
      weightTotal += weight;
    }
    overall = clamp99(weightedSum / weightTotal);
  }

  // 안내는 "가장 가까운 하나"만 말한다. 세 개를 한 번에 나열하면 아무것도 안 읽힌다.
  const locked = stats.filter((stat) => !stat.unlocked && stat.lockedBy !== null);
  const distance = (reason: PlayerCardLockReason): number => {
    if (reason.type === 'consent') return 0; // 한 번 켜면 세 개가 동시에 열린다 -- 가장 가깝다.
    return reason.remaining;
  };
  const nearest = locked.reduce<PlayerCardStat | null>((best, stat) => {
    if (best === null) return stat;
    return distance(stat.lockedBy as PlayerCardLockReason) < distance(best.lockedBy as PlayerCardLockReason) ? stat : best;
  }, null);

  return {
    formulaVersion: PLAYER_CARD_FORMULA_VERSION,
    position: input.position,
    jerseyNumber: input.jerseyNumber,
    overall,
    tier: resolveTier(appearances),
    shape: resolveCardShape(input.savedShape, input.reviewCount),
    appearances,
    stats,
    unlockedCount: unlocked.length,
    nextUnlock: nearest === null ? null : { code: nearest.code, reason: nearest.lockedBy as PlayerCardLockReason },
  };
}
