import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ArrivalCheckinPanel } from './arrival-checkin-panel';
import type { GameLineup, GameLineupParticipant, GameSide } from '@/types/game-operations';

// ─────────────────────────────────────────────────────────────────────────────
// 1차 대회(2026-08-15~16) 회고: "명단 검인 과정에서 오지 않거나, 하지 않은 사람들에
// 대한 확인이 어려움". 스태프는 제출된 명단을 들고 육안·구두로만 확인했고 결과가
// 어디에도 남지 않았다.
//
// 이 패널의 계약은 **축이 하나**다 — `arrivedAt` = 현장에서 확인한 사실(도착/미확인).
//
// 예전엔 `started`(선발/후보)를 두 번째 축으로 그렸다. **정본 §3 이 "명단 = 출전자,
// 선후발 없음" 으로 확정하면서 그 축이 사라졌고**, 지금은 `started` 가 전원 true 라 그
// 배지는 모두에게 "선발" 을 찍는 정보 없는 라벨이었다(2026-09-06 alpha 실측).
// 회고가 지목한 사람("명단에 있는데 안 온 사람")은 남은 한 축으로 그대로 표현된다.
// ─────────────────────────────────────────────────────────────────────────────

function side(id: string, name: string): GameSide {
  return {
    id,
    gameId: 'g-1',
    sideKey: id === 'side-home' ? 'HOME' : 'AWAY',
    teamId: null,
    displayNameSnapshot: name,
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
  };
}

function participant(
  overrides: Partial<GameLineupParticipant> & Pick<GameLineupParticipant, 'id' | 'displayNameSnapshot'>,
): GameLineupParticipant {
  return {
    gameId: 'g-1',
    sideId: 'side-home',
    lineupId: 'lineup-home',
    userId: null,
    jerseyNumber: null,
    position: null,
    positionX: null,
    positionY: null,
    started: true,
    arrivedAt: null,
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
    ...overrides,
  };
}

function lineup(participants: GameLineupParticipant[], overrides: Partial<GameLineup> = {}): GameLineup {
  return {
    id: 'lineup-home',
    gameId: 'g-1',
    sideId: 'side-home',
    revision: 2,
    state: 'SUBMITTED',
    version: 0,
    submittedAt: '2026-08-23T00:00:00.000Z',
    supersedesId: null,
    formation: null,
    createdAt: '2026-08-23T00:00:00.000Z',
    updatedAt: '2026-08-23T00:00:00.000Z',
    participants,
    ...overrides,
  };
}

const SIDES = [side('side-home', '홈팀')];

describe('ArrivalCheckinPanel — 명단 검인', () => {
  it('도착/미확인만 보여준다 — 선발/후보 축은 정본에서 사라졌다', () => {
    render(
      <ArrivalCheckinPanel
        sides={SIDES}
        lineups={[
          lineup([
            participant({ id: 'p-1', displayNameSnapshot: '홍길동', started: true, arrivedAt: null }),
            participant({ id: 'p-2', displayNameSnapshot: '김철수', started: false, arrivedAt: '2026-08-23T01:00:00.000Z' }),
          ]),
        ]}
        onToggleArrival={vi.fn()}
      />,
    );

    // 회고가 지목한 사람("명단에 있는데 안 온 사람")은 이 한 축으로 그대로 드러난다.
    expect(screen.getByText('미확인')).toBeInTheDocument();
    expect(screen.getByText('도착')).toBeInTheDocument();
    // **"선발"·"후보" 는 화면 어디에도 없어야 한다** — `started` 가 전원 true 라
    // 그 라벨은 정보를 주지 않으면서 정본이 없앤 축을 되살린다.
    // 픽스처 이름에 그 단어가 들어가면 이 단언이 이름에 걸린다 — 그래서 이름을
    // 축과 무관하게 지었다('김철수' → '김철수').
    expect(document.body.textContent).not.toContain('선발');
    expect(document.body.textContent).not.toContain('후보');
  });

  it('진행 상황을 숫자로 집계해 보여준다', () => {
    render(
      <ArrivalCheckinPanel
        sides={SIDES}
        lineups={[
          lineup([
            participant({ id: 'p-1', displayNameSnapshot: '홍길동', arrivedAt: '2026-08-23T01:00:00.000Z' }),
            participant({ id: 'p-2', displayNameSnapshot: '김철수' }),
            participant({ id: 'p-3', displayNameSnapshot: '박선수' }),
          ]),
        ]}
        onToggleArrival={vi.fn()}
      />,
    );

    expect(screen.getByText('도착 확인 1/3명')).toBeInTheDocument();
  });

  it('미확인을 누르면 arrived=true, 이미 도착한 사람을 누르면 arrived=false 로 나간다', () => {
    const onToggleArrival = vi.fn();
    render(
      <ArrivalCheckinPanel
        sides={SIDES}
        lineups={[
          lineup([
            participant({ id: 'p-1', displayNameSnapshot: '홍길동', arrivedAt: null }),
            participant({ id: 'p-2', displayNameSnapshot: '김철수', arrivedAt: '2026-08-23T01:00:00.000Z' }),
          ]),
        ]}
        onToggleArrival={onToggleArrival}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: /홍길동/ }));
    expect(onToggleArrival).toHaveBeenLastCalledWith({ participantId: 'p-1', arrived: true });

    fireEvent.click(screen.getByRole('switch', { name: /김철수/ }));
    expect(onToggleArrival).toHaveBeenLastCalledWith({ participantId: 'p-2', arrived: false });
  });

  it('상태를 색이 아니라 말로도 전한다 (컬러만으로 정보 전달 금지)', () => {
    render(
      <ArrivalCheckinPanel
        sides={SIDES}
        lineups={[
          lineup([participant({ id: 'p-1', displayNameSnapshot: '홍길동', arrivedAt: '2026-08-23T01:00:00.000Z' })]),
        ]}
        onToggleArrival={vi.fn()}
      />,
    );

    const row = screen.getByRole('switch', { name: /홍길동/ });
    expect(row).toHaveAttribute('aria-checked', 'true');
    expect(row).toHaveAccessibleName(expect.stringContaining('도착 확인됨'));
  });

  it('최신 리비전 라인업만 검인 대상으로 삼는다 (옛 명단이 함께 뜨면 없는 사람을 검인하게 된다)', () => {
    render(
      <ArrivalCheckinPanel
        sides={SIDES}
        lineups={[
          lineup([participant({ id: 'p-old', displayNameSnapshot: '옛명단' })], { id: 'lineup-old', revision: 1 }),
          lineup([participant({ id: 'p-new', displayNameSnapshot: '새명단' })], { id: 'lineup-new', revision: 2 }),
        ]}
        onToggleArrival={vi.fn()}
      />,
    );

    expect(screen.getByRole('switch', { name: /새명단/ })).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /옛명단/ })).not.toBeInTheDocument();
  });

  it('제출된 명단이 없으면 검인 대상이 없다고 알린다', () => {
    render(<ArrivalCheckinPanel sides={SIDES} lineups={[]} onToggleArrival={vi.fn()} />);

    expect(screen.getByText('제출된 명단이 없어 검인할 대상이 없어요.')).toBeInTheDocument();
  });

  /**
   * [P1-c 후속] 이 테스트는 원래 **정반대**를 못박고 있었다 -- "DRAFT 는 검인 대상이
   * 아니다". 그 근거는 주석에 이렇게 적혀 있었다:
   *
   *   > DRAFT를 검인 대상으로 삼으면 도착 확인을 눌러도, 팀이 실제로 제출하는 순간
   *   > saveLineup이 새 revision·새 participant 행을 만들어 **이 검인이 통째로 사라진다**
   *
   * **그 근거가 P1-b 로 사라졌다.** 이제 라인업을 저장해도 참가자 행이 새로 만들어지지
   * 않고(DRAFT 행을 재사용), 제출본 위에 새 리비전을 여는 경로에서도 `arrivedAt` 을
   * 이월한다. 즉 DRAFT 단계에서 찍은 검인은 더 이상 소실되지 않는다.
   *
   * 그리고 P1-c 로 **제출 없이 시작하는 경기가 정상 경로가 됐다.** 그 경기에서 제출본만
   * 인정하면 검인할 대상이 아예 없어 -- P1-b 가 지킨 `arrivedAt` 을 애초에 만들 수 없다.
   *
   * 단언을 뒤집되 **지우지 않는다**: 자동 등록 명단이 검인 대상으로 뜨는 것이 이제
   * 의도된 동작이라는 사실 자체를 여기서 못박는다.
   */
  it('제출본이 없으면 자동 생성된 등록 명단을 검인 대상으로 쓴다 (P1-b 로 검인 소실 위험이 사라졌다)', () => {
    render(
      <ArrivalCheckinPanel
        sides={SIDES}
        lineups={[
          // 대진 생성 시 자동으로 깔리는 rev1 DRAFT — 등록 명단 전원, 아직 아무도 제출하지 않았다.
          lineup(
            [
              participant({ id: 'p-auto-1', displayNameSnapshot: '자동등록1' }),
              participant({ id: 'p-auto-2', displayNameSnapshot: '자동등록2' }),
            ],
            { id: 'lineup-draft', revision: 1, state: 'DRAFT', submittedAt: null },
          ),
        ]}
        onToggleArrival={vi.fn()}
      />,
    );

    // 제출 없이 시작한 경기에서 이 목록이 비면 운영자는 아무도 검인할 수 없다.
    expect(screen.getByRole('switch', { name: /자동등록1/ })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /자동등록2/ })).toBeInTheDocument();
  });

  it('저장 중인 행만 잠근다 (다른 행은 계속 누를 수 있어야 줄 서서 검인할 수 있다)', () => {
    render(
      <ArrivalCheckinPanel
        sides={SIDES}
        lineups={[
          lineup([
            participant({ id: 'p-1', displayNameSnapshot: '홍길동' }),
            participant({ id: 'p-2', displayNameSnapshot: '김철수' }),
          ]),
        ]}
        onToggleArrival={vi.fn()}
        pendingParticipantId="p-1"
      />,
    );

    expect(screen.getByRole('switch', { name: /홍길동/ })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /김철수/ })).not.toBeDisabled();
  });
});
