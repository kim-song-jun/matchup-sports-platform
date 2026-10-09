import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeRegistration, makeSlot } from '@/test/bracket-canvas-fixtures';
import { BracketTeamTray } from './bracket-team-tray';
import { REGISTRATION_DRAG_MIME } from './bracket-canvas-dnd';

const registrations = [
  makeRegistration({ id: 'r1', teamName: '서울FC' }),
  makeRegistration({ id: 'r2', teamName: '부산FC' }),
  makeRegistration({ id: 'r3', teamName: '대구FC' }),
  makeRegistration({ id: 'r4', teamName: '입금 대기 팀', status: 'awaiting_payment' }),
];

function renderTray(overrides: Partial<React.ComponentProps<typeof BracketTeamTray>> = {}) {
  const props = {
    registrations,
    slots: [],
    pendingRegistrationId: null,
    canWrite: true,
    onPick: vi.fn(),
    ...overrides,
  };
  render(<BracketTeamTray {...props} />);
  return props;
}

describe('BracketTeamTray', () => {
  it('확정된 팀만 이름순으로 나열하고 미배정 수를 보여 준다', () => {
    renderTray();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['대구FC', '부산FC', '서울FC']);
    expect(screen.queryByText('입금 대기 팀')).not.toBeInTheDocument();
    expect(screen.getByText('미배정 3 / 전체 3')).toBeInTheDocument();
  });

  it('ENTRY·BYE 자리에 들어간 팀은 비활성이고 "배정됨"으로 표시한다(순위 자리는 배정으로 세지 않는다)', () => {
    renderTray({
      slots: [
        makeSlot({ id: 's1', kind: 'ENTRY', registrationId: 'r1' }),
        makeSlot({ id: 's2', kind: 'BYE', registrationId: 'r2' }),
        makeSlot({ id: 's3', kind: 'GROUP_RANK', registrationId: 'r3' }),
      ],
    });
    expect(screen.getByRole('button', { name: /서울FC/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /부산FC/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /대구FC/ })).toBeEnabled();
    expect(screen.getAllByText('배정됨')).toHaveLength(2);
    expect(screen.getByText('미배정 1 / 전체 3')).toBeInTheDocument();
  });

  it('팀을 누르면 그 팀을 선택한다', () => {
    const props = renderTray();
    fireEvent.click(screen.getByRole('button', { name: /서울FC/ }));
    expect(props.onPick).toHaveBeenCalledWith('r1');
  });

  it('선택된 팀은 aria-pressed 와 "선택됨" 글자로 알리고, 다시 누르면 null 을 보낸다', () => {
    const props = renderTray({ pendingRegistrationId: 'r1' });
    const selected = screen.getByRole('button', { name: /서울FC/ });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('선택됨')).toBeInTheDocument();
    fireEvent.click(selected);
    expect(props.onPick).toHaveBeenCalledWith(null);
  });

  it('끌기를 시작하면 registrationId 를 전달 데이터에 심는다', () => {
    renderTray();
    const setData = vi.fn();
    fireEvent.dragStart(screen.getByRole('button', { name: /서울FC/ }), { dataTransfer: { setData, effectAllowed: '' } });
    expect(setData).toHaveBeenCalledWith(REGISTRATION_DRAG_MIME, 'r1');
  });

  it('읽기 전용이면 모든 팀이 비활성이고 안내만 보인다', () => {
    renderTray({ canWrite: false });
    screen.getAllByRole('button').forEach((button) => expect(button).toBeDisabled());
    expect(screen.getByText('읽기 전용이라 팀을 넣을 수 없어요.')).toBeInTheDocument();
  });

  it('확정된 팀이 없으면 빈 안내를 보여 준다', () => {
    renderTray({ registrations: [registrations[3]] });
    expect(screen.getByText('확정된 참가팀이 아직 없어요.')).toBeInTheDocument();
  });
});
