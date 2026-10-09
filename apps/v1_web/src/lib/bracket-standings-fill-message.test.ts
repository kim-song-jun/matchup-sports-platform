import { describe, expect, it } from 'vitest';
import { describeStandingsFill } from './bracket-standings-fill-message';

const assignment = (slotId: string) => ({ slotId, registrationId: `r-${slotId}` });

describe('describeStandingsFill', () => {
  it('건너뛴 자리가 없으면 채운 수만 알린다', () => {
    expect(describeStandingsFill({ assignments: [assignment('a'), assignment('b')], skipped: [] })).toBe('2개 자리를 순위대로 채웠어요.');
  });

  it('건너뛴 자리가 있으면 그 수를 덧붙인다 (동률·경기 진행 중 구분 없이 한 번에)', () => {
    expect(
      describeStandingsFill({
        assignments: [assignment('a')],
        skipped: [{ slotId: 'b', reason: 'tied' }, { slotId: 'c', reason: 'group_incomplete' }],
      }),
    ).toBe('1개 자리를 순위대로 채웠어요. 2개 자리는 건너뛰었어요.');
  });

  it('하나도 채우지 못했으면 그렇다고 알린다', () => {
    expect(describeStandingsFill({ assignments: [], skipped: [{ slotId: 'b', reason: 'tied' }] })).toBe('채울 수 있는 자리가 없었어요.');
  });
});
