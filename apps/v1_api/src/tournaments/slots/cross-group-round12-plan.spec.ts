import { REQUIRED_TIE_BREAK_ORDER } from '../competition-config/competition-config.presets';
import type { TieBreakOrder } from '../competition-config/tournament-tie-break-order';
import { compareCrossGroupTeams, validateCrossGroupSelection, type CrossGroupPreview, type CrossGroupSelection, type CrossGroupTeam } from './cross-group-round12-plan';

const GOALS_FOR_FIRST: TieBreakOrder = ['points', 'head_to_head', 'goals_for', 'goal_difference', 'fair_play', 'seeded_draw'];

function fixture(tieBreakOrder: TieBreakOrder = REQUIRED_TIE_BREAK_ORDER) {
  const preview: CrossGroupPreview = { version: 'v', tieBreakOrder, teams: [], ranks: [], targets: [] };
  for (let group = 0; group < 5; group += 1) {
    for (let rank = 1; rank <= 4; rank += 1) {
      const id = `g${group}r${rank}`;
      preview.teams.push({ registrationId: id, teamName: id, groupId: `g${group}`, groupName: `G${group}`,
        points: 12 - rank * 2, goalsFor: 10 - group, goalsAgainst: 2 });
      if (rank < 4) preview.ranks.push({ groupId: `g${group}`, groupName: `G${group}`, rank, candidates: [id] });
    }
  }
  const rankingOrder = [1, 2, 3].flatMap((rank) => Array.from({ length: 5 }, (_, group) => `g${group}r${rank}`));
  const input: CrossGroupSelection = { rankPicks: preview.ranks.map((rank) => rank.candidates[0]),
    rankingOrder, assignments: rankingOrder.slice(0, 12) };
  return { preview, input };
}
describe('5조→12강 진출 자격과 수동 배정', () => {
  it('1위 5팀 + 2위 5팀 + 3위 상위 2팀을 선정하고 진출팀 안의 교환을 허용한다', () => {
    const { preview, input } = fixture();
    [input.assignments[0], input.assignments[11]] = [input.assignments[11], input.assignments[0]];
    expect(validateCrossGroupSelection(preview, input)).toEqual(input.rankingOrder.slice(0, 12));
  });
  it('중복 배정, 탈락팀 삽입, 다른 조 순위 후보의 위조를 거절한다', () => {
    for (const mutate of [
      (input: CrossGroupSelection) => { input.assignments[11] = input.assignments[0]; },
      (input: CrossGroupSelection) => { input.assignments[11] = 'g4r3'; },
      (input: CrossGroupSelection) => { input.rankPicks[0] = 'g1r1'; },
    ]) {
      const { preview, input } = fixture(); mutate(input);
      expect(() => validateCrossGroupSelection(preview, input)).toThrow();
    }
  });
  it('조 간 성적을 무시한 시드 정렬과 서로 다른 조별 순위의 혼합을 거절한다', () => {
    for (const positions of [[0, 4], [0, 5]]) {
      const { preview, input } = fixture();
      [input.rankingOrder[positions[0]], input.rankingOrder[positions[1]]] =
        [input.rankingOrder[positions[1]], input.rankingOrder[positions[0]]];
      expect(() => validateCrossGroupSelection(preview, input)).toThrow();
    }
  });
  it('3위 진출선의 완전 동률은 운영자가 순서를 정해 진출팀을 선택할 수 있다', () => {
    const { preview, input } = fixture();
    const second = preview.teams.find((team) => team.registrationId === 'g1r3')!;
    const third = preview.teams.find((team) => team.registrationId === 'g2r3')!;
    third.goalsFor = second.goalsFor;
    [input.rankingOrder[11], input.rankingOrder[12]] = [input.rankingOrder[12], input.rankingOrder[11]];
    input.assignments = input.rankingOrder.slice(0, 12);
    expect(validateCrossGroupSelection(preview, input)).toContain('g2r3');
    expect(validateCrossGroupSelection(preview, input)).not.toContain('g1r3');
  });
});

const team = (points: number, goalsFor: number, goalsAgainst: number): CrossGroupTeam =>
  ({ registrationId: 'r', teamName: 't', groupId: 'g', groupName: 'G', points, goalsFor, goalsAgainst });

describe('조 간 비교는 대회의 동점 순서를 따른다', () => {
  it('기본 순서에서는 승점 → 득실차 → 다득점 비교와 모든 쌍에서 같다', () => {
    const legacy = (a: CrossGroupTeam, b: CrossGroupTeam) =>
      b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor;
    const values = [0, 1, 2, 3, 5];
    const teams = values.flatMap((points) => values.flatMap((goalsFor) => values.map((goalsAgainst) => team(points, goalsFor, goalsAgainst))));
    for (const a of teams) for (const b of teams) {
      expect(Math.sign(compareCrossGroupTeams(a, b, REQUIRED_TIE_BREAK_ORDER))).toBe(Math.sign(legacy(a, b)));
    }
  });
  it('득점이 득실차 앞이면 득실차가 큰 팀이 아니라 득점이 많은 팀이 앞선다', () => {
    const goalDifferenceLead = team(6, 5, 0);
    const goalsForLead = team(6, 9, 6);
    expect(compareCrossGroupTeams(goalDifferenceLead, goalsForLead, REQUIRED_TIE_BREAK_ORDER)).toBeLessThan(0);
    expect(compareCrossGroupTeams(goalDifferenceLead, goalsForLead, GOALS_FOR_FIRST)).toBeGreaterThan(0);
  });
  it('어떤 순서에서도 승점이 먼저이고, 앞에 놓인 맞대결·페어플레이는 건너뛰고 다음 기준으로 가른다', () => {
    expect(compareCrossGroupTeams(team(4, 1, 0), team(3, 90, 0), GOALS_FOR_FIRST)).toBeLessThan(0);
    const fairPlayFirst: TieBreakOrder = ['points', 'fair_play', 'head_to_head', 'goals_for', 'goal_difference', 'seeded_draw'];
    expect(compareCrossGroupTeams(team(4, 6, 3), team(4, 5, 0), fairPlayFirst)).toBeLessThan(0);
    expect(compareCrossGroupTeams(team(4, 5, 1), team(4, 5, 1), fairPlayFirst)).toBe(0);
  });
  it('득점 우선 순서의 성적 정렬은 받고 기본 순서의 득실차 정렬은 거절한다 (반대도 같다)', () => {
    // 1위 팀 득실차 g0 +8 · g2 +6 · g3 +5 · g4 +4 · g1 +3, 득점은 g1 13 · g0 10 · g2 8 · g3 7 · g4 6.
    const byGoalDifference = ['g0r1', 'g2r1', 'g3r1', 'g4r1', 'g1r1'];
    const byGoalsFor = ['g1r1', 'g0r1', 'g2r1', 'g3r1', 'g4r1'];
    const scenario = (order: TieBreakOrder, firstFive: string[]) => {
      const { preview, input } = fixture(order);
      Object.assign(preview.teams.find((entry) => entry.registrationId === 'g1r1')!, { goalsFor: 13, goalsAgainst: 10 });
      input.rankingOrder = [...firstFive, ...input.rankingOrder.slice(5)];
      input.assignments = input.rankingOrder.slice(0, 12);
      return { preview, input };
    };
    for (const [order, accepted, rejected] of [
      [REQUIRED_TIE_BREAK_ORDER, byGoalDifference, byGoalsFor],
      [GOALS_FOR_FIRST, byGoalsFor, byGoalDifference],
    ] as const) {
      const ok = scenario(order, [...accepted]);
      expect(validateCrossGroupSelection(ok.preview, ok.input)).toEqual(ok.input.rankingOrder.slice(0, 12));
      const bad = scenario(order, [...rejected]);
      expect(() => validateCrossGroupSelection(bad.preview, bad.input)).toThrow(/완전 동률인 팀만/);
    }
  });
});
