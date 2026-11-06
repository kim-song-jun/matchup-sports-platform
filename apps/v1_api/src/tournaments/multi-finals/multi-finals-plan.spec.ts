import { planNamedFinals, planPreliminaryGroups, validateNamedFinals } from './multi-finals-plan';

describe('정규리그 + N개 토너먼트 plans', () => {
  it('부분 팀 배정을 허용하고 초과·중복 배정은 거절한다', () => {
    expect(planPreliminaryGroups([{ name: 'A조', capacity: 4, legs: 1, registrationIds: ['r1', 'r2'] }]).fixtures).toHaveLength(6);
    expect(() => planPreliminaryGroups([{ name: 'A조', capacity: 2, legs: 1, registrationIds: ['r1', 'r2', 'r3'] }])).toThrow();
    expect(() => planPreliminaryGroups([{ name: 'A조', capacity: 4, legs: 1, registrationIds: ['r1', 'r1'] }])).toThrow();
    expect(() => planPreliminaryGroups([{ name: 'A조', capacity: 2, legs: 1, registrationIds: ['r1'] }, { name: 'B조', capacity: 2, legs: 1, registrationIds: ['r1'] }])).toThrow();
  });
  it('진출 규칙 설정 전에도 자리 수만으로 12팀의 빈 대진을 만든다', () => {
    const final = { name: '프리미어', capacity: 12, rules: [], thirdPlace: true, registrationIds: null };
    validateNamedFinals([final], new Map());
    const plan = planNamedFinals([final]);
    expect(plan.slots).toHaveLength(12);
    expect(plan.byeSlots).toHaveLength(4);
    expect(plan.fixtures).toHaveLength(12);
    expect(() => validateNamedFinals([{ ...final, registrationIds: ['r1', 'r2'] }], new Map())).toThrow();
  });
  it('진출팀 미정이어도 순위 규칙의 자리 수로 결선과 부전승을 만든다', () => {
    const rules = Array.from({ length: 5 }, (_, i) => ({ groupId: `g${i}`, rank: 1 }));
    const plan = planNamedFinals([{ name: '미정 결선', rules, thirdPlace: true, registrationIds: null }]);
    expect(plan.slots).toHaveLength(5);
    expect(plan.fixtures).toHaveLength(5);
    expect(plan.byeSlots).toHaveLength(3);
    expect(plan.slots.every(slot => slot.kind === 'GROUP_RANK')).toBe(true);
    expect(() => planNamedFinals([{ name: '빈 결선', rules: [], thirdPlace: false, registrationIds: null }])).toThrow();
  });
  it('5개 조·11팀·홀수 총팀수·275경기를 허용하고 각 팀이 나머지 팀과 정확히 한 번 만난다', () => {
    const plan = planPreliminaryGroups(Array.from({ length: 5 }, (_, i) => ({ name: `${i + 1}조`, capacity: 11, legs: 1 as const })));
    expect(plan.groups).toHaveLength(5); expect(plan.slots).toHaveLength(55); expect(plan.fixtures).toHaveLength(275);
    for (const group of plan.groups) {
      const rows = plan.fixtures.filter(f => f.groupKey === group.key);
      expect(new Set(rows.map(f => [f.homeSlotKey, f.awaySlotKey].sort().join('|'))).size).toBe(55);
      for (const slot of plan.slots.filter(s => s.groupKey === group.key)) expect(rows.filter(f => f.homeSlotKey === slot.key || f.awaySlotKey === slot.key)).toHaveLength(10);
    }
  });
  it.each([2, 3, 5, 6, 10, 17, 65])('%i팀의 부전승·시드·연결을 실행하면 모든 팀이 단일 우승 경로에 포함된다', size => {
    const plan = planNamedFinals([{ name: '챔피언', rules: [], thirdPlace: false, registrationIds: Array.from({ length: size }, (_, i) => `team-${i}`) }], 30);
    expect(plan.fixtures).toHaveLength(size - 1); expect(plan.byeSlots).toHaveLength(2 ** Math.ceil(Math.log2(size)) - size);
    const played = new Map<string, Set<string>>(); const appearances = new Map<string, number>();
    for (const fixture of plan.fixtures) {
      const sides = (['HOME', 'AWAY'] as const).map(side => {
        const slotKey = side === 'HOME' ? fixture.homeSlotKey : fixture.awaySlotKey;
        if (slotKey) { appearances.set(slotKey, (appearances.get(slotKey) ?? 0) + 1); return new Set([slotKey]); }
        const edge = plan.edges.find(e => e.targetFixtureKey === fixture.key && e.targetSide === side);
        expect(edge).toBeDefined(); return played.get(edge!.sourceFixtureKey)!;
      });
      expect(sides[0]).toBeDefined(); expect(sides[1]).toBeDefined(); expect([...sides[0]].some(team => sides[1].has(team))).toBe(false);
      played.set(fixture.key, new Set([...sides[0], ...sides[1]]));
    }
    const final = plan.fixtures.find(f => plan.groups.find(g => g.key === f.groupKey)?.phase === 'final')!;
    expect(played.get(final.key)?.size).toBe(size); expect(appearances.size).toBe(size); expect([...appearances.values()].every(n => n === 1)).toBe(true); expect(plan.fixtures[0].fixtureNumber).toBe(31);
  });
  // 2026-11-06: 12팀 첫 라운드가 '16강'으로 나와 대회 규정(12강)과 달랐다. 이름만 팀 수로 부르고 단계 코드는 틀 기준을 유지한다.
  it.each([
    [12, ['12강', '8강', '4강', '결승'], ['round16', 'quarter', 'semi', 'final']],
    [6, ['6강', '4강', '결승'], ['quarter', 'semi', 'final']],
    [10, ['10강', '8강', '4강', '결승'], ['round16', 'quarter', 'semi', 'final']],
    [14, ['14강', '8강', '4강', '결승'], ['round16', 'quarter', 'semi', 'final']],
    [8, ['8강', '4강', '결승'], ['quarter', 'semi', 'final']],
    [16, ['16강', '8강', '4강', '결승'], ['round16', 'quarter', 'semi', 'final']],
    [5, ['8강', '4강', '결승'], ['quarter', 'semi', 'final']],
    [3, ['4강', '결승'], ['semi', 'final']],
  ] as const)('%i팀 결선의 라운드 이름은 %j 이고 단계 코드는 그대로다', (size, labels, phases) => {
    const plan = planNamedFinals([{ name: '프리미어', rules: [], thirdPlace: false, registrationIds: Array.from({ length: size }, (_, i) => `t${i}`) }]);
    expect(plan.groups.map(g => g.name)).toEqual(labels.map(label => `프리미어 · ${label}`));
    expect(plan.groups.map(g => g.phase)).toEqual(phases);
    // 경기의 round 값도 같은 이름이다 — 화면의 경기 이름·일정이 이 값을 그대로 쓴다.
    const roundsOfGroup = labels.map((_, i) => [...new Set(plan.fixtures.filter(f => f.groupKey === plan.groups[i].key).map(f => f.round))]);
    expect(roundsOfGroup).toEqual(labels.map(label => [label]));
  });
  it('3개 결선이 경기·승자/패자 연결·시상 범위를 공유하지 않는다', () => {
    const finals = [4, 5, 6].map((size, i) => ({ name: `토너먼트${i}`, thirdPlace: true, rules: [], registrationIds: Array.from({ length: size }, (_, j) => `t${i}-${j}`) }));
    const plan = planNamedFinals(finals); expect(new Set(plan.groups.map(g => g.bracketTrack)).size).toBe(3); expect(plan.fixtures).toHaveLength(15);
    for (const edge of plan.edges) {
      const source = plan.fixtures.find(f => f.key === edge.sourceFixtureKey)!; const target = plan.fixtures.find(f => f.key === edge.targetFixtureKey)!;
      expect(plan.groups.find(g => g.key === source.groupKey)?.bracketTrack).toBe(plan.groups.find(g => g.key === target.groupKey)?.bracketTrack);
    }
    expect(plan.edges.filter(e => e.outcome === 'LOSER')).toHaveLength(6);
  });
  it('조별로 다른 진출 수·목적지·순위 밖 수동 참가팀을 허용하고 중복 출처/참가팀을 거절한다', () => {
    const groups = new Map([['A', 8], ['B', 11]]);
    const finals = [{ name: '가', thirdPlace: false, rules: [{ groupId: 'A', rank: 8 }], registrationIds: ['manual-1', 'manual-2'] }, { name: '나', thirdPlace: false, rules: [{ groupId: 'B', rank: 1 }, { groupId: 'B', rank: 11 }], registrationIds: [] }];
    expect(() => validateNamedFinals(finals, groups)).not.toThrow();
    expect(() => validateNamedFinals([...finals, { ...finals[0], name: '다' }], groups)).toThrow();
    expect(() => validateNamedFinals([{ ...finals[0], rules: [{ groupId: 'A', rank: 9 }] }], groups)).toThrow();
    expect(() => validateNamedFinals([{ ...finals[0], registrationIds: ['duplicate', 'duplicate'] }], groups)).toThrow();
  });
  it('빈 결선·1팀 결선·3팀 3위전·중복 예선 참가팀을 거절한다', () => {
    for (const size of [0, 1]) expect(() => planNamedFinals([{ name: '결선', thirdPlace: false, rules: [], registrationIds: Array.from({ length: size }, (_, i) => String(i)) }])).toThrow();
    expect(() => planNamedFinals([{ name: '결선', thirdPlace: true, rules: [], registrationIds: ['a', 'b', 'c'] }])).toThrow();
    expect(() => planPreliminaryGroups([{ name: 'A', capacity: 2, legs: 1, registrationIds: ['a', 'a'] }])).toThrow();
  });
});
