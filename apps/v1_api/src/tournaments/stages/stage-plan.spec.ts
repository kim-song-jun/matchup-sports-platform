import { planCompetitionStages, validateStagePlan } from './stage-plan';
import type { StagePlanDto } from './stage-plan.dto';
function twenty(): StagePlanDto {
  const first = Array.from({ length: 5 }, (_, i) => ({ key: `pre${i}`, name: `${i + 1}조`, format: 'league' as const, capacity: 4, legs: 1 as const, sources: [] }));
  return { version: 1, stages: [{ key: 'pre', name: '예선', pools: first }, { key: 'main', name: '본선', pools: Array.from({ length: 4 }, (_, i) => ({ key: `main${i}`, name: `${i + 1}위 리그`, format: 'league' as const, capacity: 5, legs: 1 as const, sources: first.map(p => ({ poolKey: p.key, rank: i + 1 })) })) }] };
}
describe('stage composition planner', () => {
  it('20팀의 예선30/본선40경기를 만들고 각 팀 자리를 단계 범위로 분리한다', () => {
    const config = twenty(); expect(validateStagePlan(config, 20)).toMatchObject({ fixtures: 70, stages: 2 });
    const plan = planCompetitionStages(config);
    expect(plan.fixtures).toHaveLength(70); expect(plan.slots).toHaveLength(40);
    expect(plan.groups).toHaveLength(9);
    for (const stage of config.stages) for (const pool of stage.pools) {
      const groups = new Set(plan.groups.filter(g => g.poolKey === pool.key).map(g => g.key));
      const fixtures = plan.fixtures.filter(f => groups.has(f.groupKey));
      const entries = plan.slots.filter(s => s.groupKey && groups.has(s.groupKey));
      const pairs = fixtures.map(f => [f.homeSlotKey, f.awaySlotKey].sort().join('|'));
      expect(new Set(pairs).size).toBe(fixtures.length);
      for (const entry of entries) expect(fixtures.filter(f => f.homeSlotKey === entry.key || f.awaySlotKey === entry.key)).toHaveLength(pool.capacity - 1);
      expect(entries.every(e => e.entryScope === `stage:${stage.key}`)).toBe(true);
    }
  });
  it.each(['league', 'knockout'] as const)('예선 없이 본선 %s만 만들 수 있다', format => {
    const plan: StagePlanDto = { version: 1, stages: [{ key: 'main', name: '본선', pools: [{ key: 'main1', name: '본선', format, capacity: 5, legs: 1, sources: [] }] }] };
    expect(validateStagePlan(plan, 5).fixtures).toBe(format === 'league' ? 10 : 4);
    const generated = planCompetitionStages(plan); expect(generated.fixtures).toHaveLength(format === 'league' ? 10 : 4);
    expect(generated.slots).toHaveLength(5);
    if (format === 'knockout') expect(generated.byeSlots).toHaveLength(3);
  });
  it('3단계에서 풀리그와 토너먼트를 함께 편성한다', () => {
    const config = twenty(); config.stages[1].pools[0].format = 'knockout';
    config.stages.push({ key: 'final', name: '최종전', pools: [{ key: 'final1', name: '최종 리그', format: 'league', capacity: 2, legs: 2, sources: [{ poolKey: 'main0', rank: 1 }, { poolKey: 'main1', rank: 1 }] }] });
    expect(validateStagePlan(config, 20).stages).toBe(3); expect(planCompetitionStages(config).fixtures).toHaveLength(66);
  });
  it.each(['future', 'duplicate', 'capacity', 'unresolved'] as const)('잘못된 %s 출처는 저장 전에 거부한다', kind => {
    const config = twenty();
    if (kind === 'future') config.stages[1].pools[0].sources[0].poolKey = 'main1';
    if (kind === 'duplicate') config.stages[1].pools[0].sources[1] = config.stages[1].pools[0].sources[0];
    if (kind === 'capacity') config.stages[1].pools[0].sources[0].rank = 5;
    if (kind === 'unresolved') config.stages[1].pools[0].sources.pop();
    expect(() => validateStagePlan(config, 20)).toThrow();
  });
  it('대회 경기 수 상한을 넘기는 풀리그는 거부한다', () => {
    const config = twenty(); config.stages = [config.stages[0]]; config.stages[0].pools = [{ key: 'big', name: '리그', capacity: 64, format: 'league', legs: 1, sources: [] }];
    expect(() => validateStagePlan(config, 64)).toThrow();
  });
});
