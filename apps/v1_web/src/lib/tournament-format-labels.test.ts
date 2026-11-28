import { describe, expect, it } from 'vitest';
import { TOURNAMENT_FORMAT_NAMES } from './tournament-format-labels';

describe('TOURNAMENT_FORMAT_NAMES', () => {
  it('형식 4종의 이름은 공통 용어표 그대로다', () => {
    expect(TOURNAMENT_FORMAT_NAMES).toEqual({
      group_knockout: '조별리그 → 토너먼트',
      knockout: '토너먼트만',
      league: '리그전',
      league_knockouts: '여러 단계(예선 → 결선 여러 개)',
    });
    expect(Object.keys(TOURNAMENT_FORMAT_NAMES)).toHaveLength(4);
  });
});
