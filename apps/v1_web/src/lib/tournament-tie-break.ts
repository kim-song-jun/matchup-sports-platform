import type { V1TournamentTieBreakCriterion, V1TournamentTieBreakOrder } from '@/types/api';

/**
 * 정규 대회 동점 순서의 한국어 라벨 단일 소스. `Record<유니온, string>` 이라 서버 기준이 늘면 여기가
 * 컴파일 에러가 난다. 정규 리그의 순서와 라벨은 `league-tie-break-labels.ts` 가 따로 맡는다.
 */
export const TOURNAMENT_TIE_BREAK_LABELS: Record<V1TournamentTieBreakCriterion, string> = {
  points: '승점',
  head_to_head: '맞대결',
  goal_difference: '득실차',
  goals_for: '다득점',
  fair_play: '페어플레이',
  seeded_draw: '추첨',
};

/** 서버 `REQUIRED_TIE_BREAK_ORDER` 의 사본 — 순서를 안 고른 대회의 기준이다. */
export const DEFAULT_TOURNAMENT_TIE_BREAK_ORDER: V1TournamentTieBreakOrder = [
  'points',
  'head_to_head',
  'goal_difference',
  'goals_for',
  'fair_play',
  'seeded_draw',
];

/**
 * 서버 응답의 순서를 폼용 복사본으로 꺼낸다. 순서를 모르는 응답(배포 직후 옛 서버·정규 리그)은 기본 순서다 —
 * 서버가 항상 6칸을 싣는 대회 응답에서는 이 분기가 타지 않는다.
 */
export function tieBreakOrderOf(source: { tieBreakOrder?: readonly V1TournamentTieBreakCriterion[] | null }): V1TournamentTieBreakOrder {
  return [...(source.tieBreakOrder ?? DEFAULT_TOURNAMENT_TIE_BREAK_ORDER)];
}

/** 첫 칸(승점)과 마지막 칸(추첨)은 고정이고 그 사이 네 칸만 움직인다. */
export function isMovableTieBreakIndex(order: readonly V1TournamentTieBreakCriterion[], index: number): boolean {
  return index > 0 && index < order.length - 1;
}

export function sameTieBreakOrder(
  left: readonly V1TournamentTieBreakCriterion[],
  right: readonly V1TournamentTieBreakCriterion[],
): boolean {
  return left.length === right.length && left.every((criterion, index) => criterion === right[index]);
}

/** 가운데 칸을 한 칸 위(-1)/아래(1)로 옮긴다. 고정 칸을 건드리거나 끝을 넘으면 그대로 돌려준다. */
export function moveTieBreakCriterion(
  order: readonly V1TournamentTieBreakCriterion[],
  index: number,
  direction: -1 | 1,
): V1TournamentTieBreakOrder {
  const target = index + direction;
  if (!isMovableTieBreakIndex(order, index) || !isMovableTieBreakIndex(order, target)) return [...order];
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * 라벨을 모르는 값은 버린다 — 그대로 찍으면 사용자가 내부 식별자를 읽게 된다. 여기까지 모르는 값이
 * 오는 경로는 "새 서버 + 오래된 캐시 번들" 하나뿐이라 안내 줄이 조금 짧은 편이 낫다.
 */
export function formatTournamentTieBreakRule(order: readonly string[]): string {
  const labels: Record<string, string | undefined> = TOURNAMENT_TIE_BREAK_LABELS;
  return order
    .map((criterion) => labels[criterion])
    .filter((label): label is string => label !== undefined)
    .join(' → ');
}
