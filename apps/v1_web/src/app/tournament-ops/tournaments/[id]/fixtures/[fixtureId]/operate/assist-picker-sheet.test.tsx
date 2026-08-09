import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AssistPickerSheet } from './assist-picker-sheet';
import type { GameEventRecord, GameLineupParticipant } from '@/types/game-operations';

const EVENT: GameEventRecord = {
  id: 'event-1',
  gameId: 'game-1',
  sequence: 1,
  clientEventId: 'client-1',
  payloadHash: 'hash',
  type: 'GOAL',
  sideId: 'side-home',
  participantId: 'p-jung',
  assistParticipantId: null,
  period: 1,
  clockMs: 60000,
  occurredAt: '2026-08-07T00:00:00.000Z',
  receivedAt: '2026-08-07T00:00:00.000Z',
  actorUserId: 'actor-1',
  reversesEventId: null,
  payload: {},
};

const TEAMMATE: GameLineupParticipant = {
  id: 'p-cho',
  gameId: 'game-1',
  sideId: 'side-home',
  lineupId: 'lineup-home',
  displayNameSnapshot: '조현우',
  jerseyNumber: 9,
  position: null,
  positionX: null,
  positionY: null,
  started: true,
  createdAt: '',
  updatedAt: '',
};

describe('AssistPickerSheet', () => {
  it('팀메이트를 고르면 onAttach를 그 선수 id로 호출하고 성공 시 닫는다', async () => {
    const onAttach = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <AssistPickerSheet open event={EVENT} scorerName="정우진" teammates={[TEAMMATE]} onAttach={onAttach} onClose={onClose} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /조현우/ }));

    expect(onAttach).toHaveBeenCalledWith('p-cho');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('onAttach가 실패하면 에러 메시지를 보여주고 닫지 않는다', async () => {
    const onAttach = vi.fn().mockRejectedValue(new Error('network down'));
    const onClose = vi.fn();
    render(
      <AssistPickerSheet open event={EVENT} scorerName="정우진" teammates={[TEAMMATE]} onAttach={onAttach} onClose={onClose} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /조현우/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
    expect(onClose).not.toHaveBeenCalled();
  });
});
