import { render, screen, waitFor, within } from '@testing-library/react';
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
        userId: null,
        displayNameSnapshot: name,
        jerseyNumber: 10,
        position: null,
        positionX: null,
        positionY: null,
        started: true,
        arrivedAt: null,
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
    // 모바일 팀 전환 탭(UX 감사 item 5)이 팀명을 탭 라벨로도 보여주므로,
    // 텍스트만으로 찾으면 섹션 헤딩과 탭 버튼 둘 다 매칭돼 모호해진다 —
    // 섹션 헤딩(role="heading")으로 좁혀서 찾는다.
    expect(within(dialog).getByRole('heading', { name: /강남 풋살 클럽/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('heading', { name: /성수 풋살 클럽/ })).toBeInTheDocument();

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

  it('GOAL은 선수 없이 익명으로 팀 득점을 기록한다', async () => {
    const onCommitGoal = vi.fn();
    render(
      <ActionTargetPicker
        open
        actionLabel="골"
        actionType="GOAL"
        frozen={FROZEN}
        sides={SIDES}
        lineups={LINEUPS}
        allowTeamOnly
        onCommit={onCommitGoal}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /강남 풋살 클럽 · 익명 골로 기록/ }));
    expect(onCommitGoal).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GOAL', sideId: 's-home', payload: { anonymous: true } }),
    );
    expect(onCommitGoal.mock.calls[0]![0].participantId).toBeUndefined();
  });

  it('OWN_GOAL은 선수 없이 득점 팀 기준으로 OG를 기록한다', async () => {
    const onCommit = vi.fn();
    render(
      <ActionTargetPicker
        open
        actionLabel="자책골"
        actionType="OWN_GOAL"
        frozen={FROZEN}
        sides={SIDES}
        lineups={LINEUPS}
        allowTeamOnly
        onCommit={onCommit}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /성수 풋살 클럽 득점 · OG로 기록/ }));
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OWN_GOAL', sideId: 's-away', payload: { anonymous: true } }),
    );
    expect(onCommit.mock.calls[0]![0].participantId).toBeUndefined();
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
      userId: null,
      displayNameSnapshot: p.name,
      jerseyNumber: 10,
      position: null,
      positionX: null,
      positionY: null,
      started: p.started,
      arrivedAt: null,
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
  /**
   * 교체 2단계는 1단계의 `<LineupGrid>`를 element type이 다른 `<div>`로 갈아끼우므로
   * React가 서브트리를 언마운트한다 — 방금 누른 선수 버튼이 사라지면서
   * `document.activeElement`가 `body`로 떨어진다. focus trap은 activeElement가
   * first/last일 때만 되감으므로 body 상태에서는 아무 개입도 하지 않고,
   * 그 순간 Tab이 다이얼로그 밖 배경 문서로 샌다(WCAG 2.1.2).
   * 그래서 단계가 바뀔 때마다 다이얼로그 안 첫 focusable로 포커스를 재고정한다.
   */
  it('2단계로 넘어가도 포커스가 다이얼로그 안에 남는다(배경으로 새지 않는다)', async () => {
    render(
      <>
        <button type="button">배경 버튼</button>
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
        />
      </>,
    );

    const dialog = screen.getByRole('dialog');
    // 훅의 초기 포커스는 60ms 지연이라 먼저 소진시킨다 — 그래야 아래 단언이
    // "단계 전환 후 재고정"을 보는 것이지 초기 포커스 타이머의 부수효과를
    // 잘못 통과로 읽는 것이 아님이 보장된다.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));

    // 2단계로 실제로 전환됐는지 먼저 확인(전환이 없으면 포커스 단언은 무의미하다).
    expect(screen.getByRole('button', { name: /이민호/ })).toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('"뒤로"로 1단계에 돌아와도 포커스가 다이얼로그 안에 남는다', async () => {
    render(
      <>
        <button type="button">배경 버튼</button>
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
        />
      </>,
    );

    const dialog = screen.getByRole('dialog');
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));
    await userEvent.click(screen.getByRole('button', { name: '뒤로' }));

    expect(screen.getByRole('button', { name: /정우진/ })).toBeInTheDocument();
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
