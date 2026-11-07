import { UnprocessableEntityException } from '@nestjs/common';
import type { V1TournamentGroupPhase } from '@prisma/client';
import { buildLeagueFixtureRows } from '../league-fixture-generator.service';
import type { BracketTemplatePlan, PlanFixture, PlanSlot } from '../templates/bracket-template-plan';
import type { FinalRankRuleDto, NamedFinalDto, PreliminaryGroupDto } from './multi-finals.dto';

export const invalidMultiFinal = (message: string): never => {
  throw new UnprocessableEntityException({ code: 'MULTI_FINAL_INVALID', message });
};
export function validateNamedFinals(finals: readonly NamedFinalDto[], groups: ReadonlyMap<string, number>) {
  if (!finals.length) invalidMultiFinal('토너먼트를 하나 이상 추가해 주세요.');
  const names = new Set<string>(); const rules = new Set<string>(); const teams = new Set<string>();
  for (const final of finals) {
    const name = final.name.trim();
    if (!name || name.length > 80 || ['overall', 'upper', 'lower'].includes(name) || names.has(name)) invalidMultiFinal('토너먼트 이름을 중복 없이 입력해 주세요.');
    names.add(name);
    if (final.capacity !== undefined && (!Number.isSafeInteger(final.capacity) || final.capacity < 2 || final.rules.length > final.capacity || final.registrationIds != null && final.registrationIds.length !== final.capacity)) invalidMultiFinal('진출 규칙과 선택한 팀 수는 토너먼트 자리 수에 맞춰 주세요.');
    for (const rule of final.rules) {
      const capacity = groups.get(rule.groupId); const key = JSON.stringify([rule.groupId, rule.rank]);
      if (!capacity || !Number.isInteger(rule.rank) || rule.rank < 1 || rule.rank > capacity || rules.has(key)) invalidMultiFinal('각 조의 순위는 존재하는 토너먼트 한 곳에만 연결해 주세요.');
      rules.add(key);
    }
    for (const id of final.registrationIds ?? []) {
      if (teams.has(id)) invalidMultiFinal('같은 참가팀을 여러 자리에 중복 배정할 수 없어요.');
      teams.add(id);
    }
  }
}
/**
 * Rule order is seed order. Rank comes first so group winners take the lowest seeds (the byes of a short bracket);
 * equal ranks follow `groupOrder`. Callers validate that every rule's group is listed.
 */
export function orderRulesByRank<T extends FinalRankRuleDto>(rules: readonly T[], groupOrder: readonly string[]): T[] {
  const position = new Map(groupOrder.map((groupId, index) => [groupId, index]));
  return [...rules].sort((a, b) => a.rank - b.rank || position.get(a.groupId)! - position.get(b.groupId)!);
}
const empty = (): BracketTemplatePlan => ({ groups: [], slots: [], fixtures: [], edges: [], byeSlots: [] });
export function planPreliminaryGroups(groups: readonly PreliminaryGroupDto[]): BracketTemplatePlan {
  if (!groups.length) invalidMultiFinal('예선 조를 하나 이상 추가해 주세요.');
  const plan = empty(); const names = new Set<string>(); const teams = new Set<string>(); let number = 0;
  groups.forEach((group, index) => {
    if (!group.name.trim() || names.has(group.name.trim()) || !Number.isSafeInteger(group.capacity) || group.capacity < 2 || ![1, 2].includes(group.legs)) invalidMultiFinal('조 이름·팀 수·회전 수를 확인해 주세요.');
    names.add(group.name.trim());
    if (group.registrationIds && group.registrationIds.length > group.capacity) invalidMultiFinal('예선 자리 수보다 많은 참가팀을 배정할 수 없어요.');
    for (const id of group.registrationIds ?? []) { if (teams.has(id)) invalidMultiFinal('예선 참가팀을 중복 배정할 수 없어요.'); teams.add(id); }
    const key = String(index);
    plan.groups.push({ key, name: group.name.trim(), phase: 'group', sortOrder: index, advanceCount: null });
    const slots = Array.from({ length: group.capacity }, (_, i): PlanSlot => ({ key: `${key}:${i}`, kind: 'ENTRY', groupKey: key, position: i + 1, sourceGroupKey: null }));
    plan.slots.push(...slots);
    const rows = buildLeagueFixtureRows({ groupId: key, registrationIds: slots.map(slot => slot.key), legs: group.legs, balanceHome: true, schedule: null, fixtureNumberOffset: number });
    for (const row of rows) plan.fixtures.push({ key: `pre:${++number}`, groupKey: key, round: row.round, fixtureNumber: number, legNumber: row.legNumber, homeSlotKey: row.homeRegistrationId, awaySlotKey: row.awayRegistrationId });
  });
  return plan;
}

/** Explicit capacity lets creation precede rank rules; legacy definitions keep their original size. */
export function namedFinalSize(final: NamedFinalDto): number {
  return final.capacity ?? (final.registrationIds == null ? final.rules.length : final.registrationIds.length);
}

/** Team changes with identical topology can fill existing games without losing their schedule. */
export function sameNamedFinalStructure(left: readonly NamedFinalDto[], right: readonly NamedFinalDto[]): boolean {
  return left.length === right.length && left.every((final, index) => {
    const other = right[index];
    return final.name.trim() === other.name.trim() && final.thirdPlace === other.thirdPlace && namedFinalSize(final) === namedFinalSize(other);
  });
}

/** A seed's first rank is strongest. Missing leaves become byes, never empty games. */
export function planNamedFinals(finals: readonly NamedFinalDto[], offset = 0): BracketTemplatePlan {
  const plan = empty(); let number = offset;
  type Origin = { slot: PlanSlot } | { fixture: PlanFixture };
  for (const [trackIndex, final] of finals.entries()) {
    const size = namedFinalSize(final);
    if (size < 2 || final.thirdPlace && size < 4) invalidMultiFinal('결선은 2팀 이상, 3·4위전은 4팀 이상이어야 해요.');
    const width = 2 ** Math.ceil(Math.log2(size));
    // 부전승이 있는 첫 라운드는 틀의 칸 수(12팀 → 16칸)가 아니라 실제 팀 수로 부른다 — 대회 규정의 '12강'·'6강'과 같다.
    // 단계 코드(phase)는 틀 기준(round16·quarter)으로 그대로 둔다: 순서·시드 검증·경기 방식 설정이 그 코드를 쓴다.
    // 홀수 팀(5·7·9…)은 부르는 이름이 없어 틀 기준 이름을 유지한다.
    const firstRoundCount = size < width && size >= 6 && size % 2 === 0 ? size : width;
    let seedOrder = [1, 2];
    while (seedOrder.length < width) { const sum = seedOrder.length * 2 + 1; seedOrder = seedOrder.flatMap(seed => [seed, sum - seed]); }
    const firstKey = `final:${trackIndex}:${width}`;
    const slots = Array.from({ length: size }, (_, i): PlanSlot => ({ key: `seed:${trackIndex}:${i}`, kind: 'GROUP_RANK', groupKey: firstKey, position: i + 1, sourceGroupKey: null }));
    plan.slots.push(...slots);
    let origins: Array<Origin | null> = seedOrder.map(seed => seed <= size ? { slot: slots[seed - 1] } : null);
    for (let roundWidth = width, roundIndex = 0; roundWidth >= 2; roundWidth /= 2, roundIndex++) {
      const phase: V1TournamentGroupPhase = roundWidth >= 64 ? 'round64' : roundWidth === 32 ? 'round32' : roundWidth === 16 ? 'round16' : roundWidth === 8 ? 'quarter' : roundWidth === 4 ? 'semi' : 'final';
      const key = `final:${trackIndex}:${roundWidth}`; const label = roundWidth === 2 ? '결승' : `${roundIndex === 0 ? firstRoundCount : roundWidth}강`;
      plan.groups.push({ key, name: `${final.name} · ${label}`, phase, sortOrder: trackIndex * 100 + roundIndex, advanceCount: null, bracketTrack: final.name.trim() });
      const next: Origin[] = [];
      for (let pair = 0; pair < origins.length / 2; pair++) {
        const home = origins[pair * 2], away = origins[pair * 2 + 1];
        if (!home || !away) {
          const origin = home ?? away;
          if (!origin || !('slot' in origin)) return invalidMultiFinal('부전승 연결을 만들 수 없어요.');
          origin.slot.byeSortOrder = pair; plan.byeSlots.push({ groupKey: firstKey, sortOrder: pair }); next.push(origin); continue;
        }
        const fixture: PlanFixture = { key: `final-fixture:${++number}`, groupKey: key, round: label, fixtureNumber: number, legNumber: 1, homeSlotKey: null, awaySlotKey: null };
        for (const [origin, side] of [[home, 'HOME'], [away, 'AWAY']] as const) {
          if ('slot' in origin) { if (side === 'HOME') fixture.homeSlotKey = origin.slot.key; else fixture.awaySlotKey = origin.slot.key; }
          else plan.edges.push({ sourceFixtureKey: origin.fixture.key, outcome: 'WINNER', targetFixtureKey: fixture.key, targetSide: side });
        }
        plan.fixtures.push(fixture); next.push({ fixture });
      }
      origins = next;
    }
    if (final.thirdPlace) {
      const key = `third:${trackIndex}`;
      plan.groups.push({ key, name: `${final.name} · 3·4위전`, phase: 'third_place', sortOrder: trackIndex * 100 + 99, advanceCount: null, bracketTrack: final.name.trim() });
      const fixtureKey = `final-fixture:${++number}`;
      plan.fixtures.push({ key: fixtureKey, groupKey: key, round: '3·4위전', fixtureNumber: number, legNumber: 1, homeSlotKey: null, awaySlotKey: null });
      for (const [i, semi] of plan.fixtures.filter(f => f.groupKey === `final:${trackIndex}:4`).entries()) plan.edges.push({ sourceFixtureKey: semi.key, outcome: 'LOSER', targetFixtureKey: fixtureKey, targetSide: i === 0 ? 'HOME' : 'AWAY' });
    }
  }
  return plan;
}
