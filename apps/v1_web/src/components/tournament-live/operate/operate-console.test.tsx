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
  // 종료된 경기의 확정 결과(승부차기 포함) 조회 — 기본값은 "아직 리비전 없음"이라
  // 이 훅을 신경 쓰지 않는 기존 테스트들은 그대로 동작한다.
  useV1GameResultRevisions: vi.fn((..._args: unknown[]) => ({
    data: undefined as Array<Record<string, unknown>> | undefined,
    isPending: false,
    isError: false,
  })),
}));

vi.mock('@/hooks/use-v1-api', () => ({
  useV1AuthMe: () => mocks.useV1AuthMe(),
  useV1GameResultRevisions: (...args: unknown[]) => mocks.useV1GameResultRevisions(...args),
}));
vi.mock('@/hooks/use-v1-game-operations', () => ({
  useV1FixtureLineup: () => mocks.useV1FixtureLineup(),
  useV1Game: () => mocks.useV1Game(),
  postV1GameCommand: (...args: unknown[]) => mocks.postV1GameCommand(...args),
  // 명단 검인 토글 — 이 스위트는 검인 동작 자체를 검증하지 않지만(전용 스위트가 있다),
  // 콘솔이 매 렌더 호출하는 훅이라 모듈 목에 반드시 있어야 한다.
  useV1SetParticipantArrival: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
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
vi.mock('./lineup-grid', async (importOriginal) => ({
  // 선택자 함수들은 **실제 구현을 그대로 쓴다**(`importOriginal`). 예전에는 목 안에
  // 로직을 손으로 베껴 뒀는데, 그러면 구현이 바뀔 때 목이 조용히 뒤처진다 -- 실제로
  // [P1-c 후속]에서 `latestLineupForDisplay` 가 추가되자 이 목에 없어서 세 테스트가
  // "export 가 없다"로 깨졌고, 거기서 로직을 또 베꼈다면 **두 규칙이 다르다는 계약을
  // 목이 왜곡**할 수 있었다. 컴포넌트만 가벼운 스텁으로 대체한다.
  ...(await importOriginal<typeof import('./lineup-grid')>()),
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

// 이슈 #375 — `mocks.postV1GameCommand`는 `vi.hoisted`로 파일 전체가 공유하는
// 스파이라 `vitest.config.mts`에 clearMocks가 없는 이 프로젝트에서는 호출
// 기록이 테스트 사이에 그대로 누적된다. "하프타임" describe가 실제로
// postV1GameCommand를 호출하는 테스트를 추가하면서, 그 뒤에 있는 "경기 종료
// 확인" describe의 "아직 호출되지 않았다" 단언이 앞선 테스트의 호출까지
// 주워 담아 깨졌다 — 구현 결함이 아니라 파일 전체가 공유하는 목의 호출
// 기록이 초기화되지 않던 잠재적 취약점이다. 매 테스트 전에 호출 기록만
// 지운다(mockClear, 각 describe가 이미 따로 설정하는 mockResolvedValue
// 구현 자체는 건드리지 않는다).
beforeEach(() => {
  mocks.postV1GameCommand.mockClear();
});

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
    assignAssist: vi.fn(),
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

    expect(screen.queryByText('전송 대기·실패')).toBeNull();
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

    expect(screen.getByText('전송 대기·실패')).toBeInTheDocument();
    // 서버 로그는 그대로 남아 있어야 한다 — 큐가 그것을 대체하지 않는다.
    expect(screen.getByRole('list', { name: '기록된 이벤트 목록' })).toBeInTheDocument();
  });

  // 전부 ack 된 평상시에는 이 절이 통째로 사라져야 한다. 예전에는 ack 된 항목까지 남아
  // "골·옐로카드·골 · 기록 완료"가 위 확정 로그와 1:1로 중복됐다(시각·선수·팀 없이).
  it('전부 서버에 기록된 뒤에는 전송 절을 남기지 않는다', () => {
    mocks.useV1GameOperationsConsole.mockReturnValue(
      consoleState({
        queue: {
          items: [
            { clientEventId: 'c-1', status: 'acked', lastError: null, event: { type: 'GOAL', payload: {} } },
            { clientEventId: 'c-2', status: 'acked', lastError: null, event: { type: 'FOUL', payload: {} } },
          ],
        },
      }),
    );

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByText('전송 대기·실패')).toBeNull();
    // 확정 로그는 그대로다 — 큐를 숨긴 것이지 기록을 숨긴 게 아니다.
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

    // 선수를 고르면 ActionTargetPicker는 닫히고, 과제 1(운영 콘솔 확인 모달
    // 전면 적용)의 확인 모달이 뜬다 — 모달 두 개가 동시에 있지 않다(항상
    // role="dialog" 하나).
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    const confirmDialog = await screen.findByRole('dialog');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(mocks.useV1GameOperationsConsole().submitEvent).not.toHaveBeenCalled();

    // 확인해야만(취소가 아니라) submitEvent가 골 이벤트로 정확히 한 번
    // 호출되고 모달이 닫힌다 — "확인하면 정확히 한 번만 기록된다" 요구사항.
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '골 기록' }));
    await waitFor(() =>
      expect(mocks.useV1GameOperationsConsole().submitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GOAL', participantId: 'p-1', sideId: 'side-home' }),
      ),
    );
    expect(mocks.useV1GameOperationsConsole().submitEvent).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('골 확인 모달에서 취소하면 아무것도 기록되지 않는다', async () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /^골/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    const confirmDialog = await screen.findByRole('dialog');

    fireEvent.click(within(confirmDialog).getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.useV1GameOperationsConsole().submitEvent).not.toHaveBeenCalled();
  });

  // 종료 흐름 개편(사용자 결정 2) — 예전엔 마지막 피리어드가 LIVE인 동안
  // "경기 종료" 버튼 하나뿐이었고, 그 한 번의 클릭이 피리어드 닫기·게임
  // ENDED·스코어 산출·결과 리비전 제출을 한 트랜잭션에서 다 했다. 이제
  // 마지막 피리어드도 "후반 종료"로 먼저 닫고, "경기 종료"는 그다음
  // 단계에서만 보인다.
  it('마지막 피리어드가 진행 중이면 "후반 종료"를 보여주고, "경기 종료"는 아직 보여주지 않는다', () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'LIVE', startedAt: '2026-08-07T00:25:00.000Z', endedAt: null },
    ]);

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByRole('button', { name: '후반 종료' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
    expect(screen.queryByRole('button', { name: '전반 종료' })).toBeNull();
  });

  // 마지막 피리어드 종료는 되돌릴 수 없다(서버 revert-period는 되감을 "다음
  // 피리어드"를 전제한다). 확인 문구가 그 사실을 말해야 하고, 성공 후에도
  // 실패가 예정된 "되돌리기" 토스트를 붙이면 안 된다.
  it('"후반 종료"는 되돌릴 수 없다고 알린 뒤 end-period를 보내고, 되돌리기 토스트를 붙이지 않는다', async () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'LIVE', startedAt: '2026-08-07T00:25:00.000Z', endedAt: null },
    ]);
    mocks.postV1GameCommand.mockResolvedValue({ gameId: 'game-1', state: 'LIVE', version: 3 });

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);
    fireEvent.click(screen.getByRole('button', { name: '후반 종료' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('되돌릴 수 없어요');
    fireEvent.click(within(dialog).getByRole('button', { name: '후반 종료' }));

    await waitFor(() =>
      expect(mocks.postV1GameCommand).toHaveBeenCalledWith('game-1', 'end-period', expect.anything()),
    );
    // 전반 종료에는 붙는 되돌리기 토스트가 여기서는 붙지 않는다.
    await waitFor(() => expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull());
  });

  // 이슈 #375 — "전반 종료" 버튼 라벨은 그대로지만 실제로 서버에 보내는
  // 커맨드는 구 fused `next-period`가 아니라 새로 분리된 `end-period`여야
  // 한다(라벨과 동작을 일치시키는 것이 이슈의 핵심).
  it('"전반 종료"를 누르면 확인 모달을 거쳐 postV1GameCommand가 end-period로 호출된다', async () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);
    mocks.postV1GameCommand.mockResolvedValue({ gameId: 'game-1', state: 'LIVE', version: 3 });

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);
    fireEvent.click(screen.getByRole('button', { name: '전반 종료' }));

    // 사용자 결정("예외 없이 전부")으로 end-period도 이제 확인을 거친다.
    const dialog = await screen.findByRole('dialog');
    expect(mocks.postV1GameCommand).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '전반 종료' }));

    await waitFor(() =>
      expect(mocks.postV1GameCommand).toHaveBeenCalledWith('game-1', 'end-period', expect.anything()),
    );
  });

  // 종료 흐름 개편 요구사항 1 — 전반 종료는 확인 게이트 없이 실행되면 안
  // 된다(예전 전제였던 "되돌릴 수 있으니 즉시 실행"은 사실이 아니다:
  // 후반에 기록이 하나라도 생기면 서버가 되돌리기를 거부한다).
  it('"전반 종료" 확인 모달에서 취소하면 아무 명령도 나가지 않는다', async () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);
    mocks.postV1GameCommand.mockResolvedValue({ gameId: 'game-1', state: 'LIVE', version: 3 });

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);
    fireEvent.click(screen.getByRole('button', { name: '전반 종료' }));

    const dialog = await screen.findByRole('dialog');
    expect(mocks.postV1GameCommand).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.postV1GameCommand).not.toHaveBeenCalled();
  });

  // 이슈 #375 — 하프타임(피리어드1 ENDED + 피리어드2 HALFTIME)에서는 '후반
  // 시작'과 '되돌리기'가 보이고, 클릭하면 각각 start-period/revert-period를
  // 보낸다. 요구사항의 리터럴 테스트: "LIVE 중에는 보이지 않는다"는 바로
  // 위(마지막 피리어드가 진행 중) 테스트가 이미 덮는다.
  describe('하프타임', () => {
    function gameAtHalftime() {
      gameWithPeriods('LIVE', [
        { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
        { number: 2, state: 'HALFTIME', startedAt: null, endedAt: null },
      ]);
    }

    it('"후반 시작"과 "되돌리기"를 보여주고, 일시 중지·전반 종료는 숨긴다', () => {
      gameAtHalftime();
      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

      expect(screen.getByRole('button', { name: '후반 시작' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '경기 종료' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '일시 중지' })).toBeNull();
      expect(screen.queryByRole('button', { name: '전반 종료' })).toBeNull();
      expect(screen.getByText(/하프타임이에요/)).toBeInTheDocument();
      // 경기를 시작해 주세요 배너가 하프타임 배너로 잘못 겹치지 않아야 한다.
      expect(screen.queryByText('경기를 시작해 주세요.')).toBeNull();

      // 하프타임 동안 골/카드 등 액션 버튼은 여전히 막혀 있어야 한다(LIVE인
      // 피리어드가 없다 — currentPeriod === null 가드는 손대지 않았다).
      expect(screen.getByRole('button', { name: /^골/ })).toBeDisabled();
    });

    it('"후반 시작"을 누르면 확인 모달을 거쳐 start-period를 보낸다', async () => {
      gameAtHalftime();
      mocks.postV1GameCommand.mockResolvedValue({ gameId: 'game-1', state: 'LIVE', version: 3 });
      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

      fireEvent.click(screen.getByRole('button', { name: '후반 시작' }));

      // 사용자 결정("예외 없이 전부")으로 start-period도 이제 확인을 거친다.
      const dialog = await screen.findByRole('dialog');
      expect(mocks.postV1GameCommand).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: '후반 시작' }));

      await waitFor(() =>
        expect(mocks.postV1GameCommand).toHaveBeenCalledWith('game-1', 'start-period', expect.anything()),
      );
    });

    it('"되돌리기"를 누르면 확인 없이 곧장 revert-period를 보낸다', async () => {
      gameAtHalftime();
      mocks.postV1GameCommand.mockResolvedValue({ gameId: 'game-1', state: 'LIVE', version: 3 });
      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

      fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));

      // UX 감사 item 3 — end/전반종료와 달리 되돌리기는 그 자체가 이미
      // 교정 행동이라 확인 다이얼로그를 거치지 않는다.
      expect(screen.queryByRole('dialog')).toBeNull();
      await waitFor(() =>
        expect(mocks.postV1GameCommand).toHaveBeenCalledWith('game-1', 'revert-period', expect.anything()),
      );
    });
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

    // 사용자 결정("예외 없이 전부")으로 교체도 이제 확인 모달을 거친다.
    const confirmDialog = await screen.findByRole('dialog');
    expect(mocks.useV1GameOperationsConsole().submitEvent).not.toHaveBeenCalled();
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '교체 기록' }));

    await waitFor(() =>
      expect(mocks.useV1GameOperationsConsole().submitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SUBSTITUTION', participantId: 'p-2', sideId: 'side-home', payload: { outParticipantId: 'p-1' } }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('롤링 교체 종목에서는 "교체" 액션 버튼이 아예 없다 (Task 166 BE-3)', () => {
    // 서버가 422 SUBSTITUTION_NOT_TRACKED 로 거부하므로(정본 §3), 버튼을 남기면
    // **누를 수 있는데 항상 실패하는** 액션이 된다. 종목을 화면에 하드코딩하지 않고
    // 서버가 내려주는 substitutionPolicy.mode 로만 가른다.
    gameWithSubstitutionPolicy({ mode: 'rolling', maxSubstitutions: null });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);
    expect(screen.queryByRole('button', { name: /^교체$/ })).toBeNull();
    // 롤링 전용이던 "빠른 교체 모드"도 함께 사라졌다.
    expect(screen.queryByRole('button', { name: /빠른 교체 모드/ })).toBeNull();
  });

  it('제한 교체 종목에서는 "교체" 액션 버튼이 그대로 있다 (회귀)', () => {
    // 음성 케이스가 없으면 "모든 경기에서 숨김" 으로 바뀌어도 위 테스트가 통과한다.
    gameWithSubstitutionPolicy({ mode: 'limited', maxSubstitutions: 5 });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);
    expect(screen.getByRole('button', { name: /^교체$/ })).toBeInTheDocument();
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

  /**
   * [P1-c] 이 테스트는 원래 **반대**를 못박고 있었다 -- "한쪽이 미제출이면 시작 버튼이
   * 비활성". 그 차단을 걷어냈으므로 계약이 뒤집혔다: **경고는 뜨되 시작은 된다.**
   *
   * 단언을 뒤집는 것이지 지우는 것이 아니다. 차단이 사라졌다고 경고까지 없애면
   * "왜 명단이 비어 있지"를 운영자가 현장에서 알 수 없다.
   */
  it('한쪽 팀만 라인업을 제출했어도 "경기 시작"은 활성이고, 미제출 경고는 그대로 뜬다', () => {
    setup([{ sideId: 'side-home', state: 'SUBMITTED', revision: 1 }]);
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByRole('button', { name: '경기 시작' })).toBeEnabled();
    expect(screen.getByText(/성수 풋살 클럽.*아직 선발 명단을 제출하지 않았어요/)).toBeInTheDocument();
    // [P1-d] 배너의 제출 링크는 뗐다 -- 화면이 사라졌고, P1-c 로 제출 자체가
    // 필요 없어졌다. **경고 문구는 남긴다**(운영자가 상황을 알아야 한다).
    expect(screen.queryByRole('link', { name: '라인업 제출하러 가기' })).not.toBeInTheDocument();
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
        // 종료 흐름 개편(사용자 결정 2) — "경기 종료"는 이제 정규 시간이
        // 끝난 뒤(모든 피리어드 ENDED + 게임은 아직 LIVE)에만 보인다.
        // 예전 이 테스트는 피리어드 1이 LIVE인 상태를 썼는데, 그 상태에서
        // 나오는 버튼은 이제 "전반 종료"다.
        periods: [{ id: 'period-1', gameId: 'game-1', number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z', pausedTotalMs: 0, pausedAt: null }],
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
    // 과제 1 요구사항 4 — 시계 경고와 일반 커밋 확인이 별개 모달로 겹쳐
    // 뜨지 않는다(모달은 항상 하나뿐, 경고가 그 안에 병합된다).
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

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

  it('피리어드 설정을 못 읽었으면(periodDurations: null) 시계 경고 없이 일반 확인만 거친다', async () => {
    setup(null);
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));

    // 과제 1(모든 액션에 확인)로 시계 경고 여부와 무관하게 확인 모달은 뜬다 —
    // 다만 시계 경고 문구·"그대로 기록" 라벨은 없어야 한다(판단 근거가
    // 없으면 지어낸 경고를 보여주지 않는다는 계약은 그대로 유지).
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/이 피리어드는 보통/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '골 기록' }));

    await waitFor(() => expect(mocks.useV1GameOperationsConsole().submitEvent).toHaveBeenCalled());
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

// 과제 2 — 승부차기 입력 단계. "언제 나타날지"(요구사항 1: TOURNAMENT_FIXTURE +
// 정규시간(+연장) 종료 시 동점 + knockout 픽스처) 게이팅과, 최종 결과 반영
// (요구사항 4·5: end 커맨드의 payload.penalties로 실제 반영, 확인 모달을 거침)
// 을 검증한다.
describe('OperateConsole — 승부차기 (과제 2)', () => {
  const PENALTY_SIDES = [
    { id: 'side-home', gameId: 'game-1', sideKey: 'HOME' as const, teamId: null, displayNameSnapshot: '강남 풋살 클럽', createdAt: '', updatedAt: '' },
    { id: 'side-away', gameId: 'game-1', sideKey: 'AWAY' as const, teamId: null, displayNameSnapshot: '성수 풋살 클럽', createdAt: '', updatedAt: '' },
  ];
  // 종료 흐름 개편(사용자 결정 2·3) — 승부차기 입력은 이제 "후반 종료"
  // 이후, 즉 마지막 피리어드까지 ENDED가 된 뒤에만 열린다(경기 자체는
  // 아직 LIVE = 결과 미확정). 예전엔 마지막 피리어드가 LIVE인 동안 열려
  // 있었다 — 아직 뛰는 중인 경기에 승부차기 입력이 열려 있는 셈이었다.
  const FINAL_PERIOD = {
    id: 'period-2', gameId: 'game-1', number: 2, state: 'ENDED',
    startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:45:00.000Z', pausedTotalMs: 0, pausedAt: null,
  };

  function tiedGoal(sequence: number, sideId: string, id: string): GameEventRecord {
    return {
      id, gameId: 'game-1', sequence, clientEventId: `client-${sequence}`, payloadHash: 'hash',
      type: 'GOAL', sideId, participantId: null, assistParticipantId: null, period: 2,
      clockMs: 5 * 60000, occurredAt: '2026-08-07T00:05:00.000Z', receivedAt: '2026-08-07T00:05:00.000Z',
      actorUserId: 'actor-1', reversesEventId: null, payload: {},
    } as GameEventRecord;
  }

  const FIRST_PERIOD = {
    id: 'period-1', gameId: 'game-1', number: 1, state: 'ENDED',
    startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z', pausedTotalMs: 0, pausedAt: null,
  };

  function setup(
    overrides: {
      isKnockoutFixture?: boolean;
      sourceType?: 'TEAM_MATCH' | 'TOURNAMENT_FIXTURE';
      liveEvents?: GameEventRecord[];
      periods?: ReadonlyArray<Record<string, unknown>>;
      /** 서버가 대회 설정에서 해석해 내려주는 승부차기 종료 정책. 생략하면 서버가
       *  이 필드를 안 보낸 상태(레거시 응답)를 그대로 재현한다. */
      penaltyShootoutPolicy?: { earlyStop: boolean };
    } = {},
  ) {
    mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
    mocks.useV1FixtureLineup.mockReturnValue({
      data: { gameId: 'game-1', lineups: [] },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    mocks.useV1Game.mockReturnValue({
      data: {
        id: 'game-1',
        sourceType: overrides.sourceType ?? 'TOURNAMENT_FIXTURE',
        isKnockoutFixture: overrides.isKnockoutFixture ?? true,
        state: 'LIVE', version: 2, lastSequence: 1,
        periods: overrides.periods ?? [FIRST_PERIOD, FINAL_PERIOD],
        sides: PENALTY_SIDES,
        lineups: [],
        penaltyShootoutPolicy: overrides.penaltyShootoutPolicy,
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    const liveEvents = overrides.liveEvents ?? [tiedGoal(1, 'side-home', 'e1'), tiedGoal(2, 'side-away', 'e2')];
    mocks.useV1GameOperationsConsole.mockReturnValue(
      consoleState({ gameSnapshot: { version: 2, state: 'LIVE' }, liveEvents }),
    );
  }

  it('대회 knockout 경기가 정규시간 종료 후 동점이면 "승부차기 시작" 버튼이 보이고, "경기 종료" 버튼은 숨는다', () => {
    setup();
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.getByRole('button', { name: /승부차기 시작/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
    expect(screen.getByText(/정규 시간이 무승부로 끝났어요/)).toBeInTheDocument();
  });

  // 요구사항 4 — 아직 정규 시간이 끝나지 않은 예외 종료 경로(하프타임 중
  // 중단 등)에서 결선 무승부인 채 "경기 종료"를 누르면, 예전에는 그대로
  // 나가 리비전이 저장되고 브래킷 프로젝션만 조용히 POISONED가 됐다.
  // 이제 버튼 자체가 막히고 사유를 알려준다(백엔드도 409
  // TOURNAMENT_PENALTY_REQUIRED로 이중 방어).
  it('결선 무승부인데 승부차기 결과가 없으면 "경기 종료"를 막고 사유를 알려준다', () => {
    // 하프타임(후반이 아직 시작조차 안 됨) — game.state는 LIVE라 "경기 종료"
    // 탈출구가 남아 있는 상태다.
    setup({ periods: [FIRST_PERIOD, { ...FINAL_PERIOD, state: 'HALFTIME', startedAt: null, endedAt: null }] });

    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    const endButton = screen.getByRole('button', { name: '경기 종료' });
    expect(endButton).toBeDisabled();
    expect(screen.getByText(/승부차기 결과를 입력해주세요/)).toBeInTheDocument();
    // 아직 정규 시간이 끝나지 않았으므로 승부차기 입력도 아직 열리지 않는다.
    expect(screen.queryByRole('button', { name: /승부차기 시작/ })).toBeNull();
  });

  it('knockout이 아니면(조별리그) 동점이어도 "승부차기 시작"이 보이지 않고 평소처럼 "경기 종료"가 보인다', () => {
    setup({ isKnockoutFixture: false });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByRole('button', { name: /승부차기 시작/ })).toBeNull();
    expect(screen.getByRole('button', { name: '경기 종료' })).toBeInTheDocument();
  });

  it('동점이 아니면 knockout 경기여도 "승부차기 시작"이 보이지 않는다', () => {
    setup({ liveEvents: [tiedGoal(1, 'side-home', 'e1')] });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByRole('button', { name: /승부차기 시작/ })).toBeNull();
    expect(screen.getByRole('button', { name: '경기 종료' })).toBeInTheDocument();
  });

  it('일반 팀 매치는(방어적 케이스, isKnockoutFixture가 와도) "승부차기 시작"이 보이지 않는다', () => {
    setup({ sourceType: 'TEAM_MATCH' });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    expect(screen.queryByRole('button', { name: /승부차기 시작/ })).toBeNull();
  });

  /**
   * **대회 설정 스위치가 실제로 배선돼 있다는 유일한 증거.**
   *
   * `earlyStop`은 서버 `getGame` 응답(`penaltyShootoutPolicy`)에서 와서 술어까지
   * 흘러가야 한다. 술어 자체는 `penalty-shootout.test.ts`가 양방향으로 검증하지만,
   * **그 값을 어디서 얻는가**는 거기서 검증되지 않는다 — 콘솔이 서버 값을 무시하고
   * `true`로 굳혀도 술어 테스트는 전부 초록이다.
   *
   * 그래서 두 정책의 답이 갈리는 국면을 UI로 직접 만든다: 홈(선축) 3킥 3점 / 원정 2킥
   * 0점. 원정의 마지막 킥으로도 따라잡을 수 없어 A2는 종료를 허용하지만, 조기 종료를
   * 끈 A1은 원정의 세 번째 킥까지 기다린다.
   */
  async function openPanelAndKickThreeToTwo(policy?: { earlyStop: boolean }): Promise<HTMLElement> {
    setup(policy === undefined ? {} : { penaltyShootoutPolicy: policy });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /승부차기 시작/ }));
    const startDialog = await screen.findByRole('dialog');
    fireEvent.click(within(startDialog).getByRole('button', { name: '승부차기 시작' }));

    const panel = await screen.findByRole('dialog', { name: '승부차기' });
    chooseFirstKicker(panel, '강남 풋살 클럽');
    const successButton = within(panel).getByRole('button', { name: /성공/ });
    const missButton = within(panel).getByRole('button', { name: /실패/ });
    // 홈 성공 / 원정 실패를 두 번 반복한 뒤 홈이 한 번 더 성공 → 홈 3킥 3점 / 원정 2킥 0점.
    for (let round = 0; round < 2; round += 1) {
      fireEvent.click(successButton);
      fireEvent.click(missButton);
    }
    fireEvent.click(successButton);
    return panel;
  }

  it('earlyStop 정책이면(기본) 홈 3킥 3점 / 원정 2킥 0점에서 승부차기를 종료할 수 있다', async () => {
    const panel = await openPanelAndKickThreeToTwo({ earlyStop: true });
    expect(within(panel).getByRole('button', { name: '승부차기 종료' })).not.toBeDisabled();
  });

  it('서버가 earlyStop=false를 내려주면 같은 국면에서 종료가 잠긴다 — 정책이 UI까지 배선돼 있다', async () => {
    const panel = await openPanelAndKickThreeToTwo({ earlyStop: false });
    expect(within(panel).getByRole('button', { name: '승부차기 종료' })).toBeDisabled();
    expect(panel).toHaveTextContent('성수 풋살 클럽의 응답 킥이 남아 있어요.');
  });

  it('서버가 정책을 안 내려주면(레거시 응답) FIFA 정규로 폴백한다', async () => {
    const panel = await openPanelAndKickThreeToTwo(undefined);
    expect(within(panel).getByRole('button', { name: '승부차기 종료' })).not.toBeDisabled();
  });

  /**
   * 킥 시퀀스가 "각 2킥 2:1"에서 "각 3킥 3:0"으로 바뀐 이유: 2킥씩 찬 2:1은 **결판이
   * 아니다.** 원정에게 아직 3킥이 남아 있어 뒤집을 수 있기 때문이다(FIFA 정규).
   * 예전 술어가 그 국면을 결판으로 읽은 것이 이 작업이 고치는 결함의 다른 얼굴이다 —
   * `home !== away` 하나만 봤으므로 홈이 1킥 넣은 1:0조차 결판이었다.
   *
   * 이 테스트가 지키는 계약 자체(최종 점수를 **배열 순서가 아니라 `sideKey` 기준으로**
   * 매핑해 `end` payload 에 싣는다)는 그대로다. 3:0은 원정이 남은 2킥을 다 넣어도 2점이라
   * 수학적으로 끝난 국면이다.
   */
  it('승부차기 시작 확인 → 킥 입력(3:0) → 종료 확인을 거치면, end 커맨드가 sideKey 기준 최종 점수로 호출된다', async () => {
    setup();
    mocks.postV1GameCommand.mockResolvedValue({
      gameId: 'game-1', state: 'ENDED', version: 3, revisionId: 'rev-1', revision: 1, revisionState: 'SUBMITTED',
    });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /승부차기 시작/ }));
    const startDialog = await screen.findByRole('dialog');
    fireEvent.click(within(startDialog).getByRole('button', { name: '승부차기 시작' }));

    const panel = await screen.findByRole('dialog', { name: '승부차기' });
    // 이 시나리오는 홈이 선축인 경우다 — 아래 기대 payload 의 `firstKickSideKey: 'HOME'`이
    // 그 선택의 결과다(예전에는 고를 수 없었고 항상 홈으로 굳어 있었다).
    chooseFirstKicker(panel, '강남 풋살 클럽');
    const successButton = within(panel).getByRole('button', { name: /성공/ });
    const missButton = within(panel).getByRole('button', { name: /실패/ });

    // 순서는 항상 번갈아 찬다(선축인 홈 먼저). 홈의 세 번째 성공 시점에는 원정이
    // 한 번 덜 찼어도 마지막 킥으로 따라잡을 수 없으므로 규칙상 결판이다.
    fireEvent.click(successButton); // 홈 1:0
    fireEvent.click(missButton); // 원정 1:0
    fireEvent.click(successButton); // 홈 2:0
    fireEvent.click(missButton); // 원정 2:0
    fireEvent.click(successButton); // 홈 3:0

    const finishButton = within(panel).getByRole('button', { name: '승부차기 종료' });
    expect(finishButton).not.toBeDisabled();
    fireEvent.click(finishButton);

    const finishDialog = await screen.findByRole('dialog', { name: '승부차기를 종료할까요?' });
    expect(finishDialog).toHaveTextContent('강남 풋살 클럽 3 : 0 성수 풋살 클럽');
    fireEvent.click(within(finishDialog).getByRole('button', { name: '승부차기 종료' }));

    await waitFor(() =>
      expect(mocks.postV1GameCommand).toHaveBeenCalledWith(
        'game-1',
        'end',
        expect.objectContaining({
          // 킥 수가 함께 나가야 서버도 같은 술어로 결판을 판정할 수 있다. 규칙대로
          // 끝난 종료이므로 `operatorOverride`는 **실리지 않는다** — 키 부재가 곧
          // "우회 아님"이라, 여기에 키가 생기면 감사 기록이 우회를 구분하지 못한다.
          payload: {
            penalties: { home: 3, away: 0, firstKickSideKey: 'HOME', takenHome: 3, takenAway: 2 },
          },
        }),
      ),
    );
  });

  // 현장에서는 규칙보다 먼저 승부차기가 끝난다 — 한 팀이 기권하거나 선수가 없어 더 못 차면
  // 두 팀의 킥 수가 어긋난 채로 경기가 종료된다. 자동 판정만 믿으면 그 상태에서 종료가
  // 영원히 잠겨, 운영자는 **차지도 않은 킥을 지어내야만** 경기를 닫을 수 있었다.
  it('킥 수가 어긋나 자동 종료가 잠긴 상태에서도 "그래도 종료"로 end 커맨드가 실제 집계 그대로 나간다', async () => {
    setup();
    mocks.postV1GameCommand.mockResolvedValue({
      gameId: 'game-1', state: 'ENDED', version: 3, revisionId: 'rev-1', revision: 1, revisionState: 'SUBMITTED',
    });
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /승부차기 시작/ }));
    const startDialog = await screen.findByRole('dialog');
    fireEvent.click(within(startDialog).getByRole('button', { name: '승부차기 시작' }));

    const panel = await screen.findByRole('dialog', { name: '승부차기' });
    chooseFirstKicker(panel, '강남 풋살 클럽');
    const successButton = within(panel).getByRole('button', { name: /성공/ });
    const missButton = within(panel).getByRole('button', { name: /실패/ });

    // 홈 2킥 2점 / 원정 1킥 0점 — 원정이 남은 4킥을 다 넣으면 역전 가능하므로 규칙상 미결.
    // 아래 주석은 **점수가 아니라 킥 수와 점수**를 함께 적는다 — 이 테스트의 관심사가
    // "몇 대 몇인가"가 아니라 "누가 몇 번 찼는가"이기 때문이다.
    fireEvent.click(successButton); // 홈 1킥 1점
    fireEvent.click(missButton); // 원정 1킥 0점
    fireEvent.click(successButton); // 홈 2킥 2점 — 여기서 원정이 기권했다고 하자

    expect(within(panel).getByRole('button', { name: '승부차기 종료' })).toBeDisabled();
    fireEvent.click(within(panel).getByRole('button', { name: '그래도 종료' }));

    // 확인 문구가 평소 종료와 달라야 한다 — 이건 "예상대로 끝났나" 확인이 아니라
    // "자동 판정과 다른 결론을 낸다"는 선언이고, 킥 수까지 보여줘야 오조작을 알아챈다.
    const finishDialog = await screen.findByRole('dialog', { name: '아직 안 끝난 승부차기예요' });
    expect(finishDialog).toHaveTextContent('강남 풋살 클럽 2킥 2점');
    expect(finishDialog).toHaveTextContent('성수 풋살 클럽 1킥 0점');
    fireEvent.click(within(finishDialog).getByRole('button', { name: '그래도 종료' }));

    await waitFor(() =>
      expect(mocks.postV1GameCommand).toHaveBeenCalledWith(
        'game-1',
        'end',
        expect.objectContaining({
          // 우회 종료는 킥 수(2 vs 1)와 `operatorOverride: true`를 함께 싣는다 —
          // 서버가 이 값을 `score.penalties`에 저장해 리비전에 영구히 남기므로,
          // 나중에 "이 결과는 왜 규칙과 다른가"에 답할 수 있는 유일한 근거가 된다.
          payload: {
            penalties: {
              home: 2,
              away: 0,
              firstKickSideKey: 'HOME',
              takenHome: 2,
              takenAway: 1,
              operatorOverride: true,
            },
          },
        }),
      ),
    );
  });

  it('두 팀 점수가 같으면 "승부차기 종료" 버튼이 비활성이다(무승부 승부차기는 백엔드도 거부)', async () => {
    setup();
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /승부차기 시작/ }));
    const startDialog = await screen.findByRole('dialog');
    fireEvent.click(within(startDialog).getByRole('button', { name: '승부차기 시작' }));

    const panel = await screen.findByRole('dialog', { name: '승부차기' });
    expect(within(panel).getByRole('button', { name: '승부차기 종료' })).toBeDisabled();
  });

  /**
   * 선축(먼저 차는 팀)을 고른다. 승부차기는 동전 던지기로 선축을 정하고 시작하므로,
   * 패널은 이걸 고르기 전까지 성공/실패 버튼을 잠근다 — 즉 킥을 기록하는 모든 시나리오는
   * 이 단계를 거쳐야 한다(실제 운영자도 그렇게 한다).
   */
  function chooseFirstKicker(panel: HTMLElement, teamName: string): void {
    fireEvent.click(within(panel).getByLabelText(teamName));
  }

  /**
   * "다음 순서" 배지가 붙은 팀 이름. 패널은 `nextPenaltyKicker`가 고른 사이드
   * 카드에만 이 배지를 렌더하므로, 배지가 어느 팀에 있는지가 곧 킥 상태다.
   */
  function nextKickerName(panel: HTMLElement): string {
    const badge = within(panel).getByText('다음 순서');
    return (badge.parentElement?.textContent ?? '').replace('다음 순서', '').trim();
  }

  /**
   * 되돌리기 검증의 증거는 **패널이 그리는 킥 상태 자체**여야 한다 — 킥 기록 배지,
   * 사이드별 점수, "다음 순서" 배지의 이동.
   *
   * 이전 판은 증거로 "'승부차기 종료' 버튼이 다시 활성화된다"를 썼는데, 그 활성화는
   * 되돌리기가 동작해서가 아니라 **결판 술어가 킥 수를 보지 않아서**(홈 1:0이면
   * 원정이 0킥이어도 결판으로 읽힘) 켜지는 것이었다. 즉 그 단언은 사용자가 보고한
   * 결함을 "정답"으로 박제하고 주석으로까지 명문화하고 있었다. 원래 의도인 "undo가
   * 실제로 상태를 되감는다"는 아래 증거들이 더 직접적으로 지킨다.
   */
  it('킥을 잘못 입력했을 때 "방금 킥 되돌리기"로 킥 상태가 되감긴다', async () => {
    setup();
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /승부차기 시작/ }));
    const startDialog = await screen.findByRole('dialog');
    fireEvent.click(within(startDialog).getByRole('button', { name: '승부차기 시작' }));

    const panel = await screen.findByRole('dialog', { name: '승부차기' });
    chooseFirstKicker(panel, '강남 풋살 클럽');
    const undoButton = within(panel).getByRole('button', { name: '방금 킥 되돌리기' });
    // 킥이 하나도 없으면 되돌리기 자체가 막힌다(되돌릴 대상이 없다).
    expect(undoButton).toBeDisabled();

    const awayKicks = within(panel).getByLabelText('성수 풋살 클럽 킥 기록');
    expect(awayKicks).toHaveTextContent('아직 기록된 킥이 없어요');

    const successButton = within(panel).getByRole('button', { name: /성공/ });
    fireEvent.click(successButton); // 홈 성공 → 다음은 원정
    expect(nextKickerName(panel)).toBe('성수 풋살 클럽');
    fireEvent.click(successButton); // 원정 성공 → 다음은 다시 홈
    expect(nextKickerName(panel)).toBe('강남 풋살 클럽');
    expect(within(awayKicks).getByLabelText('1번째 킥 성공')).toBeInTheDocument();
    expect(undoButton).not.toBeDisabled();

    fireEvent.click(undoButton); // 원정 킥 되돌림

    // 되돌린 킥이 기록에서 사라지고, 차례도 원정으로 되돌아간다.
    expect(awayKicks).toHaveTextContent('아직 기록된 킥이 없어요');
    expect(within(awayKicks).queryByLabelText('1번째 킥 성공')).toBeNull();
    expect(nextKickerName(panel)).toBe('성수 풋살 클럽');
    // 되돌릴 킥이 하나(홈)만 남았다가, 그것마저 되돌리면 다시 잠긴다.
    expect(undoButton).not.toBeDisabled();
    fireEvent.click(undoButton);
    expect(undoButton).toBeDisabled();
  });

  /**
   * 사용자 보고 결함의 코어. 홈이 첫 킥을 성공하면 점수는 1:0이 되고, 옛 술어
   * (`isPenaltyShootoutDecisive(home, away) { return home !== away; }`)는 킥 수를
   * 보지 않으므로 이를 "결판"으로 읽어 `disabled={!decisive}`가 풀렸다 — **원정이
   * 한 번도 차기 전에** 승부차기를 종료할 수 있었다.
   */
  it('홈만 1킥 성공한 상태에서는 "승부차기 종료"가 비활성이다 — 원정이 아직 한 번도 차지 않았다', async () => {
    setup();
    render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

    fireEvent.click(screen.getByRole('button', { name: /승부차기 시작/ }));
    const startDialog = await screen.findByRole('dialog');
    fireEvent.click(within(startDialog).getByRole('button', { name: '승부차기 시작' }));

    const panel = await screen.findByRole('dialog', { name: '승부차기' });

    // 선축을 먼저 골라야 성공/실패 버튼이 열린다. 이걸 빼면 클릭이 무시돼(버튼 disabled)
    // 킥이 한 개도 기록되지 않고, 테스트는 "0킥이라 종료 불가"만 확인하는 공테스트가 된다
    // — 옛 술어(`home !== away`)를 되살려도 0:0이라 그대로 초록이었다.
    chooseFirstKicker(panel, '강남 풋살 클럽');
    fireEvent.click(within(panel).getByRole('button', { name: /성공/ }));

    // 홈이 실제로 1점을 넣었는지부터 확인한다 — 이 단언이 있어야 아래 disabled가
    // "1:0인데도 잠겨 있다"를 뜻한다(옛 술어라면 여기서 버튼이 열린다).
    expect(within(within(panel).getByLabelText('강남 풋살 클럽 킥 기록')).getByLabelText('1번째 킥 성공')).toBeInTheDocument();
    expect(within(panel).getByLabelText('성수 풋살 클럽 킥 기록')).toHaveTextContent('아직 기록된 킥이 없어요');
    expect(within(panel).getByRole('button', { name: '승부차기 종료' })).toBeDisabled();
    expect(panel).toHaveTextContent('성수 풋살 클럽이(가) 아직 한 번도 차지 않았어요.');
  });

  /* 종료 후 결과 표시 — 승부차기를 입력하고 종료하면 패널이 닫히고 헤더 스코어는
     골 이벤트에서만 파생돼 "0 : 0"만 남았다. 방금 입력한 승부차기 결과가 이 화면
     어디에도 없어서, 운영자는 자기가 기록한 값을 확인할 수단이 없었다(알파 실측:
     서버에는 승부차기 2:0 이 저장돼 있었다). 승부차기는 골 이벤트가 아니므로
     `liveEvents`로는 절대 복원되지 않는다 — 확정 결과 리비전에서 읽어야 한다. */
  describe('종료된 경기의 승부차기 결과', () => {
    function setupEnded(revisions: Array<Record<string, unknown>>, currentOfficialRevisionId: string | null = null) {
      mocks.useV1AuthMe.mockReturnValue({ data: { user: { id: 'user-1' } } });
      mocks.useV1FixtureLineup.mockReturnValue({
        data: { gameId: 'game-1', lineups: [] },
        isLoading: false, isError: false, error: null, refetch: vi.fn(),
      });
      mocks.useV1Game.mockReturnValue({
        data: {
          id: 'game-1',
          sourceType: 'TOURNAMENT_FIXTURE',
          isKnockoutFixture: true,
          state: 'ENDED', version: 3, lastSequence: 2,
          currentOfficialRevisionId,
          periods: [FIRST_PERIOD, FINAL_PERIOD],
          sides: PENALTY_SIDES,
          lineups: [],
        },
        isLoading: false, isError: false, refetch: vi.fn(),
      });
      mocks.useV1GameOperationsConsole.mockReturnValue(
        consoleState({
          gameSnapshot: { version: 3, state: 'ENDED' },
          liveEvents: [tiedGoal(1, 'side-home', 'e1'), tiedGoal(2, 'side-away', 'e2')],
        }),
      );
      mocks.useV1GameResultRevisions.mockReturnValue({ data: revisions, isPending: false, isError: false });
    }

    it('경기 종료 후에도 확정된 승부차기 점수를 헤더에 남긴다', () => {
      setupEnded([{ id: 'rev-1', revision: 1, state: 'DRAFT', score: { home: 1, away: 1, penalties: { home: 2, away: 0 } } }]);

      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

      expect(screen.getByText('승부차기 2:0')).toBeInTheDocument();
      // 정규시간 스코어는 그대로 남는다 — 승부차기가 정규 점수를 덮어쓰면 안 된다.
      expect(screen.getByText('1 : 1')).toBeInTheDocument();
    });

    it('정정으로 확정본이 바뀌면 최신 리비전이 아니라 확정된 리비전의 승부차기를 보여준다', () => {
      // 목록은 revision 내림차순(서버 정렬)이다. 최신(rev-2)은 아직 확정 전 초안이고
      // 확정본은 rev-1 — 여기서 최신을 그대로 쓰면 확정되지 않은 값을 결과로 보여준다.
      setupEnded(
        [
          { id: 'rev-2', revision: 2, state: 'DRAFT', score: { home: 1, away: 1, penalties: { home: 5, away: 4 } } },
          { id: 'rev-1', revision: 1, state: 'OFFICIAL', score: { home: 1, away: 1, penalties: { home: 2, away: 0 } } },
        ],
        'rev-1',
      );

      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

      expect(screen.getByText('승부차기 2:0')).toBeInTheDocument();
      expect(screen.queryByText('승부차기 5:4')).toBeNull();
    });

    it('승부차기 없이 끝난 경기에는 승부차기 표기를 만들지 않는다', () => {
      setupEnded([{ id: 'rev-1', revision: 1, state: 'DRAFT', score: { home: 2, away: 1 } }]);

      render(<OperateConsole tournamentId="t-1" fixtureId="f-1" />);

      expect(screen.queryByText(/승부차기/)).toBeNull();
    });
  });
});
