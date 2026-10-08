import {
  BRACKET_TEMPLATE_MAX_FIXTURES,
  ROUND12_BYE_SORT_ORDERS,
  planBracketTemplate,
  type BracketTemplateInput,
  type BracketTemplatePlan,
} from './bracket-template-plan';

const plan = (input: BracketTemplateInput, offset = 0) =>
  planBracketTemplate(input, { fixtureNumberOffset: offset });

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { response?: { code?: string } }).response?.code;
  }
  return undefined;
}

const sizes = (p: BracketTemplatePlan) => ({
  groups: p.groups.length,
  fixtures: p.fixtures.length,
  edges: p.edges.length,
  entry: p.slots.filter((s) => s.kind === 'ENTRY').length,
  bye: p.slots.filter((s) => s.kind === 'BYE').length,
  byeSlots: p.byeSlots.length,
});

describe('planBracketTemplate — 개수 계약(스펙 Test Scenarios)', () => {
  it('knockout 8 + 3·4위전 = 경기 8 · 연결 8 · ENTRY 8, 조 4개', () => {
    const p = plan({ kind: 'knockout', size: 8, thirdPlace: true });
    expect(sizes(p)).toEqual({ groups: 4, fixtures: 8, edges: 8, entry: 8, bye: 0, byeSlots: 0 });
    expect(p.groups.map((g) => [g.name, g.phase])).toEqual([
      ['8강', 'quarter'], ['4강', 'semi'], ['결승', 'final'], ['3위 결정전', 'third_place'],
    ]);
    expect(p.fixtures.map((f) => f.round)).toEqual(['8강', '8강', '8강', '8강', '4강', '4강', '결승', '3·4위전']);
  });

  it('knockout 4 (3·4위전 없음) = 경기 3 · 연결 2 · ENTRY 4', () => {
    const p = plan({ kind: 'knockout', size: 4, thirdPlace: false });
    expect(sizes(p)).toEqual({ groups: 2, fixtures: 3, edges: 2, entry: 4, bye: 0, byeSlots: 0 });
    expect(p.groups.map((g) => g.name)).toEqual(['4강', '결승']);
  });

  it('knockout 12 + 3·4위전 = 경기 12(4+4+2+1+1) · 연결 12 · ENTRY 8 · BYE 4 · ByeSlot 4', () => {
    const p = plan({ kind: 'knockout', size: 12, thirdPlace: true });
    expect(sizes(p)).toEqual({ groups: 5, fixtures: 12, edges: 12, entry: 8, bye: 4, byeSlots: 4 });
    const perRound = new Map<string, number>();
    for (const f of p.fixtures) perRound.set(f.round, (perRound.get(f.round) ?? 0) + 1);
    expect([...perRound]).toEqual([['12강', 4], ['8강', 4], ['4강', 2], ['결승', 1], ['3·4위전', 1]]);
  });

  it('league 6팀 2회전 = 30경기, 같은 쌍이 정확히 두 번이고 홈/원정이 교대한다', () => {
    const p = plan({ kind: 'league', teamCount: 6, legs: 2 });
    expect(p.fixtures).toHaveLength(30);
    expect(p.groups).toEqual([{ key: 'league', name: '리그', phase: 'group', sortOrder: 0, advanceCount: null }]);
    expect(p.slots.map((s) => [s.key, s.kind, s.position, s.groupKey])).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => [`entry-${n}`, 'ENTRY', n, 'league']),
    );
    const meetings = new Map<string, string[]>();
    for (const f of p.fixtures) {
      const pair = [f.homeSlotKey!, f.awaySlotKey!].sort().join('|');
      meetings.set(pair, [...(meetings.get(pair) ?? []), `${f.legNumber}:${f.homeSlotKey}`]);
    }
    expect(meetings.size).toBe(15);
    for (const list of meetings.values()) {
      expect(list).toHaveLength(2);
      expect(list[0].split(':')[1]).not.toBe(list[1].split(':')[1]); // 2회전은 홈이 뒤집힌다
    }
    expect(p.fixtures[0].round).toBe('league_r1');
  });
});

describe('planBracketTemplate — 12강 배선(스펙 S2)', () => {
  const p = plan({ kind: 'knockout', size: 12, thirdPlace: true });
  const fixture = (key: string) => p.fixtures.find((f) => f.key === key)!;

  it('BYE 자리 position 1~4 는 ByeSlot sortOrder 0,3,4,7 에 대응한다', () => {
    expect(ROUND12_BYE_SORT_ORDERS).toEqual([0, 3, 4, 7]);
    expect(p.byeSlots).toEqual([0, 3, 4, 7].map((sortOrder) => ({ groupKey: 'round12', sortOrder })));
    expect(p.slots.filter((s) => s.kind === 'BYE').map((s) => [s.position, s.groupKey])).toEqual(
      [1, 2, 3, 4].map((n) => [n, 'round12']),
    );
  });

  it('8강 i번 경기: 홈 = BYE 자리 i, 어웨이 = 12강 i번 경기 WINNER 연결', () => {
    for (const i of [1, 2, 3, 4]) {
      const quarter = fixture(`quarter-${i}`);
      expect(quarter.homeSlotKey).toBe(`bye-${i}`);
      expect(quarter.awaySlotKey).toBeNull();
      expect(p.edges).toContainEqual({
        sourceFixtureKey: `round12-${i}`, outcome: 'WINNER', targetFixtureKey: `quarter-${i}`, targetSide: 'AWAY',
      });
      expect(fixture(`round12-${i}`).homeSlotKey).toBe(`entry-${2 * i - 1}`);
      expect(fixture(`round12-${i}`).awaySlotKey).toBe(`entry-${2 * i}`);
    }
  });

  it('LOSER 연결은 4강 → 3·4위전에만 있다', () => {
    const losers = p.edges.filter((e) => e.outcome === 'LOSER');
    expect(losers).toEqual([
      { sourceFixtureKey: 'semi-1', outcome: 'LOSER', targetFixtureKey: 'third_place-1', targetSide: 'HOME' },
      { sourceFixtureKey: 'semi-2', outcome: 'LOSER', targetFixtureKey: 'third_place-1', targetSide: 'AWAY' },
    ]);
  });
});

describe('planBracketTemplate — 모든 템플릿이 지켜야 할 DB 불변식', () => {
  const inputs: BracketTemplateInput[] = [
    { kind: 'knockout', size: 4, thirdPlace: false },
    { kind: 'knockout', size: 4, thirdPlace: true },
    { kind: 'knockout', size: 8, thirdPlace: false },
    { kind: 'knockout', size: 8, thirdPlace: true },
    { kind: 'knockout', size: 12, thirdPlace: false },
    { kind: 'knockout', size: 12, thirdPlace: true },
    { kind: 'league', teamCount: 3, legs: 1 },
    { kind: 'league', teamCount: 7, legs: 2 },
  ];

  it.each(inputs.map((input) => [JSON.stringify(input), input] as const))('%s', (_label, input) => {
    const p = plan(input, 10);
    const slotKeys = new Set(p.slots.map((s) => s.key));
    const fixtureKeys = new Set(p.fixtures.map((f) => f.key));
    const groupKeys = new Set(p.groups.map((g) => g.key));
    expect(slotKeys.size).toBe(p.slots.length);
    expect(fixtureKeys.size).toBe(p.fixtures.length);

    // 참조 무결성
    for (const s of p.slots) if (s.groupKey !== null) expect(groupKeys.has(s.groupKey)).toBe(true);
    for (const f of p.fixtures) {
      expect(groupKeys.has(f.groupKey)).toBe(true);
      for (const key of [f.homeSlotKey, f.awaySlotKey]) if (key !== null) expect(slotKeys.has(key)).toBe(true);
    }
    for (const e of p.edges) {
      expect(fixtureKeys.has(e.sourceFixtureKey)).toBe(true);
      expect(fixtureKeys.has(e.targetFixtureKey)).toBe(true);
    }

    // v1_tournament_match_advancement_edges 유일 제약 2개
    const bySource = p.edges.map((e) => `${e.sourceFixtureKey}|${e.outcome}`);
    const byTarget = p.edges.map((e) => `${e.targetFixtureKey}|${e.targetSide}`);
    expect(new Set(bySource).size).toBe(bySource.length);
    expect(new Set(byTarget).size).toBe(byTarget.length);

    // 한 사이드를 자리와 연결선이 동시에 채우지 않는다(자리 연결 사이드는 PATCH 불가, 연결선 사이드는 승자가 채움)
    for (const f of p.fixtures) {
      if (f.homeSlotKey !== null) expect(byTarget).not.toContain(`${f.key}|HOME`);
      if (f.awaySlotKey !== null) expect(byTarget).not.toContain(`${f.key}|AWAY`);
    }

    // 번호는 offset 다음부터 연속, (round, fixtureNumber, legNumber) 유일
    const numbers = p.fixtures.map((f) => f.fixtureNumber).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: p.fixtures.length }, (_, i) => 11 + i));
    const coords = p.fixtures.map((f) => `${f.round}|${f.fixtureNumber}|${f.legNumber}`);
    expect(new Set(coords).size).toBe(coords.length);
  });

  it('knockout 은 ENTRY/BYE 자리마다 정확히 한 경기 사이드에서 쓰인다', () => {
    for (const input of inputs.filter((i) => i.kind === 'knockout')) {
      const p = plan(input);
      const used = p.fixtures.flatMap((f) => [f.homeSlotKey, f.awaySlotKey]).filter((k): k is string => k !== null);
      expect([...used].sort()).toEqual(p.slots.map((s) => s.key).sort());
    }
  });
});

describe('planBracketTemplate — 거부', () => {
  it('상한 240 경기: 16팀 2회전(=240)은 통과하고 17팀 2회전(=272)은 BRACKET_TEMPLATE_TOO_LARGE', () => {
    expect(BRACKET_TEMPLATE_MAX_FIXTURES).toBe(240);
    expect(plan({ kind: 'league', teamCount: 16, legs: 2 }).fixtures).toHaveLength(240);
    expect(codeOf(() => plan({ kind: 'league', teamCount: 17, legs: 2 }))).toBe('BRACKET_TEMPLATE_TOO_LARGE');
  });

  it.each([
    [{ kind: 'knockout', size: 5, thirdPlace: false }],
    [{ kind: 'knockout', size: 16, thirdPlace: true }],
    [{ kind: 'league', teamCount: 2, legs: 1 }],
    [{ kind: 'league', teamCount: 21, legs: 1 }],
    [{ kind: 'league', teamCount: 4, legs: 3 }],
    [{ kind: 'group_knockout', groupCount: 2, teamsPerGroup: 4, advancePerGroup: 2, legs: 1, thirdPlace: false }],
  ] as unknown as Array<[BracketTemplateInput]>)('범위 밖·미지원 입력 %j → BRACKET_TEMPLATE_UNSUPPORTED', (input) => {
    expect(codeOf(() => plan(input))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });
});
