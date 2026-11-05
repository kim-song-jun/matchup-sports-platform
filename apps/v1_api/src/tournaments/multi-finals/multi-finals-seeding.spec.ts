import { crossGroupTopThree, validCrossGroupBracket, validCrossGroupTopThree, supportsCrossGroupTopThree } from './multi-finals-seeding';
import { planNamedFinals } from './multi-finals-plan';
const groups = ['A', 'B', 'C', 'D'].map(id => ({ id, ranks: [1, 2, 3].map(rank => `${id}${rank}`) }));
const rules = groups.flatMap(group => [1, 2, 3].map(rank => ({ groupId: group.id, rank })));
describe('4개 조 12팀 교차 시드 배치', () => {
  it('가능한 모든 추첨 결과가 실제 12강/8강 대진에서 같은 조를 피한다', () => {
    let possibilities = 0;
    crossGroupTopThree(groups, limit => { possibilities = limit; return 0; });
    expect(possibilities).toBeGreaterThan(1);
    for (let choice = 0; choice < possibilities; choice++) {
      const seeds = crossGroupTopThree(groups, () => choice);
      expect(seeds).toHaveLength(12); expect(new Set(seeds).size).toBe(12);
      expect(validCrossGroupTopThree(groups, seeds)).toBe(true);
      const plan = planNamedFinals([{ name: '프리미어', rules, thirdPlace: true, registrationIds: seeds }]);
      const graph = plan.fixtures.map(fixture => ({ id: fixture.key, phase: plan.groups.find(group => group.key === fixture.groupKey)!.phase,
        homeSlotId: fixture.homeSlotKey, awaySlotId: fixture.awaySlotKey,
        incoming: plan.edges.filter(edge => edge.targetFixtureKey === fixture.key).map(edge => ({ sourceId: edge.sourceFixtureKey, outcome: edge.outcome })) }));
      const slots = plan.slots.map(slot => ({ id: slot.key, position: slot.position }));
      expect(validCrossGroupBracket(groups, seeds, slots, graph)).toBe(true);
      const changed = structuredClone(graph);
      const quarters = changed.filter(fixture => fixture.phase === 'quarter');
      [quarters[0].incoming, quarters[1].incoming] = [quarters[1].incoming, quarters[0].incoming];
      expect(validCrossGroupBracket(groups, seeds, slots, changed)).toBe(false);
      expect(plan.byeSlots).toHaveLength(4);
      expect(plan.fixtures.filter(row => row.groupKey === 'final:0:16')).toHaveLength(4);
      const team = (key: string | null) => seeds[plan.slots.find(slot => slot.key === key)!.position - 1];
      for (const [index, group] of groups.entries()) {
        const bye = plan.slots.find(slot => seeds[slot.position - 1] === group.ranks[0])!;
        expect(bye.byeSortOrder).toBeDefined();
        const quarter = plan.fixtures.find(row => row.groupKey === 'final:0:8' && (row.homeSlotKey === bye.key || row.awaySlotKey === bye.key))!;
        const edge = plan.edges.find(row => row.targetFixtureKey === quarter.key)!;
        const round12 = plan.fixtures.find(row => row.key === edge.sourceFixtureKey)!;
        const players = [team(round12.homeSlotKey), team(round12.awaySlotKey)];
        expect(players).toContain(groups[(index + 1) % 4].ranks[1]);
        const third = players.find(id => id.endsWith('3'))!;
        expect(third[0]).not.toBe(group.id);
        expect(third[0]).not.toBe(groups[(index + 1) % 4].id);
      }
    }
  });
  it('저장된 배치 검증은 재추첨하지 않고 1위·2위 고정과 3위의 두 회피 조건을 검사한다', () => {
    const seeds = crossGroupTopThree(groups, () => 0);
    const changed = [...seeds]; [changed[0], changed[1]] = [changed[1], changed[0]];
    expect(validCrossGroupTopThree(groups, changed)).toBe(false);
    expect(validCrossGroupTopThree(groups, seeds.slice(0, 11))).toBe(false);
    const duplicate = [...seeds]; duplicate[11] = duplicate[10];
    expect(validCrossGroupTopThree(groups, duplicate)).toBe(false);
  });
  it('네 조의 1~3위 12자리에서만 새 방식을 제공한다', () => {
    const final = { name: '프리미어', rules, thirdPlace: false };
    expect(supportsCrossGroupTopThree(final, groups.map(g => g.id))).toBe(true);
    expect(supportsCrossGroupTopThree({ ...final, rules: rules.map(rule => ({ ...rule, rank: rule.rank + 3 })) }, groups.map(g => g.id))).toBe(false);
    expect(supportsCrossGroupTopThree(final, ['A', 'B', 'C'])).toBe(false);
    expect(supportsCrossGroupTopThree({ ...final, registrationIds: ['A1', 'B1'] }, groups.map(g => g.id))).toBe(false);
    expect(() => crossGroupTopThree(groups.slice(0, 3))).toThrow();
  });
});
