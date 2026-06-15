import { describe, it, expect } from 'vitest';
import { roundRobinRounds, knockoutSeedPairs } from './tournament-bracket-gen';

const teamsOf = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const pairKey = (a: string, b: string) => [a, b].sort().join('-');

describe('roundRobinRounds', () => {
  it('1팀 이하는 빈 일정', () => {
    expect(roundRobinRounds([])).toEqual([]);
    expect(roundRobinRounds(['T1'])).toEqual([]);
  });

  it.each([2, 3, 4, 5, 6, 7, 8])('%i팀: 모든 비순서 쌍이 정확히 한 번씩', (n) => {
    const rounds = roundRobinRounds(teamsOf(n));
    const pairs = rounds.flat();
    // 총 쌍 수 = n(n-1)/2
    expect(pairs.length).toBe((n * (n - 1)) / 2);
    // 자기 자신과의 쌍 없음
    expect(pairs.every(([h, a]) => h !== a)).toBe(true);
    // 모든 쌍 유니크
    const keys = pairs.map(([h, a]) => pairKey(h, a));
    expect(new Set(keys).size).toBe(pairs.length);
    // 가능한 모든 쌍을 망라
    const allPairs = new Set<string>();
    const t = teamsOf(n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) allPairs.add(pairKey(t[i], t[j]));
    expect(new Set(keys)).toEqual(allPairs);
  });

  it('한 라운드 안에서 같은 팀이 두 번 나오지 않음 (동시 경기 가능)', () => {
    for (const n of [4, 5, 6]) {
      for (const round of roundRobinRounds(teamsOf(n))) {
        const seen = round.flat();
        expect(new Set(seen).size).toBe(seen.length);
      }
    }
  });
});

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
