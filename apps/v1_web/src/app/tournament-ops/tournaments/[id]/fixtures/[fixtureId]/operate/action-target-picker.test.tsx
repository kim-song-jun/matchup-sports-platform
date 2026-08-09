import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ActionTargetPicker } from './action-target-picker';
import type { GameLineup, GameSide } from '@/types/game-operations';

/**
 * 액션 우선 리오더(선수 우선 → 액션 우선)의 2단계 화면. 예전 event-capture-modal
 * 테스트가 검증하던 "탭 즉시 확정" 계약을 여기서 이어받되, 순서가 뒤집혔으므로
 * 커밋 인풋에 `participantId`가 나중에 붙는다는 점과 얼린 시각을 다시 얼리지
 * 않는다는 점을 새로 검증한다.
 */

const HOME: GameSide = {
  id: 's-home',
  gameId: 'g-1',
  sideKey: 'HOME',
  teamId: null,
  displayNameSnapshot: '강남 풋살 클럽',
  createdAt: '',
  updatedAt: '',
};
const AWAY: GameSide = {
  id: 's-away',
  gameId: 'g-1',
  sideKey: 'AWAY',
  teamId: null,
  displayNameSnapshot: '성수 풋살 클럽',
  createdAt: '',
  updatedAt: '',
};

function lineup(side: GameSide, participantId: string, name: string): GameLineup {
  return {
    id: `lineup-${side.id}`,
    gameId: 'g-1',
    sideId: side.id,
    revision: 1,
    state: 'SUBMITTED',
    version: 1,
    submittedAt: '',
    supersedesId: null,
    formation: null,
    createdAt: '',
    updatedAt: '',
    participants: [
      {
        id: participantId,
        gameId: 'g-1',
        sideId: side.id,
        lineupId: `lineup-${side.id}`,
        displayNameSnapshot: name,
        jerseyNumber: 10,
        position: null,
        positionX: null,
        positionY: null,
        started: true,
        createdAt: '',
        updatedAt: '',
      },
    ],
  };
}

const SIDES = [HOME, AWAY];
const LINEUPS = [lineup(HOME, 'p-jung', '정우진'), lineup(AWAY, 'p-cho', '조현우')];
const FROZEN = { period: 1, clockMs: 120_000, occurredAt: '2026-08-07T00:00:00.000Z' };

describe('ActionTargetPicker — 액션 우선(액션 먼저, 대상은 나중)', () => {
  it('양 팀 선수가 모두 보이고, 고른 선수의 팀으로 즉시 커밋한다', async () => {
    const onCommit = vi.fn();
    render(
      <ActionTargetPicker
        open
        actionLabel="골"
        actionType="GOAL"
        frozen={FROZEN}
        sides={SIDES}
        lineups={LINEUPS}
        allowTeamOnly={false}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('강남 풋살 클럽', { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText('성수 풋살 클럽', { exact: false })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /조현우/ }));

    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GOAL',
        participantId: 'p-cho',
        sideId: 's-away',
        period: 1,
        clockMs: 120_000,
        occurredAt: '2026-08-07T00:00:00.000Z',
      }),
    );
  });

  it('카드 액션은 payload.card로 색을 실어 보낸다', async () => {
    const onCommit = vi.fn();
    render(
      <ActionTargetPicker
        open
        actionLabel="레드카드"
        actionType="CARD"
        cardColor="RED"
        frozen={FROZEN}
        sides={SIDES}
        lineups={LINEUPS}
        allowTeamOnly={false}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ payload: { card: 'RED' } }));
  });

  it('FOUL만 선수 없이 팀 단위로 기록하는 경로를 제공한다', () => {
    const onCommitGoal = vi.fn();
    render(
      <ActionTargetPicker
        open
        actionLabel="골"
        actionType="GOAL"
        frozen={FROZEN}
        sides={SIDES}
        lineups={LINEUPS}
        allowTeamOnly={false}
        onCommit={onCommitGoal}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText(/선수 지정 없이/)).toBeNull();
  });

  it('FOUL에서 "선수 지정 없이"를 고르면 participantId 없이 sideId만으로 커밋한다', async () => {
    const onCommit = vi.fn();
    render(
      <ActionTargetPicker
        open
        actionLabel="파울"
        actionType="FOUL"
        frozen={FROZEN}
        sides={SIDES}
        lineups={LINEUPS}
        allowTeamOnly
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /강남 풋살 클럽 · 선수 지정 없이/ }));
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FOUL', sideId: 's-home' }),
    );
    const call = onCommit.mock.calls[0]![0];
    expect(call.participantId).toBeUndefined();
  });

  it('취소하면 아무것도 커밋하지 않는다', async () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <ActionTargetPicker
        open
        actionLabel="골"
        actionType="GOAL"
        frozen={FROZEN}
        sides={SIDES}
        lineups={LINEUPS}
        allowTeamOnly={false}
        onCommit={onCommit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '이벤트 기록 취소' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
