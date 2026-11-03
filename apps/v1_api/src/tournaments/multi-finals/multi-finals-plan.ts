import { UnprocessableEntityException } from '@nestjs/common';
import type { V1TournamentGroupPhase } from '@prisma/client';
import { buildLeagueFixtureRows } from '../league-fixture-generator.service';
import type { BracketTemplatePlan, PlanFixture, PlanSlot } from '../templates/bracket-template-plan';
import type { NamedFinalDto, PreliminaryGroupDto } from './multi-finals.dto';

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
const empty = (): BracketTemplatePlan => ({ groups: [], slots: [], fixtures: [], edges: [], byeSlots: [] });
export function planPreliminaryGroups(groups: readonly PreliminaryGroupDto[]): BracketTemplatePlan {
  if (!groups.length) invalidMultiFinal('예선 조를 하나 이상 추가해 주세요.');
  const plan = empty(); const names = new Set<string>(); const teams = new Set<string>(); let number = 0;
  groups.forEach((group, index) => {
    if (!group.name.trim() || names.has(group.name.trim()) || !Number.isSafeInteger(group.capacity) || group.capacity < 2 || ![1, 2].includes(group.legs)) invalidMultiFinal('조 이름·팀 수·회전 수를 확인해 주세요.');
    names.add(group.name.trim());
    if (group.registrationIds && group.registrationIds.length !== group.capacity) invalidMultiFinal('예선 자리 수에 맞게 참가팀을 선택해 주세요.');
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

/** A seed's first rank is strongest. Missing leaves become byes, never empty games. */
export function planNamedFinals(finals: readonly NamedFinalDto[], offset = 0): BracketTemplatePlan {
  const plan = empty(); let number = offset;
  type Origin = { slot: PlanSlot } | { fixture: PlanFixture };
  for (const [trackIndex, final] of finals.entries()) {
    const size = final.registrationIds?.length ?? 0;
    if (size < 2 || final.thirdPlace && size < 4) invalidMultiFinal('결선은 2팀 이상, 3·4위전은 4팀 이상이어야 해요.');
    const width = 2 ** Math.ceil(Math.log2(size));
    let seedOrder = [1, 2];
    while (seedOrder.length < width) { const sum = seedOrder.length * 2 + 1; seedOrder = seedOrder.flatMap(seed => [seed, sum - seed]); }
    const firstKey = `final:${trackIndex}:${width}`;
    const slots = Array.from({ length: size }, (_, i): PlanSlot => ({ key: `seed:${trackIndex}:${i}`, kind: 'GROUP_RANK', groupKey: firstKey, position: i + 1, sourceGroupKey: null }));
    plan.slots.push(...slots);
    let origins: Array<Origin | null> = seedOrder.map(seed => seed <= size ? { slot: slots[seed - 1] } : null);
    for (let roundWidth = width, roundIndex = 0; roundWidth >= 2; roundWidth /= 2, roundIndex++) {
      const phase: V1TournamentGroupPhase = roundWidth >= 64 ? 'round64' : roundWidth === 32 ? 'round32' : roundWidth === 16 ? 'round16' : roundWidth === 8 ? 'quarter' : roundWidth === 4 ? 'semi' : 'final';
      const key = `final:${trackIndex}:${roundWidth}`; const label = roundWidth === 2 ? '결승' : `${roundWidth}강`;
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
