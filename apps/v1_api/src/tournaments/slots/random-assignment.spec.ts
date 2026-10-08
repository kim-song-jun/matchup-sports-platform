import { pickRandomAssignments } from './random-assignment';

// 결정적 난수 — 상위 비트를 써서 LCG 하위 비트의 짧은 주기를 피한다.
function seeded(seed: number) {
  let state = seed;
  return (maxExclusive: number) => {
    state = (Math.imul(state, 1103515245) + 12345) & 0x7fffffff; // 32비트 정수 곱 — 부동소수점으로 곱하면 하위 비트가 깨진다
    return Math.floor((state / 0x80000000) * maxExclusive);
  };
}

describe('pickRandomAssignments', () => {
  const slots = ['s1', 's2', 's3', 's4'];

  it('자리가 팀보다 많으면 팀 수만큼만, 중복 없이 채운다', () => {
    const picks = pickRandomAssignments(slots, ['r1', 'r2'], seeded(1));
    expect(picks).toHaveLength(2);
    expect(new Set(picks.map((p) => p.slotId)).size).toBe(2);
    expect(new Set(picks.map((p) => p.registrationId))).toEqual(new Set(['r1', 'r2']));
    for (const pick of picks) expect(slots).toContain(pick.slotId);
  });

  it('팀이 자리보다 많으면 자리 수만큼만 채운다', () => {
    const picks = pickRandomAssignments(slots, ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'], seeded(2));
    expect(picks).toHaveLength(4);
    expect(new Set(picks.map((p) => p.slotId))).toEqual(new Set(slots));
    expect(new Set(picks.map((p) => p.registrationId)).size).toBe(4);
  });

  it('입력이 비면 빈 결과다', () => {
    expect(pickRandomAssignments([], ['r1'], seeded(3))).toEqual([]);
    expect(pickRandomAssignments(slots, [], seeded(3))).toEqual([]);
  });

  it('섞는다 — 3자리 3팀 3000번에서 9개 (자리, 팀) 짝이 모두, 고르게 나온다', () => {
    const random = seeded(7);
    const counts = new Map<string, number>();
    for (let trial = 0; trial < 3000; trial += 1) {
      for (const { slotId, registrationId } of pickRandomAssignments(['a', 'b', 'c'], ['x', 'y', 'z'], random)) {
        counts.set(`${slotId}${registrationId}`, (counts.get(`${slotId}${registrationId}`) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(9); // 섞지 않으면 3짝에 그친다
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(3000 * 0.25);
      expect(count).toBeLessThan(3000 * 0.42);
    }
  });
});
