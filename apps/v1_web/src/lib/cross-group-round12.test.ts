import { describe, expect, it } from 'vitest';
import { compareCrossGroupTeams, crossGroupRecommendation, formatCrossGroupRule, swapRound12Assignment } from './cross-group-round12';
import { DEFAULT_TOURNAMENT_TIE_BREAK_ORDER } from '@/lib/tournament-tie-break';
import type { V1TournamentTieBreakOrder } from '@/types/api';
import type { CrossGroupPreview, CrossGroupTeam } from '@/types/cross-group-round12';

const DEFAULT_ORDER = DEFAULT_TOURNAMENT_TIE_BREAK_ORDER;
const GOALS_FOR_FIRST: V1TournamentTieBreakOrder = ['points', 'head_to_head', 'goals_for', 'goal_difference', 'fair_play', 'fewest_goals_against', 'seeded_draw'];
const entry = (points: number, goalsFor: number, goalsAgainst: number, registrationId = 'a'): CrossGroupTeam =>
  ({ registrationId, teamName: registrationId, groupId: 'g', groupName: 'g', points, goalsFor, goalsAgainst });

it('승점→골득실→다득점으로 비교하고 완전 동률은 0으로 남긴다', () => {
  const team = entry(6, 5, 2);
  expect(compareCrossGroupTeams(team, { ...team, points: 3, goalsFor: 100 }, DEFAULT_ORDER)).toBeLessThan(0);
  expect(compareCrossGroupTeams(team, { ...team, goalsAgainst: 3 }, DEFAULT_ORDER)).toBeLessThan(0);
  expect(compareCrossGroupTeams(team, { ...team, goalsFor: 4, goalsAgainst: 1 }, DEFAULT_ORDER)).toBeLessThan(0);
  expect(compareCrossGroupTeams(team, { ...team, registrationId: 'other' }, DEFAULT_ORDER)).toBe(0);
});
describe('대회의 동점 순서를 따른다', () => {
  it('기본 순서에서는 승점→득실차→다득점 비교와 모든 쌍에서 같다', () => {
    const legacy = (a: CrossGroupTeam, b: CrossGroupTeam) =>
      b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor;
    const values = [0, 1, 2, 3, 5];
    const teams = values.flatMap((points) => values.flatMap((goalsFor) => values.map((goalsAgainst) => entry(points, goalsFor, goalsAgainst))));
    for (const a of teams) for (const b of teams) {
      expect(Math.sign(compareCrossGroupTeams(a, b, DEFAULT_ORDER))).toBe(Math.sign(legacy(a, b)));
    }
  });
  it('득점이 득실차 앞이면 득실차가 큰 팀이 아니라 득점이 많은 팀이 앞선다', () => {
    const goalDifferenceLead = entry(6, 5, 0);
    const goalsForLead = entry(6, 9, 6);
    expect(compareCrossGroupTeams(goalDifferenceLead, goalsForLead, DEFAULT_ORDER)).toBeLessThan(0);
    expect(compareCrossGroupTeams(goalDifferenceLead, goalsForLead, GOALS_FOR_FIRST)).toBeGreaterThan(0);
  });
  it('어떤 순서에서도 승점이 먼저이고, 앞에 놓인 맞대결·페어플레이는 건너뛰고 다음 기준으로 가른다', () => {
    expect(compareCrossGroupTeams(entry(4, 1, 0), entry(3, 90, 0), GOALS_FOR_FIRST)).toBeLessThan(0);
    const fairPlayFirst: V1TournamentTieBreakOrder = ['points', 'fair_play', 'head_to_head', 'goals_for', 'goal_difference', 'seeded_draw'];
    expect(compareCrossGroupTeams(entry(4, 6, 3), entry(4, 5, 0), fairPlayFirst)).toBeLessThan(0);
    expect(compareCrossGroupTeams(entry(4, 5, 1), entry(4, 5, 1), fairPlayFirst)).toBe(0);
  });
  it('안내 문구는 실제로 쓰는 기준만 그 순서대로 보여 준다', () => {
    expect(formatCrossGroupRule(DEFAULT_ORDER)).toBe('승점 → 득실차 → 다득점');
    expect(formatCrossGroupRule(GOALS_FOR_FIRST)).toBe('승점 → 다득점 → 득실차');
    expect(formatCrossGroupRule(['points', 'fair_play', 'head_to_head', 'goals_for', 'goal_difference', 'seeded_draw'])).toBe('승점 → 다득점 → 득실차');
  });
});
it('선택된 팀을 다른 자리에 고르면 중복 없이 맞바꾼다', () => {
  expect(swapRound12Assignment(['a', 'b', 'c'], 0, 'c')).toEqual(['c', 'b', 'a']);
});
describe('12강 추천', () => {
  it('조별 순위 선택이 끝나야 1위5→2위5→3위5 순으로 비교한다', () => {
    const preview: CrossGroupPreview = { version: 'v', tieBreakOrder: DEFAULT_ORDER, ranks: [], teams: [], targets: [] };
    for (let group = 0; group < 5; group++) for (let rank = 1; rank <= 3; rank++) {
      const id = `g${group}r${rank}`;
      preview.ranks.push({ groupId: String(group), groupName: String(group), rank, candidates: [id] });
      preview.teams.push({ registrationId: id, teamName: id, groupId: String(group), groupName: String(group),
        points: group, goalsFor: 0, goalsAgainst: 0 });
    }
    const picks = preview.ranks.map((row) => row.candidates[0]);
    const result = crossGroupRecommendation(preview, picks)!;
    expect(result.slice(0, 5)).toEqual(['g4r1', 'g3r1', 'g2r1', 'g1r1', 'g0r1']);
    expect(result.slice(10, 12)).toEqual(['g4r3', 'g3r3']);
    expect(crossGroupRecommendation(preview, picks.map((id, index) => index === 0 ? '' : id))).toBeNull();
    expect(crossGroupRecommendation(preview, picks.map((id, index) => index === 0 ? picks[1] : id))).toBeNull();
  });
  it('같은 선택도 대회의 동점 순서에 따라 추천 순서가 달라진다', () => {
    // 같은 승점의 조별 성적(득점/실점): g0 10/2 · g1 4/0 · g2 3/0 · g3 2/0 · g4 12/12.
    const stats = [[10, 2], [4, 0], [3, 0], [2, 0], [12, 12]];
    const previewFor = (tieBreakOrder: V1TournamentTieBreakOrder): CrossGroupPreview => {
      const preview: CrossGroupPreview = { version: 'v', tieBreakOrder, ranks: [], teams: [], targets: [] };
      for (let group = 0; group < 5; group++) for (let rank = 1; rank <= 3; rank++) {
        const id = `g${group}r${rank}`;
        preview.ranks.push({ groupId: String(group), groupName: String(group), rank, candidates: [id] });
        preview.teams.push(entry(3, stats[group][0], stats[group][1], id));
      }
      return preview;
    };
    const firstFive = (order: V1TournamentTieBreakOrder) => {
      const preview = previewFor(order);
      return crossGroupRecommendation(preview, preview.ranks.map((row) => row.candidates[0]))!.slice(0, 5);
    };
    expect(firstFive(DEFAULT_ORDER)).toEqual(['g0r1', 'g1r1', 'g2r1', 'g3r1', 'g4r1']);
    expect(firstFive(GOALS_FOR_FIRST)).toEqual(['g4r1', 'g0r1', 'g1r1', 'g2r1', 'g3r1']);
  });
});
