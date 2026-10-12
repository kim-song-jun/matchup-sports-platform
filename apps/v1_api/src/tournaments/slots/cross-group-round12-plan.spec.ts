import { validateCrossGroupSelection, type CrossGroupPreview, type CrossGroupSelection } from './cross-group-round12-plan';

function fixture() {
  const preview: CrossGroupPreview = { version: 'v', teams: [], ranks: [], targets: [] };
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
