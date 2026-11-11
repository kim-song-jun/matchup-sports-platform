import type { V1SixTeamCriterion, V1TournamentTieBreakCriterion, V1TournamentTieBreakOrder } from '@/types/api';

/**
 * 정규 대회 동점 순서의 한국어 라벨 단일 소스. `Record<유니온, string>` 이라 서버 기준이 늘면 여기가
 * 컴파일 에러가 난다. 정규 리그의 순서와 라벨은 `league-tie-break-labels.ts` 가 따로 맡는다.
 */
export const TOURNAMENT_TIE_BREAK_LABELS: Record<V1TournamentTieBreakCriterion, string> = {
  points: '승점',
  head_to_head: '맞대결',
  goal_difference: '득실차',
  goals_for: '다득점',
  fewest_goals_against: '최소 실점',
  fair_play: '페어플레이',
  seeded_draw: '추첨',
};

export type TournamentTieBreakPresetKey = 'head_to_head_first' | 'goal_difference_first' | 'goals_for_first';

/**
 * 서버 `tournament-tie-break-presets.ts` 의 사본 — 이 파일을 읽는 `tournament-tie-break.test.ts` 가 대조한다.
 * 저장은 언제나 순서 배열이고 이름은 화면 표시용이다. 첫 프리셋이 플랫폼 기본값이다.
 */
export const TOURNAMENT_TIE_BREAK_PRESETS: ReadonlyArray<{ key: TournamentTieBreakPresetKey; name: string; order: V1TournamentTieBreakOrder }> = [
  {
    key: 'head_to_head_first',
    name: '맞대결 우선',
    order: ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw'],
  },
  {
    key: 'goal_difference_first',
    name: '득실차 우선',
    order: ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'fewest_goals_against', 'seeded_draw'],
  },
  {
    key: 'goals_for_first',
    name: '다득점 우선',
    order: ['points', 'goals_for', 'goal_difference', 'fewest_goals_against', 'head_to_head', 'fair_play', 'seeded_draw'],
  },
];

/** 서버 `DEFAULT_TIE_BREAK_ORDER` 의 사본 — 순서를 안 고른 대회의 기준(첫 프리셋)이다. */
export const DEFAULT_TOURNAMENT_TIE_BREAK_ORDER: V1TournamentTieBreakOrder = [...TOURNAMENT_TIE_BREAK_PRESETS[0].order];

/** 직접 정한 순서를 부르는 이름. */
export const CUSTOM_TIE_BREAK_NAME = '직접 정한 순서';

/** 순서가 프리셋 하나와 같으면 그 프리셋, 아니면 null(직접 정한 순서). */
export function matchTieBreakPreset(order: readonly string[]): (typeof TOURNAMENT_TIE_BREAK_PRESETS)[number] | null {
  return TOURNAMENT_TIE_BREAK_PRESETS.find((preset) => sameOrder(preset.order, order)) ?? null;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((criterion, index) => criterion === right[index]);
}

/** 6칸(MD-QA #186 이전) 순서는 추첨 바로 앞에 최소 실점이 들어간 것으로 읽는다 — 서버 정규화와 같다. */
function normalizeLegacyOrder(order: readonly V1TournamentTieBreakCriterion[]): V1TournamentTieBreakOrder {
  if (order.length === DEFAULT_TOURNAMENT_TIE_BREAK_ORDER.length - 1 && !order.includes('fewest_goals_against')) {
    const last = order.length - 1;
    return [...order.slice(0, last), 'fewest_goals_against', ...order.slice(last)];
  }
  return [...order];
}

/**
 * 서버 응답의 순서를 폼용 복사본으로 꺼낸다. 순서를 모르는 응답(배포 직후 옛 서버·정규 리그)은 기본 순서다 —
 * 서버가 항상 7칸을 싣는 대회 응답에서는 이 분기가 타지 않는다.
 */
export function tieBreakOrderOf(source: { tieBreakOrder?: readonly V1TournamentTieBreakCriterion[] | null }): V1TournamentTieBreakOrder {
  return normalizeLegacyOrder(source.tieBreakOrder ?? DEFAULT_TOURNAMENT_TIE_BREAK_ORDER);
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
 * 안내 줄에 보여 줄 기준만 남긴다. 득실차·다득점이 모두 앞에 있으면 최소 실점은 순위를 바꾸지 못하므로 생략한다.
 * 라벨을 모르는 값도 버린다 — 그대로 찍으면 사용자가 내부 식별자를 읽게 된다("새 서버 + 오래된 캐시 번들").
 */
export function formatTournamentTieBreakRule(order: readonly string[]): string {
  const labels: Record<string, string | undefined> = TOURNAMENT_TIE_BREAK_LABELS;
  const gd = order.indexOf('goal_difference');
  const gf = order.indexOf('goals_for');
  const redundant = (criterion: string, index: number) =>
    criterion === 'fewest_goals_against' && gd >= 0 && gd < index && gf >= 0 && gf < index;
  return order
    .filter((criterion, index) => !redundant(criterion, index))
    .map((criterion) => labels[criterion])
    .filter((label): label is string => label !== undefined)
    .join(' → ');
}

/** 순위표 안내를 이름(프리셋과 같을 때만)과 순서 문장으로 나눈다 — 화면이 이름만 굵게 쓰려고 쓴다. */
export function describeTieBreakRuleParts(order: readonly string[]): { presetName: string | null; sentence: string } {
  const full = normalizeLegacyOrder(order as readonly V1TournamentTieBreakCriterion[]);
  const rule = formatTournamentTieBreakRule(full.filter((criterion) => criterion !== 'points'));
  return { presetName: matchTieBreakPreset(full)?.name ?? null, sentence: `동점이면 ${rule} 순서로 정해요.` };
}

/** 순위표 안내 문장. 프리셋과 같으면 이름을 앞세운다. */
export function describeTieBreakRule(order: readonly string[]): string {
  const { presetName, sentence } = describeTieBreakRuleParts(order);
  return presetName ? `${presetName} 규정이에요. ${sentence}` : sentence;
}

/** 프리셋 이름, 없으면 「직접 정한 순서」. */
export function tieBreakOrderName(order: readonly string[]): string {
  return matchTieBreakPreset(order)?.name ?? CUSTOM_TIE_BREAK_NAME;
}

export const SIX_TEAM_CRITERION_LABELS: Record<V1SixTeamCriterion, string> = {
  goals_for: '다득점',
  goal_difference: '득실차',
  fewest_goals_against: '최소 실점',
};

/** 서버 `DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER` 의 사본. */
export const DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER: readonly V1SixTeamCriterion[] = ['goals_for', 'goal_difference', 'fewest_goals_against'];

/** 6강 직행 순서를 「다득점 → 득실차 → 최소 실점 → 운영자 선택」 로 적는다. 순서를 모르면 기본 순서다. */
export function formatSixTeamDirectFinalRule(order?: readonly V1SixTeamCriterion[] | null): string {
  const source = order && order.length > 0 ? order : DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER;
  return [...source.map((criterion) => SIX_TEAM_CRITERION_LABELS[criterion]), '운영자 선택'].join(' → ');
}

/** 가운데 칸 이동용 — 6강 순서는 세 칸 모두 움직인다. */
export function moveSixTeamCriterion(order: readonly V1SixTeamCriterion[], index: number, direction: -1 | 1): V1SixTeamCriterion[] {
  const target = index + direction;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) return [...order];
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function sameSixTeamOrder(left: readonly V1SixTeamCriterion[], right: readonly V1SixTeamCriterion[]): boolean {
  return sameOrder(left, right);
}
