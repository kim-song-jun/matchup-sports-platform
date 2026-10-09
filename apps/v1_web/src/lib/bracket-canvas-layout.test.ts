import { describe, expect, it } from 'vitest';
import { makeFixture, makeGame, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import {
  buildCanvasLayout,
  buildSideLabelContext,
  classifyFixtureSide,
  fixtureNodeState,
  fixtureSideLabel,
  isFixtureLocked,
  isSlotAssignable,
} from './bracket-canvas-layout';

// 칸 폭 232, 높이 156, 열 간격 72, 바깥 여백 24, 열 이름 32 → 첫 칸 y 56, 칸 사이 24.
const semi = makeGroup({ id: 'g-semi', name: '4강', phase: 'semi', sortOrder: 0 });
const final = makeGroup({ id: 'g-final', name: '결승', phase: 'final', sortOrder: 1 });
const third = makeGroup({ id: 'g-third', name: '3·4위전', phase: 'third_place', sortOrder: 2 });

const f1 = makeFixture({ id: 'f1', groupId: 'g-semi', fixtureNumber: 1, round: '4강' });
const f2 = makeFixture({ id: 'f2', groupId: 'g-semi', fixtureNumber: 2, round: '4강' });
const f3 = makeFixture({
  id: 'f3',
  groupId: 'g-final',
  fixtureNumber: 3,
  round: '결승',
  bracketSources: [
    { fixtureId: 'f1', outcome: 'WINNER', side: 'HOME' },
    { fixtureId: 'f2', outcome: 'WINNER', side: 'AWAY' },
  ],
});
const f4 = makeFixture({
  id: 'f4',
  groupId: 'g-third',
  fixtureNumber: 4,
  round: '3·4위전',
  bracketSources: [
    { fixtureId: 'f1', outcome: 'LOSER', side: 'HOME' },
    { fixtureId: 'f2', outcome: 'LOSER', side: 'AWAY' },
  ],
});

describe('buildCanvasLayout — 4팀 + 3·4위전', () => {
  // 입력 순서를 섞어도 열은 4강 > 결승 > 3·4위전이어야 한다.
  const layout = buildCanvasLayout({ groups: [third, final, semi], fixtures: [f4, f2, f3, f1], slots: [] });
  const node = (id: string) => layout.nodes.find((n) => n.fixtureId === id)!;

  it('단계 순서로 열을 만들고 x 를 열 폭+간격으로 늘린다', () => {
    expect(layout.columns.map((c) => [c.label, c.x])).toEqual([
      ['4강', 24],
      ['결승', 328],
      ['3·4위전', 632],
    ]);
  });

  it('첫 열은 번호 순으로 쌓고, 다음 열은 원천 두 칸의 가운데에 놓는다', () => {
    expect([node('f1').y, node('f2').y]).toEqual([56, 236]);
    // 원천 연결 높이 144·324 의 평균 234 에서 칸 연결 높이 88 을 뺀다.
    expect(node('f3').y).toBe(146);
    expect(node('f4').y).toBe(146);
    expect(node('f3').x).toBe(328);
  });

  it('승자·패자 연결선을 칸 오른쪽 가운데에서 대상 사이드 줄까지 꺾어 그린다', () => {
    const edge = (id: string) => layout.edges.find((e) => e.id === id)!;
    expect(layout.edges).toHaveLength(4);
    expect(edge('f1->f3:HOME')).toMatchObject({ kind: 'WINNER', fromFixtureId: 'f1', toFixtureId: 'f3', side: 'HOME', path: 'M256 144 H292 V212 H328' });
    expect(edge('f2->f3:AWAY').path).toBe('M256 324 H292 V256 H328');
    expect(edge('f1->f4:HOME')).toMatchObject({ kind: 'LOSER', path: 'M256 144 H596 V212 H632' });
  });

  it('전체 크기는 마지막 열과 가장 아래 칸에 여백을 더한 값이다', () => {
    expect(layout.width).toBe(888);
    expect(layout.height).toBe(416);
  });
});

describe('buildCanvasLayout — 12강 부전승 대진', () => {
  const groups = [
    makeGroup({ id: 'g-r12', name: '12강', phase: 'round12', sortOrder: 0 }),
    makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter', sortOrder: 1 }),
    makeGroup({ id: 'g-sf', name: '4강', phase: 'semi', sortOrder: 2 }),
    makeGroup({ id: 'g-f', name: '결승', phase: 'final', sortOrder: 3 }),
    makeGroup({ id: 'g-t', name: '3·4위전', phase: 'third_place', sortOrder: 4 }),
  ];
  const slots = [1, 2, 3, 4].map((n) => makeSlot({ id: `bye-${n}`, kind: 'BYE', label: `부전승 ${n}`, position: n }));
  const r12 = [1, 2, 3, 4].map((n) => makeFixture({ id: `f${n}`, groupId: 'g-r12', fixtureNumber: n, round: '12강' }));
  const qf = [1, 2, 3, 4].map((n) =>
    makeFixture({
      id: `f${n + 4}`,
      groupId: 'g-qf',
      fixtureNumber: n + 4,
      homeSlotId: `bye-${n}`,
      bracketSources: [{ fixtureId: `f${n}`, outcome: 'WINNER', side: 'AWAY' }],
    }),
  );
  const rest = [
    makeFixture({ id: 'f9', groupId: 'g-sf', fixtureNumber: 9, bracketSources: [{ fixtureId: 'f5', outcome: 'WINNER', side: 'HOME' }, { fixtureId: 'f6', outcome: 'WINNER', side: 'AWAY' }] }),
    makeFixture({ id: 'f10', groupId: 'g-sf', fixtureNumber: 10, bracketSources: [{ fixtureId: 'f7', outcome: 'WINNER', side: 'HOME' }, { fixtureId: 'f8', outcome: 'WINNER', side: 'AWAY' }] }),
    makeFixture({ id: 'f11', groupId: 'g-f', fixtureNumber: 11, bracketSources: [{ fixtureId: 'f9', outcome: 'WINNER', side: 'HOME' }, { fixtureId: 'f10', outcome: 'WINNER', side: 'AWAY' }] }),
    makeFixture({ id: 'f12', groupId: 'g-t', fixtureNumber: 12, bracketSources: [{ fixtureId: 'f9', outcome: 'LOSER', side: 'HOME' }, { fixtureId: 'f10', outcome: 'LOSER', side: 'AWAY' }] }),
  ];
  const layout = buildCanvasLayout({ groups, fixtures: [...r12, ...qf, ...rest], slots });
  const y = (id: string) => layout.nodes.find((n) => n.fixtureId === id)!.y;

  it('8강은 12강 승자 칸과 같은 높이, 4강·결승은 원천 가운데에 놓는다', () => {
    expect([y('f1'), y('f2'), y('f3'), y('f4')]).toEqual([56, 236, 416, 596]);
    expect([y('f5'), y('f6'), y('f7'), y('f8')]).toEqual([56, 236, 416, 596]);
    expect([y('f9'), y('f10')]).toEqual([146, 506]);
    expect([y('f11'), y('f12')]).toEqual([326, 326]);
  });

  it('부전승 자리는 8강 홈 줄 앞에 짧은 BYE 연결선을 둔다', () => {
    const bye = layout.edges.filter((e) => e.kind === 'BYE');
    expect(bye).toHaveLength(4);
    expect(bye[0]).toMatchObject({ id: 'bye:f5:HOME', fromFixtureId: null, toFixtureId: 'f5', side: 'HOME', path: 'M292 122 H328' });
  });

  it('연결선 종류별 개수: 승자 10, 패자 2, 부전승 4', () => {
    const count = (kind: string) => layout.edges.filter((e) => e.kind === kind).length;
    expect([count('WINNER'), count('LOSER'), count('BYE')]).toEqual([10, 2, 4]);
  });

  it('같은 열의 칸은 어떤 경우에도 겹치지 않는다(칸 높이 156 + 간격 24)', () => {
    for (const column of layout.columns) {
      const ys = column.fixtureIds.map(y).sort((a, b) => a - b);
      ys.slice(1).forEach((value, index) => expect(value - ys[index]).toBeGreaterThanOrEqual(180));
    }
  });
});

describe('buildCanvasLayout — 16강 대진', () => {
  // 그룹을 일부러 섞어 넘겨도 열 순서는 sortOrder 가 아니라 단계(round16 > quarter > semi > final > third_place)를 따른다.
  const groups = [
    makeGroup({ id: 'g-t', name: '3·4위전', phase: 'third_place', sortOrder: 0 }),
    makeGroup({ id: 'g-f', name: '결승', phase: 'final', sortOrder: 1 }),
    makeGroup({ id: 'g-sf', name: '4강', phase: 'semi', sortOrder: 2 }),
    makeGroup({ id: 'g-qf', name: '8강', phase: 'quarter', sortOrder: 3 }),
    makeGroup({ id: 'g-r16', name: '16강', phase: 'round16', sortOrder: 4 }),
  ];
  const r16 = Array.from({ length: 8 }, (_, i) => makeFixture({ id: `r${i + 1}`, groupId: 'g-r16', fixtureNumber: i + 1, round: '16강' }));
  const pair = (target: string, a: string, b: string, groupId: string, fixtureNumber: number) =>
    makeFixture({
      id: target,
      groupId,
      fixtureNumber,
      bracketSources: [
        { fixtureId: a, outcome: 'WINNER', side: 'HOME' },
        { fixtureId: b, outcome: 'WINNER', side: 'AWAY' },
      ],
    });
  const qf = [1, 2, 3, 4].map((n) => pair(`q${n}`, `r${2 * n - 1}`, `r${2 * n}`, 'g-qf', 8 + n));
  const sf = [pair('s1', 'q1', 'q2', 'g-sf', 13), pair('s2', 'q3', 'q4', 'g-sf', 14)];
  const fin = pair('fin', 's1', 's2', 'g-f', 15);
  const third = makeFixture({
    id: 'th',
    groupId: 'g-t',
    fixtureNumber: 16,
    bracketSources: [
      { fixtureId: 's1', outcome: 'LOSER', side: 'HOME' },
      { fixtureId: 's2', outcome: 'LOSER', side: 'AWAY' },
    ],
  });
  const layout = buildCanvasLayout({ groups, fixtures: [...r16, ...qf, ...sf, fin, third], slots: [] });

  it('16강 열이 8강보다 앞에 오고 열 순서는 16강 > 8강 > 4강 > 결승 > 3·4위전이다', () => {
    expect(layout.columns.map((c) => c.label)).toEqual(['16강', '8강', '4강', '결승', '3·4위전']);
    const xs = layout.columns.map((c) => c.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it('16강 8경기는 겹치지 않고, 8강은 원천 두 경기의 가운데에 놓인다', () => {
    const y = (id: string) => layout.nodes.find((n) => n.fixtureId === id)!.y;
    const ys = Array.from({ length: 8 }, (_, i) => y(`r${i + 1}`));
    ys.slice(1).forEach((value, index) => expect(value - ys[index]).toBeGreaterThanOrEqual(180));
    expect(y('q1')).toBe((y('r1') + y('r2')) / 2);
    expect(layout.edges.filter((e) => e.kind === 'WINNER')).toHaveLength(14);
    expect(layout.edges.filter((e) => e.kind === 'LOSER')).toHaveLength(2);
  });
});

describe('buildCanvasLayout — 예외 입력', () => {
  it('조에 속하지 않은 경기는 "조 미정" 열에 모아 잃지 않는다', () => {
    const orphan = makeFixture({ id: 'x1', groupId: null, fixtureNumber: 1 });
    const layout = buildCanvasLayout({ groups: [semi], fixtures: [f1, orphan], slots: [] });
    expect(layout.columns.map((c) => c.label)).toEqual(['4강', '조 미정']);
    expect(layout.nodes).toHaveLength(2);
  });

  it('경기가 없으면 열 머리만 있는 최소 크기를 돌려준다', () => {
    const layout = buildCanvasLayout({ groups: [], fixtures: [], slots: [] });
    expect(layout).toMatchObject({ columns: [], nodes: [], edges: [], width: 48, height: 80 });
  });
});

describe('fixtureNodeState', () => {
  const revision = (state: 'DRAFT' | 'SUBMITTED' | 'CHANGE_REQUESTED' | 'OFFICIAL' | 'VOID') => ({
    id: 'rev', state, score: { home: 1, away: 0 }, entryMethod: 'quick' as const,
  });
  it.each([
    ['게임 없음', null, 'scheduled'],
    ['예정', makeGame(), 'scheduled'],
    ['진행 중', makeGame({ state: 'LIVE' }), 'live'],
    ['잠시 멈춤도 진행 중', makeGame({ state: 'PAUSED' }), 'live'],
    ['종료됐지만 결과 없음', makeGame({ state: 'ENDED' }), 'submitted'],
    ['확정 전(제출됨)', makeGame({ state: 'ENDED', latestRevision: revision('SUBMITTED') }), 'submitted'],
    ['확정 전(정정 초안)', makeGame({ state: 'ENDED', latestRevision: revision('DRAFT') }), 'submitted'],
    ['확정', makeGame({ state: 'ENDED', latestRevision: revision('OFFICIAL') }), 'official'],
    ['무효 뒤에는 다시 입력할 수 있는 예정', makeGame({ state: 'ENDED', latestRevision: revision('VOID') }), 'scheduled'],
    ['취소', makeGame({ state: 'CANCELLED' }), 'cancelled'],
  ] as const)('%s → %s', (_name, game, expected) => {
    expect(fixtureNodeState(game)).toBe(expected);
  });
});

describe('isFixtureLocked · isSlotAssignable', () => {
  it('예정이고 결과가 없는 경기만 열려 있다', () => {
    expect(isFixtureLocked(makeFixture({ id: 'a', groupId: 'g', fixtureNumber: 1 }))).toBe(false);
    expect(isFixtureLocked(makeFixture({ id: 'a', groupId: 'g', fixtureNumber: 1, game: makeGame() }))).toBe(false);
    expect(isFixtureLocked(makeFixture({ id: 'a', groupId: 'g', fixtureNumber: 1, game: makeGame({ state: 'LIVE' }) }))).toBe(true);
    expect(isFixtureLocked(makeFixture({ id: 'a', groupId: 'g', fixtureNumber: 1, game: makeGame({ state: 'ENDED' }) }))).toBe(true);
  });

  it('순위 자리는 끌어 놓기·선택 배정 대상이 아니다', () => {
    expect(isSlotAssignable(makeSlot({ id: 's', kind: 'ENTRY' }))).toBe(true);
    expect(isSlotAssignable(makeSlot({ id: 's', kind: 'BYE' }))).toBe(true);
    expect(isSlotAssignable(makeSlot({ id: 's', kind: 'GROUP_RANK' }))).toBe(false);
  });
});

describe('fixtureSideLabel — 팀 > 자리 > 연결 설명 > 미정', () => {
  const slot = makeSlot({ id: 's-rank', kind: 'GROUP_RANK', label: 'A조 1위' });
  const ctx = buildSideLabelContext([semi, final], [f1, f2, f3], [slot]);

  it('팀이 정해졌으면 팀 이름', () => {
    const fixture = makeFixture({ id: 'x', groupId: 'g-final', fixtureNumber: 9, homeRegistrationId: 'r1', homeTeamName: '서울FC', homeSlotId: 's-rank' });
    expect(fixtureSideLabel(fixture, 'HOME', ctx)).toBe('서울FC');
  });

  it('팀이 없고 자리가 있으면 자리 라벨', () => {
    const fixture = makeFixture({ id: 'x', groupId: 'g-final', fixtureNumber: 9, homeSlotId: 's-rank' });
    expect(fixtureSideLabel(fixture, 'HOME', ctx)).toBe('A조 1위');
  });

  it('자리가 없고 연결된 원천이 있으면 원천 경기 설명', () => {
    expect(fixtureSideLabel(f3, 'HOME', ctx)).toBe('4강 1번 경기 승자');
    expect(fixtureSideLabel(f4, 'AWAY', buildSideLabelContext([semi, third], [f1, f2, f4], []))).toBe('4강 2번 경기 패자');
  });

  it('아무것도 없으면 미정', () => {
    expect(fixtureSideLabel(f1, 'AWAY', ctx)).toBe('미정');
  });
});

describe('classifyFixtureSide', () => {
  const slotMap = new Map([['s-home', makeSlot({ id: 's-home' })]]);

  it('자리가 있으면 slot, 자리 없이 연결 원천만 있으면 feeder, 둘 다 없으면 direct', () => {
    const mixed = makeFixture({
      id: 'x',
      groupId: 'g-final',
      fixtureNumber: 1,
      homeSlotId: 's-home',
      bracketSources: [{ fixtureId: 'f1', outcome: 'WINNER', side: 'AWAY' }],
    });
    expect(classifyFixtureSide(mixed, 'HOME', slotMap)).toBe('slot');
    expect(classifyFixtureSide(mixed, 'AWAY', slotMap)).toBe('feeder');
    const legacy = makeFixture({ id: 'y', groupId: 'g-final', fixtureNumber: 2 });
    expect(classifyFixtureSide(legacy, 'HOME', slotMap)).toBe('direct');
    expect(classifyFixtureSide(legacy, 'AWAY', slotMap)).toBe('direct');
  });

  it('slotId 가 있어도 슬롯 목록에서 못 찾으면 자리로 보지 않는다', () => {
    const dangling = makeFixture({ id: 'z', groupId: 'g-final', fixtureNumber: 3, homeSlotId: 's-gone' });
    expect(classifyFixtureSide(dangling, 'HOME', slotMap)).toBe('direct');
  });

  it('원천이 한쪽에만 있으면 그쪽만 feeder 다', () => {
    const oneSide = makeFixture({ id: 'w', groupId: 'g-final', fixtureNumber: 4, bracketSources: [{ fixtureId: 'f1', outcome: 'LOSER', side: 'HOME' }] });
    expect(classifyFixtureSide(oneSide, 'HOME', slotMap)).toBe('feeder');
    expect(classifyFixtureSide(oneSide, 'AWAY', slotMap)).toBe('direct');
  });
});

describe('buildCanvasLayout — 조별+결선 조 편성 블록과 순위 연결선', () => {
  const stage = (id: string, name: string, sortOrder: number) =>
    makeGroup({ id, name, phase: 'group', sortOrder, advanceCount: 2 });
  const gA = stage('gA', 'A조', 0);
  const gB = stage('gB', 'B조', 1);
  const gSemi = makeGroup({ id: 'g-semi', name: '4강', phase: 'semi', sortOrder: 0 });
  const gFinal = makeGroup({ id: 'g-final', name: '결승', phase: 'final', sortOrder: 1 });
  const entry = (groupId: string, letter: string, position: number) =>
    makeSlot({ id: `e${letter}${position}`, kind: 'ENTRY', groupId, position, label: `${letter}조 ${position}번` });
  const rank = (letter: string, sourceGroupId: string, position: number) =>
    makeSlot({ id: `r${letter}${position}`, kind: 'GROUP_RANK', groupId: 'g-semi', sourceGroupId, position, label: `${letter}조 ${position}위` });
  const slots = [
    ...[1, 2, 3, 4].map((n) => entry('gA', 'A', n)),
    ...[1, 2, 3, 4].map((n) => entry('gB', 'B', n)),
    rank('A', 'gA', 1), rank('A', 'gA', 2), rank('B', 'gB', 1), rank('B', 'gB', 2),
  ];
  const fixtures = [
    makeFixture({ id: 'fa1', groupId: 'gA', fixtureNumber: 1, round: 'league_r1', homeSlotId: 'eA1', awaySlotId: 'eA2' }),
    makeFixture({ id: 'fb1', groupId: 'gB', fixtureNumber: 2, round: 'league_r1', homeSlotId: 'eB1', awaySlotId: 'eB2' }),
    makeFixture({ id: 'sf1', groupId: 'g-semi', fixtureNumber: 3, round: '4강', homeSlotId: 'rA1', awaySlotId: 'rB2' }),
    makeFixture({ id: 'sf2', groupId: 'g-semi', fixtureNumber: 4, round: '4강', homeSlotId: 'rB1', awaySlotId: 'rA2' }),
    makeFixture({
      id: 'fin',
      groupId: 'g-final',
      fixtureNumber: 5,
      round: '결승',
      bracketSources: [
        { fixtureId: 'sf1', outcome: 'WINNER', side: 'HOME' },
        { fixtureId: 'sf2', outcome: 'WINNER', side: 'AWAY' },
      ],
    }),
  ];
  const layout = buildCanvasLayout({ groups: [gFinal, gSemi, gB, gA], fixtures, slots });

  it('마지막 조별 열과 결선 첫 열 사이에 "조 편성" 열이 끼고, 다음 열들은 한 칸씩 밀린다', () => {
    expect(layout.columns.map((c) => [c.label, c.x])).toEqual([
      ['A조', 24], ['B조', 328], ['조 편성', 632], ['4강', 936], ['결승', 1240],
    ]);
    expect(layout.columns.find((c) => c.key === 'group-blocks')?.fixtureIds).toEqual([]);
    expect(layout.width).toBe(1496);
  });

  it('조 블록은 조 편성 열에 위에서부터 쌓이고 전체 높이에 반영된다', () => {
    expect(layout.groupBlocks.map((b) => [b.groupId, b.x, b.y, b.width, b.height])).toEqual([
      ['gA', 632, 56, 232, 228],
      ['gB', 632, 308, 232, 228],
    ]);
    // 블록 맨 아래 536 + 바깥 여백 24 — 칸이 가장 낮은 곳(392)보다 깊다.
    expect(layout.height).toBe(560);
  });

  it('순위 연결선: 블록 오른쪽 → 결선 칸 사이드, 4강 A1–B2 · B1–A2 교차', () => {
    const ranks = layout.edges.filter((e) => e.kind === 'GROUP_RANK');
    expect(ranks.map((e) => [e.id, e.fromFixtureId, e.toFixtureId, e.side, e.path])).toEqual([
      ['rank:sf1:HOME', null, 'sf1', 'HOME', 'M864 132 H900 V122 H936'],
      ['rank:sf1:AWAY', null, 'sf1', 'AWAY', 'M864 460 H900 V166 H936'],
      ['rank:sf2:HOME', null, 'sf2', 'HOME', 'M864 384 H900 V302 H936'],
      ['rank:sf2:AWAY', null, 'sf2', 'AWAY', 'M864 208 H900 V346 H936'],
    ]);
  });

  it('기존 승자 연결선은 그대로 — 결승으로 가는 2개, 조별 칸 사이드(ENTRY 자리)에는 선이 없다', () => {
    expect(layout.edges.filter((e) => e.kind === 'WINNER').map((e) => e.id)).toEqual(['sf1->fin:HOME', 'sf2->fin:AWAY']);
    expect(layout.edges.some((e) => e.toFixtureId === 'fa1' || e.toFixtureId === 'fb1')).toBe(false);
  });

  it('순위 자리가 없는 조별 대진(수동으로 만든 조·리그 방식 조)에는 블록 열도 블록도 없다 — 대조군', () => {
    const noRanks = slots.filter((slot) => slot.kind !== 'GROUP_RANK');
    const plain = buildCanvasLayout({ groups: [gA, gB, gSemi], fixtures: fixtures.slice(0, 4), slots: noRanks });
    expect(plain.groupBlocks).toEqual([]);
    expect(plain.columns.map((c) => c.label)).toEqual(['A조', 'B조', '4강']);
  });

  it('블록이 없는 기존 대진의 결과에는 groupBlocks 가 빈 배열로 붙는다', () => {
    const knockout = buildCanvasLayout({ groups: [semi], fixtures: [f1, f2], slots: [] });
    expect(knockout.groupBlocks).toEqual([]);
  });
});

// 스펙 S2 교차 대진 표 — 서버 group-rank-pairings.spec.ts 와 같은 표다.
const RANK_COMBOS: Array<[string, number, number, string[][], 'round16' | 'quarter' | 'semi' | 'final']> = [
  ['2조 x 1팀', 2, 1, [['A1', 'B1']], 'final'],
  ['2조 x 2팀', 2, 2, [['A1', 'B2'], ['B1', 'A2']], 'semi'],
  ['4조 x 1팀', 4, 1, [['A1', 'D1'], ['B1', 'C1']], 'semi'],
  ['4조 x 2팀', 4, 2, [['A1', 'B2'], ['C1', 'D2'], ['B1', 'A2'], ['D1', 'C2']], 'quarter'],
  ['8조 x 1팀', 8, 1, [['A1', 'H1'], ['D1', 'E1'], ['B1', 'G1'], ['C1', 'F1']], 'quarter'],
  [
    '8조 x 2팀(16강)',
    8,
    2,
    [
      ['A1', 'B2'], ['C1', 'D2'], ['E1', 'F2'], ['G1', 'H2'],
      ['B1', 'A2'], ['D1', 'C2'], ['F1', 'E2'], ['H1', 'G2'],
    ],
    'round16',
  ],
];

describe.each(RANK_COMBOS)('순위 연결선 — %s', (_name, groupCount, advance, pairs, firstPhase) => {
  const letters = Array.from({ length: groupCount }, (_, i) => String.fromCharCode(65 + i));
  const stageGroups = letters.map((letter, i) => makeGroup({ id: `g${letter}`, name: `${letter}조`, phase: 'group', sortOrder: i, advanceCount: advance }));
  const knockoutGroup = makeGroup({ id: 'ko', name: '결선', phase: firstPhase });
  const entrySlots = letters.flatMap((letter) =>
    [1, 2, 3, 4].map((p) => makeSlot({ id: `e${letter}${p}`, kind: 'ENTRY', groupId: `g${letter}`, position: p, label: `${letter}${p}` })),
  );
  const rankSlots = letters.flatMap((letter) =>
    Array.from({ length: advance }, (_, i) =>
      makeSlot({ id: `r${letter}${i + 1}`, kind: 'GROUP_RANK', groupId: 'ko', sourceGroupId: `g${letter}`, position: i + 1, label: `${letter}조 ${i + 1}위` }),
    ),
  );
  const knockout = pairs.map(([home, away], index) =>
    makeFixture({ id: `k${index}`, groupId: 'ko', fixtureNumber: index + 1, round: '결선', homeSlotId: `r${home}`, awaySlotId: `r${away}` }),
  );
  const layout = buildCanvasLayout({ groups: [...stageGroups, knockoutGroup], fixtures: knockout, slots: [...entrySlots, ...rankSlots] });

  it('올라오는 자리마다 선 하나, 올바른 조 블록 높이에서 올바른 사이드로 이어진다', () => {
    const ranks = layout.edges.filter((e) => e.kind === 'GROUP_RANK');
    expect(ranks).toHaveLength(groupCount * advance);
    const blockX = 24 + groupCount * 304;
    const koX = 24 + (groupCount + 1) * 304;
    pairs.forEach(([home, away], index) => {
      const nodeY = 56 + index * 180;
      for (const [side, label] of [['HOME', home], ['AWAY', away]] as const) {
        const block = layout.groupBlocks.find((b) => b.groupId === `g${label[0]}`)!;
        const fromY = block.y + (228 * Number(label.slice(1))) / (advance + 1);
        const toY = nodeY + 44 + (side === 'HOME' ? 22 : 66);
        const edge = ranks.find((e) => e.id === `rank:k${index}:${side}`)!;
        expect(edge.path).toBe(`M${blockX + 232} ${fromY} H${koX - 36} V${toY} H${koX}`);
      }
    });
  });

  it('블록은 조 순서로 쌓이고(간격 24) 같은 조의 선은 서로 다른 높이에서 나간다', () => {
    expect(layout.groupBlocks.map((b) => b.groupId)).toEqual(letters.map((l) => `g${l}`));
    layout.groupBlocks.forEach((b, i) => expect(b.y).toBe(56 + i * (228 + 24)));
    const fromY = (path: string) => Number(path.split(' ')[1]);
    for (const block of layout.groupBlocks) {
      const ys = layout.edges
        .filter((e) => e.kind === 'GROUP_RANK' && fromY(e.path) > block.y && fromY(e.path) < block.y + block.height)
        .map((e) => fromY(e.path));
      expect(ys).toHaveLength(advance);
      expect(new Set(ys).size).toBe(advance);
    }
  });
});
