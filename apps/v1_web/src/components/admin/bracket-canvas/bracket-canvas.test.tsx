import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGroup, makeSlot } from '@/test/bracket-canvas-fixtures';
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
    onAssignDirect: vi.fn(),
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
