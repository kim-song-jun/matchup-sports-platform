import { render, screen, within, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OperateConsole } from './operate-console';
import type { GameEventRecord } from '@/types/game-operations';

/**
 * "기록한 이벤트" 자리에 **로컬 전송 큐**를 그리고 있었다. 큐는 이번 세션에서 내가 올린 것만
 * 담기 때문에, 새로고침하거나 다른 운영자가 넘겨받으면 골이 4개 기록된 경기도
 * "기록된 이벤트가 아직 없어요" 로 보였다 — 화면이 실제 기록을 부정하는 상태였다.
 *
 * 지금은 서버 확정 로그(liveEvents)를 먼저 보여주고, 전송 큐는 대기·실패가 있을 때만
 * "전송 상태" 로 따로 세운다. 둘은 다른 것을 뜻하므로 같은 제목 아래 둘 수 없다.
 */

const mocks = vi.hoisted(() => ({
  useV1AuthMe: vi.fn(),
  useV1FixtureLineup: vi.fn(),
  useV1Game: vi.fn(),
  useV1GameOperationsConsole: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({ useV1AuthMe: () => mocks.useV1AuthMe() }));
vi.mock('@/hooks/use-v1-game-operations', () => ({
  useV1FixtureLineup: () => mocks.useV1FixtureLineup(),
  useV1Game: () => mocks.useV1Game(),
  postV1GameCommand: vi.fn(),
}));
vi.mock('@/hooks/use-v1-game-operations-console', () => ({
  useV1GameOperationsConsole: () => mocks.useV1GameOperationsConsole(),
  gameOperationsErrorMessage: (code: string) => `오류(${code})`,
  isRetryableGameOperationsErrorCode: () => true,
}));
// action-target-picker.tsx가 그대로 import하는 './lineup-grid'와 같은 상대
// 경로라 여기서 목을 걸면 (모달이 열렸을 때) 그 안에서 렌더되는 실제
// LineupGrid도 이 목으로 대체된다.
//
// SUBSTITUTION은 이 안에서 LineupGrid를 두 번 렌더한다 — 1단계("나갈 선수")와
// 2단계("들어올 선수"). 실제 ActionTargetPicker 구현은 2단계에만
// `restrictSideId`를 넘긴다(같은 팀 벤치로 좁히기 위해) — 이 prop 유무로 두
// 단계를 구분해 서로 다른 참가자를 돌려준다. 예전엔 항상 같은 p-1을 돌려줘서
// SUBSTITUTION 테스트가 "나가는 선수 == 들어오는 선수"라는, 실제 계약
// (validateSubstitution이 거부하는 상태)과 모순되는 입력을 "정상"으로
// 통과시켰다(Copilot 리뷰 지적).
vi.mock('./lineup-grid', () => ({
  LineupGrid: ({
    onSelectPlayer,
    restrictSideId,
  }: {
    onSelectPlayer: (input: {
      sideId: string;
      participant: {
        id: string; gameId: string; sideId: string; lineupId: string;
        displayNameSnapshot: string; jerseyNumber: number | null; position: string | null;
        createdAt: string; updatedAt: string;
      };
    }) => void;
    restrictSideId?: string;
  }) => {
    const participant = restrictSideId
      ? {
          id: 'p-2', gameId: 'game-1', sideId: 'side-home', lineupId: 'l-1',
          displayNameSnapshot: '이민호', jerseyNumber: 7, position: null,
          createdAt: '', updatedAt: '',
        }
      : {
          id: 'p-1', gameId: 'game-1', sideId: 'side-home', lineupId: 'l-1',
          displayNameSnapshot: '정우진', jerseyNumber: 10, position: null,
          createdAt: '', updatedAt: '',
        };
    return (
      <div data-testid="lineup-grid">
        <button type="button" onClick={() => onSelectPlayer({ sideId: 'side-home', participant })}>
          select-player
        </button>
      </div>
    );
  },
}));

const SIDE_ID = 'side-home';

function goal(sequence: number): GameEventRecord {
  return {
    id: `event-${sequence}`,
    gameId: 'game-1',
    sequence,
    clientEventId: `client-${sequence}`,
    payloadHash: 'hash',
    type: 'GOAL',
    sideId: SIDE_ID,
    participantId: 'p-1',
    period: 2,
    clockMs: 6 * 60000,
    occurredAt: '2026-08-04T00:00:00.000Z',
    receivedAt: '2026-08-04T00:00:00.000Z',
    actorUserId: 'actor-1',
    reversesEventId: null,
  } as GameEventRecord;
}

function consoleState(overrides: Record<string, unknown> = {}) {
  return {
    connectionStatus: 'connected',
    sync: { status: 'ok', lastSequence: 1 },
    takeover: { status: 'held', token: 'tok', expiresAtMs: Date.now() + 60000, assignmentVersion: 0 },
    queue: { items: [] },
    clockOffsetMs: 0,
    liveEvents: [goal(1)],
    gameSnapshot: { version: 2, state: 'LIVE' },
    bannerMessage: null,
    submitEvent: vi.fn(),
    retryFailedEvent: vi.fn(),
    requestTakeover: vi.fn(),
    ...overrides,
  };
}

describe('OperateConsole — 기록된 이벤트 / 전송 상태 분리', () => {
  beforeEach(() => {
    mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
    mocks.useV1FixtureLineup.mockReturnValue({
      data: { gameId: 'game-1', lineups: [{ sideId: SIDE_ID, participants: [
        { id: 'p-1', gameId: 'game-1', sideId: SIDE_ID, lineupId: 'l-1',
          displayNameSnapshot: '정우진', jerseyNumber: 10, position: null,
          createdAt: '', updatedAt: '' },
      ] }] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useV1Game.mockReturnValue({
      data: {
        id: 'game-1', state: 'LIVE', version: 2, lastSequence: 1, periods: [],
        sides: [{ id: SIDE_ID, gameId: 'game-1', sideKey: 'HOME', teamId: null,
          displayNameSnapshot: '강남 풋살 클럽', createdAt: '', updatedAt: '' }],
        lineups: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useV1GameOperationsConsole.mockReturnValue(consoleState());
  });

  it('서버에 확정된 이벤트를 보여준다 — 로컬 큐가 비어 있어도', () => {
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    const list = screen.getByRole('list', { name: '기록된 이벤트 목록' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('정우진');
  });

  // 큐가 비어 있으면 "전송 상태" 절은 아예 나오지 않아야 한다 — 평상시 화면에 빈 패널이
  // 남아 있으면 운영자가 그걸 이벤트 목록으로 오해한다(예전 회귀의 원인).
  it('전송할 것이 없으면 전송 상태 절을 세우지 않는다', () => {
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByText('전송 상태')).toBeNull();
  });

  it('대기·실패한 전송이 있을 때만 전송 상태를 따로 세운다', () => {
    mocks.useV1GameOperationsConsole.mockReturnValue(
      consoleState({
        queue: {
          items: [{
            clientEventId: 'client-9',
            status: 'failed',
            lastError: '이벤트를 기록하지 못했어요.',
            event: { type: 'GOAL', payload: {} },
          }],
        },
      }),
    );

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByText('전송 상태')).toBeInTheDocument();
    // 서버 로그는 그대로 남아 있어야 한다 — 큐가 그것을 대체하지 않는다.
    expect(screen.getByRole('list', { name: '기록된 이벤트 목록' })).toBeInTheDocument();
  });
});

describe('OperateConsole — 피리어드 생명주기 (T1-0)', () => {
  beforeEach(() => {
    mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
    mocks.useV1FixtureLineup.mockReturnValue({
      data: {
        gameId: 'game-1',
        lineups: [{
          sideId: 'side-home',
          participants: [{
            id: 'p-1', gameId: 'game-1', sideId: 'side-home', lineupId: 'l-1',
            displayNameSnapshot: '정우진', jerseyNumber: 10, position: null,
            createdAt: '', updatedAt: '',
          }],
        }],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  function gameWithPeriods(
    state: 'SCHEDULED' | 'LIVE',
    periods: Array<{
      number: number;
      state: string;
      startedAt: string | null;
      endedAt: string | null;
      pausedTotalMs?: number;
      pausedAt?: string | null;
    }>,
  ) {
    mocks.useV1Game.mockReturnValue({
      data: {
        id: 'game-1', state, version: 2, lastSequence: 1,
        periods: periods.map((period) => ({
          id: `period-${period.number}`,
          gameId: 'game-1',
          pausedTotalMs: 0,
          pausedAt: null,
          ...period,
        })),
        sides: [{
          id: 'side-home', gameId: 'game-1', sideKey: 'HOME', teamId: null,
          displayNameSnapshot: '강남 풋살 클럽', createdAt: '', updatedAt: '',
        }],
        lineups: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useV1GameOperationsConsole.mockReturnValue(consoleState({ gameSnapshot: { version: 2, state } }));
  }

  it('진행 중인 피리어드가 없으면 액션 버튼을 막고 안내 문구를 보여준다', () => {
    gameWithPeriods('SCHEDULED', [
      { number: 1, state: 'SCHEDULED', startedAt: null, endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByText('경기를 시작해 주세요.')).toBeInTheDocument();
    // 액션 우선 리오더: 골/카드/파울 버튼이 곧 예전 "선수 탭" 진입점의 자리를
    // 대신한다 — 여전히 진행 중인 피리어드가 없으면 막혀야 한다.
    const goalButton = screen.getByRole('button', { name: /^골/ });
    expect(goalButton).toBeDisabled();

    fireEvent.click(goalButton);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('1피리어드가 진행 중이고 다음 피리어드가 있으면 "전반 종료" 버튼을 보여주고 액션을 허용한다', () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByText('경기를 시작해 주세요.')).toBeNull();
    expect(screen.getByRole('button', { name: '전반 종료' })).toBeInTheDocument();
    const goalButton = screen.getByRole('button', { name: /^골/ });
    expect(goalButton).not.toBeDisabled();

    // 액션(골)을 먼저 탭하면 "누구인가요" 선택 모달이 뜬다 — 선수를 먼저 고르던
    // 예전 흐름의 정반대다.
    fireEvent.click(goalButton);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // 모달 안에서 선수를 고르면 submitEvent가 골 이벤트로 호출되고 모달이 닫힌다.
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    expect(mocks.useV1GameOperationsConsole().submitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'GOAL', participantId: 'p-1', sideId: 'side-home' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('마지막 피리어드가 진행 중이면 다음 피리어드 버튼이 보이지 않는다', () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'LIVE', startedAt: '2026-08-07T00:25:00.000Z', endedAt: null },
    ]);

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByRole('button', { name: '경기 종료' })).toBeInTheDocument();
    expect(screen.queryByText('전반 종료')).toBeNull();
    expect(screen.queryByText('2피리어드 종료')).toBeNull();
  });
});

describe('OperateConsole — 선수 교체', () => {
  const LIVE_PERIOD = { id: 'period-1', gameId: 'game-1', number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null, pausedTotalMs: 0, pausedAt: null };
  const SUB_SIDES = [{ id: 'side-home', gameId: 'game-1', sideKey: 'HOME', teamId: null, displayNameSnapshot: '강남 풋살 클럽', createdAt: '', updatedAt: '' }];

  beforeEach(() => {
    mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
    mocks.useV1FixtureLineup.mockReturnValue({
      data: {
        gameId: 'game-1',
        lineups: [{
          sideId: 'side-home',
          state: 'SUBMITTED',
          revision: 1,
          participants: [
            { id: 'p-1', gameId: 'game-1', sideId: 'side-home', lineupId: 'l-1', displayNameSnapshot: '정우진', jerseyNumber: 10, position: null, positionX: null, positionY: null, started: true, createdAt: '', updatedAt: '' },
            { id: 'p-2', gameId: 'game-1', sideId: 'side-home', lineupId: 'l-1', displayNameSnapshot: '이민호', jerseyNumber: 7, position: null, positionX: null, positionY: null, started: false, createdAt: '', updatedAt: '' },
          ],
        }],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  function gameWithSubstitutionPolicy(substitutionPolicy: { mode: 'limited' | 'rolling'; maxSubstitutions: number | null }) {
    mocks.useV1Game.mockReturnValue({
      data: { id: 'game-1', state: 'LIVE', version: 2, lastSequence: 1, periods: [LIVE_PERIOD], sides: SUB_SIDES, lineups: [], substitutionPolicy },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useV1GameOperationsConsole.mockReturnValue(consoleState({ gameSnapshot: { version: 2, state: 'LIVE' }, liveEvents: [] }));
  }

  it('"교체" 액션 버튼이 있고, 2단계(나갈 선수 → 들어올 선수)를 거쳐 SUBSTITUTION 이벤트를 제출한다', () => {
    gameWithSubstitutionPolicy({ mode: 'limited', maxSubstitutions: 5 });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /^교체/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // 1단계(나갈 선수 — p-1)를 고르면 2단계(들어올 선수)로 넘어간다. 목킹된
    // LineupGrid는 실제 컴포넌트처럼 2단계에만 restrictSideId를 받으므로
    // 그때는 다른 참가자(p-2)를 돌려준다 — 나가는/들어오는 선수가 같아지는
    // 걸 이 테스트 수준에서도 막는다(실제 계약: validateSubstitution은 둘이
    // 같으면 거부한다).
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));

    expect(mocks.useV1GameOperationsConsole().submitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SUBSTITUTION', participantId: 'p-2', sideId: 'side-home', payload: { outParticipantId: 'p-1' } }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('substitutions === "rolling"일 때만 빠른 교체 모드 토글이 보인다', () => {
    gameWithSubstitutionPolicy({ mode: 'limited', maxSubstitutions: 5 });
    const { rerender } = render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);
    expect(screen.queryByRole('button', { name: /빠른 교체 모드/ })).toBeNull();

    gameWithSubstitutionPolicy({ mode: 'rolling', maxSubstitutions: null });
    rerender(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);
    expect(screen.getByRole('button', { name: /빠른 교체 모드 켜기/ })).toBeInTheDocument();
  });

  it('빠른 교체 모드를 켜면 실제 라인업 데이터로 피치 위 선수만 지정 가능한 목록이 뜬다', () => {
    gameWithSubstitutionPolicy({ mode: 'rolling', maxSubstitutions: null });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /빠른 교체 모드 켜기/ }));
    // 선발(started: true)인 정우진만 지정 가능한 목록에 보이고, 벤치(이민호)는 안 보인다.
    expect(screen.getByRole('button', { name: /정우진/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /이민호/ })).toBeNull();
  });
});
