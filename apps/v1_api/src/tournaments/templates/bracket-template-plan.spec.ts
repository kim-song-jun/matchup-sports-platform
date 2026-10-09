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

  it('knockout 16 + 3·4위전 = 경기 16(8+4+2+1+1) · 연결 16(8강←16강 8, 4강←8강 4, 결승←4강 2, 3위←4강 2) · ENTRY 16 · BYE 0', () => {
    const p = plan({ kind: 'knockout', size: 16, thirdPlace: true });
    expect(sizes(p)).toEqual({ groups: 5, fixtures: 16, edges: 16, entry: 16, bye: 0, byeSlots: 0 });
    expect(p.groups.map((g) => [g.name, g.phase])).toEqual([
      ['16강', 'round16'], ['8강', 'quarter'], ['4강', 'semi'], ['결승', 'final'], ['3위 결정전', 'third_place'],
    ]);
    const perRound = new Map<string, number>();
    for (const f of p.fixtures) perRound.set(f.round, (perRound.get(f.round) ?? 0) + 1);
    expect([...perRound]).toEqual([['16강', 8], ['8강', 4], ['4강', 2], ['결승', 1], ['3·4위전', 1]]);
  });

  it('knockout 16 (3·4위전 없음) = 경기 15 · 연결 14 · 조 4개', () => {
    const p = plan({ kind: 'knockout', size: 16, thirdPlace: false });
    expect(sizes(p)).toEqual({ groups: 4, fixtures: 15, edges: 14, entry: 16, bye: 0, byeSlots: 0 });
    expect(p.groups.map((g) => g.phase)).toEqual(['round16', 'quarter', 'semi', 'final']);
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

describe('planBracketTemplate — 16강 배선(스펙 S2)', () => {
  const p = plan({ kind: 'knockout', size: 16, thirdPlace: true });
  const incoming = (key: string) => p.edges.filter((e) => e.targetFixtureKey === key);

  it('16강 2i-1·2i 번 경기 승자 → 8강 i 번 경기 홈·어웨이', () => {
    for (const i of [1, 2, 3, 4]) {
      expect(incoming(`quarter-${i}`).map((e) => [e.sourceFixtureKey, e.outcome, e.targetSide]).sort()).toEqual([
        [`round16-${2 * i - 1}`, 'WINNER', 'HOME'],
        [`round16-${2 * i}`, 'WINNER', 'AWAY'],
      ]);
    }
  });

  it('16강 ENTRY 자리는 1~16 이 경기 i 번 홈=2i-1 · 어웨이=2i 번에 쓰이고 8강 이후 경기는 자리를 쓰지 않는다', () => {
    const slotOf = (key: string | null) => p.slots.find((s) => s.key === key)?.position ?? null;
    for (const f of p.fixtures.filter((x) => x.groupKey === 'round16')) {
      const n = Number(f.key.split('-')[1]);
      expect([slotOf(f.homeSlotKey), slotOf(f.awaySlotKey)]).toEqual([2 * n - 1, 2 * n]);
    }
    for (const f of p.fixtures.filter((x) => x.groupKey !== 'round16')) expect([f.homeSlotKey, f.awaySlotKey]).toEqual([null, null]);
  });

  it('16강엔 부전승이 없다 — BYE 자리·ByeSlot 이 없고 LOSER 연결은 4강 → 3·4위전 둘뿐이다', () => {
    expect(p.slots.some((s) => s.kind === 'BYE')).toBe(false);
    expect(p.byeSlots).toEqual([]);
    expect(p.edges.filter((e) => e.outcome === 'LOSER').map((e) => e.sourceFixtureKey).sort()).toEqual(['semi-1', 'semi-2']);
  });

  it('경기 번호는 16강 1~8 → 8강 9~12 → 4강 13~14 → 결승 15 → 3·4위전 16 (offset 반영)', () => {
    const shifted = plan({ kind: 'knockout', size: 16, thirdPlace: true }, 10);
    expect(shifted.fixtures.map((f) => [f.round, f.fixtureNumber])).toEqual([
      ...[11, 12, 13, 14, 15, 16, 17, 18].map((n) => ['16강', n]),
      ...[19, 20, 21, 22].map((n) => ['8강', n]),
      ['4강', 23], ['4강', 24], ['결승', 25], ['3·4위전', 26],
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
    { kind: 'knockout', size: 16, thirdPlace: false },
    { kind: 'knockout', size: 16, thirdPlace: true },
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
    [{ kind: 'knockout', size: 10, thirdPlace: false }],
    [{ kind: 'knockout', size: 20, thirdPlace: true }],
    [{ kind: 'league', teamCount: 2, legs: 1 }],
    [{ kind: 'league', teamCount: 21, legs: 1 }],
    [{ kind: 'league', teamCount: 4, legs: 3 }],
  ] as unknown as Array<[BracketTemplateInput]>)('범위 밖·미지원 입력 %j → BRACKET_TEMPLATE_UNSUPPORTED', (input) => {
    expect(codeOf(() => plan(input))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });
});

describe('planBracketTemplate — group_knockout', () => {
  const groupKnockout = {
    kind: 'group_knockout' as const,
    groupCount: 2,
    teamsPerGroup: 4,
    advancePerGroup: 2 as const,
    legs: 1 as const,
    thirdPlace: false,
  };

  it('2조 x 4팀(2팀 진출): 조별 12 + 4강 2 + 결승 1 = 15경기, GROUP_RANK 자리 4개', () => {
    const p = plan(groupKnockout);
    expect(p.fixtures).toHaveLength(15);
    expect(p.slots.filter((slot) => slot.kind === 'GROUP_RANK')).toHaveLength(4);
    expect(p.slots.filter((slot) => slot.kind === 'ENTRY')).toHaveLength(8);
  });

  it('3·4위전 포함 시 16경기', () => {
    expect(plan({ ...groupKnockout, thirdPlace: true }).fixtures).toHaveLength(16);
  });

  it('fixtureNumberOffset 이 첫 조별 경기 번호에 반영된다', () => {
    const numbers = plan(groupKnockout, 20).fixtures.map((f) => f.fixtureNumber);
    expect(Math.min(...numbers)).toBe(21);
    expect(Math.max(...numbers)).toBe(35);
  });

  it('상한: 8조 x 6팀 x 2회전은 247경기라 422 BRACKET_TEMPLATE_TOO_LARGE, 8조 x 5팀 x 2회전(167경기)은 통과', () => {
    const big = { ...groupKnockout, groupCount: 8, teamsPerGroup: 6, advancePerGroup: 1 as const, legs: 2 as const };
    expect(codeOf(() => plan(big))).toBe('BRACKET_TEMPLATE_TOO_LARGE');
    expect(plan({ ...big, teamsPerGroup: 5 }).fixtures).toHaveLength(167);
  });

  it('결선 크기 6 (3조 x 2팀)은 422 BRACKET_TEMPLATE_UNSUPPORTED', () => {
    expect(codeOf(() => plan({ ...groupKnockout, groupCount: 3 }))).toBe('BRACKET_TEMPLATE_UNSUPPORTED');
  });

  describe('16강 (8조 x 2팀)', () => {
    const sixteen = { ...groupKnockout, groupCount: 8, teamsPerGroup: 4 };

    it('현실적인 8조 x 4팀 x 1회전: 조별 48 + 16강 8 + 8강 4 + 4강 2 + 결승 1 = 63경기(3·4위전 포함 64), 16강 그룹 phase round16', () => {
      const p = plan(sixteen);
      expect(p.fixtures).toHaveLength(63);
      expect(plan({ ...sixteen, thirdPlace: true }).fixtures).toHaveLength(64);
      expect(p.groups.find((g) => g.name === '16강')?.phase).toBe('round16');
      expect(p.fixtures.filter((f) => f.round === '16강')).toHaveLength(8);
    });

    it('상한 경계: 8조 x 6팀 x 2회전은 조별 240 + 결선 16 = 256경기라 422 BRACKET_TEMPLATE_TOO_LARGE(3·4위전 유무와 무관), 8조 x 5팀 x 2회전(175경기)·8조 x 6팀 x 1회전(135경기)은 통과', () => {
      const extreme = { ...sixteen, teamsPerGroup: 6, legs: 2 as const };
      expect(codeOf(() => plan(extreme))).toBe('BRACKET_TEMPLATE_TOO_LARGE');
      expect(codeOf(() => plan({ ...extreme, thirdPlace: true }))).toBe('BRACKET_TEMPLATE_TOO_LARGE');
      expect(plan({ ...extreme, teamsPerGroup: 5 }).fixtures).toHaveLength(175);
      expect(plan({ ...extreme, legs: 1 }).fixtures).toHaveLength(135);
    });
  });
});
