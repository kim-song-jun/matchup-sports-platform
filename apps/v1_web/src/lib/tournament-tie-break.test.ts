import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER,
  DEFAULT_TOURNAMENT_TIE_BREAK_ORDER,
  TOURNAMENT_TIE_BREAK_PRESETS,
  describeTieBreakRule,
  formatSixTeamDirectFinalRule,
  formatTournamentTieBreakRule,
  matchTieBreakPreset,
  moveSixTeamCriterion,
  moveTieBreakCriterion,
  sameTieBreakOrder,
  tieBreakOrderOf,
} from './tournament-tie-break';

describe('moveTieBreakCriterion', () => {
  it('가운데 칸을 한 칸 아래로 옮기면 바로 아래 칸과 자리를 바꾼다', () => {
    expect(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 1, 1)).toEqual([
      'points', 'goal_difference', 'head_to_head', 'goals_for', 'fair_play', 'fewest_goals_against', 'seeded_draw',
    ]);
  });

  it('가운데 칸을 한 칸 위로 옮기면 바로 위 칸과 자리를 바꾼다', () => {
    expect(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 4, -1)).toEqual([
      'points', 'head_to_head', 'goal_difference', 'fair_play', 'goals_for', 'fewest_goals_against', 'seeded_draw',
    ]);
  });

  it('승점 아래로 올리거나 추첨 위로 내리면 고정 칸을 건드리지 않고 그대로다', () => {
    expect(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 1, -1)).toEqual(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER);
    expect(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 5, 1)).toEqual(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER);
  });

  it('고정 칸 자체는 움직이지 않는다', () => {
    expect(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 0, 1)).toEqual(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER);
    expect(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 6, -1)).toEqual(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER);
  });

  it('받은 배열을 바꾸지 않는다', () => {
    const before = [...DEFAULT_TOURNAMENT_TIE_BREAK_ORDER];
    moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 2, 1);
    expect(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER).toEqual(before);
  });
});

describe('sameTieBreakOrder', () => {
  it('같은 순서만 같다고 본다', () => {
    expect(sameTieBreakOrder(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, [...DEFAULT_TOURNAMENT_TIE_BREAK_ORDER])).toBe(true);
    expect(sameTieBreakOrder(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 1, 1))).toBe(false);
  });
});

describe('formatTournamentTieBreakRule', () => {
  it('순서대로 한국어 라벨을 화살표로 잇는다', () => {
    expect(formatTournamentTieBreakRule(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER)).toBe('승점 → 맞대결 → 득실차 → 다득점 → 페어플레이 → 추첨');
  });

  it('라벨을 모르는 값은 내부 식별자를 노출하지 않고 버린다', () => {
    expect(formatTournamentTieBreakRule(['points', 'mystery', 'seeded_draw'])).toBe('승점 → 추첨');
  });
});

describe('최소 실점 표기', () => {
  it('득실차·다득점이 앞에 있으면 최소 실점은 순위를 못 바꾸므로 생략한다', () => {
    expect(formatTournamentTieBreakRule(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER)).not.toContain('최소 실점');
  });

  it('득실차나 다득점 앞에 있으면 보여 준다', () => {
    expect(formatTournamentTieBreakRule(['points', 'fewest_goals_against', 'goal_difference', 'goals_for', 'head_to_head', 'fair_play', 'seeded_draw']))
      .toBe('승점 → 최소 실점 → 득실차 → 다득점 → 맞대결 → 페어플레이 → 추첨');
  });
});

describe('tieBreakOrderOf', () => {
  it('옛 6칸 순서는 추첨 바로 앞에 최소 실점을 넣어 7칸으로 읽는다', () => {
    expect(tieBreakOrderOf({ tieBreakOrder: ['points', 'head_to_head', 'goal_difference', 'goals_for', 'fair_play', 'seeded_draw'] }))
      .toEqual(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER);
  });

  it('순서를 모르면 기본 순서다', () => {
    expect(tieBreakOrderOf({})).toEqual(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER);
  });
});

describe('프리셋', () => {
  it('프리셋과 같은 순서는 이름을 돌려주고 아니면 null 이다', () => {
    expect(matchTieBreakPreset(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER)?.name).toBe('맞대결 우선');
    expect(matchTieBreakPreset(moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 3, 1))).toBeNull();
  });

  it('프리셋 이름이 있으면 안내 문장 앞에 붙인다', () => {
    expect(describeTieBreakRule(TOURNAMENT_TIE_BREAK_PRESETS[2].order))
      .toBe('다득점 우선 규정이에요. 동점이면 다득점 → 득실차 → 맞대결 → 페어플레이 → 추첨 순서로 정해요.');
  });

  it('직접 정한 순서는 순서 문장만 보여 준다', () => {
    const custom = moveTieBreakCriterion(DEFAULT_TOURNAMENT_TIE_BREAK_ORDER, 3, 1);
    expect(describeTieBreakRule(custom)).toBe('동점이면 맞대결 → 득실차 → 페어플레이 → 다득점 → 추첨 순서로 정해요.');
  });
});

describe('6강 직행 순서', () => {
  it('기본 순서를 운영자 선택으로 닫는다', () => {
    expect(formatSixTeamDirectFinalRule()).toBe('다득점 → 득실차 → 최소 실점 → 운영자 선택');
    expect(formatSixTeamDirectFinalRule(['goal_difference', 'goals_for', 'fewest_goals_against'])).toBe('득실차 → 다득점 → 최소 실점 → 운영자 선택');
  });

  it('세 칸 모두 위아래로 움직인다', () => {
    expect(moveSixTeamCriterion(DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER, 0, 1)).toEqual(['goal_difference', 'goals_for', 'fewest_goals_against']);
    expect(moveSixTeamCriterion(DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER, 0, -1)).toEqual([...DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER]);
  });
});

describe('서버 프리셋 사본 대조', () => {
  const source = readFileSync(resolve(process.cwd(), '../v1_api/src/tournaments/competition-config/tournament-tie-break-presets.ts'), 'utf8');
  const quoted = (block: string) => [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);

  it('프리셋 키와 순서가 서버와 같다', () => {
    const entries = [...source.matchAll(/key:\s*'([^']+)',\s*order:\s*\[([^\]]*)\]/g)].map((match) => ({ key: match[1], order: quoted(match[2]) }));

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map((entry) => entry.key)).toEqual(TOURNAMENT_TIE_BREAK_PRESETS.map((preset) => preset.key));
    for (const entry of entries) {
      expect(TOURNAMENT_TIE_BREAK_PRESETS.find((preset) => preset.key === entry.key)?.order).toEqual(entry.order);
    }
  });

  it('6강 직행 기본 순서가 서버와 같다', () => {
    const body = source.match(/DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER[^=]*=\s*\[([^\]]*)\]/)?.[1];
    const parsed = body === undefined ? [] : quoted(body);

    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed).toEqual([...DEFAULT_SIX_TEAM_DIRECT_FINAL_ORDER]);
  });
});
