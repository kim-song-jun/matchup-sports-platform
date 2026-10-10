import { describe, expect, it } from 'vitest';
import { makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import { buildLeagueGrid } from './bracket-league-grid-model';
import { nextFixtureNumber } from './bracket-fixture-tools';
import {
  isLegacyLeagueBracket,
  leagueAddableGroups,
  leagueRoundPlan,
  resolveLeagueRound,
} from './bracket-league-add-fixture';

const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0 });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
const fx = (id: string, groupId: string | null, n: number, round: string) =>
  makeFixture({ id, groupId, fixtureNumber: n, round });
const ids = (list: { id: string }[] | undefined) => (list ?? []).map((f) => f.id);

/** 대화상자가 하는 일 그대로 — 결정한 round 와 다음 경기 번호로 경기를 하나 붙인다. */
function addVia(fixtures: ReturnType<typeof fx>[], groupId: string, choiceValue: string) {
  const choice = leagueRoundPlan(fixtures).choices.find((candidate) => candidate.value === choiceValue);
  if (choice === undefined) throw new Error(`선택지에 ${choiceValue} 가 없어요`);
  const { round } = resolveLeagueRound({ fixtures, groupId, choice });
  return { round, fixtures: [...fixtures, fx('new', groupId, nextFixtureNumber(fixtures), round)] };
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
    const plan = leagueRoundPlan([fx('a10', 'gA', 9, 'league_r10'), fx('a1', 'gA', 1, 'league_r1'), fx('b2', 'gB', 2, 'league_r2')]);
    expect(plan.choices.map((c) => [c.value, c.label, c.round])).toEqual([
      ['r1', '1라운드', 'league_r1'],
      ['r2', '2라운드', 'league_r2'],
      ['r10', '10라운드', 'league_r10'],
      ['new', '새 라운드 (11라운드)', 'league_r11'],
    ]);
    expect(plan.defaultChoice.value).toBe('r10');
    expect(plan.choices[plan.choices.length - 1].name).toBe('11라운드');
  });

  it('league_r 가 아닌 수동 추가 round 는 선택지에 넣지 않는다', () => {
    const plan = leagueRoundPlan([fx('a1', 'gA', 1, 'league_r1'), fx('m', 'gA', 2, 'final')]);
    expect(plan.choices.map((c) => c.value)).toEqual(['r1', 'new']);
  });

  it('경기가 하나도 없으면 「새 라운드 (1라운드)」 하나이고 그것이 기본이다', () => {
    const plan = leagueRoundPlan([]);
    expect(plan.choices.map((c) => c.label)).toEqual(['새 라운드 (1라운드)']);
    expect(plan.defaultChoice.round).toBe('league_r1');
  });
});

describe('resolveLeagueRound — 격자 착지', () => {
  const base = [
    fx('a1', 'gA', 1, 'league_r1'),
    fx('b1', 'gB', 2, 'league_r1'),
    fx('a2', 'gA', 3, 'league_r2'),
  ];

  it('빈 조(경기 0)에 기존 라운드로 넣으면 행은 늘지 않고 그 조 칸에만 들어간다', () => {
    const empty = makeGroup({ id: 'gE', name: 'E조', phase: 'group', sortOrder: 2 });
    const { round, fixtures } = addVia(base, 'gE', 'r2');
    expect(round).toBe('league_r2');
    const grid = buildLeagueGrid({ groups: [gA, gB, empty], fixtures });
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드']);
    expect(ids(grid.rows[1].cells.gE)).toEqual(['new']);
    // 대조: 같은 행의 다른 조 칸은 그대로
    expect(ids(grid.rows[1].cells.gA)).toEqual(['a2']);
    expect(ids(grid.rows[1].cells.gB)).toEqual([]);
  });

  it('새 라운드를 고르면 번호 행이 하나 늘고 고른 조 칸에만 경기가 있다', () => {
    const { round, fixtures } = addVia(base, 'gB', 'new');
    expect(round).toBe('league_r3');
    const grid = buildLeagueGrid({ groups: [gA, gB], fixtures });
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드', '3라운드']);
    expect(ids(grid.rows[2].cells.gB)).toEqual(['new']);
    expect(ids(grid.rows[2].cells.gA)).toEqual([]);
  });

  it('기존 라운드 칸에 넣으면 그 칸의 맨 뒤(경기 번호 순)에 쌓인다', () => {
    const { fixtures } = addVia(base, 'gA', 'r1');
    expect(ids(buildLeagueGrid({ groups: [gA, gB], fixtures }).rows[0].cells.gA)).toEqual(['a1', 'new']);
  });

  it('혼합 데이터(번호 + 수동 final)에서 새 라운드 행은 final 행 앞에 온다', () => {
    const mixed = [...base, fx('m', 'gA', 9, 'final')];
    const { fixtures } = addVia(mixed, 'gA', 'new');
    const grid = buildLeagueGrid({ groups: [gA, gB], fixtures });
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드', '3라운드', '결승']);
    expect(grid.legacyChunking).toBe(false);
  });
});

describe('resolveLeagueRound — 옛(번호 없는) 대진', () => {
  const team = (id: string, n: number) => ({ id: `gt-${id}`, groupId: 'gA', registrationId: id, teamName: id, sortOrder: n, createdAt: '' });
  const four = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0, groupTeams: ['r1', 'r2', 'r3', 'r4'].map((id, i) => team(id, i)) });
  const six = [1, 2, 3, 4, 5, 6].map((n) => fx(`f${n}`, 'gA', n, '조별 리그'));

  it('옛 대진이면 옛 round 값을 이어 쓰고 roundName 은 없다', () => {
    expect(isLegacyLeagueBracket(six)).toBe(true);
    const choice = leagueRoundPlan(six).defaultChoice; // 옛 대진에는 번호가 없어 「새 라운드 (1라운드)」 하나뿐이다
    expect(resolveLeagueRound({ fixtures: six, groupId: 'gA', choice })).toEqual({ round: '조별 리그', roundName: null });
  });

  it('옛 round 값을 이어 쓰면 끊김 모드가 유지되고 새 경기는 그 조의 마지막 행에 떨어진다', () => {
    const { fixtures } = addVia(six, 'gA', 'new');
    const grid = buildLeagueGrid({ groups: [four], fixtures });
    expect(grid.legacyChunking).toBe(true);
    expect(grid.rows.map((r) => r.label)).toEqual(['1라운드', '2라운드', '3라운드', '4라운드']);
    expect(ids(grid.rows[3].cells.gA)).toEqual(['new']);
  });

  it('근거: 옛 대진에 league_r 를 섞으면 끊김이 꺼지고 옛 경기가 한 행으로 뭉친다 — 그래서 이어 쓴다', () => {
    const grid = buildLeagueGrid({ groups: [four], fixtures: [...six, fx('new', 'gA', 7, 'league_r1')] });
    expect(grid.legacyChunking).toBe(false);
    expect(grid.rows).toHaveLength(2);
    expect(ids(grid.rows[1].cells.gA)).toEqual(['f1', 'f2', 'f3', 'f4', 'f5', 'f6']);
  });

  it('경기가 없는 조에 넣을 때는 대회에서 가장 최근 경기의 round 를 쓴다', () => {
    const b = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
    expect(resolveLeagueRound({ fixtures: six, groupId: b.id, choice: leagueRoundPlan(six).defaultChoice }).round).toBe('조별 리그');
  });

  it('번호 있는 경기가 하나라도 있으면 옛 대진이 아니고, 경기가 0개여도 아니다', () => {
    expect(isLegacyLeagueBracket([...six, fx('n', 'gA', 7, 'league_r1')])).toBe(false);
    expect(isLegacyLeagueBracket([])).toBe(false);
  });
});
