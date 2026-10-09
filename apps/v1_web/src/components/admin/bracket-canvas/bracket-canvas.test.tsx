import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGame, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';
import { BracketCanvas, fixtureTitle } from './bracket-canvas';

const semi = makeGroup({ id: 'g-semi', name: '4강', phase: 'semi', sortOrder: 0 });
const final = makeGroup({ id: 'g-final', name: '결승', phase: 'final', sortOrder: 1 });
const third = makeGroup({ id: 'g-third', name: '3·4위전', phase: 'third_place', sortOrder: 2 });
const slots = [
  makeSlot({ id: 's1', label: '1번 자리' }),
  makeSlot({ id: 's2', label: '2번 자리' }),
  makeSlot({ id: 's3', label: '3번 자리' }),
  makeSlot({ id: 's4', label: '4번 자리' }),
];
const fixtures = [
  makeFixture({ id: 'f1', groupId: 'g-semi', fixtureNumber: 1, round: '4강', homeSlotId: 's1', awaySlotId: 's2' }),
  makeFixture({ id: 'f2', groupId: 'g-semi', fixtureNumber: 2, round: '4강', homeSlotId: 's3', awaySlotId: 's4' }),
  makeFixture({
    id: 'f3',
    groupId: 'g-final',
    fixtureNumber: 3,
    round: '결승',
    bracketSources: [
      { fixtureId: 'f1', outcome: 'WINNER', side: 'HOME' },
      { fixtureId: 'f2', outcome: 'WINNER', side: 'AWAY' },
    ],
  }),
  makeFixture({
    id: 'f4',
    groupId: 'g-third',
    fixtureNumber: 4,
    round: '3·4위전',
    bracketSources: [
      { fixtureId: 'f1', outcome: 'LOSER', side: 'HOME' },
      { fixtureId: 'f2', outcome: 'LOSER', side: 'AWAY' },
    ],
  }),
];

function renderCanvas(overrides: Partial<React.ComponentProps<typeof BracketCanvas>> = {}) {
  const props = {
    groups: [third, final, semi],
    fixtures,
    slots,
    mode: 'bracket' as const,
    selectedFixtureId: null,
    pendingRegistrationId: null,
    canWrite: true,
    onSelectFixture: vi.fn(),
    onAssignSlot: vi.fn(),
    ...overrides,
  };
  const view = render(<BracketCanvas {...props} />);
  return { ...view, props };
}

describe('fixtureTitle', () => {
  it('결선은 단계 이름 + 번호, 조별은 조 이름까지 붙인다', () => {
    expect(fixtureTitle(fixtures[0], [semi])).toBe('4강 1번 경기');
    const groupFixture = makeFixture({ id: 'x', groupId: 'g-a', fixtureNumber: 5, round: 'league_r2' });
    expect(fixtureTitle(groupFixture, [makeGroup({ id: 'g-a', name: 'A조', phase: 'group' })])).toBe('A조 · 조별리그 2라운드 5번 경기');
  });
});

describe('BracketCanvas', () => {
  it('열 이름을 단계 순서(4강 > 결승 > 3·4위전)로 보여 준다', () => {
    renderCanvas();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['4강', '결승', '3·4위전']);
  });

  it('칸마다 제목과 자리 라벨을 그리고, 연결선은 승자 2 + 패자 2 개를 SVG 로 그린다', () => {
    const { container } = renderCanvas();
    expect(screen.getAllByRole('group')).toHaveLength(4);
    expect(screen.getByRole('button', { name: '홈 1번 자리' })).toBeInTheDocument();
    expect(container.querySelectorAll('svg path')).toHaveLength(4);
  });

  it('패자 연결선만 점선이라 색 없이도 승자선과 구분된다', () => {
    const { container } = renderCanvas();
    const dashed = [...container.querySelectorAll('svg path')].filter((path) => path.hasAttribute('stroke-dasharray'));
    expect(dashed).toHaveLength(2);
    expect(screen.getByText(/실선은 승자, 점선은 패자/)).toBeInTheDocument();
  });

  it('선택한 칸의 머리 버튼이 눌린 상태이고, 칸을 누르면 선택을 알린다', () => {
    const { props } = renderCanvas({ selectedFixtureId: 'f2' });
    expect(screen.getByRole('button', { name: '4강 2번 경기 열기' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '4강 1번 경기 열기' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: '4강 1번 경기 열기' }));
    expect(props.onSelectFixture).toHaveBeenCalledWith('f1');
  });

  it('고른 팀이 있으면 빈 자리 줄을 눌러 그 자리에 배정한다(키보드 경로)', () => {
    const { props } = renderCanvas({ pendingRegistrationId: 'reg-1' });
    const nodeOne = screen.getByRole('group', { name: '4강 1번 경기, 예정' });
    fireEvent.click(within(nodeOne).getByRole('button', { name: '어웨이 2번 자리, 선택한 팀을 여기에 넣어요' }));
    expect(props.onAssignSlot).toHaveBeenCalledWith('s2', 'reg-1');
    expect(props.onSelectFixture).not.toHaveBeenCalled();
  });

  it('연결선이 없는 대진(리그 모드)에는 선 설명을 숨긴다', () => {
    renderCanvas({
      mode: 'league',
      groups: [makeGroup({ id: 'g-semi', name: '리그', phase: 'group' })],
      fixtures: [fixtures[0]],
    });
    expect(screen.queryByText(/실선은 승자/)).not.toBeInTheDocument();
  });
});

describe('BracketCanvas — 조별+결선 조 편성 블록', () => {
  const gA = makeGroup({ id: 'gA', name: 'A조', phase: 'group', sortOrder: 0, advanceCount: 2 });
  const gB = makeGroup({ id: 'gB', name: 'B조', phase: 'group', sortOrder: 1, advanceCount: 2 });
  const gSemi = makeGroup({ id: 'g-semi', name: '4강', phase: 'semi', sortOrder: 0 });
  const gFinal = makeGroup({ id: 'g-final', name: '결승', phase: 'final', sortOrder: 1 });
  const entry = (groupId: string, letter: string, position: number, team: string | null = null) =>
    makeSlot({
      id: `e${letter}${position}`, kind: 'ENTRY', groupId, position, label: `${letter}조 ${position}번`,
      registrationId: team === null ? null : `reg-${letter}${position}`, teamName: team,
    });
  const rank = (letter: string, sourceGroupId: string, position: number) =>
    makeSlot({ id: `r${letter}${position}`, kind: 'GROUP_RANK', groupId: 'g-semi', sourceGroupId, position, label: `${letter}조 ${position}위` });
  const rankSlots = [rank('A', 'gA', 1), rank('A', 'gA', 2), rank('B', 'gB', 1), rank('B', 'gB', 2)];
  const groupSlots = [
    entry('gA', 'A', 1, '서울FC'), entry('gA', 'A', 2), entry('gA', 'A', 3), entry('gA', 'A', 4),
    entry('gB', 'B', 1), entry('gB', 'B', 2), entry('gB', 'B', 3), entry('gB', 'B', 4),
  ];
  const groupFixtures = (aGame = makeGame()) => [
    // 일부러 번호가 큰 경기를 앞에 둔다 — 첫 경기 판정은 입력 순서가 아니라 번호 순이어야 한다.
    makeFixture({ id: 'fa2', groupId: 'gA', fixtureNumber: 6, round: 'league_r2', homeSlotId: 'eA1', awaySlotId: 'eA3' }),
    makeFixture({ id: 'fa1', groupId: 'gA', fixtureNumber: 1, round: 'league_r1', homeSlotId: 'eA1', awaySlotId: 'eA2', game: aGame }),
    makeFixture({ id: 'fb1', groupId: 'gB', fixtureNumber: 2, round: 'league_r1', homeSlotId: 'eB1', awaySlotId: 'eB2' }),
    makeFixture({ id: 'sf1', groupId: 'g-semi', fixtureNumber: 7, round: '4강', homeSlotId: 'rA1', awaySlotId: 'rB2' }),
    makeFixture({ id: 'sf2', groupId: 'g-semi', fixtureNumber: 8, round: '4강', homeSlotId: 'rB1', awaySlotId: 'rA2' }),
    makeFixture({
      id: 'fin', groupId: 'g-final', fixtureNumber: 9, round: '결승',
      bracketSources: [{ fixtureId: 'sf1', outcome: 'WINNER', side: 'HOME' }, { fixtureId: 'sf2', outcome: 'WINNER', side: 'AWAY' }],
    }),
  ];
  const stageProps = (aGame?: ReturnType<typeof makeGame>) => ({
    groups: [gFinal, gSemi, gB, gA],
    fixtures: groupFixtures(aGame),
    slots: [...groupSlots, ...rankSlots],
  });

  it('조마다 편성 블록을 그리고 열 이름 "조 편성" 이 4강 앞에 온다', () => {
    renderCanvas(stageProps());
    expect(screen.getByRole('group', { name: 'A조 조 편성' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'B조 조 편성' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['A조', 'B조', '조 편성', '4강', '결승']);
    expect(within(screen.getByRole('group', { name: 'A조 조 편성' })).getByRole('button', { name: 'A조 1번, 서울FC' })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'A조 조 편성' })).getByRole('button', { name: 'A조 2번, 빈 자리' })).toBeInTheDocument();
  });

  it('조 순위 연결선 4개는 선·점 점선이고 설명 문구가 따로 붙는다 (승자선 설명과 구분)', () => {
    const { container } = renderCanvas(stageProps());
    expect(container.querySelectorAll('svg path[stroke-dasharray="10 4 2 4"]')).toHaveLength(4);
    expect(screen.getByText('선과 점이 번갈아 나오는 점선은 조 순위로 올라오는 곳이에요.')).toBeInTheDocument();
    expect(screen.getByText(/실선은 승자, 점선은 패자/)).toBeInTheDocument();
  });

  it('팀을 고른 상태에서 빈 조 자리를 누르면 그 자리에 배정한다', () => {
    const { props } = renderCanvas({ ...stageProps(), pendingRegistrationId: 'reg-9' });
    fireEvent.click(screen.getByRole('button', { name: 'A조 2번, 빈 자리, 선택한 팀을 여기에 넣어요' }));
    expect(props.onAssignSlot).toHaveBeenCalledWith('eA2', 'reg-9');
    expect(props.onSelectFixture).not.toHaveBeenCalled();
  });

  it('팀을 고르지 않고 자리를 누르면 그 자리를 쓰는 경기 중 번호가 가장 앞선 경기를 연다', () => {
    const { props } = renderCanvas(stageProps());
    fireEvent.click(screen.getByRole('button', { name: 'A조 1번, 서울FC' }));
    expect(props.onSelectFixture).toHaveBeenCalledWith('fa1'); // fa2(6번)도 eA1 을 쓰지만 1번 경기가 먼저
  });

  it('쓰는 경기가 하나라도 시작됐으면 그 자리는 팀을 고른 상태에서도 넣을 수 없다 — 시작 전 자리는 넣는다', () => {
    const { props } = renderCanvas({ ...stageProps(makeGame({ state: 'LIVE' })), pendingRegistrationId: 'reg-9' });
    // eA1·eA2 는 진행 중인 fa1 이 쓴다. eA3 은 시작 전 fa2 만 쓴다.
    const block = within(screen.getByRole('group', { name: 'A조 조 편성' }));
    expect(block.queryByRole('button', { name: /A조 1번.*선택한 팀을 여기에 넣어요/ })).not.toBeInTheDocument();
    fireEvent.click(block.getByRole('button', { name: 'A조 1번, 서울FC' }));
    expect(props.onAssignSlot).not.toHaveBeenCalled();
    expect(props.onSelectFixture).toHaveBeenCalledWith('fa1');
    fireEvent.click(block.getByRole('button', { name: 'A조 3번, 빈 자리, 선택한 팀을 여기에 넣어요' }));
    expect(props.onAssignSlot).toHaveBeenCalledWith('eA3', 'reg-9');
  });

  it('끌어 놓은 팀을 조 자리에 넣는다', () => {
    const { props } = renderCanvas(stageProps());
    const row = screen.getByRole('button', { name: 'B조 2번, 빈 자리' }).closest('li')!;
    fireEvent.drop(row, { dataTransfer: { getData: (type: string) => (type === REGISTRATION_DRAG_MIME ? 'reg-7' : '') } });
    expect(props.onAssignSlot).toHaveBeenCalledWith('eB2', 'reg-7');
  });

  it('읽기 전용에서는 고른 팀이 있어도 넣을 수 없다', () => {
    renderCanvas({ ...stageProps(), canWrite: false, pendingRegistrationId: 'reg-9' });
    expect(screen.queryByRole('button', { name: /A조 2번.*선택한 팀을 여기에 넣어요/ })).not.toBeInTheDocument();
  });

  it('순위 자리가 없는 대진(토너먼트)에는 조 편성 블록도 순위 연결 설명도 없다 — 대조군', () => {
    const { container } = renderCanvas();
    expect(screen.queryByRole('group', { name: /조 편성/ })).not.toBeInTheDocument();
    expect(container.querySelector('svg path[stroke-dasharray="10 4 2 4"]')).toBeNull();
    expect(screen.queryByText(/조 순위로 올라오는 곳/)).not.toBeInTheDocument();
  });
});
