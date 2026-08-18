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
  userId: null,
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

describe('AssistPickerSheet — 어시스트 없음·맥락·잘림 (2026-08-18 실화면 반영)', () => {
  const base = {
    open: true as const,
    event: EVENT,
    scorerName: '5 정우영',
    onAttach: vi.fn(),
  };

  it('"어시스트 없이 두기"를 눌러 닫을 수 있다 — 골은 이미 기록돼 있으므로 붙이지 않고 끝낸다', async () => {
    const onClose = vi.fn();
    const onAttach = vi.fn();
    render(<AssistPickerSheet {...base} onAttach={onAttach} teammates={[TEAMMATE]} onClose={onClose} />);

    await userEvent.click(screen.getByRole('button', { name: '어시스트 없이 두기' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    // 어시스트를 "없음"으로 고른 것이지 무언가를 붙인 게 아니다.
    expect(onAttach).not.toHaveBeenCalled();
  });

  it('팀·시각 맥락을 헤더에 보여준다 — 엉뚱한 골에 어시스트를 다는 사고를 막는다', () => {
    render(
      <AssistPickerSheet
        {...base}
        teamName="송파 풋살 모임"
        whenLabel="전반 01:00"
        teammates={[TEAMMATE]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/송파 풋살 모임/)).toBeInTheDocument();
    expect(screen.getByText(/전반 01:00/)).toBeInTheDocument();
  });

  it('선수가 많으면 더 있다는 신호를 준다 — 예전에는 잘려도 알 수 없었다', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...TEAMMATE,
      id: `p-${i}`,
      displayNameSnapshot: `선수${i}`,
      jerseyNumber: i === 0 ? null : i,
    }));
    render(<AssistPickerSheet {...base} teammates={many} onClose={vi.fn()} />);
    expect(screen.getByText('아래로 더 있어요')).toBeInTheDocument();
    // 등번호 없는 선수 앞에 "-" 가 붙지 않는다.
    expect(screen.getByRole('button', { name: /선수0/ })).not.toHaveTextContent('-');
  });
});
