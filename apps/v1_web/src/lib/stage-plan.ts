import type { StagePlan } from '@/types/stage-plan';
export const initialStagePlan = (): StagePlan => ({ version: 1, stages: [{ key: 'main', name: '본선', pools: [{ key: 'main-league', name: '본선 리그', format: 'league', capacity: 4, legs: 1, sources: [] }] }] });
export function rankedLeagueStagePlan(): StagePlan {
  const pools = Array.from({ length: 5 }, (_, i) => ({ key: `pre-${i}`, name: `${String.fromCharCode(65 + i)}조`, format: 'league' as const, capacity: 4, legs: 1 as const, sources: [] }));
  return { version: 1, stages: [{ key: 'preliminary', name: '예선', pools }, { key: 'main', name: '본선', pools: Array.from({ length: 4 }, (_, i) => ({ key: `main-${i}`, name: `${i + 1}위 리그`, format: 'league' as const, capacity: 5, legs: 1 as const, sources: pools.map(p => ({ poolKey: p.key, rank: i + 1 })) })) }] };
}
export function stagePlanCounts(plan: StagePlan) {
  return { teams: plan.stages[0]?.pools.reduce((sum, p) => sum + p.capacity, 0) ?? 0,
    fixtures: plan.stages.flatMap(s => s.pools).reduce((sum, p) => sum + (p.format === 'league' ? p.capacity * (p.capacity - 1) / 2 * p.legs : p.capacity - 1), 0) };
}
export function stagePlanError(plan: StagePlan): string | null {
  if (!plan.stages.length || plan.stages.length > 8) return '단계는 1~8개로 설정해 주세요.';
  const { teams, fixtures } = stagePlanCounts(plan);
  if (!Number.isInteger(teams) || teams < 2 || fixtures > 240) return '참가팀은 2팀 이상, 총 경기는 240경기 이하로 구성해 주세요.';
  const stageNames = new Set<string>();
  const poolStages = new Map<string, { index: number; capacity: number; format: string }>();
  for (const [i, s] of plan.stages.entries()) {
    if (!s.name.trim() || stageNames.has(s.name.trim()) || !s.pools.length || s.pools.length > 16) return '모든 단계에 이름과 편성을 입력해 주세요.';
    stageNames.add(s.name.trim());
    if (s.pools.reduce((sum, p) => sum + p.capacity, 0) > teams) return '단계별 참가 자리 수가 모집 팀 수를 넘을 수 없어요.';
    const names = new Set<string>(), taken = new Set<string>();
    for (const p of s.pools) {
      if (!p.name.trim() || names.has(p.name.trim()) || !Number.isInteger(p.capacity) || p.capacity < 2 || p.capacity > 64) return '편성마다 중복 없는 이름과 2~64팀 정원을 입력해 주세요.';
      names.add(p.name.trim());
      if (i > 0 && p.sources.length !== p.capacity) return '다음 단계의 모든 자리에 진출 출처를 설정해 주세요.';
      for (const source of p.sources) {
        const origin = poolStages.get(source.poolKey), key = `${source.poolKey}:${source.rank}`;
        if (!origin || origin.index >= i || source.rank < 1 || source.rank > (origin.format === 'knockout' ? 2 : origin.capacity) || taken.has(key)) return '이전 편성의 순위를 중복 없이 연결해 주세요.';
        taken.add(key);
      }
      poolStages.set(p.key, { index: i, capacity: p.capacity, format: p.format });
    }
  }
  return null;
}
