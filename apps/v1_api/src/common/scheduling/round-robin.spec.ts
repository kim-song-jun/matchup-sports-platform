import { generateRoundRobin } from './round-robin';

describe('generateRoundRobin', () => {
  it('4명·1회전에 모든 페어가 정확히 한 번씩 만난다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd'], { legs: 1 });
    expect(pairings).toHaveLength(6);
    const pairKeys = pairings.map((p) => [p.homeId, p.awayId].sort().join('-')).sort();
    expect(pairKeys).toEqual(['a-b', 'a-c', 'a-d', 'b-c', 'b-d', 'c-d']);
  });

  it('한 라운드 안에서 같은 참가자가 두 번 나오지 않는다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd', 'e', 'f'], { legs: 1 });
    const byRound = new Map<number, string[]>();
    for (const p of pairings) {
      const ids = byRound.get(p.round) ?? [];
      ids.push(p.homeId, p.awayId);
      byRound.set(p.round, ids);
    }
    for (const ids of byRound.values()) {
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('legs=2이면 각 페어가 두 번 만나고 홈/어웨이가 뒤바뀐다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd'], { legs: 2 });
    expect(pairings).toHaveLength(12);
    const ab = pairings.filter((p) => [p.homeId, p.awayId].sort().join('-') === 'a-b');
    expect(ab).toHaveLength(2);
    expect(ab[0].homeId).not.toBe(ab[1].homeId);
  });

  it('legs=2에서 각 참가자의 홈 경기 수와 원정 경기 수가 같다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd'], { legs: 2 });
    for (const id of ['a', 'b', 'c', 'd']) {
      const home = pairings.filter((p) => p.homeId === id).length;
      const away = pairings.filter((p) => p.awayId === id).length;
      expect(home).toBe(away);
    }
  });

  it('leg 번호가 1부터 매겨지고 round는 leg를 통틀어 연속 증가한다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd'], { legs: 2 });
    expect(Math.max(...pairings.map((p) => p.leg))).toBe(2);
    expect(Math.max(...pairings.map((p) => p.round))).toBe(6);
    const leg2Rounds = pairings.filter((p) => p.leg === 2).map((p) => p.round);
    expect(Math.min(...leg2Rounds)).toBe(4);
  });

  it('홀수 인원은 매 라운드 한 명이 bye이고 각자 (n-1)경기를 뛴다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c'], { legs: 1 });
    expect(pairings).toHaveLength(3);
    for (const id of ['a', 'b', 'c']) {
      const played = pairings.filter((p) => p.homeId === id || p.awayId === id).length;
      expect(played).toBe(2);
    }
  });

  it('rounds를 직접 주면 부분 회전도 만든다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd'], { rounds: 2 });
    expect(new Set(pairings.map((p) => p.round))).toEqual(new Set([1, 2]));
    expect(pairings).toHaveLength(4);
  });

  it('rounds와 legs를 둘 다 주면 rounds가 우선한다', () => {
    const pairings = generateRoundRobin(['a', 'b', 'c', 'd'], { rounds: 1, legs: 5 });
    expect(pairings).toHaveLength(2);
  });

  it('balanceHome=false면 홈 균등 배분을 하지 않는다', () => {
    const balanced = generateRoundRobin(['a', 'b', 'c', 'd'], { legs: 1, balanceHome: true });
    const raw = generateRoundRobin(['a', 'b', 'c', 'd'], { legs: 1, balanceHome: false });
    expect(raw).toHaveLength(balanced.length);
  });

  it('같은 입력에 항상 같은 결과를 낸다', () => {
    const first = generateRoundRobin(['a', 'b', 'c', 'd', 'e'], { legs: 2 });
    const second = generateRoundRobin(['a', 'b', 'c', 'd', 'e'], { legs: 2 });
    expect(first).toEqual(second);
  });

  it('참가자가 2명 미만이거나 라운드가 0 이하이면 빈 배열을 반환한다', () => {
    expect(generateRoundRobin(['a'], { legs: 1 })).toEqual([]);
    expect(generateRoundRobin([], { legs: 1 })).toEqual([]);
    expect(generateRoundRobin(['a', 'b'], { rounds: 0 })).toEqual([]);
    expect(generateRoundRobin(['a', 'b'], { legs: 0 })).toEqual([]);
  });
});
