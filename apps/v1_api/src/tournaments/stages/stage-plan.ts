import { UnprocessableEntityException } from '@nestjs/common';
import type { StagePlanDto, StagePoolDto } from './stage-plan.dto';
import type { BracketTemplatePlan } from '../templates/bracket-template-plan';
import { planNamedFinals } from '../multi-finals/multi-finals-plan';
import { buildLeagueFixtureRows } from '../league-fixture-generator.service';
export const stageInvalid = (message: string): never => { throw new UnprocessableEntityException({ code: 'STAGE_PLAN_INVALID', message }); };
export const stageScope = (key: string) => `stage:${key}`;
export function validateStagePlan(plan: StagePlanDto, teamCount: number) {
  if (plan.version !== 1 || !Array.isArray(plan.stages) || !plan.stages.length || plan.stages.length > 8) stageInvalid('단계는 1~8개로 설정해 주세요.');
  const stages = new Set<string>(), stageNames = new Set<string>(), pools = new Map<string, { index: number; pool: StagePoolDto }>();
  let fixtures = 0;
  plan.stages.forEach((stage, index) => {
    if (!stage.name.trim() || stageNames.has(stage.name.trim()) || stages.has(stage.key) || !stage.pools.length || stage.pools.length > 16) stageInvalid('단계 이름과 편성을 중복 없이 설정해 주세요.');
    stages.add(stage.key); stageNames.add(stage.name.trim());
    const names = new Set<string>(), sources = new Set<string>();
    let seats = 0;
    stage.pools.forEach(pool => {
      if (!pool.name.trim() || names.has(pool.name.trim()) || pools.has(pool.key) || !Number.isInteger(pool.capacity) || pool.capacity < 2 || pool.capacity > 64 || ![1, 2].includes(pool.legs) || !['league', 'knockout'].includes(pool.format)) stageInvalid('편성 이름·팀 수·경기 방식을 확인해 주세요.');
      if (pool.format === 'knockout' && pool.legs !== 1) stageInvalid('토너먼트는 단판으로 설정해 주세요.');
      names.add(pool.name.trim()); seats += pool.capacity;
      if ((index === 0 && pool.sources.length !== 0) || (index > 0 && pool.sources.length !== pool.capacity)) stageInvalid('첫 단계는 직접 배정하고, 다음 단계는 모든 자리의 진출 출처를 설정해 주세요.');
      for (const source of pool.sources) {
        const origin = pools.get(source.poolKey);
        if (!origin || origin.index >= index || !Number.isInteger(source.rank) || source.rank < 1 || source.rank > origin.pool.capacity || (origin.pool.format === 'knockout' && source.rank > 2)) stageInvalid('이전 편성에서 확정 가능한 순위를 선택해 주세요. 토너먼트는 1·2위만 연결할 수 있어요.');
        const key = `${source.poolKey}:${source.rank}`;
        if (sources.has(key)) stageInvalid('같은 순위 출처를 같은 단계의 여러 자리에 연결할 수 없어요.');
        sources.add(key);
      }
      pools.set(pool.key, { index, pool });
      fixtures += pool.format === 'league' ? pool.capacity * (pool.capacity - 1) / 2 * pool.legs : pool.capacity - 1;
    });
    if (index === 0 && seats !== teamCount || seats > teamCount) stageInvalid('첫 단계의 자리 합계는 모집 팀 수와 같아야 하고, 다음 단계는 모집 팀 수를 넘을 수 없어요.');
  });
  if (fixtures > 240) stageInvalid('한 대회의 총 경기 수는 240경기 이하로 구성해 주세요.');
  return { fixtures, stages: plan.stages.length, pools: pools.size };
}
export function planCompetitionStages(config: StagePlanDto): BracketTemplatePlan {
  const plan: BracketTemplatePlan = { groups: [], slots: [], fixtures: [], edges: [], byeSlots: [] };
  config.stages.forEach((stage, stageIndex) => stage.pools.forEach((pool, poolIndex) => {
    const prefix = `${stage.key}:${pool.key}`;
    const track = `stage:${pool.key}`;
    if (pool.format === 'league') {
      const groupKey = `${prefix}:league`;
      plan.groups.push({ key: groupKey, name: `${stageIndex + 1}-${poolIndex + 1} · ${stage.name} · ${pool.name}`, phase: 'group', sortOrder: stageIndex * 1000 + poolIndex * 10, advanceCount: null, bracketTrack: track, stageKey: stage.key, poolKey: pool.key });
      const slots = Array.from({ length: pool.capacity }, (_, i) => ({ key: `${prefix}:entry:${i + 1}`, kind: 'ENTRY' as const, groupKey, position: i + 1, sourceGroupKey: null, entryScope: stageScope(stage.key) }));
      plan.slots.push(...slots);
      const rows = buildLeagueFixtureRows({ groupId: groupKey, registrationIds: slots.map(s => s.key), legs: pool.legs, balanceHome: true, schedule: null, fixtureNumberOffset: plan.fixtures.length });
      rows.forEach(row => plan.fixtures.push({ key: `${prefix}:fixture:${row.fixtureNumber}`, groupKey, round: row.round, fixtureNumber: row.fixtureNumber, legNumber: row.legNumber, homeSlotKey: row.homeRegistrationId, awaySlotKey: row.awayRegistrationId }));
    } else {
      const tree = planNamedFinals([{ name: pool.name, capacity: pool.capacity, rules: [], thirdPlace: false }], plan.fixtures.length);
      const key = (value: string) => `${prefix}:${value}`;
      tree.groups.forEach((g, i) => plan.groups.push({ ...g, key: key(g.key), name: `${stageIndex + 1}-${poolIndex + 1} · ${stage.name} · ${g.name}`, bracketTrack: track, sortOrder: stageIndex * 1000 + poolIndex * 10 + i, stageKey: stage.key, poolKey: pool.key }));
      tree.slots.forEach(s => plan.slots.push({ ...s, key: key(s.key), kind: 'ENTRY', entryScope: stageScope(stage.key), groupKey: s.groupKey ? key(s.groupKey) : null }));
      tree.fixtures.forEach(f => plan.fixtures.push({ ...f, key: key(f.key), groupKey: key(f.groupKey), homeSlotKey: f.homeSlotKey ? key(f.homeSlotKey) : null, awaySlotKey: f.awaySlotKey ? key(f.awaySlotKey) : null }));
      tree.edges.forEach(e => plan.edges.push({ ...e, sourceFixtureKey: key(e.sourceFixtureKey), targetFixtureKey: key(e.targetFixtureKey) }));
      tree.byeSlots.forEach(b => plan.byeSlots.push({ ...b, groupKey: key(b.groupKey) }));
    }
  }));
  return plan;
}
