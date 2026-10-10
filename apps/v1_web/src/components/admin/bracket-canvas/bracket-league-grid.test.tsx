import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGame, makeGroup } from '@/test/bracket-canvas-fixtures';
import { BracketLeagueGrid } from './bracket-league-grid';

const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0 });
const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1 });
const fixtures = [
  makeFixture({ id: 'a1', groupId: 'gA', fixtureNumber: 1, round: 'league_r1', homeTeamName: '송파', homeRegistrationId: 'r1', awayTeamName: '마포', awayRegistrationId: 'r2' }),
  makeFixture({ id: 'b1', groupId: 'gB', fixtureNumber: 2, round: 'league_r1' }),
  makeFixture({ id: 'a2', groupId: 'gA', fixtureNumber: 3, round: 'league_r2', status: 'cancelled', game: makeGame({ state: 'CANCELLED' }) }),
];

function renderGrid(overrides: Partial<React.ComponentProps<typeof BracketLeagueGrid>> = {}) {
  const props = {
    groups: [gA, gB], fixtures, slots: [], selectedFixtureId: null, pendingRegistrationId: null, canWrite: true,
    onSelectFixture: vi.fn(), onAssignSlot: vi.fn(), onAssignDirect: vi.fn(), ...overrides,
  };
  render(<BracketLeagueGrid {...props} />);
  return props;
}

describe('BracketLeagueGrid', () => {
  it('열은 조, 행은 라운드이고 경기는 제 칸에 들어간다', () => {
    renderGrid();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['A조', 'B조']);
    expect(screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual(['1라운드', '2라운드']);
    const cell = screen.getByRole('group', { name: '1라운드 A조' });
    expect(within(cell).getByRole('group', { name: 'A조 · 조별리그 1라운드 1번 경기, 예정' })).toBeInTheDocument();
    expect(within(cell).queryByText('2번 경기')).not.toBeInTheDocument();
  });

  it('조마다 줄어들 수 있는 minmax 트랙을 둔다(2개 조가 1440 에서 스크롤 없이 들어가는 폭)', () => {
    renderGrid();
    const track = screen.getByRole('region', { name: '대진 그림' }).querySelector<HTMLElement>('div.grid')?.style.gridTemplateColumns;
    expect(track).toBe('72px repeat(2, minmax(190px, 1fr))');
  });

  it('조는 있는데 경기가 하나도 없으면 빈 안내를 보여 주고, 경기가 있으면 보이지 않는다', () => {
    const { unmount } = render(<BracketLeagueGrid groups={[gA]} fixtures={[]} slots={[]} selectedFixtureId={null} pendingRegistrationId={null} canWrite onSelectFixture={vi.fn()} onAssignSlot={vi.fn()} onAssignDirect={vi.fn()} />);
    expect(screen.getByText('아직 경기가 없어요. 템플릿으로 시작하거나 경기를 추가해 주세요.')).toBeInTheDocument();
    unmount();
    renderGrid();
    expect(screen.queryByText(/아직 경기가 없어요/)).not.toBeInTheDocument();
  });

  it('칸의 보이는 제목은 짧고 취소된 경기도 제 칸에 취소 칩으로 남는다', () => {
    renderGrid();
    const cancelled = within(screen.getByRole('group', { name: '2라운드 A조' })).getByRole('group', { name: /3번 경기, 취소/ });
    expect(within(cancelled).getByText('3번 경기')).toBeInTheDocument();
  });

  it('경기가 없는 칸은 「경기 없음」 으로 남는다', () => {
    renderGrid();
    expect(within(screen.getByRole('group', { name: '2라운드 B조' })).getByText('경기 없음')).toBeInTheDocument();
  });

  it('칸을 누르면 선택 콜백이 fixtureId 로 불리고 선택된 칸은 aria-pressed 다', () => {
    const props = renderGrid({ selectedFixtureId: 'b1' });
    expect(screen.getByRole('button', { name: 'B조 · 조별리그 1라운드 2번 경기 열기' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'A조 · 조별리그 1라운드 1번 경기 열기' }));
    expect(props.onSelectFixture).toHaveBeenCalledWith('a1');
  });

  it('고른 팀을 비어 있는 직접 지정 칸에 넣으면 onAssignDirect 가 불린다', () => {
    const props = renderGrid({ pendingRegistrationId: 'r9' });
    const cell = screen.getByRole('group', { name: '1라운드 B조' });
    fireEvent.click(within(cell).getByRole('button', { name: /^홈 .*선택한 팀을 여기에 넣어요/ }));
    expect(props.onAssignDirect).toHaveBeenCalledWith('b1', 'HOME', 'r9');
  });

  it('옛 데이터는 경기 번호 순서로 나눴다는 안내를 보이고, 번호가 있으면 보이지 않는다', () => {
    const legacy = fixtures.map((f) => ({ ...f, round: '조별 리그' }));
    const { unmount } = render(<BracketLeagueGrid {...{ groups: [gA, gB], fixtures: legacy, slots: [], selectedFixtureId: null, pendingRegistrationId: null, canWrite: true, onSelectFixture: vi.fn(), onAssignSlot: vi.fn(), onAssignDirect: vi.fn() }} />);
    expect(screen.getByText('라운드 정보가 없어 경기 번호 순서로 나눴어요.')).toBeInTheDocument();
    unmount();
    renderGrid();
    expect(screen.queryByText(/경기 번호 순서로 나눴어요/)).not.toBeInTheDocument();
  });
});
