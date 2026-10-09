// apps/v1_web/src/components/admin/bracket-canvas/bracket-group-block.test.tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GroupBlockLayout } from '@/lib/bracket-canvas-group-layout';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';
import { BracketGroupBlock } from './bracket-group-block';

const block: GroupBlockLayout = {
  groupId: 'gA',
  name: 'A조',
  advanceCount: 2,
  rankCount: 2,
  x: 632,
  y: 56,
  width: 232,
  height: 140,
  slots: [
    { id: 'a1', position: 1, label: 'A조 1번', registrationId: 'reg-1', teamName: '서울FC' },
    { id: 'a2', position: 2, label: 'A조 2번', registrationId: null, teamName: null },
  ],
};

function renderBlock(overrides: Partial<React.ComponentProps<typeof BracketGroupBlock>> = {}) {
  const props = {
    block,
    canWrite: true,
    lockedSlotIds: new Set<string>(),
    pendingRegistrationId: null,
    onPlace: vi.fn(),
    onOpenSlot: vi.fn(),
    ...overrides,
  };
  render(<BracketGroupBlock {...props} />);
  return props;
}

const dropOn = (row: HTMLElement, registrationId: string) =>
  fireEvent.drop(row, { dataTransfer: { getData: (type: string) => (type === REGISTRATION_DRAG_MIME ? registrationId : '') } });

describe('BracketGroupBlock', () => {
  it('조 이름·진출 배지와 자리를 보여 준다 — 채워진 자리는 팀 이름, 빈 자리는 "빈 자리" 글자로 구분한다', () => {
    renderBlock();
    const group = screen.getByRole('group', { name: 'A조 조 편성' });
    expect(within(group).getByText('상위 2팀 진출')).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'A조 1번, 서울FC' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'A조 2번, 빈 자리' })).toBeInTheDocument();
  });

  it('진출 수가 없으면 배지를 그리지 않는다', () => {
    renderBlock({ block: { ...block, advanceCount: null } });
    expect(screen.queryByText(/팀 진출/)).not.toBeInTheDocument();
  });

  it('행 높이는 44px 터치 타겟이다', () => {
    renderBlock();
    expect(screen.getByRole('button', { name: 'A조 1번, 서울FC' }).closest('li')).toHaveStyle({ height: '44px' });
  });

  it('팀을 고르지 않고 자리를 누르면 그 자리의 패널을 연다 (읽기 전용에서도)', () => {
    const props = renderBlock({ canWrite: false });
    fireEvent.click(screen.getByRole('button', { name: 'A조 1번, 서울FC' }));
    expect(props.onOpenSlot).toHaveBeenCalledWith('a1');
    expect(props.onPlace).not.toHaveBeenCalled();
  });

  it('고른 팀이 있으면 자리를 눌러 그 팀을 넣는다 (채워진 자리는 바꿔 넣기)', () => {
    const props = renderBlock({ pendingRegistrationId: 'reg-9' });
    fireEvent.click(screen.getByRole('button', { name: 'A조 2번, 빈 자리, 선택한 팀을 여기에 넣어요' }));
    expect(props.onPlace).toHaveBeenCalledWith('a2', 'reg-9');
    fireEvent.click(screen.getByRole('button', { name: 'A조 1번, 서울FC, 선택한 팀을 여기에 넣어요' }));
    expect(props.onPlace).toHaveBeenLastCalledWith('a1', 'reg-9');
    expect(props.onOpenSlot).not.toHaveBeenCalled();
  });

  it('이미 시작한 경기가 쓰는 자리는 팀을 고른 상태에서도 넣을 수 없다 — 누르면 패널만 연다 (대조: 다른 자리는 넣는다)', () => {
    const props = renderBlock({ pendingRegistrationId: 'reg-9', lockedSlotIds: new Set(['a1']) });
    fireEvent.click(screen.getByRole('button', { name: 'A조 1번, 서울FC' }));
    expect(props.onOpenSlot).toHaveBeenCalledWith('a1');
    expect(props.onPlace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /A조 2번, 빈 자리, 선택한 팀을 여기에 넣어요/ }));
    expect(props.onPlace).toHaveBeenCalledWith('a2', 'reg-9');
  });

  it('읽기 전용에서는 팀을 고른 상태여도 넣을 수 없다', () => {
    const props = renderBlock({ canWrite: false, pendingRegistrationId: 'reg-9' });
    expect(screen.queryByRole('button', { name: /선택한 팀을 여기에 넣어요/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'A조 2번, 빈 자리' }));
    expect(props.onPlace).not.toHaveBeenCalled();
  });

  it('끌어 놓은 팀을 그 자리에 넣는다 — 잠긴 자리·읽기 전용은 놓을 수 없다', () => {
    const props = renderBlock({ lockedSlotIds: new Set(['a1']) });
    const open = screen.getByRole('button', { name: 'A조 2번, 빈 자리' }).closest('li')!;
    const locked = screen.getByRole('button', { name: 'A조 1번, 서울FC' }).closest('li')!;
    expect(fireEvent.dragOver(open)).toBe(false); // preventDefault 가 걸려 놓을 수 있는 곳
    expect(fireEvent.dragOver(locked)).toBe(true);
    dropOn(open, 'reg-7');
    expect(props.onPlace).toHaveBeenCalledWith('a2', 'reg-7');
    dropOn(locked, 'reg-8');
    expect(props.onPlace).toHaveBeenCalledTimes(1);
  });

  it('끌어 놓은 데이터에 팀이 없으면 아무것도 하지 않는다', () => {
    const props = renderBlock();
    dropOn(screen.getByRole('button', { name: 'A조 2번, 빈 자리' }).closest('li')!, '');
    expect(props.onPlace).not.toHaveBeenCalled();
  });
});
