import { UnprocessableEntityException } from '@nestjs/common';
import { buildLeagueFixtureRows } from '../league-fixture-generator.service';
import type { BracketTemplateInput, BracketTemplatePlan, PlanFixture, PlanSlot } from './bracket-template-plan';
import { GROUP_NAME, type KnockoutPhase } from './knockout-phase-labels';

export type FlexibleGroup = { name: string; capacity: number; advanceCount: number };
export type FlexibleBracketSettings = {
  sixTeamMode?: boolean;
  schemaVersion?: 2;
  participantCount?: number;
  groups?: FlexibleGroup[];
  drawSeed?: number;
  seedPolicy?: 'random' | 'seeded';
  registrationIds?: string[];
};
type Input = Exclude<BracketTemplateInput, { kind: 'league' }>;
type Source = { key: string; rank: number; groupKey: string | null; position: number };
type Origin = { slot: PlanSlot } | { fixture: PlanFixture };
const PHASE: Record<number, KnockoutPhase> = { 64: 'round64', 32: 'round32', 16: 'round16', 8: 'quarter', 4: 'semi', 2: 'final' };

function invalid(message: string): never {
  throw new UnprocessableEntityException({ code: 'BRACKET_TEMPLATE_UNSUPPORTED', message });
}
const integer = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

/** Seeded draw is part of the input: retries and previews cannot silently reshuffle. */
function shuffle<T>(items: readonly T[], seed: number): T[] {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Standard seed positions keep high seeds apart and give byes to the highest seeds. */
function seedPositions(width: number): number[] {
  let positions = [1, 2];
  while (positions.length < width) {
    const sum = positions.length * 2 + 1;
    positions = positions.flatMap((seed) => [seed, sum - seed]);
  }
  return positions;
}

export function planFlexibleBracket(input: Input, offset: number): BracketTemplatePlan {
  const plan: BracketTemplatePlan = { groups: [], slots: [], fixtures: [], edges: [], byeSlots: [] };
  const seed = input.drawSeed ?? 0;
  if (!integer(seed, 0, 0xffffffff)) invalid('추첨 값을 다시 만들어 주세요.');
  let number = offset;
  const sources: Source[] = [];
  if (input.kind === 'knockout') {
    if (!integer(input.size, 4, 64) || input.size % 2) invalid('참가 팀 수는 4~64팀 사이의 짝수로 입력해 주세요.');
    if (input.participantCount !== undefined && input.participantCount !== input.size) invalid('참가 팀 수와 대진 팀 수를 맞춰 주세요.');
    for (let i = 1; i <= input.size; i++) sources.push({ key: `entry-${i}`, rank: 1, groupKey: null, position: i });
  } else {
    if (input.qualificationMode) invalid('조 간 성적 비교 12강은 기존 전용 설정으로 만들어 주세요.');
    if (!input.groups && !integer(input.groupCount, 2, 16)) invalid('조 수는 2~16개로 설정해 주세요.');
    const groups = input.groups ?? Array.from({ length: input.groupCount }, (_, i) => ({
      name: `${String.fromCharCode(65 + i)}조`, capacity: input.teamsPerGroup, advanceCount: input.advancePerGroup,
    }));
    if (!integer(groups.length, 2, 16) || ![1, 2].includes(input.legs)) invalid('조는 2~16개, 회전은 1~2회로 설정해 주세요.');
    const total = groups.reduce((sum, group) => sum + group.capacity, 0);
    if (!integer(total, 4, 64) || total % 2 || (input.participantCount !== undefined && input.participantCount !== total)) {
      invalid('조별 팀 수의 합계를 참가 팀 수(4~64팀의 짝수)와 맞춰 주세요.');
    }
    const names = new Set<string>();
    groups.forEach((group, i) => {
      const name = group.name.trim();
      if (!name || name.length > 80 || names.has(name)) invalid('조 이름은 1~80자로 중복 없이 입력해 주세요.');
      names.add(name);
      if (!integer(group.capacity, 2, 8) || !integer(group.advanceCount, 1, group.capacity - 1)) invalid(`${name}의 팀 수는 2~8팀, 진출 수는 팀 수보다 적게 설정해 주세요.`);
      const key = `group:${i}`;
      plan.groups.push({ key, name, phase: 'group', sortOrder: i, advanceCount: group.advanceCount });
      const slots = Array.from({ length: group.capacity }, (_, p): PlanSlot => ({
        key: `entry:${i}:${p + 1}`, kind: 'ENTRY', groupKey: key, position: p + 1, sourceGroupKey: null,
      }));
      plan.slots.push(...slots);
      const rows = buildLeagueFixtureRows({ groupId: key, registrationIds: slots.map((slot) => slot.key), legs: input.legs,
        balanceHome: true, schedule: null, fixtureNumberOffset: number });
      for (const row of rows) plan.fixtures.push({ key: `group-fixture:${++number}`, groupKey: key, round: row.round,
        fixtureNumber: number, legNumber: row.legNumber, homeSlotKey: row.homeRegistrationId, awaySlotKey: row.awayRegistrationId });
      for (let rank = 1; rank <= group.advanceCount; rank++) sources.push({ key: `rank:${i}:${rank}`, rank, groupKey: key, position: rank });
    });
  }
  const size = sources.length;
  if (!integer(size, 2, 64)) invalid('결선 진출 팀 수는 2~64팀으로 설정해 주세요.');
  if (input.thirdPlace && size < 4) invalid('결선 진출이 4팀 이상일 때 3·4위전을 만들 수 있어요.');
  const width = 2 ** Math.ceil(Math.log2(size));
  const firstPhase = PHASE[width];
  const firstKey = `ko:${firstPhase}`;
  // Rank priority is preserved; the same-rank draw is deterministic and reviewable.
  const ordered = input.kind === 'knockout' && input.seedPolicy === 'seeded' ? sources : drawSources(sources, seed, width);
  const slots = ordered.map((source): PlanSlot => ({ key: source.key, kind: source.groupKey ? 'GROUP_RANK' : 'ENTRY',
    groupKey: firstKey, position: source.position, sourceGroupKey: source.groupKey }));
  const seedOrder = seedPositions(width);
  let origins: (Origin | null)[] = seedOrder.map((position) => position <= size ? { slot: slots[position - 1] } : null);
  const groupNames = new Set(plan.groups.map((group) => group.name));
  const uniqueName = (base: string) => {
    let name = base;
    for (let suffix = 2; groupNames.has(name); suffix++) name = `${base} ${suffix}`;
    groupNames.add(name);
    return name;
  };
  for (let roundWidth = width, index = 0; roundWidth >= 2; roundWidth /= 2, index++) {
    const phase = PHASE[roundWidth];
    const key = `ko:${phase}`;
    const label = index === 0 && width !== size ? `${size}팀 첫 라운드` : GROUP_NAME[phase];
    plan.groups.push({ key, name: uniqueName(label), phase, sortOrder: index, advanceCount: null });
    const next: Origin[] = [];
    for (let pair = 0; pair < origins.length / 2; pair++) {
      const home = origins[pair * 2];
      const away = origins[pair * 2 + 1];
      if (!home || !away) {
        const origin = home ?? away;
        if (!origin || !('slot' in origin)) invalid('부전승 연결을 만들 수 없어요.');
        origin.slot.byeSortOrder = pair;
        if (origin.slot.kind === 'ENTRY') origin.slot.kind = 'BYE';
        plan.byeSlots.push({ groupKey: firstKey, sortOrder: pair });
        next.push(origin);
        continue;
      }
      const fixture: PlanFixture = { key: `ko:${roundWidth}:${pair}`, groupKey: key, round: label,
        fixtureNumber: ++number, legNumber: 1, homeSlotKey: null, awaySlotKey: null };
      for (const [origin, side] of [[home, 'HOME'], [away, 'AWAY']] as const) {
        if ('slot' in origin) {
          if (side === 'HOME') fixture.homeSlotKey = origin.slot.key;
          else fixture.awaySlotKey = origin.slot.key;
        } else plan.edges.push({ sourceFixtureKey: origin.fixture.key, outcome: 'WINNER', targetFixtureKey: fixture.key, targetSide: side });
      }
      plan.fixtures.push(fixture);
      next.push({ fixture });
    }
    origins = next;
  }
  plan.slots.push(...slots);
  if (input.thirdPlace) {
    plan.groups.push({ key: 'ko:third_place', name: uniqueName(GROUP_NAME.third_place), phase: 'third_place', sortOrder: 10, advanceCount: null });
    const fixture: PlanFixture = { key: 'ko:third_place:0', groupKey: 'ko:third_place', round: '3·4위전',
      fixtureNumber: ++number, legNumber: 1, homeSlotKey: null, awaySlotKey: null };
    plan.fixtures.push(fixture);
    plan.fixtures.filter((row) => row.groupKey === 'ko:semi').forEach((row, i) => plan.edges.push({
      sourceFixtureKey: row.key, outcome: 'LOSER', targetFixtureKey: fixture.key, targetSide: i === 0 ? 'HOME' : 'AWAY',
    }));
  }
  const possible = new Map<string, Set<string>>();
  const warnings = new Set<string>();
  for (const fixture of plan.fixtures.filter((row) => row.groupKey.startsWith('ko:'))) {
    const direct = [fixture.homeSlotKey, fixture.awaySlotKey].map((key) => plan.slots.find((slot) => slot.key === key)?.sourceGroupKey);
    const sides = (['HOME', 'AWAY'] as const).map((side, i) => direct[i] ? new Set([direct[i]!])
      : possible.get(plan.edges.find((edge) => edge.targetFixtureKey === fixture.key && edge.targetSide === side)?.sourceFixtureKey ?? '') ?? new Set<string>());
    for (const group of sides[0]) if (sides[1].has(group) && (direct[0] || direct[1])) {
      warnings.add(`${plan.groups.find((row) => row.key === group)?.name} 팀이 결선 첫 경기에서 재대결할 수 있어요 (#${fixture.fixtureNumber}).`);
    }
    possible.set(fixture.key, new Set([...sides[0], ...sides[1]]));
  }
  plan.warnings = [...warnings];
  return plan;
}

/** Bounded deterministic search keeps same-group qualifiers apart without violating rank priority. */
function drawSources(sources: Source[], seed: number, width: number): Source[] {
  const positions = seedPositions(width);
  const score = (order: Source[]) => {
    const leaves = new Map(order.map((source, i) => [source.key, positions.indexOf(i + 1)]));
    let cost = 0;
    for (let i = 0; i < order.length; i++) for (let j = i + 1; j < order.length; j++) {
      if (!order[i].groupKey || order[i].groupKey !== order[j].groupKey) continue;
      let a = leaves.get(order[i].key)!, b = leaves.get(order[j].key)!, round = 0;
      while (a !== b) { a = Math.floor(a / 2); b = Math.floor(b / 2); round++; }
      cost += 4 ** (Math.log2(width) - round);
    }
    return cost;
  };
  let best = shuffle(sources, seed).sort((a, b) => a.rank - b.rank);
  let bestCost = score(best);
  if (sources.every((source) => source.groupKey === null)) return best;
  for (let attempt = 1; attempt < 128; attempt++) {
    const candidate = shuffle(sources, (seed + attempt) >>> 0).sort((a, b) => a.rank - b.rank);
    const cost = score(candidate);
    if (cost < bestCost) { best = candidate; bestCost = cost; }
  }
  return best;
}
