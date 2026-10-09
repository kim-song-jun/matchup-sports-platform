import { UnprocessableEntityException } from '@nestjs/common';
import type { BracketTemplatePlan } from './bracket-template-plan';
import { planGroupKnockoutTemplate, type GroupKnockoutTemplateInput } from './group-knockout-plan';

const base: GroupKnockoutTemplateInput = {
  kind: 'group_knockout',
  groupCount: 2,
  teamsPerGroup: 4,
  advancePerGroup: 2,
  legs: 1,
  thirdPlace: false,
};
const plan = (overrides: Partial<GroupKnockoutTemplateInput> = {}, offset = 0) =>
  planGroupKnockoutTemplate({ ...base, ...overrides }, { fixtureNumberOffset: offset });

const groupKeyByName = (p: BracketTemplatePlan, name: string) => p.groups.find((g) => g.name === name)!.key;
const knockoutFixtures = (p: BracketTemplatePlan, round: string) => p.fixtures.filter((f) => f.round === round);
const stageFixtures = (p: BracketTemplatePlan) => p.fixtures.filter((f) => f.round.startsWith('league_r'));
const rankLabel = (p: BracketTemplatePlan, key: string | null) => {
  const slot = p.slots.find((s) => s.key === key);
  if (!slot || slot.kind !== 'GROUP_RANK') return null;
  const source = p.groups.find((g) => g.key === slot.sourceGroupKey)!;
  return `${source.name.replace('조', '')}${slot.position}`;
};

describe('planGroupKnockoutTemplate — 개수 계약', () => {
  it('2조 x 4팀, 2팀 진출, 1회전: 조별 12 + 4강 2 + 결승 1 = 15경기, 연결 2, 자리 12(ENTRY 8 + GROUP_RANK 4)', () => {
    const p = plan();
    expect(stageFixtures(p)).toHaveLength(12);
    expect(p.fixtures).toHaveLength(15);
    expect(p.edges).toHaveLength(2);
    expect(p.groups).toHaveLength(4);
    expect(p.slots.filter((s) => s.kind === 'ENTRY')).toHaveLength(8);
    expect(p.slots.filter((s) => s.kind === 'GROUP_RANK')).toHaveLength(4);
    expect(p.byeSlots).toEqual([]);
  });

  it('3·4위전을 넣으면 경기 +1, 4강 패자 연결 +2, 3위 결정전 그룹 +1', () => {
    const p = plan({ thirdPlace: true });
    expect(p.fixtures).toHaveLength(16);
    expect(p.edges).toHaveLength(4);
    expect(p.groups).toHaveLength(5);
  });

  it.each([
    // 조, 팀, 진출, 회전, 3위전, 경기, 연결, 그룹, 자리
    [2, 3, 1, 1, false, 7, 0, 3, 8],
    [4, 4, 2, 2, true, 56, 8, 8, 24],
    [8, 3, 1, 1, false, 31, 6, 11, 32],
    [4, 5, 1, 2, false, 83, 2, 6, 24],
    // K=16: 16강 8 + 8강 4 + 4강 2 + 결승 1 (+ 3·4위전 1), 연결 8+4+2 (+2), 결선 그룹 4 (+1), GROUP_RANK 16
    [8, 4, 2, 1, false, 63, 14, 12, 48],
    [8, 4, 2, 1, true, 64, 16, 13, 48],
    [8, 5, 2, 2, true, 176, 16, 13, 56],
  ] as const)('%i조 x %i팀(진출 %i, %i회전, 3위전 %s) → 경기 %i · 연결 %i · 그룹 %i · 자리 %i', (groupCount, teamsPerGroup, advancePerGroup, legs, thirdPlace, fixtures, edges, groups, slots) => {
    const p = plan({ groupCount, teamsPerGroup, advancePerGroup, legs, thirdPlace });
    expect(p.fixtures).toHaveLength(fixtures);
    expect(p.edges).toHaveLength(edges);
    expect(p.groups).toHaveLength(groups);
    expect(p.slots).toHaveLength(slots);
  });
});

describe('planGroupKnockoutTemplate — 조별 라운드로빈', () => {
  it('조 이름·phase·진출 수와 ENTRY 자리 소속', () => {
    const p = plan({ groupCount: 4, advancePerGroup: 1 });
    expect(p.groups.slice(0, 4).map((g) => [g.name, g.phase, g.advanceCount])).toEqual([
      ['A조', 'group', 1],
      ['B조', 'group', 1],
      ['C조', 'group', 1],
      ['D조', 'group', 1],
    ]);
    const entry = p.slots.filter((s) => s.kind === 'ENTRY');
    expect(entry.every((s) => s.sourceGroupKey === null && s.groupKey !== null)).toBe(true);
    expect(entry.filter((s) => s.groupKey === groupKeyByName(p, 'B조')).map((s) => s.position)).toEqual([1, 2, 3, 4]);
  });

  it('각 ENTRY 자리는 자기 조 안에서 (팀 수-1) x 회전 경기를 치르고 다른 조 자리와는 붙지 않는다', () => {
    const p = plan({ legs: 2 });
    for (const entry of p.slots.filter((s) => s.kind === 'ENTRY')) {
      const games = stageFixtures(p).filter((f) => f.homeSlotKey === entry.key || f.awaySlotKey === entry.key);
      expect(games).toHaveLength((4 - 1) * 2);
      for (const game of games) expect(game.groupKey).toBe(entry.groupKey);
    }
    for (const game of stageFixtures(p)) {
      const sides = [game.homeSlotKey, game.awaySlotKey].map((key) => p.slots.find((s) => s.key === key)!);
      expect(sides[0].groupKey).toBe(sides[1].groupKey);
      expect(sides[0].key).not.toBe(sides[1].key);
    }
  });

  it('2회전은 같은 쌍을 홈/어웨이를 바꿔 한 번 더 붙인다', () => {
    const p = plan({ legs: 2, teamsPerGroup: 3, groupCount: 2 });
    const a = p.slots.filter((s) => s.kind === 'ENTRY' && s.groupKey === groupKeyByName(p, 'A조'));
    const [first, second] = [a[0].key, a[1].key];
    const meetings = stageFixtures(p).filter((f) => [f.homeSlotKey, f.awaySlotKey].includes(first) && [f.homeSlotKey, f.awaySlotKey].includes(second));
    expect(meetings.map((m) => m.legNumber).sort()).toEqual([1, 2]);
    const leg1 = meetings.find((m) => m.legNumber === 1)!;
    const leg2 = meetings.find((m) => m.legNumber === 2)!;
    expect(leg2.homeSlotKey).toBe(leg1.awaySlotKey);
  });

  it('경기 번호는 offset 다음부터 대회 전체에서 연속·유일하고 조별 → 결선 순이다', () => {
    const p = plan({ thirdPlace: true }, 10);
    const numbers = p.fixtures.map((f) => f.fixtureNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(Math.min(...numbers)).toBe(11);
    expect(Math.max(...numbers)).toBe(10 + p.fixtures.length);
    const lastStage = Math.max(...stageFixtures(p).map((f) => f.fixtureNumber));
    expect(Math.min(...knockoutFixtures(p, '4강').map((f) => f.fixtureNumber))).toBeGreaterThan(lastStage);
    // PR-1b/1c knockout 템플릿과 같은 순서: 결승 다음이 3·4위전
    expect(knockoutFixtures(p, '3·4위전')[0].fixtureNumber).toBe(knockoutFixtures(p, '결승')[0].fixtureNumber + 1);
  });

  it('(round, fixtureNumber, legNumber) 가 유일하다 — DB 유일 제약과 같은 조건', () => {
    const p = plan({ groupCount: 4, teamsPerGroup: 4, advancePerGroup: 2, legs: 2, thirdPlace: true });
    const triples = p.fixtures.map((f) => `${f.round}|${f.fixtureNumber}|${f.legNumber}`);
    expect(new Set(triples).size).toBe(triples.length);
  });
});

describe('planGroupKnockoutTemplate — 결선 자리와 연결', () => {
  it('2조 x 2팀: 4강 A1–B2, B1–A2 / 결승은 4강 승자끼리', () => {
    const p = plan();
    const semis = knockoutFixtures(p, '4강');
    expect(semis.map((f) => [rankLabel(p, f.homeSlotKey), rankLabel(p, f.awaySlotKey)])).toEqual([['A1', 'B2'], ['B1', 'A2']]);
    const [final] = knockoutFixtures(p, '결승');
    expect(final.homeSlotKey).toBeNull();
    expect(final.awaySlotKey).toBeNull();
    expect(p.edges).toEqual([
      { sourceFixtureKey: semis[0].key, outcome: 'WINNER', targetFixtureKey: final.key, targetSide: 'HOME' },
      { sourceFixtureKey: semis[1].key, outcome: 'WINNER', targetFixtureKey: final.key, targetSide: 'AWAY' },
    ]);
  });

  it('GROUP_RANK 자리: 결선 첫 그룹 소속, position = 순위, sourceGroupKey = 올라오는 조', () => {
    const p = plan();
    const rankSlots = p.slots.filter((s) => s.kind === 'GROUP_RANK');
    const semiGroup = groupKeyByName(p, '4강');
    expect(rankSlots.every((s) => s.groupKey === semiGroup)).toBe(true);
    expect(rankSlots.map((s) => [s.position, p.groups.find((g) => g.key === s.sourceGroupKey)!.name]).sort()).toEqual([
      [1, 'A조'],
      [1, 'B조'],
      [2, 'A조'],
      [2, 'B조'],
    ]);
  });

  it('4조 x 2팀: 8강 표 그대로, 8강 1·2경기 → 4강 1, 3·4경기 → 4강 2', () => {
    const p = plan({ groupCount: 4, advancePerGroup: 2 });
    const quarters = knockoutFixtures(p, '8강');
    expect(quarters.map((f) => [rankLabel(p, f.homeSlotKey), rankLabel(p, f.awaySlotKey)])).toEqual([
      ['A1', 'B2'], ['C1', 'D2'], ['B1', 'A2'], ['D1', 'C2'],
    ]);
    const semis = knockoutFixtures(p, '4강');
    const into = (target: string) => p.edges.filter((e) => e.targetFixtureKey === target).map((e) => [e.sourceFixtureKey, e.targetSide]);
    expect(into(semis[0].key)).toEqual([[quarters[0].key, 'HOME'], [quarters[1].key, 'AWAY']]);
    expect(into(semis[1].key)).toEqual([[quarters[2].key, 'HOME'], [quarters[3].key, 'AWAY']]);
  });

  it('결선 첫 라운드로 들어오는 연결선은 없다(자리가 대신한다) — 대조: 둘째 라운드부터는 양쪽 다 연결', () => {
    const p = plan({ groupCount: 4, advancePerGroup: 2 });
    const firstRoundKeys = new Set(knockoutFixtures(p, '8강').map((f) => f.key));
    expect(p.edges.some((e) => firstRoundKeys.has(e.targetFixtureKey))).toBe(false);
    for (const semi of knockoutFixtures(p, '4강')) {
      expect(p.edges.filter((e) => e.targetFixtureKey === semi.key).map((e) => e.targetSide).sort()).toEqual(['AWAY', 'HOME']);
    }
  });

  it('3·4위전: 별도 그룹(phase third_place)에 4강 LOSER 연결, 결승으로는 WINNER 만', () => {
    const p = plan({ thirdPlace: true });
    const third = p.groups.find((g) => g.phase === 'third_place')!;
    expect(third.name).toBe('3위 결정전');
    const [match] = knockoutFixtures(p, '3·4위전');
    expect(match.groupKey).toBe(third.key);
    const semis = knockoutFixtures(p, '4강');
    expect(p.edges.filter((e) => e.targetFixtureKey === match.key)).toEqual([
      { sourceFixtureKey: semis[0].key, outcome: 'LOSER', targetFixtureKey: match.key, targetSide: 'HOME' },
      { sourceFixtureKey: semis[1].key, outcome: 'LOSER', targetFixtureKey: match.key, targetSide: 'AWAY' },
    ]);
    const [final] = knockoutFixtures(p, '결승');
    expect(p.edges.filter((e) => e.targetFixtureKey === final.key).every((e) => e.outcome === 'WINNER')).toBe(true);
  });

  it('2조 x 1팀: 결선은 결승 한 경기, 연결 0, 결승 사이드가 곧 GROUP_RANK 자리', () => {
    const p = plan({ advancePerGroup: 1 });
    const [final] = knockoutFixtures(p, '결승');
    expect([rankLabel(p, final.homeSlotKey), rankLabel(p, final.awaySlotKey)]).toEqual(['A1', 'B1']);
    expect(p.edges).toEqual([]);
  });

  it('모든 경기·연결선이 계획 안의 자리·경기 키만 가리키고 키가 중복되지 않는다', () => {
    const p = plan({ groupCount: 4, advancePerGroup: 2, thirdPlace: true, legs: 2 });
    const slotKeys = new Set(p.slots.map((s) => s.key));
    const groupKeys = new Set(p.groups.map((g) => g.key));
    const fixtureKeys = new Set(p.fixtures.map((f) => f.key));
    expect(slotKeys.size).toBe(p.slots.length);
    expect(fixtureKeys.size).toBe(p.fixtures.length);
    expect(groupKeys.size).toBe(p.groups.length);
    for (const f of p.fixtures) {
      expect(groupKeys.has(f.groupKey)).toBe(true);
      for (const key of [f.homeSlotKey, f.awaySlotKey]) if (key !== null) expect(slotKeys.has(key)).toBe(true);
    }
    for (const e of p.edges) {
      expect(fixtureKeys.has(e.sourceFixtureKey)).toBe(true);
      expect(fixtureKeys.has(e.targetFixtureKey)).toBe(true);
    }
    for (const s of p.slots) {
      if (s.groupKey !== null) expect(groupKeys.has(s.groupKey)).toBe(true);
      if (s.sourceGroupKey !== null) expect(groupKeys.has(s.sourceGroupKey)).toBe(true);
    }
  });
});

describe('planGroupKnockoutTemplate — 16강 (8조 x 2팀, 스펙 S1-b·S2)', () => {
  const sixteen = (overrides: Partial<GroupKnockoutTemplateInput> = {}) =>
    plan({ groupCount: 8, teamsPerGroup: 4, advancePerGroup: 2, ...overrides });

  it('결선 그룹은 16강(phase round16) → 8강 → 4강 → 결승 → (thirdPlace 일 때만) 3위 결정전 순이고 sortOrder 는 0부터 그 순서다', () => {
    const p = sixteen({ thirdPlace: true });
    expect(p.groups.slice(8).map((g) => [g.name, g.phase])).toEqual([
      ['16강', 'round16'],
      ['8강', 'quarter'],
      ['4강', 'semi'],
      ['결승', 'final'],
      ['3위 결정전', 'third_place'],
    ]);
    expect(p.groups.slice(8).map((g) => g.sortOrder)).toEqual([0, 1, 2, 3, 4]);
    expect(sixteen().groups.slice(8).map((g) => g.phase)).toEqual(['round16', 'quarter', 'semi', 'final']);
  });

  it('라운드별 경기 수 8·4·2·1(+1)이고 조별 경기(8조 x 6) 뒤 번호로 이어진다', () => {
    const p = sixteen({ thirdPlace: true });
    expect(['16강', '8강', '4강', '결승', '3·4위전'].map((r) => knockoutFixtures(p, r).length)).toEqual([8, 4, 2, 1, 1]);
    expect(stageFixtures(p)).toHaveLength(48);
    const lastStage = Math.max(...stageFixtures(p).map((f) => f.fixtureNumber));
    expect(Math.min(...knockoutFixtures(p, '16강').map((f) => f.fixtureNumber))).toBe(lastStage + 1);
  });

  it('16강 8경기가 스펙 S2 표 그대로 GROUP_RANK 자리를 사이드로 쓴다(자리 16개)', () => {
    const p = sixteen();
    expect(p.slots.filter((s) => s.kind === 'GROUP_RANK')).toHaveLength(16);
    expect(knockoutFixtures(p, '16강').map((f) => [rankLabel(p, f.homeSlotKey), rankLabel(p, f.awaySlotKey)])).toEqual([
      ['A1', 'B2'], ['C1', 'D2'], ['E1', 'F2'], ['G1', 'H2'],
      ['B1', 'A2'], ['D1', 'C2'], ['F1', 'E2'], ['H1', 'G2'],
    ]);
    const firstGroup = groupKeyByName(p, '16강');
    expect(p.slots.filter((s) => s.kind === 'GROUP_RANK').every((s) => s.groupKey === firstGroup)).toBe(true);
  });

  it('16강 2i-1·2i 번 경기 승자 → 8강 i 번 경기 홈·어웨이, 8강→4강→결승도 같은 규칙이고 16강으로 들어오는 연결·부전승은 없다', () => {
    const p = sixteen();
    const r16 = knockoutFixtures(p, '16강');
    const quarters = knockoutFixtures(p, '8강');
    for (let i = 1; i <= 4; i += 1) {
      expect(p.edges.filter((e) => e.targetFixtureKey === quarters[i - 1].key)).toEqual([
        { sourceFixtureKey: r16[2 * i - 2].key, outcome: 'WINNER', targetFixtureKey: quarters[i - 1].key, targetSide: 'HOME' },
        { sourceFixtureKey: r16[2 * i - 1].key, outcome: 'WINNER', targetFixtureKey: quarters[i - 1].key, targetSide: 'AWAY' },
      ]);
    }
    expect(p.edges).toHaveLength(8 + 4 + 2);
    expect(p.edges.every((e) => e.outcome === 'WINNER')).toBe(true);
    expect(p.edges.some((e) => r16.some((f) => f.key === e.targetFixtureKey))).toBe(false);
    expect(p.byeSlots).toEqual([]);
    expect(quarters.every((f) => f.homeSlotKey === null && f.awaySlotKey === null)).toBe(true);
  });

  it('3·4위전은 4강 패자 연결만 받고(16강·8강 패자는 연결 없음) 연결 16개다', () => {
    const p = sixteen({ thirdPlace: true });
    const [match] = knockoutFixtures(p, '3·4위전');
    const semis = knockoutFixtures(p, '4강');
    expect(p.edges.filter((e) => e.outcome === 'LOSER')).toEqual([
      { sourceFixtureKey: semis[0].key, outcome: 'LOSER', targetFixtureKey: match.key, targetSide: 'HOME' },
      { sourceFixtureKey: semis[1].key, outcome: 'LOSER', targetFixtureKey: match.key, targetSide: 'AWAY' },
    ]);
    expect(p.edges).toHaveLength(16);
  });

  it('(round, fixtureNumber, legNumber) 유일 — 2회전 8조 x 5팀 포함', () => {
    const p = sixteen({ teamsPerGroup: 5, legs: 2, thirdPlace: true });
    const triples = p.fixtures.map((f) => `${f.round}|${f.fixtureNumber}|${f.legNumber}`);
    expect(new Set(triples).size).toBe(triples.length);
  });
});

describe('planGroupKnockoutTemplate — 거절', () => {
  const codeOf = (operation: () => unknown) => {
    try {
      operation();
    } catch (error) {
      if (!(error instanceof UnprocessableEntityException)) throw error;
      return (error.getResponse() as { code?: string }).code;
    }
    throw new Error('예외가 나지 않았다');
  };

  it.each([
    ['결선 크기 3 (3조 x 1)', { groupCount: 3, advancePerGroup: 1 as const }],
    ['결선 크기 7 (7조 x 1)', { groupCount: 7, advancePerGroup: 1 as const }],
    ['결선 크기 14 (7조 x 2)', { groupCount: 7, advancePerGroup: 2 as const }],
    ['결선 크기 6 (3조 x 2)', { groupCount: 3, advancePerGroup: 2 as const }],
    ['조 1개', { groupCount: 1 }],
    ['조 9개', { groupCount: 9 }],
    ['조당 2팀', { teamsPerGroup: 2 }],
    ['조당 7팀', { teamsPerGroup: 7 }],
    ['3회전', { legs: 3 as unknown as 1 }],
    ['진출 3팀', { advancePerGroup: 3 as unknown as 1 }],
  ])('%s → 422 BRACKET_TEMPLATE_UNSUPPORTED', (_name, overrides) => {
    expect(codeOf(() => plan(overrides))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });

  it('결선이 결승 한 경기뿐(2조 x 1)인데 3·4위전을 넣으면 422 — 3·4위전의 패자 원천은 4강뿐', () => {
    expect(codeOf(() => plan({ advancePerGroup: 1, thirdPlace: true }))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });

  it('결선 16(8조 x 2)은 거절하지 않는다 — 대조: 조 9개(결선 18)는 거절', () => {
    expect(() => plan({ groupCount: 8, advancePerGroup: 2 })).not.toThrow();
    expect(codeOf(() => plan({ groupCount: 9, advancePerGroup: 2 }))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });
});
