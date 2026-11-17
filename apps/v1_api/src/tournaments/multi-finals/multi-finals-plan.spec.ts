import { orderRulesByRank, planNamedFinals, planPreliminaryGroups, validateNamedFinals } from './multi-finals-plan';

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
    [3, ['준결승', '결승'], ['semi', 'final']],
    [4, ['4강', '결승'], ['semi', 'final']],
  ] as const)('%i팀 결선의 라운드 이름은 %j 이고 단계 코드는 그대로다', (size, labels, phases) => {
    const plan = planNamedFinals([{ name: '프리미어', rules: [], thirdPlace: false, registrationIds: Array.from({ length: size }, (_, i) => `t${i}`) }]);
    expect(plan.groups.map(g => g.name)).toEqual(labels.map(label => `프리미어 · ${label}`));
    expect(plan.groups.map(g => g.phase)).toEqual(phases);
    // 경기의 round 값도 같은 이름이다 — 화면의 경기 이름·일정이 이 값을 그대로 쓴다.
    const roundsOfGroup = labels.map((_, i) => [...new Set(plan.fixtures.filter(f => f.groupKey === plan.groups[i].key).map(f => f.round))]);
    expect(roundsOfGroup).toEqual(labels.map(label => [label]));
  });
  // 웹 화면이 토너먼트를 만든 순서로 보여 주는 근거다(`apps/v1_web/src/lib/bracket-track.ts`의 orderedBracketTracks,
  // 웹 픽스처 `apps/v1_web/src/test/named-final-groups.ts`가 이 공식을 재현한다). 공식을 바꾸면 여기가 먼저 깨져야 한다.
  it('토너먼트 그룹의 sortOrder 는 트랙번호*100+단계(3·4위전은 +99)라 팀 수가 달라도 트랙별 최소값이 만든 순서대로 늘어난다', () => {
    const teamIds = (prefix: string, size: number) => Array.from({ length: size }, (_, i) => `${prefix}${i}`);
    const plan = planNamedFinals([
      { name: '프리미어', rules: [], thirdPlace: true, registrationIds: teamIds('p', 8) },
      { name: '챌린지', rules: [], thirdPlace: true, registrationIds: teamIds('c', 12) },
      { name: '도전', rules: [], thirdPlace: false, registrationIds: teamIds('d', 4) },
    ]);
    const byTrack = (track: string) => plan.groups.filter(g => g.bracketTrack === track);
    expect(byTrack('프리미어').map(g => [g.phase, g.sortOrder])).toEqual([['quarter', 0], ['semi', 1], ['final', 2], ['third_place', 99]]);
    expect(byTrack('챌린지').map(g => [g.phase, g.sortOrder])).toEqual([['round16', 100], ['quarter', 101], ['semi', 102], ['final', 103], ['third_place', 199]]);
    expect(byTrack('도전').map(g => [g.phase, g.sortOrder])).toEqual([['semi', 200], ['final', 201]]);
    const firstSortOrders = ['프리미어', '챌린지', '도전'].map(track => Math.min(...byTrack(track).map(g => g.sortOrder)));
    expect(firstSortOrders).toEqual([...firstSortOrders].sort((a, b) => a - b));
  });
  it('예선 조 그룹은 트랙 이름을 갖지 않아 결선 순서 계산에 끼어들지 않는다', () => {
    const plan = planPreliminaryGroups([{ name: 'A조', capacity: 4, legs: 1 }, { name: 'B조', capacity: 4, legs: 1 }]);
    expect(plan.groups.map(g => g.phase)).toEqual(['group', 'group']);
    expect(plan.groups.every(g => g.bracketTrack === undefined || g.bracketTrack === 'overall')).toBe(true);
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

describe('진출 규칙의 시드 순서', () => {
  const label = (rule: { groupId: string; rank: number }, names: Record<string, string>) => `${names[rule.groupId]}${rule.rank}`;
  const byGroup = (groups: string[], ranks: number[]) => groups.flatMap(groupId => ranks.map(rank => ({ groupId, rank })));
  // Seed n is rules[n - 1]; the byes of a short bracket go to the lowest seed numbers.
  const byeHolders = (rules: Array<{ groupId: string; rank: number }>, names: Record<string, string>) => {
    const plan = planNamedFinals([{ name: '본선', thirdPlace: false, rules, registrationIds: null }]);
    return plan.slots.filter(slot => slot.byeSortOrder !== undefined).map(slot => label(rules[slot.position - 1], names));
  };

  it('조 단위로 넣은 6팀 규칙(5팀×2조, 1~3위)도 순위 먼저 정렬되어 조 1위 둘이 부전승이다', () => {
    const names = { 0: 'A', 1: 'B' } as Record<string, string>;
    const typed = byGroup(['0', '1'], [1, 2, 3]);
    expect(byeHolders(typed, names)).toEqual(['A1', 'A2']);
    const ordered = orderRulesByRank(typed, ['0', '1']);
    expect(ordered.map(rule => label(rule, names))).toEqual(['A1', 'B1', 'A2', 'B2', 'A3', 'B3']);
    expect(byeHolders(ordered, names)).toEqual(['A1', 'B1']);
  });
  it('4개 조×3위 12팀 규칙은 1위 4팀 → 2위 4팀 → 3위 4팀 순서이고 부전승 4자리는 조 1위가 받는다', () => {
    const names = { a: 'A', b: 'B', c: 'C', d: 'D' } as Record<string, string>;
    const ordered = orderRulesByRank(byGroup(['a', 'b', 'c', 'd'], [1, 2, 3]), ['a', 'b', 'c', 'd']);
    expect(ordered.map(rule => label(rule, names))).toEqual(['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2', 'A3', 'B3', 'C3', 'D3']);
    expect(byeHolders(ordered, names)).toEqual(['A1', 'B1', 'C1', 'D1']);
  });
  it('같은 순위끼리는 저장된 규칙 순서가 아니라 주어진 조 순서를 따른다', () => {
    const typed = [{ groupId: 'b', rank: 2 }, { groupId: 'a', rank: 2 }, { groupId: 'b', rank: 1 }, { groupId: 'a', rank: 1 }];
    expect(orderRulesByRank(typed, ['a', 'b'])).toEqual([{ groupId: 'a', rank: 1 }, { groupId: 'b', rank: 1 }, { groupId: 'a', rank: 2 }, { groupId: 'b', rank: 2 }]);
    expect(orderRulesByRank(typed, ['b', 'a'])).toEqual([{ groupId: 'b', rank: 1 }, { groupId: 'a', rank: 1 }, { groupId: 'b', rank: 2 }, { groupId: 'a', rank: 2 }]);
  });
  it('조마다 진출 순위가 달라도 순위 먼저 놓고 비는 자리는 건너뛴다', () => {
    const typed = [{ groupId: 'a', rank: 1 }, { groupId: 'a', rank: 2 }, { groupId: 'a', rank: 3 }, { groupId: 'b', rank: 1 }, { groupId: 'c', rank: 2 }];
    expect(orderRulesByRank(typed, ['a', 'b', 'c'])).toEqual([
      { groupId: 'a', rank: 1 }, { groupId: 'b', rank: 1 }, { groupId: 'a', rank: 2 }, { groupId: 'c', rank: 2 }, { groupId: 'a', rank: 3 },
    ]);
  });
  it('이미 순위순으로 넣은 규칙은 그대로이고 입력 배열은 바뀌지 않는다', () => {
    const ranked = [{ groupId: 'a', rank: 1 }, { groupId: 'b', rank: 1 }, { groupId: 'a', rank: 2 }, { groupId: 'b', rank: 2 }];
    const snapshot = ranked.map(rule => ({ ...rule }));
    expect(orderRulesByRank(ranked, ['a', 'b'])).toEqual(snapshot);
    const mixed = [ranked[3], ranked[0]];
    orderRulesByRank(mixed, ['a', 'b']);
    expect(mixed).toEqual([ranked[3], ranked[0]]);
  });
});
