import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeFixture, makeGame, makeSlot } from '@/test/bracket-canvas-fixtures';
import type { V1AdminBracketFixture, V1AdminBracketSlot } from '@/types/api';
import { BracketCanvasNode } from './bracket-canvas-node';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

const POSITION = { fixtureId: 'f1', columnKey: 'g', x: 24, y: 56, width: 232, height: 156 };
const entry = (id: string) => makeSlot({ id, kind: 'ENTRY', label: `${id} 자리` });

function renderNode(
  fixture: V1AdminBracketFixture,
  overrides: Partial<React.ComponentProps<typeof BracketCanvasNode>> = {},
) {
  const props = {
    fixture,
    position: POSITION,
    title: '8강 1번 경기',
    sideLabels: { HOME: '1번 자리', AWAY: '2번 자리' },
    slots: { HOME: entry('s-home') as V1AdminBracketSlot | null, AWAY: entry('s-away') as V1AdminBracketSlot | null },
    selected: false,
    canWrite: true,
    pendingRegistrationId: null,
    onSelect: vi.fn(),
    onAssign: vi.fn(),
    ...overrides,
  };
  render(<BracketCanvasNode {...props} />);
  return props;
}

const base = makeFixture({ id: 'f1', groupId: 'g', fixtureNumber: 1, homeSlotId: 's-home', awaySlotId: 's-away' });
const officialQuick = (entryMethod: 'quick' | 'console' | 'correction', penalties?: { home: number; away: number }) =>
  makeFixture({
    ...base,
    homeRegistrationId: 'r1',
    homeTeamName: '서울FC',
    awayRegistrationId: 'r2',
    awayTeamName: '부산FC',
    game: makeGame({
      state: 'ENDED',
      latestRevision: { id: 'rev', state: 'OFFICIAL', entryMethod, score: { home: 1, away: 1, ...(penalties ? { penalties } : {}) } },
    }),
  });

describe('BracketCanvasNode — 표시', () => {
  it('예정 칸: 제목·상태 태그·사이드 라벨을 보여 주고 점수는 없다', () => {
    renderNode(base);
    expect(screen.getByRole('group', { name: '8강 1번 경기, 예정' })).toBeInTheDocument();
    expect(screen.getByText('예정')).toBeInTheDocument();
    expect(screen.getByText('1번 자리')).toBeInTheDocument();
    expect(screen.queryByText('어드민 빠른 입력')).not.toBeInTheDocument();
  });

  it('빠른 입력으로 확정된 칸만 "어드민 빠른 입력"과 점수를 보여 준다(대조: 콘솔 입력은 표시 없음)', () => {
    renderNode(officialQuick('quick'));
    expect(screen.getByText('확정')).toBeInTheDocument();
    expect(screen.getByText('어드민 빠른 입력')).toBeInTheDocument();
  });

  it('라이브 콘솔로 확정된 칸에는 빠른 입력 표시가 없다', () => {
    renderNode(officialQuick('console'));
    expect(screen.getByText('확정')).toBeInTheDocument();
    expect(screen.queryByText('어드민 빠른 입력')).not.toBeInTheDocument();
  });

  it('승부차기 점수를 꼬리에 보여 준다', () => {
    renderNode(officialQuick('quick', { home: 4, away: 3 }));
    expect(screen.getByText(/승부차기 4:3/)).toBeInTheDocument();
  });

  it('무효 처리된 칸은 점수를 숨기고 "무효 처리됨"을 보여 준다', () => {
    renderNode(
      makeFixture({
        ...base,
        game: makeGame({ state: 'ENDED', latestRevision: { id: 'rev', state: 'VOID', entryMethod: 'quick', score: { home: 3, away: 0 } } }),
      }),
    );
    expect(screen.getByText('무효 처리됨')).toBeInTheDocument();
    expect(screen.queryByText('어드민 빠른 입력')).not.toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  it('머리 버튼은 선택 상태를 aria-pressed 로 알린다', () => {
    renderNode(base, { selected: true });
    expect(screen.getByRole('button', { name: '8강 1번 경기 열기' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('선택된 칸은 색만이 아니라 테두리 두께로도 구분된다', () => {
    renderNode(base, { selected: true });
    expect((document.querySelector('[data-fixture-id="f1"]') as HTMLElement).style.border).toContain('2px');
    cleanup();
    renderNode(base, { selected: false });
    expect((document.querySelector('[data-fixture-id="f1"]') as HTMLElement).style.border).toContain('1px');
  });
});

describe('BracketCanvasNode — 눌러서 배정', () => {
  it('고른 팀이 없으면 줄을 눌러도 배정하지 않고 칸을 연다', () => {
    const props = renderNode(base);
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리' }));
    expect(props.onSelect).toHaveBeenCalledWith('f1');
    expect(props.onAssign).not.toHaveBeenCalled();
  });

  it('고른 팀이 있으면 누른 줄의 자리에 배정한다', () => {
    const props = renderNode(base, { pendingRegistrationId: 'reg-9' });
    fireEvent.click(screen.getByRole('button', { name: '어웨이 2번 자리, 선택한 팀을 여기에 넣어요' }));
    expect(props.onAssign).toHaveBeenCalledWith('s-away', 'reg-9');
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it.each([
    ['경기가 시작된 칸', makeFixture({ ...base, game: makeGame({ state: 'LIVE' }) }), {}],
    ['읽기 전용 화면', base, { canWrite: false }],
    ['순위 자리', base, { slots: { HOME: makeSlot({ id: 's-rank', kind: 'GROUP_RANK', label: 'A조 1위' }), AWAY: null } }],
    ['자리가 없는 줄(연결선으로 채워지는 줄)', base, { slots: { HOME: null, AWAY: null } }],
  ] as const)('%s 에서는 고른 팀이 있어도 배정하지 않고 칸을 연다', (_name, fixture, overrides) => {
    const props = renderNode(fixture, { pendingRegistrationId: 'reg-9', ...overrides });
    fireEvent.click(screen.getByRole('button', { name: '홈 1번 자리' }));
    expect(props.onAssign).not.toHaveBeenCalled();
    expect(props.onSelect).toHaveBeenCalledWith('f1');
  });
});

describe('BracketCanvasNode — 끌어 놓기', () => {
  const dropOn = (side: 'HOME' | 'AWAY', registrationId: string) => {
    const row = document.querySelector(`[data-side="${side}"]`)!;
    fireEvent.drop(row, { dataTransfer: { getData: (type: string) => (type === REGISTRATION_DRAG_MIME ? registrationId : '') } });
  };

  it('배정 가능한 줄에 놓으면 그 자리에 배정한다', () => {
    const props = renderNode(base);
    dropOn('HOME', 'reg-7');
    expect(props.onAssign).toHaveBeenCalledWith('s-home', 'reg-7');
  });

  it('시작된 칸에서는 놓아도 배정하지 않는다', () => {
    const live = renderNode(makeFixture({ ...base, game: makeGame({ state: 'LIVE' }) }));
    dropOn('HOME', 'reg-7');
    expect(live.onAssign).not.toHaveBeenCalled();
  });

  it('우리 앱이 심은 데이터가 아니면(다른 곳에서 끌어온 것) 무시한다', () => {
    const props = renderNode(base);
    const row = document.querySelector('[data-side="HOME"]')!;
    fireEvent.drop(row, { dataTransfer: { getData: () => '' } });
    expect(props.onAssign).not.toHaveBeenCalled();
  });
});
