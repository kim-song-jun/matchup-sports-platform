import type { ComponentProps } from 'react';
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
    invalidatedAt: null,
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

  it('레드카드가 기록된 선수는 골·카드 대상 목록에서 "퇴장"으로 가르되 다른 팀 선수는 그대로 둔다', () => {
    for (const [actionLabel, actionType] of [['골', 'GOAL'], ['옐로카드', 'CARD']] as const) {
      const { unmount } = render(
        <ActionTargetPicker
          open
          actionLabel={actionLabel}
          actionType={actionType}
          cardColor={actionType === 'CARD' ? 'YELLOW' : undefined}
          frozen={FROZEN}
          sides={SIDES}
          lineups={LINEUPS}
          allowTeamOnly={false}
          sentOffParticipantIds={new Set(['p-jung'])}
          onCommit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );

      expect(screen.getByRole('button', { name: '정우진 선수 이벤트 기록, 퇴장' })).toHaveTextContent('퇴장');
      expect(screen.getByRole('button', { name: '조현우 선수 이벤트 기록' })).not.toHaveTextContent('퇴장');
      unmount();
    }
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

  it.each([{ lineups: LINEUPS }, { lineups: [] }])('GOAL은 명단 유무와 무관하게 익명으로 팀 득점을 기록한다', async ({ lineups }) => {
    const onCommitGoal = vi.fn();
    render(
      <ActionTargetPicker
        open
        actionLabel="골"
        actionType="GOAL"
        frozen={FROZEN}
        sides={SIDES}
        lineups={lineups}
        allowTeamOnly
        onCommit={onCommitGoal}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '강남 풋살 클럽 · 선수 모름' }));
    expect(onCommitGoal).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GOAL', sideId: 's-home', payload: { anonymous: true } }),
    );
    expect(onCommitGoal.mock.calls[0]![0].participantId).toBeUndefined();
  });

  it('OWN_GOAL은 자책골을 넣은 선수를 고르면 상대 팀 득점으로 기록한다', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: /조현우/ }));
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OWN_GOAL', participantId: 'p-cho', sideId: 's-home' }),
    );
  });

  it('OWN_GOAL은 선수 없이 자책골을 넣은 팀을 고르면 상대 팀 득점으로 기록한다', async () => {
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
    await userEvent.click(
      screen.getByRole('button', { name: /성수 풋살 클럽 자책골 · 강남 풋살 클럽 득점으로 기록/ }),
    );
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'OWN_GOAL', sideId: 's-home', payload: { anonymous: true } }),
    );
    expect(onCommit.mock.calls[0]![0].participantId).toBeUndefined();
  });

  it('FOUL에서 "선수 모름"을 고르면 participantId 없이 sideId만으로 커밋한다', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: '강남 풋살 클럽 · 선수 모름' }));
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
    invalidatedAt: null,
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

describe('ActionTargetPicker — 교체 문구의 운영진 실명', () => {
  it.each([
    ['운영진(실명 있음)', { realName: '김실명', phone: null }, '김실명 (정우진) 선수와 교체'],
    ['권한 없음(identity 키 없음)', undefined, '정우진 선수와 교체'],
  ])('%s', async (_, identity, text) => {
    const [home, away] = SUB_LINEUPS;
    const lineups = [
      { ...home, participants: home.participants.map((p) => (identity === undefined || p.id !== 'p-out' ? p : { ...p, identity })) },
      away,
    ];
    render(
      <ActionTargetPicker
        open
        actionLabel="교체"
        actionType="SUBSTITUTION"
        frozen={FROZEN}
        sides={SIDES}
        lineups={lineups}
        allowTeamOnly={false}
        onPitchParticipantIds={SUB_ON_PITCH}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));

    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe('ActionTargetPicker — 퇴장한 선수는 기록 전에 한 번 더 확인한다', () => {
  const SENT_OFF = new Set(['p-jung']);
  const RED_AT = new Map([['p-jung', { period: 2, clockMs: 492_000 }]]);

  function renderPicker(props: Partial<ComponentProps<typeof ActionTargetPicker>> = {}) {
    const onCommit = vi.fn();
    render(
      <ActionTargetPicker
        open
        actionLabel="골"
        actionType="GOAL"
        frozen={FROZEN}
        periodCount={2}
        sides={SIDES}
        lineups={LINEUPS}
        allowTeamOnly={false}
        sentOffParticipantIds={SENT_OFF}
        sentOffRedCards={RED_AT}
        onCommit={onCommit}
        onCancel={vi.fn()}
        {...props}
      />,
    );
    return onCommit;
  }

  it('퇴장한 선수를 고르면 바로 기록하지 않고 퇴장 사실·시각을 보여 주는 확인을 먼저 띄운다', async () => {
    const onCommit = renderPicker();

    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));

    const panel = screen.getByRole('group', { name: '정우진은 퇴장한 선수예요' });
    expect(panel).toHaveTextContent('후반 8:12에 레드카드를 받고 퇴장했어요. 그래도 골을 기록할까요?');
    expect(onCommit).not.toHaveBeenCalled();
    // 선수 목록은 확인이 끝날 때까지 가려진다 — 결정이 하나만 보이게.
    expect(screen.queryByRole('button', { name: /조현우/ })).not.toBeInTheDocument();
  });

  it('처음 포커스는 "다른 선수 고르기"에 있다 — 습관적으로 Enter 를 눌러도 기록되지 않는다', async () => {
    renderPicker();

    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));

    expect(screen.getByRole('button', { name: '다른 선수 고르기' })).toHaveFocus();
  });

  it('"그래도 계속"을 누르면 그 선수로 한 번만 커밋한다(얼린 시각 그대로)', async () => {
    const onCommit = renderPicker();

    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));
    await userEvent.click(screen.getByRole('button', { name: '그래도 계속' }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GOAL', participantId: 'p-jung', sideId: 's-home', period: 1, clockMs: 120_000 }),
    );
  });

  it('"다른 선수 고르기"를 누르면 아무것도 기록하지 않고 선수 목록으로 돌아가 다른 선수를 고를 수 있다', async () => {
    const onCommit = renderPicker();

    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));
    await userEvent.click(screen.getByRole('button', { name: '다른 선수 고르기' }));

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: /퇴장한 선수예요/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /조현우/ }));
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ participantId: 'p-cho' }));
  });

  it('퇴장하지 않은 선수는 확인 없이 바로 기록한다', async () => {
    const onCommit = renderPicker();

    await userEvent.click(screen.getByRole('button', { name: /조현우/ }));

    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ participantId: 'p-cho' }));
    expect(screen.queryByRole('group', { name: /퇴장한 선수예요/ })).not.toBeInTheDocument();
  });

  it.each([
    ['옐로카드', 'CARD', 'YELLOW', '그래도 옐로카드를 기록할까요?'],
    ['레드카드', 'CARD', 'RED', '그래도 레드카드를 기록할까요?'],
    ['파울', 'FOUL', undefined, '그래도 파울을 기록할까요?'],
    ['자책골', 'OWN_GOAL', undefined, '그래도 자책골을 기록할까요?'],
  ] as const)('%s도 같은 확인을 거친다', async (actionLabel, actionType, cardColor, question) => {
    const onCommit = renderPicker({ actionLabel, actionType, cardColor });

    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));

    expect(screen.getByRole('group', { name: '정우진은 퇴장한 선수예요' })).toHaveTextContent(question);
    expect(onCommit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '그래도 계속' }));
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ type: actionType, participantId: 'p-jung' }));
  });

  it('퇴장 시각을 모르면 시각 없이 묻는다', async () => {
    renderPicker({ sentOffRedCards: undefined });

    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));

    expect(screen.getByRole('group', { name: '정우진은 퇴장한 선수예요' })).toHaveTextContent(
      '레드카드를 받고 퇴장했어요. 그래도 골을 기록할까요?',
    );
  });

  it('확인이 떠 있는 동안에는 팀 단위(선수 모름) 기록 버튼을 감춘다', async () => {
    renderPicker({ allowTeamOnly: true });
    expect(screen.getAllByRole('button', { name: /선수 모름/ })).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));

    expect(screen.queryByRole('button', { name: /선수 모름/ })).not.toBeInTheDocument();
  });

  it('교체는 이 확인을 거치지 않는다 — 퇴장한 선수도 나가는 선수로 고르면 다음 단계로 간다', async () => {
    renderPicker({
      actionLabel: '교체',
      actionType: 'SUBSTITUTION',
      lineups: SUB_LINEUPS,
      onPitchParticipantIds: SUB_ON_PITCH,
      sentOffParticipantIds: new Set(['p-out']),
      sentOffRedCards: new Map([['p-out', { period: 1, clockMs: 60_000 }]]),
    });

    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));

    expect(screen.queryByRole('group', { name: /퇴장한 선수예요/ })).not.toBeInTheDocument();
    expect(screen.getByText('정우진 선수와 교체')).toBeInTheDocument();
  });
});

describe('ActionTargetPicker — 두 팀 한 시트 · 선수 모름 · 문구', () => {
  function renderAction(overrides: Partial<ComponentProps<typeof ActionTargetPicker>> = {}) {
    const onCommit = vi.fn();
    render(
      <ActionTargetPicker
        open
        actionLabel="골"
        actionType="GOAL"
        frozen={FROZEN}
        periodCount={2}
        sides={SIDES}
        lineups={LINEUPS}
        allowTeamOnly
        onCommit={onCommit}
        onCancel={vi.fn()}
        {...overrides}
      />,
    );
    return { onCommit };
  }

  it('GOAL 은 선수를 누르면 확인 없이 onCommit 한 번', async () => {
    const { onCommit } = renderAction();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByRole('region', { name: '홈 · 강남 풋살 클럽' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '원정 · 성수 풋살 클럽' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /조현우/ }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ type: 'GOAL', participantId: 'p-cho', sideId: 's-away', payload: {} }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('선수 모름은 payload.anonymous=true', async () => {
    const { onCommit } = renderAction();
    const away = screen.getByRole('region', { name: '원정 · 성수 풋살 클럽' });
    const unknown = within(away).getByRole('button', { name: '성수 풋살 클럽 · 선수 모름' });
    expect(unknown).toHaveClass('min-h-12');
    expect(unknown).toHaveTextContent('선수 모름');

    await userEvent.click(unknown);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]![0]).toMatchObject({ type: 'GOAL', sideId: 's-away', payload: { anonymous: true } });
    expect(onCommit.mock.calls[0]![0].participantId).toBeUndefined();
  });

  it('파울의 선수 모름은 anonymous 를 붙이지 않는다', async () => {
    const { onCommit } = renderAction({ actionLabel: '파울', actionType: 'FOUL' });
    await userEvent.click(screen.getByRole('button', { name: '강남 풋살 클럽 · 선수 모름' }));
    expect(onCommit.mock.calls[0]![0]).toMatchObject({ type: 'FOUL', sideId: 's-home', payload: {} });
  });

  it('자책골의 선수 모름은 어느 팀 득점이 되는지 함께 적는다', () => {
    renderAction({ actionLabel: '자책골', actionType: 'OWN_GOAL' });
    const button = screen.getByRole('button', { name: /성수 풋살 클럽 자책골 · 강남 풋살 클럽 득점으로 기록/ });
    expect(button).toHaveTextContent('선수 모름');
    expect(button).toHaveTextContent('강남 풋살 클럽 득점으로 기록');
  });

  it('CARD 에는 선수 모름이 없다', () => {
    renderAction({ actionLabel: '옐로카드', actionType: 'CARD', cardColor: 'YELLOW', allowTeamOnly: false });
    expect(screen.queryByRole('button', { name: /선수 모름/ })).toBeNull();
    expect(screen.getByRole('button', { name: /정우진/ })).toBeInTheDocument();
  });

  it('퇴장한 선수는 여전히 확인 패널이 먼저', async () => {
    const { onCommit } = renderAction({ sentOffParticipantIds: new Set(['p-jung']) });
    await userEvent.click(screen.getByRole('button', { name: /정우진/ }));
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: '정우진은 퇴장한 선수예요' })).toBeInTheDocument();
  });

  it.each([
    ['골', 'GOAL', undefined, '골 · 누가 넣었나요?'],
    ['자책골', 'OWN_GOAL', undefined, '자책골 · 누구의 자책골인가요?'],
    ['옐로카드', 'CARD', 'YELLOW', '옐로카드 · 누가 받았나요?'],
    ['레드카드', 'CARD', 'RED', '레드카드 · 누가 받았나요?'],
    ['파울', 'FOUL', undefined, '파울 · 누가 했나요?'],
  ] as const)('%s 시트 제목', (actionLabel, actionType, cardColor, title) => {
    renderAction({ actionLabel, actionType, cardColor });
    expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
  });

  it('캡션은 기록될 시각과 바로 저장된다는 사실을 말한다', () => {
    renderAction();
    expect(screen.getByText('전반 2:00로 기록돼요 · 누르면 바로 저장돼요')).toBeInTheDocument();
  });

  it('단판이면 캡션에 전반을 붙이지 않는다', () => {
    renderAction({ periodCount: 1 });
    expect(screen.getByText('2:00로 기록돼요 · 누르면 바로 저장돼요')).toBeInTheDocument();
  });

  it('교체 1단계 캡션은 시각만 말한다(아직 저장되지 않는다)', async () => {
    renderAction({
      actionLabel: '교체',
      actionType: 'SUBSTITUTION',
      allowTeamOnly: false,
      onPitchParticipantIds: new Set(['p-jung', 'p-cho']),
    });
    expect(screen.getByText('전반 2:00로 기록돼요')).toBeInTheDocument();
    expect(screen.queryByText(/누르면 바로 저장돼요/)).toBeNull();
    // 교체는 기존 탭 배치 그대로다.
    expect(screen.getByRole('tablist', { name: '팀 선택' })).toBeInTheDocument();
  });

  it('시트는 화면 높이 − 48px 를 넘지 않고 본문만 스크롤한다', () => {
    renderAction();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('max-h-[calc(100dvh-48px)]');
    expect(screen.getByRole('region', { name: '홈 · 강남 풋살 클럽' }).closest('[class*="overflow-y-auto"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: '골 · 누가 넣었나요?' }).closest('[class*="overflow-y-auto"]')).toBeNull();
  });
});
