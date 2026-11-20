import { stagePoolDependsOn } from './stage-dependencies';
import type { StagePlanDto } from './stage-plan.dto';

describe('stage pool scheduling dependencies', () => {
  const pool = (key: string, upstream: string[] = []) => ({ key, name: key, format: 'league' as const, capacity: 2, legs: 1 as const, sources: upstream.map(poolKey => ({ poolKey, rank: 1 })) });
  const plan: StagePlanDto = { version: 1, stages: [
    { key: 'pre', name: 'pre', pools: [pool('a'), pool('b')] },
    { key: 'main', name: 'main', pools: [pool('c', ['a'])] },
    { key: 'final', name: 'final', pools: [pool('d', ['c'])] },
  ] };
  it('protects direct and transitive upstream fixtures', () => {
    expect(stagePoolDependsOn(plan, 'c', 'a')).toBe(true);
    expect(stagePoolDependsOn(plan, 'd', 'a')).toBe(true);
  });
  it('does not block an independent pool merely because it is in an earlier stage', () => {
    expect(stagePoolDependsOn(plan, 'c', 'b')).toBe(false);
    expect(stagePoolDependsOn(plan, 'd', 'b')).toBe(false);
    expect(stagePoolDependsOn(plan, 'a', 'c')).toBe(false);
  });
});
