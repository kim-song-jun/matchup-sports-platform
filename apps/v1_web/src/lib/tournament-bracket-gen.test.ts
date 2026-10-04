import { describe, it, expect } from 'vitest';
import { knockoutSeedPairs, round12Pairs } from './tournament-bracket-gen';

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

describe('12강 대진', () => {
  it('부전승 4팀을 제외해 8팀이 한 번씩 출전하는 4경기를 만든다', () => {
    const teams = Array.from({ length: 12 }, (_, sortOrder) => ({ sortOrder, isBye: sortOrder < 4 }));
    const pairs = round12Pairs(teams);
    expect(pairs).toHaveLength(4);
    expect(pairs.map(({ home, away }) => [home.sortOrder, away.sortOrder])).toEqual([[4, 11], [5, 10], [6, 9], [7, 8]]);
  });
  it('부전승 지정 없이 12팀을 6경기로 만들지 않는다', () => {
    expect(() => round12Pairs(Array.from({ length: 12 }, (_, sortOrder) => ({ sortOrder })))).toThrow('부전승 4팀');
  });
});
