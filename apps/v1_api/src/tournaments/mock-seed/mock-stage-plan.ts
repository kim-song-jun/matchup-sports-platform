import type { StagePlanDto } from '../stages/stage-plan.dto';

/** Editable starting point: balanced preliminary leagues, then a top-two knockout. */
export function mockStagePlan(teamCount: number): StagePlanDto {
  const poolCount = Math.ceil(teamCount / 4);
  const pools = Array.from({ length: poolCount }, (_, index) => ({
    key: `pre-${index}`, name: `${String.fromCharCode(65 + index)}조`,
    format: 'league' as const,
    capacity: Math.floor(teamCount / poolCount) + (index < teamCount % poolCount ? 1 : 0),
    legs: 1 as const, sources: [],
  }));
  return { version: 1, autoAdvance: false, stages: [
    { key: 'preliminary', name: '예선', pools },
    { key: 'main', name: '본선', pools: [{
      key: 'main-knockout', name: '본선 토너먼트', format: 'knockout',
      capacity: poolCount * 2, legs: 1,
      sources: [1, 2].flatMap(rank => pools.map(pool => ({ poolKey: pool.key, rank }))),
    }] },
  ] };
}
