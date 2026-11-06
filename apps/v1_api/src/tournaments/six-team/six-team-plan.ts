import { UnprocessableEntityException } from '@nestjs/common';
import type {
  BracketTemplateInput,
  BracketTemplatePlan,
} from '../templates/bracket-template-plan';

/** Three winners are compared together; no fixed round-six winner edge is valid. */
export function planSixTeamBracket(
  input: Exclude<BracketTemplateInput, { kind: 'league' }>,
  offset: number
): BracketTemplatePlan {
  if (
    input.kind !== 'knockout' ||
    input.size !== 6 ||
    input.participantCount !== 6 ||
    input.thirdPlace ||
    input.schemaVersion !== 2
  ) {
    throw new UnprocessableEntityException({
      code: 'SIX_TEAM_FORMAT_INVALID',
      message:
        '6강 결승 직행 방식은 6팀 토너먼트에서 3위전 없이 사용할 수 있어요.',
    });
  }
  return {
    groups: [
      {
        key: 'six',
        name: '6강',
        phase: 'quarter',
        sortOrder: 0,
        advanceCount: null,
      },
      {
        key: 'semi',
        name: '준결승',
        phase: 'semi',
        sortOrder: 1,
        advanceCount: null,
      },
      {
        key: 'final',
        name: '결승',
        phase: 'final',
        sortOrder: 2,
        advanceCount: null,
      },
    ],
    slots: Array.from({ length: 6 }, (_, i) => ({
      key: `entry-${i + 1}`,
      kind: 'ENTRY',
      groupKey: 'six',
      position: i + 1,
      sourceGroupKey: null,
    })),
    fixtures: Array.from({ length: 5 }, (_, i) => ({
      key: `six-game-${i}`,
      groupKey: i < 3 ? 'six' : i === 3 ? 'semi' : 'final',
      round: i < 3 ? '6강' : i === 3 ? '준결승' : '결승',
      fixtureNumber: offset + i + 1,
      legNumber: 1,
      homeSlotKey: i < 3 ? `entry-${i * 2 + 1}` : null,
      awaySlotKey: i < 3 ? `entry-${i * 2 + 2}` : null,
    })),
    edges: [],
    byeSlots: [],
  };
}
