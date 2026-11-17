import type { StagePlanDto } from './stage-plan.dto';

/** Transitive dependencies, rather than display order, constrain independent pools. */
export function stagePoolDependsOn(plan: StagePlanDto, poolKey: string, upstreamKey: string): boolean {
  const pools = new Map(plan.stages.flatMap(s => s.pools.map(p => [p.key, p] as const)));
  const seen = new Set<string>();
  const visit = (key: string): boolean => {
    if (seen.has(key)) return false;
    seen.add(key);
    return (pools.get(key)?.sources ?? []).some(source => (source.comparisonPoolKeys ?? [source.poolKey]).some(origin => origin === upstreamKey || visit(origin)));
  };
  return visit(poolKey);
}
