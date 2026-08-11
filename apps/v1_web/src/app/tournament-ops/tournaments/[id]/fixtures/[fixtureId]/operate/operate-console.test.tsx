import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
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
  postV1GameCommand: vi.fn(),
}));

vi.mock('@/hooks/use-v1-api', () => ({ useV1AuthMe: () => mocks.useV1AuthMe() }));
vi.mock('@/hooks/use-v1-game-operations', () => ({
  useV1FixtureLineup: () => mocks.useV1FixtureLineup(),
  useV1Game: () => mocks.useV1Game(),
  postV1GameCommand: (...args: unknown[]) => mocks.postV1GameCommand(...args),
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
  // operate-console.tsx가 "라인업 없이 시작 막기"(UX 감사 item 2) 판정에
  // 실제 구현과 동일한 로직을 쓴다 — 목도 같은 판정을 하도록 실제 함수와
  // 동일하게 둔다(다르게 두면 이 파일의 다른 테스트가 실제로는 없던 라인업을
  // "있다"고 오판하게 된다).
  latestOperableLineup: (
    lineups: Array<{ sideId: string; state?: string; revision: number }>,
    sideId: string,
  ) => {
    const candidates = lineups.filter(
      (l) => l.sideId === sideId && (l.state === 'SUBMITTED' || l.state === 'LOCKED'),
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((latest, current) => (current.revision > latest.revision ? current : latest));
  },
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
    reverseEvent: vi.fn(),
    applyCommandResult: vi.fn(),
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
          // 이 describe는 라인업 게이트(UX 감사 item 2)가 아니라 피리어드
          // 생명주기를 검증한다 — 제출된 라인업이 있는 정상 상태를 기본값으로
          // 둔다(없으면 SCHEDULED 테스트에서 "경기를 시작해 주세요." 대신
          // "라인업을 제출해야" 배너가 대신 뜬다).
          state: 'SUBMITTED',
          revision: 1,
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

  it('1피리어드가 진행 중이고 다음 피리어드가 있으면 "전반 종료" 버튼을 보여주고 액션을 허용한다', async () => {
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
    // alpha 452′ 사고 대응 게이트가 커밋 경로에 확인 한 단계(비동기)를 끼워
    // 넣었으므로(이 게임은 periodDurations를 안 줘 통과만 비동기로 지연됨),
    // 여기서부터는 waitFor로 그 마이크로태스크가 끝나길 기다린다.
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    await waitFor(() =>
      expect(mocks.useV1GameOperationsConsole().submitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GOAL', participantId: 'p-1', sideId: 'side-home' }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('마지막 피리어드가 진행 중이면 다음 피리어드 버튼이 보이지 않는다', () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'LIVE', startedAt: '2026-08-07T00:25:00.000Z', endedAt: null },
    ]);

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByRole('button', { name: '경기 종료' })).toBeInTheDocument();
    expect(screen.queryByText('전반 종료')).toBeNull();
    expect(screen.queryByText('후반 종료')).toBeNull();
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

  it('"교체" 액션 버튼이 있고, 2단계(나갈 선수 → 들어올 선수)를 거쳐 SUBSTITUTION 이벤트를 제출한다', async () => {
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

    // alpha 452′ 사고 대응 게이트가 커밋 경로에 확인 한 단계(비동기)를 끼워
    // 넣었으므로(이 게임은 periodDurations를 안 줘 통과만 비동기로 지연됨),
    // 여기서부터는 waitFor로 그 마이크로태스크가 끝나길 기다린다.
    await waitFor(() =>
      expect(mocks.useV1GameOperationsConsole().submitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SUBSTITUTION', participantId: 'p-2', sideId: 'side-home', payload: { outParticipantId: 'p-1' } }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
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

const HOME_AWAY_SIDES = [
  { id: 'side-home', gameId: 'game-1', sideKey: 'HOME' as const, teamId: null, displayNameSnapshot: '강남 풋살 클럽', createdAt: '', updatedAt: '' },
  { id: 'side-away', gameId: 'game-1', sideKey: 'AWAY' as const, teamId: null, displayNameSnapshot: '성수 풋살 클럽', createdAt: '', updatedAt: '' },
];

// UX 감사 item 2 — 라인업 없이 경기 시작 가능 → 복구 불가능한 막다른 길.
describe('OperateConsole — 라인업 게이트 (UX 감사 item 2)', () => {
  function setup(lineups: Array<{ sideId: string; state: string; revision: number }>) {
    mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
    mocks.useV1FixtureLineup.mockReturnValue({
      data: { gameId: 'game-1', lineups: lineups.map((l) => ({ ...l, participants: [] })) },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useV1Game.mockReturnValue({
      data: {
        id: 'game-1', state: 'SCHEDULED', version: 1, lastSequence: 0,
        periods: [{ id: 'period-1', gameId: 'game-1', number: 1, state: 'SCHEDULED', startedAt: null, endedAt: null, pausedTotalMs: 0, pausedAt: null }],
        sides: HOME_AWAY_SIDES,
        lineups: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useV1GameOperationsConsole.mockReturnValue(consoleState({ gameSnapshot: { version: 1, state: 'SCHEDULED' } }));
  }

  it('한쪽 팀만 라인업을 제출했으면 "경기 시작"이 비활성이고 사유·복구 링크가 뜬다', () => {
    setup([{ sideId: 'side-home', state: 'SUBMITTED', revision: 1 }]);
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByRole('button', { name: '경기 시작' })).toBeDisabled();
    expect(screen.getByText(/성수 풋살 클럽.*선발 명단을 제출해야 경기를 시작할 수 있어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '라인업 제출하러 가기' })).toHaveAttribute(
      'href',
      '/tournaments/t-1/matches/f-1/lineup',
    );
  });

  it('양 팀 모두 라인업을 제출하면 "경기 시작"이 활성화되고 배너가 없다', () => {
    setup([
      { sideId: 'side-home', state: 'SUBMITTED', revision: 1 },
      { sideId: 'side-away', state: 'LOCKED', revision: 1 },
    ]);
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByRole('button', { name: '경기 시작' })).not.toBeDisabled();
    expect(screen.queryByText(/선발 명단을 제출해야/)).toBeNull();
  });
});

// UX 감사 item 3 — "경기 종료"가 확인 없이 즉시 실행됐다(되돌릴 수 없는 동작).
describe('OperateConsole — 경기 종료 확인 (UX 감사 item 3)', () => {
  beforeEach(() => {
    mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
    mocks.useV1FixtureLineup.mockReturnValue({
      data: { gameId: 'game-1', lineups: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useV1Game.mockReturnValue({
      data: {
        id: 'game-1', state: 'LIVE', version: 2, lastSequence: 1,
        periods: [{ id: 'period-1', gameId: 'game-1', number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null, pausedTotalMs: 0, pausedAt: null }],
        sides: [HOME_AWAY_SIDES[0]],
        lineups: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useV1GameOperationsConsole.mockReturnValue(consoleState({ gameSnapshot: { version: 2, state: 'LIVE' } }));
    mocks.postV1GameCommand.mockResolvedValue({ gameId: 'game-1', state: 'ENDED', version: 3 });
  });

  it('"경기 종료"를 눌러도 확인 전에는 실행되지 않고, 취소하면 아무 일도 일어나지 않는다', async () => {
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: '경기 종료' }));
    const dialog = await screen.findByRole('dialog');
    expect(mocks.postV1GameCommand).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.postV1GameCommand).not.toHaveBeenCalled();
  });

  it('확인하면 그때 종료 명령이 실행된다', async () => {
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: '경기 종료' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '경기 종료' }));

    await waitFor(() =>
      expect(mocks.postV1GameCommand).toHaveBeenCalledWith('game-1', 'end', expect.anything()),
    );

    // UX 감사 — 명령 응답이 그 자리에서 gameSnapshot에 반영돼야 한다.
    // 이게 빠지면 REST는 성공해도 화면은 다음 이벤트 커밋/재구독 전까지
    // 이전 상태(예: "일시 중지")를 계속 보여준다(alpha 실측, 2026-08:
    // 새로고침해야만 반영됨).
    await waitFor(() =>
      expect(mocks.useV1GameOperationsConsole().applyCommandResult).toHaveBeenCalledWith({
        gameId: 'game-1',
        state: 'ENDED',
        version: 3,
      }),
    );
  });
});

// alpha "452′" 사고(2026-08) — 운영자가 경기 종료를 누르지 않으면 클럭이
// 계속 흘러 골/카드가 몇 시간 뒤 시각으로 기록될 수 있다. 서버는 이 값을
// 하드 거부하지 않으므로(현장 기록이 우선), 콘솔이 제출 직전에 확인만 요구
// 해야 한다 — 취소해도 "제출 안 됨"일 뿐 서버 422가 아니다.
describe('OperateConsole — 이상 클럭 확인 게이트 (alpha 452′ 사고)', () => {
  function setup(periodDurations: unknown) {
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
          ],
        }],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useV1Game.mockReturnValue({
      data: {
        id: 'game-1', state: 'LIVE', version: 2, lastSequence: 1,
        // 20분 피리어드가 아득한 과거(2020년)에 시작 — 실제 Date.now() 기준으로도
        // 항상 40분(×2 배율) 임계값을 훌쩍 넘겨, 테스트 실행 시각과 무관하게
        // 결정론적으로 "의심스러운 클럭"을 만든다.
        periods: [{ id: 'period-1', gameId: 'game-1', number: 1, state: 'LIVE', startedAt: '2020-01-01T00:00:00.000Z', endedAt: null, pausedTotalMs: 0, pausedAt: null }],
        sides: [HOME_AWAY_SIDES[0]],
        lineups: [],
        periodDurations,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.useV1GameOperationsConsole.mockReturnValue(consoleState({ gameSnapshot: { version: 2, state: 'LIVE' } }));
  }

  it('설정된 피리어드 길이를 크게 넘는 시각을 기록하려 하면 제출 전 확인을 요구하고, 취소하면 제출되지 않는다', async () => {
    setup([{ durationMinutes: 20, extraTime: false }]);
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));

    expect(await screen.findByText(/이 피리어드는 보통 20분이에요/)).toBeInTheDocument();
    expect(mocks.useV1GameOperationsConsole().submitEvent).not.toHaveBeenCalled();

    // 서버 하드 거부가 아니라 확인 게이트일 뿐이라는 계약: 취소해도 그냥
    // "제출 안 됨"이지 에러가 아니다.
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(mocks.useV1GameOperationsConsole().submitEvent).not.toHaveBeenCalled();
  });

  it('확인을 누르면 그대로(숫자 조작 없이) 기록된다', async () => {
    setup([{ durationMinutes: 20, extraTime: false }]);
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    await screen.findByText(/이 피리어드는 보통 20분이에요/);

    fireEvent.click(screen.getByRole('button', { name: '그대로 기록' }));

    await waitFor(() =>
      expect(mocks.useV1GameOperationsConsole().submitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GOAL', participantId: 'p-1' }),
      ),
    );
  });

  it('피리어드 설정을 못 읽었으면(periodDurations: null) 판단 근거가 없으므로 확인 없이 그대로 제출한다', async () => {
    setup(null);
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));

    await waitFor(() => expect(mocks.useV1GameOperationsConsole().submitEvent).toHaveBeenCalled());
    expect(screen.queryByText(/이 피리어드는 보통/)).toBeNull();
  });
});

// UX 감사 item 4 — takeover.status가 'none'/'requesting'인 동안 명령 버튼·
// LineupGrid가 전부 비활성인데 이유가 화면에 없었다.
describe('OperateConsole — 운영 권한 요청 중 배너 (UX 감사 item 4)', () => {
  beforeEach(() => {
    mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
    mocks.useV1FixtureLineup.mockReturnValue({
      data: { gameId: 'game-1', lineups: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useV1Game.mockReturnValue({
      data: {
        id: 'game-1', state: 'LIVE', version: 2, lastSequence: 1, periods: [],
        sides: [HOME_AWAY_SIDES[0]],
        lineups: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it.each(['none', 'requesting'] as const)(
    'takeover.status가 %s이면 권한을 가져오는 중이라는 배너를 보여준다',
    (status) => {
      mocks.useV1GameOperationsConsole.mockReturnValue(consoleState({ takeover: { status } }));
      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

      expect(screen.getByText('경기 운영 권한을 가져오는 중이에요…')).toBeInTheDocument();
    },
  );

  it('권한을 보유하면(held) 배너가 사라진다', () => {
    mocks.useV1GameOperationsConsole.mockReturnValue(consoleState());
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByText('경기 운영 권한을 가져오는 중이에요…')).toBeNull();
  });
});

// UX 감사 item 6 — 실시간 점수가 표시되지 않았다. 되돌려진(reversed) 이벤트는
// 제외하고 확정 이벤트에서만 파생해야 한다(`on-pitch-state.ts`와 동일한 규칙).
describe('OperateConsole — 헤더 점수 표시 (UX 감사 item 6)', () => {
  beforeEach(() => {
    mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
    mocks.useV1FixtureLineup.mockReturnValue({
      data: { gameId: 'game-1', lineups: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.useV1Game.mockReturnValue({
      data: {
        id: 'game-1', state: 'LIVE', version: 2, lastSequence: 1,
        periods: [{ id: 'period-1', gameId: 'game-1', number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null, pausedTotalMs: 0, pausedAt: null }],
        sides: HOME_AWAY_SIDES,
        lineups: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('되돌려진 골은 빼고, 나머지 확정 골만으로 사이드별 점수를 센다', () => {
    const homeGoalA = { ...goal(1), id: 'e1', sideId: 'side-home' };
    const homeGoalReversed = { ...goal(2), id: 'e2', sideId: 'side-home' };
    const reversal = { ...goal(3), id: 'e3', type: 'CORRECTION' as const, sideId: 'side-home', reversesEventId: 'e2' };
    const homeGoalB = { ...goal(4), id: 'e4', sideId: 'side-home' };
    const awayGoal = { ...goal(5), id: 'e5', sideId: 'side-away' };

    mocks.useV1GameOperationsConsole.mockReturnValue(
      consoleState({ liveEvents: [homeGoalA, homeGoalReversed, reversal, homeGoalB, awayGoal] }),
    );
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    // 강남(홈) 3골 중 1골이 되돌려져 2, 성수(원정) 1골 → "2 : 1"
    expect(screen.getByText('2 : 1')).toBeInTheDocument();
  });

  /**
   * Root-cause regression (2026-08 alpha 실사고): 골을 기록하면 "기록된
   * 이벤트"는 갱신되는데 상단 스코어만 계속 예전 값으로 멈춰 있었다.
   * 원인은 백엔드 `RealtimeGateway.acknowledgeGameEvent`가 자기 자신에게
   * 쏘는 `game.event.committed` 브로드캐스트에 서버가 실제로 저장한 행이
   * 아니라 클라이언트가 보낸 원본 요청 payload를 그대로 실어 보냈다는
   * 것이다 — 그 payload에는 서버가 나중에 채우는 `id`/`reversesEventId`가
   * 없다. 이 콘솔의 `useV1GameOperationsConsole`은 그렇게 도착한 이벤트를
   * `liveEvents`에 그대로 이어붙이므로(`onCommitted`), 방금 기록한 골의
   * `id`/`reversesEventId`가 `undefined`인 채로 들어온다. `scoreBySideId`가
   * `reversesEventId !== null`만으로 "되돌려짐" 집합을 만들면
   * `undefined !== null`이 참이라 그 `undefined`가 집합에 들어가고,
   * `.has(event.id)`가 `id`도 `undefined`인 바로 그 이벤트(자기 자신)를
   * "이미 되돌려짐"으로 오판해 점수 집계에서 빼버린다 — 골이 몇 개든
   * 전부 조용히 빠진다. 백엔드는 이제 실제 저장된 행(id 포함,
   * reversesEventId: null)을 브로드캐스트하도록 고쳤고(realtime.gateway.ts
   * `acknowledgeGameEvent`), 이 테스트는 그 수정이 되돌아가더라도(또는
   * 미래에 다른 실시간 경로가 같은 실수를 반복하더라도) 방어선 역할을
   * 하도록 프런트 `scoreBySideId`가 `undefined`도 `null`과 동일하게
   * 다루는지를 직접 검증한다.
   */
  it('id/reversesEventId가 undefined인(고쳐지기 전 실시간 브로드캐스트 모양) 자기 자신의 골도 되돌려진 것으로 오판하지 않고 점수에 반영한다', () => {
    const malformedSelfCommittedGoal = {
      ...goal(1),
      id: undefined,
      reversesEventId: undefined,
      sideId: 'side-home',
    } as unknown as GameEventRecord;

    mocks.useV1GameOperationsConsole.mockReturnValue(
      consoleState({ liveEvents: [malformedSelfCommittedGoal] }),
    );
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByText('1 : 0')).toBeInTheDocument();
  });

  it('id/reversesEventId가 둘 다 undefined인 자기-커밋 골이 두 번 연속 들어와도(같은 undefined를 공유) 둘 다 점수에 반영한다', () => {
    const firstMalformed = {
      ...goal(1),
      id: undefined,
      reversesEventId: undefined,
      sideId: 'side-home',
    } as unknown as GameEventRecord;
    const secondMalformed = {
      ...goal(2),
      id: undefined,
      reversesEventId: undefined,
      sideId: 'side-away',
    } as unknown as GameEventRecord;

    mocks.useV1GameOperationsConsole.mockReturnValue(
      consoleState({ liveEvents: [firstMalformed, secondMalformed] }),
    );
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByText('1 : 1')).toBeInTheDocument();
  });
});
