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

  /** jsdom 은 레이아웃을 계산하지 않아 scrollHeight/clientHeight 가 항상 0 이다.
   *  "목록이 넘친다/안 넘친다"는 이 컴포넌트가 실제로 분기하는 조건이므로 그 두 값만
   *  직접 세워 두 갈래를 각각 검증한다(넘침 신호는 목록 스크롤 여부의 함수여야 하고,
   *  선수 수 어림짐작이어서는 안 된다 — 4명이 딱 들어맞는 390px 화면에서 마지막
   *  선수가 페이드에 반쯤 지워지던 실제 결함). */
  function stubListMetrics({ scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
    const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    const client = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, value: scrollHeight });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: clientHeight });
    return () => {
      if (scroll) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scroll);
      if (client) Object.defineProperty(HTMLElement.prototype, 'clientHeight', client);
    };
  }

  const manyTeammates = Array.from({ length: 8 }, (_, i) => ({
    ...TEAMMATE,
    id: `p-${i}`,
    displayNameSnapshot: `선수${i}`,
    jerseyNumber: i === 0 ? null : i,
  }));

  it('목록이 실제로 넘칠 때만 더 있다는 신호를 준다', () => {
    const restore = stubListMetrics({ scrollHeight: 600, clientHeight: 200 });
    try {
      render(<AssistPickerSheet {...base} teammates={manyTeammates} onClose={vi.fn()} />);
      expect(screen.getByText('아래로 더 있어요')).toBeInTheDocument();
      // 등번호 없는 선수 앞에 "-" 가 붙지 않는다.
      expect(screen.getByRole('button', { name: /선수0/ })).not.toHaveTextContent('-');
    } finally {
      restore();
    }
  });

  it('목록이 다 보이면 신호도 아래쪽 페이드도 없다 — 마지막 선수가 잘린 것처럼 보이면 안 된다', () => {
    const restore = stubListMetrics({ scrollHeight: 200, clientHeight: 200 });
    try {
      const { container } = render(
        <AssistPickerSheet {...base} teammates={manyTeammates.slice(0, 4)} onClose={vi.fn()} />,
      );
      expect(screen.queryByText('아래로 더 있어요')).not.toBeInTheDocument();
      const list = container.querySelector('[role="list"]');
      expect(list?.className).not.toContain('mask-image');
    } finally {
      restore();
    }
  });
});
