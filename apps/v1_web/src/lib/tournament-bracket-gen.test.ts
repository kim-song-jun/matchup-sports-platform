import { describe, it, expect } from 'vitest';
import { knockoutSeedPairs } from './tournament-bracket-gen';

describe('knockoutSeedPairs', () => {
  it('짝수: 1vsN, 2vs(N-1) 시드 페어링', () => {
    expect(knockoutSeedPairs(['T1', 'T2', 'T3', 'T4'])).toEqual([
      { home: 'T1', away: 'T4' },
      { home: 'T2', away: 'T3' },
    ]);
  });

  it('홀수: 가운데 팀은 부전승(away=null)', () => {
    const pairs = knockoutSeedPairs(['T1', 'T2', 'T3']);
    expect(pairs).toEqual([
      { home: 'T1', away: 'T3' },
      { home: 'T2', away: null },
    ]);
  });

  it('빈 배열은 빈 결과', () => {
    expect(knockoutSeedPairs([])).toEqual([]);
  });
});
