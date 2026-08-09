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

/**
 * 라이브 선수 교체 — SUBSTITUTION만 내부에 2단계(나갈 선수 → 들어올 선수)를
 * 더 갖는다. `onPitchParticipantIds`로 1단계는 피치 위 선수만, 2단계는 같은
 * 팀 벤치만 필터한다(오조작 방지 1차 방어선 — 서버가 최종 검증하지만
 * 애초에 무효한 대상을 보여주지 않는다).
 */
function subLineup(
  side: GameSide,
  participants: ReadonlyArray<{ id: string; name: string; started: boolean }>,
): GameLineup {
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
    participants: participants.map((p) => ({
      id: p.id,
      gameId: 'g-1',
      sideId: side.id,
      lineupId: `lineup-${side.id}`,
      displayNameSnapshot: p.name,
      jerseyNumber: 10,
      position: null,
      positionX: null,
      positionY: null,
      started: p.started,
      createdAt: '',
      updatedAt: '',
    })),
  };
}

const SUB_LINEUPS = [
  subLineup(HOME, [
    { id: 'p-out', name: '정우진', started: true },
    { id: 'p-in', name: '이민호', started: false },
  ]),
  subLineup(AWAY, [{ id: 'p-away', name: '조현우', started: true }]),
];
const SUB_ON_PITCH = new Set(['p-out', 'p-away']);

describe('ActionTargetPicker — SUBSTITUTION (나갈 선수 → 들어올 선수 2단계)', () => {
  it('1단계는 피치 위 선수만 보여준다(벤치 선수는 안 보인다)', () => {
    render(
      <ActionTargetPicker
        open
        actionLabel="교체"
        actionType="SUBSTITUTION"
        frozen={FROZEN}
        sides={SIDES}
        lineups={SUB_LINEUPS}
        allowTeamOnly={false}
        onPitchParticipantIds={SUB_ON_PITCH}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /정우진/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /이민호/ })).toBeNull();
  });

  it('나갈 선수를 고르면 2단계로 넘어가 같은 팀 벤치만 보여주고, 고르면 OUT/IN이 실린 SUBSTITUTION으로 커밋한다', async () => {
    const onCommit = vi.fn();
    render(
      <ActionTargetPicker
        open
        actionLabel="교체"
        actionType="SUBSTITUTION"
        frozen={FROZEN}
        sides={SIDES}
        lineups={SUB_LINEUPS}
        allowTeamOnly={false}
        onPitchParticipantIds={SUB_ON_PITCH}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));

    // 2단계: 상대팀(조현우)은 보이지 않고, 같은 팀 벤치(이민호)만 보인다.
    expect(screen.queryByRole('button', { name: /조현우/ })).toBeNull();
    const inButton = screen.getByRole('button', { name: /이민호/ });
    await userEvent.click(inButton);

    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SUBSTITUTION',
        participantId: 'p-in',
        sideId: 's-home',
        payload: { outParticipantId: 'p-out' },
        period: 1,
        clockMs: 120_000,
        occurredAt: '2026-08-07T00:00:00.000Z',
      }),
    );
  });

  it('2단계에서 "뒤로"를 누르면 1단계로 돌아가고 아직 아무것도 커밋하지 않는다', async () => {
    const onCommit = vi.fn();
    render(
      <ActionTargetPicker
        open
        actionLabel="교체"
        actionType="SUBSTITUTION"
        frozen={FROZEN}
        sides={SIDES}
        lineups={SUB_LINEUPS}
        allowTeamOnly={false}
        onPitchParticipantIds={SUB_ON_PITCH}
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));
    await userEvent.click(screen.getByRole('button', { name: '뒤로' }));

    // 1단계로 복귀 — 피치 위 선수(정우진)가 다시 보인다.
    expect(screen.getByRole('button', { name: /정우진/ })).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('substitutions === "limited"이면 남은 교체 횟수를 보여준다', async () => {
    render(
      <ActionTargetPicker
        open
        actionLabel="교체"
        actionType="SUBSTITUTION"
        frozen={FROZEN}
        sides={SIDES}
        lineups={SUB_LINEUPS}
        allowTeamOnly={false}
        onPitchParticipantIds={SUB_ON_PITCH}
        substitutionPolicy={{ mode: 'limited', maxSubstitutions: 5 }}
        substitutionUsedBySideId={{ 's-home': 2 }}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));
    expect(screen.getByText(/남은 교체 3회/)).toBeInTheDocument();
    expect(screen.getByText(/2\/5 사용/)).toBeInTheDocument();
  });

  it('substitutions === "rolling"이면 남은 횟수 표시를 하지 않는다', async () => {
    render(
      <ActionTargetPicker
        open
        actionLabel="교체"
        actionType="SUBSTITUTION"
        frozen={FROZEN}
        sides={SIDES}
        lineups={SUB_LINEUPS}
        allowTeamOnly={false}
        onPitchParticipantIds={SUB_ON_PITCH}
        substitutionPolicy={{ mode: 'rolling', maxSubstitutions: null }}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));
    expect(screen.queryByText(/남은 교체/)).toBeNull();
  });
});
