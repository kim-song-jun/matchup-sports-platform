import { describe, expect, it } from 'vitest';
import { makeFixture, makeGroup } from '@/test/bracket-canvas-fixtures';
import { buildLeagueGrid, LEAGUE_UNGROUPED_COLUMN_KEY } from './bracket-league-grid-model';

const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0 });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
const fx = (id: string, groupId: string | null, n: number, round: string, extra = {}) =>
  makeFixture({ id, groupId, fixtureNumber: n, round, ...extra });
const ids = (list: { id: string }[] | undefined) => (list ?? []).map((f) => f.id);

describe('buildLeagueGrid — 번호가 있는 라운드', () => {
  const fixtures = [
    fx('a10', 'gA', 30, 'league_r10'),
    fx('a2', 'gA', 3, 'league_r2'),
    fx('a1', 'gA', 1, 'league_r1'),
    fx('b1', 'gB', 2, 'league_r1'),
    fx('b2', 'gB', 4, 'league_r2'),
  ];

  it('행은 라운드 번호의 숫자 순서이고 league_r10 이 league_r2 뒤에 온다', () => {
    const grid = buildLeagueGrid({ groups: [gB, gA], fixtures });
    expect(grid.rows.map((row) => row.label)).toEqual(['1라운드', '2라운드', '10라운드']);
    expect(grid.legacyChunking).toBe(false);
  });

  it('열은 조의 sortOrder 순이고 각 칸에는 그 조의 그 라운드 경기만 들어간다', () => {
    const grid = buildLeagueGrid({ groups: [gB, gA], fixtures });
    expect(grid.columns.map((column) => column.label)).toEqual(['A조', 'B조']);
    expect(ids(grid.rows[0].cells.gA)).toEqual(['a1']);
    expect(ids(grid.rows[0].cells.gB)).toEqual(['b1']);
    // 대조: B조는 10라운드가 없다 — 빈 칸이지 누락이 아니다
    expect(ids(grid.rows[2].cells.gB)).toEqual([]);
    expect(ids(grid.rows[2].cells.gA)).toEqual(['a10']);
  });

  it('같은 조·같은 라운드의 여러 경기는 경기 번호 순으로 쌓인다', () => {
    const grid = buildLeagueGrid({
      groups: [gA],
      fixtures: [fx('x2', 'gA', 6, 'league_r1'), fx('x1', 'gA', 5, 'league_r1')],
    });
    expect(ids(grid.rows[0].cells.gA)).toEqual(['x1', 'x2']);
  });

  it('취소된 경기도 제 라운드·조 칸에 남는다', () => {
    const cancelled = fx('c1', 'gA', 1, 'league_r1', { status: 'cancelled' });
    const grid = buildLeagueGrid({ groups: [gA], fixtures: [cancelled, fx('a2', 'gA', 2, 'league_r2')] });
    expect(ids(grid.rows[0].cells.gA)).toEqual(['c1']);
    expect(grid.columns[0].fixtureCount).toBe(2);
  });
});

describe('buildLeagueGrid — 열', () => {
  it('경기가 없는 조도 열로 남고 fixtureCount 는 0 이다', () => {
    const grid = buildLeagueGrid({ groups: [gA, gB], fixtures: [fx('a1', 'gA', 1, 'league_r1')] });
    expect(grid.columns.map((c) => [c.label, c.fixtureCount])).toEqual([['A조', 1], ['B조', 0]]);
    expect(grid.rows[0].cells.gB).toEqual([]);
  });

  it('조가 하나도 없으면 「전체 경기」 열 하나', () => {
    const grid = buildLeagueGrid({ groups: [], fixtures: [fx('f1', null, 1, 'league_r1')] });
    expect(grid.columns).toEqual([{ key: LEAGUE_UNGROUPED_COLUMN_KEY, groupId: null, label: '전체 경기', fixtureCount: 1 }]);
  });

  it('조가 있을 때 조 없는 경기는 「조 미정」 열로 가고, 없으면 그 열이 생기지 않는다', () => {
    const withOrphan = buildLeagueGrid({ groups: [gA], fixtures: [fx('o', null, 2, 'league_r1'), fx('a1', 'gA', 1, 'league_r1')] });
    expect(withOrphan.columns.map((c) => c.label)).toEqual(['A조', '조 미정']);
    expect(buildLeagueGrid({ groups: [gA], fixtures: [fx('a1', 'gA', 1, 'league_r1')] }).columns).toHaveLength(1);
  });

  it('조도 경기도 없으면 열도 행도 없다', () => {
    expect(buildLeagueGrid({ groups: [], fixtures: [] })).toEqual({ columns: [], rows: [], legacyChunking: false });
  });
});

describe('buildLeagueGrid — 라운드 번호가 없는 옛 데이터', () => {
  const team = (id: string, n: number) => ({ id: `gt-${id}`, groupId: 'gA', registrationId: id, teamName: id, sortOrder: n, createdAt: '' });
  const four = makeGroup({ id: 'gA', name: 'A조', phase: 'group', groupTeams: ['r1', 'r2', 'r3', 'r4'].map((id, i) => team(id, i)) });
  const six = [1, 2, 3, 4, 5, 6].map((n) => fx(`f${n}`, 'gA', n, '조별 리그'));

  it('4팀 조는 k=2 라 경기 번호 순으로 2경기씩 3행이 된다', () => {
    const grid = buildLeagueGrid({ groups: [four], fixtures: [...six].reverse() });
    expect(grid.legacyChunking).toBe(true);
    expect(grid.rows.map((row) => row.label)).toEqual(['1라운드', '2라운드', '3라운드']);
    expect(grid.rows.map((row) => ids(row.cells.gA))).toEqual([['f1', 'f2'], ['f3', 'f4'], ['f5', 'f6']]);
  });

  it('팀이 2명 이하이거나 조 편성이 비면 k 는 1 이다', () => {
    const lone = makeGroup({ id: 'gA', name: 'A조', phase: 'group', groupTeams: [team('r1', 0)] });
    expect(buildLeagueGrid({ groups: [lone], fixtures: six }).rows).toHaveLength(6);
  });

  it('조 편성이 비면 그 조 경기에 등장하는 서로 다른 팀 수로 k 를 정한다', () => {
    const bare = makeGroup({ id: 'gA', name: 'A조', phase: 'group' });
    const withTeams = [
      fx('f1', 'gA', 1, '조별 리그', { homeRegistrationId: 'r1', awayRegistrationId: 'r2' }),
      fx('f2', 'gA', 2, '조별 리그', { homeRegistrationId: 'r3', awayRegistrationId: 'r4' }),
      fx('f3', 'gA', 3, '조별 리그', { homeRegistrationId: 'r1', awayRegistrationId: 'r3' }),
    ];
    // 팀 4 → k=2: [f1,f2] [f3]
    expect(buildLeagueGrid({ groups: [bare], fixtures: withTeams }).rows.map((r) => ids(r.cells.gA))).toEqual([['f1', 'f2'], ['f3']]);
  });

  it('조마다 따로 끊고 행 수는 가장 긴 조에 맞춘다', () => {
    const b = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
    const grid = buildLeagueGrid({ groups: [four, b], fixtures: [...six, fx('g1', 'gB', 7, '조별 리그')] });
    expect(grid.rows).toHaveLength(3);
    expect(ids(grid.rows[0].cells.gB)).toEqual(['g1']);
    expect(ids(grid.rows[1].cells.gB)).toEqual([]);
  });

  it('번호 경기가 섞여도 옛 경기는 계속 끊기고, k번째 묶음은 league_r{k} 와 같은 줄·같은 칸에 합쳐진다', () => {
    const grid = buildLeagueGrid({ groups: [four], fixtures: [...six, fx('n2', 'gA', 7, 'league_r2')] });
    expect(grid.legacyChunking).toBe(true);
    expect(grid.rows.map((row) => [row.label, row.roundNumber])).toEqual([['1라운드', 1], ['2라운드', 2], ['3라운드', 3]]);
    expect(grid.rows.map((row) => ids(row.cells.gA))).toEqual([['f1', 'f2'], ['f3', 'f4', 'n2'], ['f5', 'f6']]);
  });

  it('번호 경기는 옛 경기의 끊김 위치를 밀지 않는다 — 번호 경기를 더해도 옛 줄은 같다 (대조군)', () => {
    const legacyIdsPerRow = (grid: ReturnType<typeof buildLeagueGrid>) => grid.rows.map((row) => ids(row.cells.gA).filter((id) => id.startsWith('f')));
    const without = buildLeagueGrid({ groups: [four], fixtures: six });
    const withNumbered = buildLeagueGrid({ groups: [four], fixtures: [fx('n0', 'gA', 0, 'league_r1'), ...six] });
    expect(legacyIdsPerRow(withNumbered)).toEqual(legacyIdsPerRow(without));
    expect(ids(withNumbered.rows[0].cells.gA)).toEqual(['n0', 'f1', 'f2']);
  });

  it('옛 묶음 수보다 큰 번호는 새 줄이 되고 줄은 숫자 순서다', () => {
    const grid = buildLeagueGrid({ groups: [four], fixtures: [...six, fx('n9', 'gA', 8, 'league_r9')] });
    expect(grid.rows.map((row) => row.label)).toEqual(['1라운드', '2라운드', '3라운드', '9라운드']);
    expect(ids(grid.rows[3].cells.gA)).toEqual(['n9']);
  });

  it('결선 단계 코드(final)·한국어 이름(결승)으로 쓴 round 도 예외 없이 옛 경기로 끊긴다', () => {
    const numbered = fx('a1', 'gA', 1, 'league_r1');
    for (const round of ['final', '결승']) {
      const grid = buildLeagueGrid({ groups: [gA], fixtures: [fx('m', 'gA', 9, round), numbered] });
      expect(grid.rows.map((row) => [row.label, row.roundNumber])).toEqual([['1라운드', 1]]);
      expect(ids(grid.rows[0].cells.gA)).toEqual(['a1', 'm']);
      expect(grid.legacyChunking).toBe(true);
    }
  });

  it('번호가 아닌 자유 문자열(예선)도 옛 경기로 끊긴다', () => {
    const grid = buildLeagueGrid({ groups: [four], fixtures: [...six, fx('x', 'gA', 7, '예선')] });
    expect(grid.rows.map((row) => row.label)).toEqual(['1라운드', '2라운드', '3라운드', '4라운드']);
    expect(ids(grid.rows[3].cells.gA)).toEqual(['x']);
    expect(grid.legacyChunking).toBe(true);
  });

  it('번호 경기만 있으면 안내 플래그는 꺼진다', () => {
    expect(buildLeagueGrid({ groups: [four], fixtures: [fx('n1', 'gA', 1, 'league_r1')] }).legacyChunking).toBe(false);
  });
});
