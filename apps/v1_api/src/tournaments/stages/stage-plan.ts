import { UnprocessableEntityException } from '@nestjs/common';
import type { StagePlanDto, StagePoolDto } from './stage-plan.dto';
import type { BracketTemplatePlan } from '../templates/bracket-template-plan';
import { planNamedFinals } from '../multi-finals/multi-finals-plan';
import { buildLeagueFixtureRows } from '../league-fixture-generator.service';
import { planSixTeamBracket } from '../six-team/six-team-plan';
import { resolveSixTeamDirectFinalOrder } from '../competition-config/tournament-tie-break-order';
export const stageInvalid = (message: string): never => { throw new UnprocessableEntityException({ code: 'STAGE_PLAN_INVALID', message }); };
export const stageScope = (key: string) => `stage:${key}`;
export function validateStagePlan(plan: StagePlanDto, teamCount: number) {
  if (plan.version !== 1 || !Array.isArray(plan.stages) || !plan.stages.length || plan.stages.length > 8) stageInvalid('단계는 1~8개로 설정해 주세요.');
  const stages = new Set<string>(), stageNames = new Set<string>(), pools = new Map<string, { index: number; pool: StagePoolDto }>();
  let fixtures = 0;
  const overallRanks = new Set<number>();
  plan.stages.forEach((stage, index) => {
    if (!stage.name.trim() || stageNames.has(stage.name.trim()) || stages.has(stage.key) || !stage.pools.length || stage.pools.length > 16) stageInvalid('단계 이름과 편성을 중복 없이 설정해 주세요.');
    stages.add(stage.key); stageNames.add(stage.name.trim());
    const names = new Set<string>(), sources = new Set<string>(), reservedOrigins = new Map<string, string>();
    let seats = 0;
    stage.pools.forEach(pool => {
      if (!pool.name.trim() || names.has(pool.name.trim()) || pools.has(pool.key) || !Number.isInteger(pool.capacity) || pool.capacity < 2 || pool.capacity > 64 || ![1, 2].includes(pool.legs) || !['league', 'knockout'].includes(pool.format)) stageInvalid('편성 이름·팀 수·경기 방식을 확인해 주세요.');
      if (pool.format === 'knockout' && pool.legs !== 1) stageInvalid('토너먼트는 단판으로 설정해 주세요.');
      if (pool.thirdPlace && (pool.format !== 'knockout' || pool.capacity < 4)) stageInvalid('3·4위전은 4팀 이상 토너먼트에서 설정해 주세요.');
      if (pool.sixTeamFinalBye && (pool.format !== 'knockout' || pool.capacity !== 6 || pool.thirdPlace)) stageInvalid('6강 결승 직행은 6팀 토너먼트·3위전 없음으로 설정해 주세요.');
      if (pool.sixTeamDirectFinalOrder) { if (!pool.sixTeamFinalBye) stageInvalid('6강 결승 직행 방식에서만 비교 순서를 설정해 주세요.'); resolveSixTeamDirectFinalOrder(pool.sixTeamDirectFinalOrder); }
      if (pool.overallRankStart !== undefined) {
        const count = pool.format === 'league' ? pool.capacity : pool.thirdPlace ? 4 : 2;
        if (index !== plan.stages.length - 1 || !Number.isInteger(pool.overallRankStart) || pool.overallRankStart < 1 || pool.overallRankStart + count - 1 > teamCount) stageInvalid('전체 순위 구간은 마지막 단계에서 참가팀 수 안으로 설정해 주세요.');
        for (let r = pool.overallRankStart; r < pool.overallRankStart + count; r++) { if (overallRanks.has(r)) stageInvalid('전체 순위 구간이 겹치지 않게 설정해 주세요.'); overallRanks.add(r); }
      }
      names.add(pool.name.trim()); seats += pool.capacity;
      if ((index === 0 && pool.sources.length !== 0) || (index > 0 && pool.sources.length !== pool.capacity)) stageInvalid('첫 단계는 직접 배정하고, 다음 단계는 모든 자리의 진출 출처를 설정해 주세요.');
      for (const source of pool.sources) {
        const origins = source.comparisonPoolKeys ?? [source.poolKey];
        const family = source.comparisonPoolKeys ? `wildcard:${[...origins].sort().join(',')}:${source.rank}` : 'direct';
        if (source.comparisonPoolKeys && new Set(origins.map(key => pools.get(key)?.index)).size !== 1) stageInvalid('조간 비교는 같은 이전 단계의 풀리그끼리 설정해 주세요.');
        if (source.comparisonPoolKeys && (new Set(origins).size !== origins.length || !origins.includes(source.poolKey) || origins.length < 2 || !Number.isInteger(source.comparisonPosition) || source.comparisonPosition! < 1 || source.comparisonPosition! > origins.length)) stageInvalid('조간 비교 편성과 비교 순위를 확인해 주세요.');
        for (const originKey of origins) {
          const origin = pools.get(originKey);
          if (!origin || origin.index >= index || !Number.isInteger(source.rank) || source.rank < 1 || source.rank > origin.pool.capacity || (origin.pool.format === 'knockout' && source.rank > (origin.pool.thirdPlace ? 4 : 2)) || source.comparisonPoolKeys && origin.pool.format !== 'league') stageInvalid('이전 편성에서 확정 가능한 순위를 선택해 주세요. 조간 비교는 풀리그끼리 연결해 주세요.');
          const token = `${originKey}:${source.rank}`, existing = reservedOrigins.get(token);
          if (existing && (family === 'direct' || existing !== family)) stageInvalid('직접 진출과 조간 비교 출처가 겹치지 않게 설정해 주세요.');
          reservedOrigins.set(token, family);
        }
        const key = source.comparisonPoolKeys ? `${family}:${source.comparisonPosition}` : `${source.poolKey}:${source.rank}`;
        if (sources.has(key)) stageInvalid('같은 순위 출처를 같은 단계의 여러 자리에 연결할 수 없어요.');
        sources.add(key);
      }
      if (pool.seeding === 'cross_group_top_three') {
        const keys = [...new Set(pool.sources.map(s => s.poolKey))];
        if (pool.format !== 'knockout' || pool.capacity !== 12 || keys.length !== 4 || pool.sources.some(s => s.comparisonPoolKeys) || !keys.every(key => [1, 2, 3].every(rank => pool.sources.filter(s => s.poolKey === key && s.rank === rank).length === 1))) stageInvalid('교차 시드는 4개 조 1~3위가 진출하는 12팀 토너먼트에서 사용할 수 있어요.');
      }
      pools.set(pool.key, { index, pool });
      fixtures += pool.format === 'league' ? pool.capacity * (pool.capacity - 1) / 2 * pool.legs : pool.capacity - 1 + (pool.thirdPlace ? 1 : 0);
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
      const tree = pool.sixTeamFinalBye ? planSixTeamBracket({ kind: 'knockout', size: 6, participantCount: 6, schemaVersion: 2, thirdPlace: false }, plan.fixtures.length) : planNamedFinals([{ name: pool.name, capacity: pool.capacity, rules: [], thirdPlace: pool.thirdPlace ?? false }], plan.fixtures.length);
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
