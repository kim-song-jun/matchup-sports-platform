import { UnprocessableEntityException } from '@nestjs/common';
import { buildLeagueFixtureRows } from '../league-fixture-generator.service';
import type {
  BracketTemplateInput,
  BracketTemplatePlan,
  PlanEdge,
  PlanFixture,
  PlanGroup,
  PlanSlot,
} from './bracket-template-plan';
import { FIXTURES_IN_PHASE, GROUP_NAME, ROUND_LABEL, type KnockoutPhase } from './knockout-phase-labels';
import { groupRankPairings } from './group-rank-pairings';

export type GroupKnockoutTemplateInput = Extract<BracketTemplateInput, { kind: 'group_knockout' }>;

type MainPhase = Extract<KnockoutPhase, 'round16' | 'quarter' | 'semi' | 'final'>;

const MAIN_CHAIN: readonly MainPhase[] = ['round16', 'quarter', 'semi', 'final'];
const FIRST_PHASE_BY_SIZE: Readonly<Record<number, MainPhase>> = { 16: 'round16', 8: 'quarter', 4: 'semi', 2: 'final' };

const stageGroupKey = (index: number) => `group:${index}`;
const entryKey = (group: number, position: number) => `entry:${group}:${position}`;
const rankKey = (group: number, rank: number) => `rank:${group}:${rank}`;
const knockoutGroupKey = (phase: KnockoutPhase) => `ko:${phase}`;
const knockoutFixtureKey = (phase: KnockoutPhase, index: number) => `fx:ko:${phase}:${index}`;

function unsupported(message: string): never {
  throw new UnprocessableEntityException({ code: 'BRACKET_TEMPLATE_UNSUPPORTED', message });
}

function assertSupported(input: GroupKnockoutTemplateInput): void {
  const { groupCount, teamsPerGroup, advancePerGroup, legs, thirdPlace } = input;
  const inRange = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
  if (
    !inRange(groupCount, 2, 8) ||
    !inRange(teamsPerGroup, 3, 6) ||
    (advancePerGroup !== 1 && advancePerGroup !== 2) ||
    (legs !== 1 && legs !== 2)
  ) {
    unsupported('조는 2~8개, 조당 팀은 3~6팀, 진출은 1~2팀, 회전은 1~2회로 입력해 주세요.');
  }
  groupRankPairings(groupCount, advancePerGroup); // 결선 크기가 2·4·8·16 이 아니면 여기서 422
  if (groupCount * advancePerGroup === 2 && thirdPlace) {
    unsupported('결선이 결승 한 경기뿐이면 3·4위전을 만들 수 없어요.');
  }
}

export function planGroupKnockoutTemplate(
  input: GroupKnockoutTemplateInput,
  ctx: { fixtureNumberOffset: number },
): BracketTemplatePlan {
  assertSupported(input);
  const { groupCount, teamsPerGroup, advancePerGroup, legs, thirdPlace } = input;
  const size = groupCount * advancePerGroup;
  const mainPhases = MAIN_CHAIN.slice(MAIN_CHAIN.indexOf(FIRST_PHASE_BY_SIZE[size]));
  // 결승 다음이 3·4위전 — PR-1b/1c knockout 템플릿과 같은 번호·그룹 순서
  const phases: KnockoutPhase[] = thirdPlace ? [...mainPhases, 'third_place'] : [...mainPhases];
  const firstPhase = phases[0];

  const groups: PlanGroup[] = [];
  const slots: PlanSlot[] = [];
  for (let g = 0; g < groupCount; g += 1) {
    groups.push({
      key: stageGroupKey(g),
      name: `${String.fromCharCode(65 + g)}조`,
      phase: 'group',
      sortOrder: g,
      advanceCount: advancePerGroup,
    });
    for (let position = 1; position <= teamsPerGroup; position += 1) {
      slots.push({ key: entryKey(g, position), kind: 'ENTRY', groupKey: stageGroupKey(g), position, sourceGroupKey: null });
    }
  }
  phases.forEach((phase, index) => {
    groups.push({ key: knockoutGroupKey(phase), name: GROUP_NAME[phase], phase, sortOrder: index, advanceCount: null });
  });
  for (let g = 0; g < groupCount; g += 1) {
    for (let rank = 1; rank <= advancePerGroup; rank += 1) {
      slots.push({ key: rankKey(g, rank), kind: 'GROUP_RANK', groupKey: knockoutGroupKey(firstPhase), position: rank, sourceGroupKey: stageGroupKey(g) });
    }
  }

  const fixtures: PlanFixture[] = [];
  let lastNumber = ctx.fixtureNumberOffset;
  for (let g = 0; g < groupCount; g += 1) {
    const rows = buildLeagueFixtureRows({
      groupId: stageGroupKey(g),
      registrationIds: Array.from({ length: teamsPerGroup }, (_, index) => entryKey(g, index + 1)),
      legs,
      balanceHome: true,
      schedule: null,
      fixtureNumberOffset: lastNumber,
    });
    for (const row of rows) {
      fixtures.push({
        key: `fx:${row.groupId}:${row.fixtureNumber}`,
        groupKey: row.groupId,
        round: row.round,
        fixtureNumber: row.fixtureNumber,
        legNumber: row.legNumber,
        homeSlotKey: row.homeRegistrationId,
        awaySlotKey: row.awayRegistrationId,
      });
    }
    lastNumber += rows.length;
  }

  const pairings = groupRankPairings(groupCount, advancePerGroup);
  for (const phase of phases) {
    for (let index = 1; index <= FIXTURES_IN_PHASE[phase]; index += 1) {
      lastNumber += 1;
      const pair = phase === firstPhase ? pairings[index - 1] : null;
      fixtures.push({
        key: knockoutFixtureKey(phase, index),
        groupKey: knockoutGroupKey(phase),
        round: ROUND_LABEL[phase],
        fixtureNumber: lastNumber,
        legNumber: 1,
        homeSlotKey: pair ? rankKey(pair[0].group, pair[0].rank) : null,
        awaySlotKey: pair ? rankKey(pair[1].group, pair[1].rank) : null,
      });
    }
  }

  const edges: PlanEdge[] = [];
  for (let i = 0; i < mainPhases.length - 1; i += 1) {
    const from = mainPhases[i];
    const to = mainPhases[i + 1];
    for (let j = 1; j <= FIXTURES_IN_PHASE[to]; j += 1) {
      edges.push({ sourceFixtureKey: knockoutFixtureKey(from, 2 * j - 1), outcome: 'WINNER', targetFixtureKey: knockoutFixtureKey(to, j), targetSide: 'HOME' });
      edges.push({ sourceFixtureKey: knockoutFixtureKey(from, 2 * j), outcome: 'WINNER', targetFixtureKey: knockoutFixtureKey(to, j), targetSide: 'AWAY' });
    }
  }
  if (thirdPlace) {
    edges.push({ sourceFixtureKey: knockoutFixtureKey('semi', 1), outcome: 'LOSER', targetFixtureKey: knockoutFixtureKey('third_place', 1), targetSide: 'HOME' });
    edges.push({ sourceFixtureKey: knockoutFixtureKey('semi', 2), outcome: 'LOSER', targetFixtureKey: knockoutFixtureKey('third_place', 1), targetSide: 'AWAY' });
  }

  return { groups, slots, fixtures, edges, byeSlots: [] };
}
