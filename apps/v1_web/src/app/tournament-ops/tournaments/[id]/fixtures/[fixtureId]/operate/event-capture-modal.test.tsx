import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EventCaptureModal } from './event-capture-modal';

const PLAYER = {
  id: 'p-1',
  gameId: 'g-1',
  sideId: 's-1',
  lineupId: 'l-1',
  displayNameSnapshot: '정우진',
  jerseyNumber: 10,
  position: null,
  positionX: null,
  positionY: null,
  started: true,
  createdAt: '',
  updatedAt: '',
} as const;
const FROZEN = { period: 1, clockMs: 120000, occurredAt: '2026-08-07T00:00:00.000Z' };

describe('EventCaptureModal — 1탭 즉시 확정', () => {
  it('골 버튼을 누르면 어시스트를 묻지 않고 즉시 GOAL 이벤트를 커밋하고 닫는다', async () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <EventCaptureModal open sideId="s-1" player={PLAYER} frozen={FROZEN} onCommit={onCommit} onCancel={onCancel} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /골/ }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GOAL', participantId: 'p-1', payload: {} }),
    );
    // "어시스트한 선수가 있나요" 같은 2단계 화면이 더 이상 없다
    expect(screen.queryByText(/어시스트한 선수/)).toBeNull();
  });

  it('파울 버튼은 골·카드와 같은 줄에서 즉시 FOUL 이벤트를 커밋한다', async () => {
    const onCommit = vi.fn();
    render(<EventCaptureModal open sideId="s-1" player={PLAYER} frozen={FROZEN} onCommit={onCommit} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: '파울' }));
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ type: 'FOUL', payload: {} }));
  });

  it('카드 버튼은 각각 옐로/레드 payload로 즉시 커밋한다', async () => {
    const onCommit = vi.fn();
    render(<EventCaptureModal open sideId="s-1" player={PLAYER} frozen={FROZEN} onCommit={onCommit} onCancel={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /옐로카드/ }));
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ type: 'CARD', payload: { card: 'YELLOW' } }));
  });
});
