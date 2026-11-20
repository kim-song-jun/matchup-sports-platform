import type { StagePlan } from '@/types/stage-plan';
export const initialStagePlan = (): StagePlan => ({ version: 1, stages: [{ key: 'main', name: '본선', pools: [{ key: 'main-league', name: '본선 리그', format: 'league', capacity: 4, legs: 1, sources: [] }] }] });
export function rankedLeagueStagePlan(): StagePlan {
  const pools = Array.from({ length: 5 }, (_, i) => ({ key: `pre-${i}`, name: `${String.fromCharCode(65 + i)}조`, format: 'league' as const, capacity: 4, legs: 1 as const, sources: [] }));
  return { version: 1, autoAdvance: true, stages: [{ key: 'preliminary', name: '예선', pools }, { key: 'main', name: '본선', pools: Array.from({ length: 4 }, (_, i) => ({ key: `main-${i}`, name: `${i + 1}위 리그`, format: 'league' as const, capacity: 5, legs: 1 as const, overallRankStart: i * 5 + 1, sources: pools.map(p => ({ poolKey: p.key, rank: i + 1 })) })) }] };
}
export function stagePlanCounts(plan: StagePlan) {
  return { teams: plan.stages[0]?.pools.reduce((sum, p) => sum + p.capacity, 0) ?? 0,
    fixtures: plan.stages.flatMap(s => s.pools).reduce((sum, p) => sum + (p.format === 'league' ? p.capacity * (p.capacity - 1) / 2 * p.legs : p.capacity - 1 + (p.thirdPlace ? 1 : 0)), 0) };
}
export function stagePlanError(plan: StagePlan): string | null {
  if (!plan.stages.length || plan.stages.length > 8) return '단계는 1~8개로 설정해 주세요.';
  const { teams, fixtures } = stagePlanCounts(plan);
  if (!Number.isInteger(teams) || teams < 2 || fixtures > 240) return '참가팀은 2팀 이상, 총 경기는 240경기 이하로 구성해 주세요.';
  const stageNames = new Set<string>();
  const poolStages = new Map<string, { index: number; capacity: number; format: string; thirdPlace?: boolean }>();
  const overallRanks = new Set<number>();
  for (const [i, s] of plan.stages.entries()) {
    if (!s.name.trim() || stageNames.has(s.name.trim()) || !s.pools.length || s.pools.length > 16) return '모든 단계에 이름과 편성을 입력해 주세요.';
    stageNames.add(s.name.trim());
    if (s.pools.reduce((sum, p) => sum + p.capacity, 0) > teams) return '단계별 참가 자리 수가 모집 팀 수를 넘을 수 없어요.';
    const names = new Set<string>(), taken = new Set<string>(), reserved = new Map<string, string>();
    for (const p of s.pools) {
      if (!p.name.trim() || names.has(p.name.trim()) || !Number.isInteger(p.capacity) || p.capacity < 2 || p.capacity > 64) return '편성마다 중복 없는 이름과 2~64팀 정원을 입력해 주세요.';
      names.add(p.name.trim());
      if (p.thirdPlace && (p.format !== 'knockout' || p.capacity < 4)) return '3·4위전은 4팀 이상 토너먼트에서 설정해 주세요.';
      if (p.sixTeamFinalBye && (p.format !== 'knockout' || p.capacity !== 6 || p.thirdPlace)) return '6강 결승 직행은 6팀 토너먼트·3위전 없음으로 설정해 주세요.';
      if (p.sixTeamDirectFinalOrder && (!p.sixTeamFinalBye || p.sixTeamDirectFinalOrder.length !== 3 || new Set(p.sixTeamDirectFinalOrder).size !== 3 || !['goals_for', 'goal_difference', 'fewest_goals_against'].every(key => p.sixTeamDirectFinalOrder!.some(value => value === key)))) return '6강 결승 직행 비교 기준 세 가지를 한 번씩 설정해 주세요.';
      if (p.overallRankStart !== undefined) {
        const count = p.format === 'league' ? p.capacity : p.thirdPlace ? 4 : 2;
        if (i !== plan.stages.length - 1 || !Number.isInteger(p.overallRankStart) || p.overallRankStart < 1 || p.overallRankStart + count - 1 > teams) return '전체 순위 구간은 마지막 단계에서 참가팀 수 안으로 설정해 주세요.';
        for (let r = p.overallRankStart; r < p.overallRankStart + count; r++) { if (overallRanks.has(r)) return '전체 순위 구간이 겹치지 않게 설정해 주세요.'; overallRanks.add(r); }
      }
      if (i > 0 && p.sources.length !== p.capacity) return '다음 단계의 모든 자리에 진출 출처를 설정해 주세요.';
      for (const source of p.sources) {
        const origins = source.comparisonPoolKeys ?? [source.poolKey];
        const family = source.comparisonPoolKeys ? `wildcard:${[...origins].sort().join(',')}:${source.rank}` : 'direct';
        if (source.comparisonPoolKeys && new Set(origins.map(key => poolStages.get(key)?.index)).size !== 1) return '조간 비교는 같은 이전 단계의 풀리그끼리 설정해 주세요.';
        if (source.comparisonPoolKeys && (new Set(origins).size !== origins.length || origins.length < 2 || !origins.includes(source.poolKey) || !Number.isInteger(source.comparisonPosition) || source.comparisonPosition! < 1 || source.comparisonPosition! > origins.length)) return '조간 비교 편성과 비교 순위를 확인해 주세요.';
        for (const originKey of origins) {
          const origin = poolStages.get(originKey), token = `${originKey}:${source.rank}`, existing = reserved.get(token);
          if (!origin || origin.index >= i || source.rank < 1 || source.rank > (origin.format === 'knockout' ? origin.thirdPlace ? 4 : 2 : origin.capacity) || source.comparisonPoolKeys && origin.format !== 'league' || existing && (family === 'direct' || existing !== family)) return '이전 편성의 순위를 중복 없이 연결해 주세요.';
          reserved.set(token, family);
        }
        const key = source.comparisonPoolKeys ? `${family}:${source.comparisonPosition}` : `${source.poolKey}:${source.rank}`;
        if (taken.has(key)) return '같은 순위 출처를 중복 연결할 수 없어요.';
        taken.add(key);
      }
      if (p.seeding === 'cross_group_top_three') {
        const keys = [...new Set(p.sources.map(source => source.poolKey))];
        if (p.format !== 'knockout' || p.capacity !== 12 || keys.length !== 4 || p.sources.some(source => source.comparisonPoolKeys) || !keys.every(key => [1, 2, 3].every(rank => p.sources.filter(source => source.poolKey === key && source.rank === rank).length === 1))) return '교차 시드는 4개 조 1~3위가 진출하는 12팀 토너먼트에서 설정해 주세요.';
      }
      poolStages.set(p.key, { index: i, capacity: p.capacity, format: p.format, thirdPlace: p.thirdPlace });
    }
  }
  return null;
}
