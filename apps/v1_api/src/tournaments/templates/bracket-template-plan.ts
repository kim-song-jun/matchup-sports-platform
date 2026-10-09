import { UnprocessableEntityException } from '@nestjs/common';
import type { V1TournamentGroupPhase, V1TournamentSlotKind } from '@prisma/client';
import { buildLeagueFixtureRows } from '../league-fixture-generator.service';
import { FIXTURES_IN_PHASE, GROUP_NAME, ROUND_LABEL, type KnockoutPhase } from './knockout-phase-labels';

export type BracketTemplateInput =
  | { kind: 'knockout'; size: 4 | 8 | 12 | 16; thirdPlace: boolean }
  | { kind: 'group_knockout'; groupCount: number; teamsPerGroup: number; advancePerGroup: 1 | 2; legs: 1 | 2; thirdPlace: boolean }
  | { kind: 'league'; teamCount: number; legs: 1 | 2 };
export type PlanGroup = { key: string; name: string; phase: V1TournamentGroupPhase; sortOrder: number; advanceCount: number | null };
export type PlanSlot = { key: string; kind: V1TournamentSlotKind; groupKey: string | null; position: number; sourceGroupKey: string | null };
export type PlanFixture = { key: string; groupKey: string; round: string; fixtureNumber: number; legNumber: number; homeSlotKey: string | null; awaySlotKey: string | null };
export type PlanEdge = { sourceFixtureKey: string; outcome: 'WINNER' | 'LOSER'; targetFixtureKey: string; targetSide: 'HOME' | 'AWAY' };
export type PlanByeSlot = { groupKey: string; sortOrder: number };
export type BracketTemplatePlan = { groups: PlanGroup[]; slots: PlanSlot[]; fixtures: PlanFixture[]; edges: PlanEdge[]; byeSlots: PlanByeSlot[] };

export const BRACKET_TEMPLATE_MAX_FIXTURES = 240;

/** BYE 자리 position(1부터) → 12강 그룹 `V1TournamentByeSlot.sortOrder`. 공개 그래프의 12강 기본 부전승 위치와 같다. */
export const ROUND12_BYE_SORT_ORDERS = [0, 3, 4, 7] as const;

function unsupported(message: string): never {
  throw new UnprocessableEntityException({ code: 'BRACKET_TEMPLATE_UNSUPPORTED', message });
}

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index + 1);

function entrySlot(groupKey: string, position: number): PlanSlot {
  return { key: `entry-${position}`, kind: 'ENTRY', groupKey, position, sourceGroupKey: null };
}

function planKnockout(input: Extract<BracketTemplateInput, { kind: 'knockout' }>, offset: number): BracketTemplatePlan {
  const phases: KnockoutPhase[] = [];
  if (input.size === 16) phases.push('round16');
  if (input.size === 12) phases.push('round12');
  if (input.size >= 8) phases.push('quarter');
  phases.push('semi', 'final');
  if (input.thirdPlace) phases.push('third_place');

  const groups: PlanGroup[] = phases.map((phase, index) => (
    { key: phase, name: GROUP_NAME[phase], phase, sortOrder: index, advanceCount: null }
  ));
  let fixtureNumber = offset;
  const fixtures: PlanFixture[] = phases.flatMap((phase) => range(FIXTURES_IN_PHASE[phase]).map((n) => ({
    key: `${phase}-${n}`, groupKey: phase, round: ROUND_LABEL[phase],
    fixtureNumber: ++fixtureNumber, legNumber: 1, homeSlotKey: null, awaySlotKey: null,
  })));
  const fixtureOf = (key: string): PlanFixture => {
    const found = fixtures.find((fixture) => fixture.key === key);
    if (found === undefined) throw new Error(`template plan has no fixture ${key}`);
    return found;
  };

  const slots: PlanSlot[] = [];
  const firstPhase = phases[0];
  fixtures.filter((fixture) => fixture.groupKey === firstPhase).forEach((fixture, index) => {
    const home = entrySlot(firstPhase, index * 2 + 1);
    const away = entrySlot(firstPhase, index * 2 + 2);
    slots.push(home, away);
    fixture.homeSlotKey = home.key;
    fixture.awaySlotKey = away.key;
  });

  const byeSlots: PlanByeSlot[] = [];
  if (input.size === 12) {
    for (const n of range(4)) {
      slots.push({ key: `bye-${n}`, kind: 'BYE', groupKey: 'round12', position: n, sourceGroupKey: null });
      byeSlots.push({ groupKey: 'round12', sortOrder: ROUND12_BYE_SORT_ORDERS[n - 1] });
      fixtureOf(`quarter-${n}`).homeSlotKey = `bye-${n}`;
    }
  }

  const edges: PlanEdge[] = [];
  const link = (source: string, outcome: 'WINNER' | 'LOSER', target: string, targetSide: 'HOME' | 'AWAY') => {
    edges.push({ sourceFixtureKey: source, outcome, targetFixtureKey: target, targetSide });
  };
  if (input.size === 12) for (const n of range(4)) link(`round12-${n}`, 'WINNER', `quarter-${n}`, 'AWAY');
  // 16강 2i-1·2i 번 승자 → 8강 i 번 홈·어웨이. 16강엔 부전승 자리가 없다.
  if (input.size === 16) {
    for (const n of range(8)) link(`round16-${n}`, 'WINNER', `quarter-${Math.ceil(n / 2)}`, n % 2 === 1 ? 'HOME' : 'AWAY');
  }
  if (input.size >= 8) {
    for (const j of range(2)) {
      link(`quarter-${2 * j - 1}`, 'WINNER', `semi-${j}`, 'HOME');
      link(`quarter-${2 * j}`, 'WINNER', `semi-${j}`, 'AWAY');
    }
  }
  link('semi-1', 'WINNER', 'final-1', 'HOME');
  link('semi-2', 'WINNER', 'final-1', 'AWAY');
  if (input.thirdPlace) {
    link('semi-1', 'LOSER', 'third_place-1', 'HOME');
    link('semi-2', 'LOSER', 'third_place-1', 'AWAY');
  }
  return { groups, slots, fixtures, edges, byeSlots };
}

function planLeague(input: Extract<BracketTemplateInput, { kind: 'league' }>, offset: number): BracketTemplatePlan {
  const groupKey = 'league';
  const slots = range(input.teamCount).map((position) => entrySlot(groupKey, position));
  // 기존 생성기의 페어링·라운드 이름('league_r{n}')을 그대로 쓰되 등록 id 자리에 슬롯 키를 넣는다.
  const rows = buildLeagueFixtureRows({
    groupId: groupKey, registrationIds: slots.map((slot) => slot.key), legs: input.legs,
    balanceHome: true, schedule: null, fixtureNumberOffset: offset,
  });
  return {
    groups: [{ key: groupKey, name: '리그', phase: 'group', sortOrder: 0, advanceCount: null }],
    slots,
    fixtures: rows.map((row) => ({
      key: `league-${row.fixtureNumber - offset}`, groupKey, round: row.round,
      fixtureNumber: row.fixtureNumber, legNumber: row.legNumber,
      homeSlotKey: row.homeRegistrationId, awaySlotKey: row.awayRegistrationId,
    })),
    edges: [],
    byeSlots: [],
  };
}

function build(input: BracketTemplateInput, offset: number): BracketTemplatePlan {
  switch (input.kind) {
    case 'knockout':
      if (!([4, 8, 12, 16] as readonly number[]).includes(input.size)) unsupported('토너먼트는 4강·8강·12강·16강으로만 만들 수 있어요.');
      return planKnockout(input, offset);
    case 'league':
      if (!Number.isInteger(input.teamCount) || input.teamCount < 3 || input.teamCount > 20) unsupported('리그는 3~20팀으로 만들 수 있어요.');
      if (input.legs !== 1 && input.legs !== 2) unsupported('회전 수는 1 또는 2예요.');
      return planLeague(input, offset);
    case 'group_knockout':
      return unsupported('조별+결선 템플릿은 아직 지원하지 않아요.');
  }
}

export function planBracketTemplate(input: BracketTemplateInput, ctx: { fixtureNumberOffset: number }): BracketTemplatePlan {
  const plan = build(input, ctx.fixtureNumberOffset);
  if (plan.fixtures.length > BRACKET_TEMPLATE_MAX_FIXTURES) {
    throw new UnprocessableEntityException({
      code: 'BRACKET_TEMPLATE_TOO_LARGE',
      message: `한 번에 만들 수 있는 경기는 최대 ${BRACKET_TEMPLATE_MAX_FIXTURES}개예요. 팀 수나 회전 수를 줄여 주세요.`,
    });
  }
  return plan;
}
