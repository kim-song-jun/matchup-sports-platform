import type { CompetitionConfig } from './competition-config.types';

type Order = CompetitionConfig['tieBreak']['order'];

/**
 * 동점 순서 프리셋의 단일 소스(MD-QA #186). 저장은 언제나 순서 배열이고 이름은 화면 표시용이다 — 프리셋 정의가
 * 바뀌어도 이미 저장된 대회의 순서는 바뀌지 않는다. 웹 `lib/tournament-tie-break.ts` 의 사본은 이 파일을 읽는
 * 테스트(`tournament-tie-break.test.ts`)가 대조하므로, 키·순서를 바꾸면 두 곳을 같은 변경에서 고친다.
 * 첫 프리셋이 플랫폼 기본값이다.
 */
export const TOURNAMENT_TIE_BREAK_PRESETS = [
  {
    key: 'head_to_head_first',
    order: ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw'],
  },
  {
    key: 'goal_difference_first',
    order: ['points', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'fewest_goals_against', 'seeded_draw'],
  },
  {
    key: 'goals_for_first',
    order: ['points', 'goals_for', 'goal_difference', 'fewest_goals_against', 'head_to_head', 'fair_play', 'seeded_draw'],
  },
] as const satisfies ReadonlyArray<{ key: string; order: Order }>;

export type TournamentTieBreakPresetKey = (typeof TOURNAMENT_TIE_BREAK_PRESETS)[number]['key'];

/** 순서가 프리셋 하나와 같으면 그 키, 아니면 null(직접 정한 순서). */
export function matchTieBreakPreset(order: readonly string[]): TournamentTieBreakPresetKey | null {
  const preset = TOURNAMENT_TIE_BREAK_PRESETS.find(
    (candidate) => candidate.order.length === order.length && candidate.order.every((criterion, index) => criterion === order[index]),
  );
  return preset?.key ?? null;
}

/** 6강 결승 직행팀 비교 기준. 운영자 선택은 언제나 마지막이라 배열에 넣지 않는다. */
export type SixTeamDirectFinalCriterion = 'goals_for' | 'goal_difference' | 'fewest_goals_against';

/** 2026-10-28 확정 순서 — 순서를 고르지 않은 대회는 이 순서다. */
export const DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER: readonly SixTeamDirectFinalCriterion[] = ['goals_for', 'goal_difference', 'fewest_goals_against'];
