import { describe, expect, it } from 'vitest';
import { makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import { buildLeagueGrid } from './bracket-league-grid-model';
import { leagueAddableGroups, leagueRoundPlan } from './bracket-league-add-fixture';

const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0 });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
const fx = (id: string, groupId: string | null, n: number, round: string) =>
  makeFixture({ id, groupId, fixtureNumber: n, round });
const ids = (list: { id: string }[] | undefined) => (list ?? []).map((f) => f.id);

/** 대화상자가 보내는 round 로, 서버처럼 최대 번호 다음 번호를 붙여 경기를 하나 더한다. */
function addVia(groups: ReturnType<typeof makeGroup>[], fixtures: ReturnType<typeof fx>[], groupId: string, choiceValue: string) {
  const choice = leagueRoundPlan({ groups, fixtures }).choices.find((candidate) => candidate.value === choiceValue);
  if (choice === undefined) throw new Error(`선택지에 ${choiceValue} 가 없어요`);
  return { round: choice.round, fixtures: [...fixtures, fx('new', groupId, Math.max(0, ...fixtures.map((f) => f.fixtureNumber)) + 1, choice.round)] };
}

describe('leagueAddableGroups', () => {
  it('phase 가 group 인 조만 sortOrder 순으로 남기고 결선 조는 뺀다', () => {
    const semi = makeGroup({ id: 'gS', name: '4강', phase: 'semi', sortOrder: 0 });
    const late = makeGroup({ id: 'gC', name: 'C조', phase: 'group', sortOrder: 5 });
    expect(leagueAddableGroups([late, semi, gB, gA]).map((g) => g.id)).toEqual(['gA', 'gB', 'gC']);
  });
});

describe('leagueRoundPlan', () => {
  it('번호는 숫자 순서로(league_r10 이 league_r2 뒤) 나열하고 끝에 새 라운드를 붙이며, 기본은 마지막 기존 라운드다', () => {
    const plan = leagueRoundPlan({ groups: [gA, gB], fixtures: [fx('a10', 'gA', 9, 'league_r10'), fx('a1', 'gA', 1, 'league_r1'), fx('b2', 'gB', 2, 'league_r2')] });
    expect(plan.choices.map((c) => [c.value, c.label, c.round])).toEqual([
      ['r1', '1라운드', 'league_r1'],
      ['r2', '2라운드', 'league_r2'],
      ['r10', '10라운드', 'league_r10'],
      ['new', '새 라운드 (11라운드)', 'league_r11'],
    ]);
    expect(plan.defaultChoice.value).toBe('r10');
    expect(plan.choices[plan.choices.length - 1].name).toBe('11라운드');
  });

  it('번호가 아닌 round(final)는 옛 경기로 끊겨 같은 줄로 읽히므로 새 선택지를 만들지 않는다', () => {
    const plan = leagueRoundPlan({ groups: [gA], fixtures: [fx('a1', 'gA', 1, 'league_r1'), fx('m', 'gA', 2, 'final')] });
    expect(plan.choices.map((c) => c.value)).toEqual(['r1', 'new']);
  });

  it('경기가 하나도 없으면 「새 라운드 (1라운드)」 하나이고 그것이 기본이다', () => {
    const plan = leagueRoundPlan({ groups: [], fixtures: [] });
    expect(plan.choices.map((c) => c.label)).toEqual(['새 라운드 (1라운드)']);
    expect(plan.defaultChoice.round).toBe('league_r1');
  });
});

describe('leagueRoundPlan — 격자 착지', () => {
  const base = [
    fx('a1', 'gA', 1, 'league_r1'),
    fx('b1', 'gB', 2, 'league_r1'),
    fx('a2', 'gA', 3, 'league_r2'),
  ];

  it('빈 조(경기 0)에 기존 라운드로 넣으면 행은 늘지 않고 그 조 칸에만 들어간다', () => {
    const empty = makeGroup({ id: 'gE', name: 'E조', phase: 'group', sortOrder: 2 });
    const { round, fixtures } = addVia([gA, gB, empty], base, 'gE', 'r2');
    expect(round).toBe('league_r2');
    const grid = buildLeagueGrid({ groups: [gA, gB, empty], fixtures });
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드']);
    expect(ids(grid.rows[1].cells.gE)).toEqual(['new']);
    // 대조: 같은 행의 다른 조 칸은 그대로
    expect(ids(grid.rows[1].cells.gA)).toEqual(['a2']);
    expect(ids(grid.rows[1].cells.gB)).toEqual([]);
  });

  it('새 라운드를 고르면 번호 행이 하나 늘고 고른 조 칸에만 경기가 있다', () => {
    const { round, fixtures } = addVia([gA, gB], base, 'gB', 'new');
    expect(round).toBe('league_r3');
    const grid = buildLeagueGrid({ groups: [gA, gB], fixtures });
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드', '3라운드']);
    expect(ids(grid.rows[2].cells.gB)).toEqual(['new']);
    expect(ids(grid.rows[2].cells.gA)).toEqual([]);
  });

  it('기존 라운드 칸에 넣으면 그 칸의 맨 뒤(경기 번호 순)에 쌓인다', () => {
    const { fixtures } = addVia([gA, gB], base, 'gA', 'r1');
    expect(ids(buildLeagueGrid({ groups: [gA, gB], fixtures }).rows[0].cells.gA)).toEqual(['a1', 'new']);
  });

  it('혼합 데이터(번호 + 수동 final)에서 final 은 1라운드 줄에 합쳐지고 새 라운드는 3라운드다', () => {
    const mixed = [...base, fx('m', 'gA', 9, 'final')];
    const { fixtures } = addVia([gA, gB], mixed, 'gA', 'new');
    const grid = buildLeagueGrid({ groups: [gA, gB], fixtures });
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드', '3라운드']);
    expect(ids(grid.rows[0].cells.gA)).toEqual(['a1', 'm']);
    expect(grid.legacyChunking).toBe(true);
  });
});

describe('leagueRoundPlan·착지 — 옛(번호 없는) 대진', () => {
  const team = (id: string, n: number) => ({ id: `gt-${id}`, groupId: 'gA', registrationId: id, teamName: id, sortOrder: n, createdAt: '' });
  const four = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0, groupTeams: ['r1', 'r2', 'r3', 'r4'].map((id, i) => team(id, i)) });
  const six = [1, 2, 3, 4, 5, 6].map((n) => fx(`f${n}`, 'gA', n, '조별 리그'));

  it('옛 대진도 격자 줄과 같은 1..N라운드 + 새 라운드를 고르게 한다 — 선택지는 격자 줄에서만 나온다', () => {
    const plan = leagueRoundPlan({ groups: [four], fixtures: six });
    expect(plan.choices.map((c) => [c.value, c.label, c.round])).toEqual([
      ['r1', '1라운드', 'league_r1'], ['r2', '2라운드', 'league_r2'], ['r3', '3라운드', 'league_r3'], ['new', '새 라운드 (4라운드)', 'league_r4'],
    ]);
    expect(plan.defaultChoice.value).toBe('r3');
    expect(plan.choices.slice(0, -1).map((c) => c.name)).toEqual(buildLeagueGrid({ groups: [four], fixtures: six }).rows.map((r) => r.label));
  });

  it('옛 대진에서 2라운드를 고르면 league_r2 로 저장되어 옛 2라운드 묶음과 같은 줄·같은 칸에 들어가고 옛 줄은 그대로다', () => {
    const { round, fixtures } = addVia([four], six, 'gA', 'r2');
    expect(round).toBe('league_r2');
    const grid = buildLeagueGrid({ groups: [four], fixtures });
    expect(grid.legacyChunking).toBe(true);
    expect(grid.rows.map((r) => ids(r.cells.gA))).toEqual([['f1', 'f2'], ['f3', 'f4', 'new'], ['f5', 'f6']]);
  });

  it('새 라운드를 고르면 옛 줄 뒤에 4라운드 줄이 생기고 고른 조 칸에만 들어간다', () => {
    const b = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
    const { round, fixtures } = addVia([four, b], six, 'gB', 'new');
    expect(round).toBe('league_r4');
    const grid = buildLeagueGrid({ groups: [four, b], fixtures });
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드', '3라운드', '4라운드']);
    expect(ids(grid.rows[3].cells.gB)).toEqual(['new']);
    expect(ids(grid.rows[3].cells.gA)).toEqual([]);
  });

  it('번호 경기가 이미 섞인 대진에서도 선택지는 합쳐진 줄이다 (옛 3묶음 + league_r5)', () => {
    const plan = leagueRoundPlan({ groups: [four], fixtures: [...six, fx('n5', 'gA', 7, 'league_r5')] });
    expect(plan.choices.map((c) => c.value)).toEqual(['r1', 'r2', 'r3', 'r5', 'new']);
    expect(plan.choices[plan.choices.length - 1].round).toBe('league_r6');
  });
});
