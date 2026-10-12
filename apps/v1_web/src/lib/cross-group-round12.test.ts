import { describe, expect, it } from 'vitest';
import { compareCrossGroupTeams, crossGroupRecommendation, swapRound12Assignment } from './cross-group-round12';
import type { CrossGroupPreview, CrossGroupTeam } from '@/types/cross-group-round12';

it('승점→골득실→다득점으로 비교하고 완전 동률은 0으로 남긴다', () => {
  const team: CrossGroupTeam = { registrationId: 'a', teamName: 'a', groupId: 'g', groupName: 'g', points: 6, goalsFor: 5, goalsAgainst: 2 };
  expect(compareCrossGroupTeams(team, { ...team, points: 3, goalsFor: 100 })).toBeLessThan(0);
  expect(compareCrossGroupTeams(team, { ...team, goalsAgainst: 3 })).toBeLessThan(0);
  expect(compareCrossGroupTeams(team, { ...team, goalsFor: 4, goalsAgainst: 1 })).toBeLessThan(0);
  expect(compareCrossGroupTeams(team, { ...team, registrationId: 'other' })).toBe(0);
});
it('선택된 팀을 다른 자리에 고르면 중복 없이 맞바꾼다', () => {
  expect(swapRound12Assignment(['a', 'b', 'c'], 0, 'c')).toEqual(['c', 'b', 'a']);
});
describe('12강 추천', () => {
  it('조별 순위 선택이 끝나야 1위5→2위5→3위5 순으로 비교한다', () => {
    const preview: CrossGroupPreview = { version: 'v', ranks: [], teams: [], targets: [] };
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
});
