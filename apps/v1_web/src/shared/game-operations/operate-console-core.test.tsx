import { act, cleanup, render as renderElement, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { AbnormalEndDialog, OperateConsoleCore, type GameDetailQueryState, type OperateConsoleRuntime } from '@/shared/game-operations';
import { COMMAND_RESPONSE_TIMEOUT_MS } from './operate-console-core';
import type { FixtureLineupResponse, GameCommandRequest, GameDetail, GameEventRecord, GameLineup, GameLineupState, GameMutationResult, GameRevisionMutationResult, GameState } from '@/types/game-operations';
import type { V1GameResultRevision } from '@/types/api';
import type { QueuedGameEvent } from '@/lib/game-operations-queue';
import { V1_NETWORK_ERROR_CODE, V1ApiError } from '@/lib/api-client';
import * as overlayHistory from '@/lib/overlay-history';

const queryClients: QueryClient[] = [];
function render(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  queryClients.push(client);
  return renderElement(ui, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
afterEach(() => {
  cleanup();
  queryClients.splice(0).forEach((client) => client.clear());
});

/**
 * "기록한 이벤트" 자리에 **로컬 전송 큐**를 그리고 있었다. 큐는 이번 세션에서 내가 올린 것만
 * 담기 때문에, 새로고침하거나 다른 운영자가 넘겨받으면 골이 4개 기록된 경기도
 * "기록된 이벤트가 아직 없어요" 로 보였다 — 화면이 실제 기록을 부정하는 상태였다.
 *
 * 지금은 서버 확정 로그(liveEvents)를 먼저 보여주고, 전송 큐는 대기·실패가 있을 때만
 * "전송 상태" 로 따로 세운다. 둘은 다른 것을 뜻하므로 같은 제목 아래 둘 수 없다.
 */

const testFixtures = vi.hoisted(() => ({
  auth: vi.fn(),
  lineups: vi.fn(),
  game: vi.fn(),
  operations: vi.fn<() => MockedOperations>(),
  sendCommand: vi.fn<OperateConsoleRuntime['postGameCommand']>(),
  // 종료된 경기의 확정 결과(승부차기 포함) 조회 기본 fixture.
  resultRevisions: vi.fn((..._args: unknown[]) => ({
    data: undefined as V1GameResultRevision[] | undefined,
    isPending: false,
    isError: false,
  })),
}));

type OperationsContract = OperateConsoleRuntime['operations'];
type GameCommandResult = GameMutationResult | GameRevisionMutationResult;
type MockedOperations = {
  [Key in keyof OperationsContract]: OperationsContract[Key] extends (...args: infer Args) => infer Result
    ? Mock<(...args: Args) => Result>
    : OperationsContract[Key];
};

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
    filterParticipantIds,
    sentOffParticipantIds,
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
    filterParticipantIds?: ReadonlySet<string>;
    sentOffParticipantIds?: ReadonlySet<string>;
  }) => {
    const participantId = restrictSideId
      ? filterParticipantIds?.has('p-1')
        ? 'p-1'
        : filterParticipantIds?.has('p-2')
          ? 'p-2'
          : 'p-3'
      : filterParticipantIds?.has('p-2')
        ? 'p-2'
        : 'p-1';
    const participant = {
      id: participantId,
      gameId: 'game-1', sideId: 'side-home', lineupId: 'l-1',
      displayNameSnapshot: participantId === 'p-1' ? '정우진' : participantId === 'p-2' ? '이민호' : '박서준',
      jerseyNumber: participantId === 'p-1' ? 10 : participantId === 'p-2' ? 7 : 3,
      position: null,
      createdAt: '', updatedAt: '',
    };
    return (
      <div data-testid="lineup-grid">
        <button type="button" onClick={() => onSelectPlayer({ sideId: 'side-home', participant })}>
          select-player
        </button>
        <span data-testid="sent-off-ids">{[...(sentOffParticipantIds ?? [])].sort().join(',')}</span>
      </div>
    );
  },
}));

// 이슈 #375 — `testFixtures.sendCommand`는 `vi.hoisted`로 파일 전체가 공유하는
// 스파이라 `vitest.config.mts`에 clearMocks가 없는 이 프로젝트에서는 호출
// 기록이 테스트 사이에 그대로 누적된다. "하프타임" describe가 실제로
// sendCommand를 호출하는 테스트를 추가하면서, 그 뒤에 있는 "경기 종료
// 확인" describe의 "아직 호출되지 않았다" 단언이 앞선 테스트의 호출까지
// 주워 담아 깨졌다 — 구현 결함이 아니라 파일 전체가 공유하는 목의 호출
// 기록이 초기화되지 않던 잠재적 취약점이다. 매 테스트 전에 호출 기록만
// 지운다(mockClear, 각 describe가 이미 따로 설정하는 mockResolvedValue
// 구현 자체는 건드리지 않는다).
beforeEach(() => {
  testFixtures.sendCommand.mockClear();
});

// 진행 명령은 응답 제한 시간을 걸 수 있게 abort 신호를 함께 넘긴다.
const COMMAND_OPTIONS = { signal: expect.any(AbortSignal) };

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

function queuedEvent(clientEventId: string, status: QueuedGameEvent['status'], type = 'GOAL'): QueuedGameEvent {
  return {
    clientEventId,
    gameId: 'game-1',
    expectedVersion: 2,
    event: { type, period: 1, clockMs: 0, occurredAt: '2026-10-28T00:00:00.000Z', payload: {} },
    payloadHash: 'hash',
    status,
    queuedAt: '2026-10-28T00:00:00.000Z',
    attempts: 1,
    lastError: status === 'failed' ? { code: 'INTERNAL_ERROR', message: '이벤트를 기록하지 못했어요.' } : null,
    ackedSequence: status === 'acked' ? 1 : null,
    ackedVersion: status === 'acked' ? 2 : null,
  };
}

function gameMutationResult(state: GameState, version = 3, replayed = false): GameMutationResult {
  return {
    gameId: 'game-1',
    state,
    version,
    durableCommandId: 'command-1',
    replayed,
  };
}

function gameRevisionMutationResult(state: GameState, version = 3): GameRevisionMutationResult {
  return {
    ...gameMutationResult(state, version),
    revisionId: 'revision-1',
    revision: 1,
    revisionState: 'SUBMITTED',
  };
}

function consoleState(overrides: Partial<MockedOperations> = {}): MockedOperations {
  return {
    canOperate: true,
    connectionStatus: 'connected',
    sync: { status: 'synced', lastSequence: 1 },
    takeover: { status: 'held', token: 'tok', expiresAtMs: Date.now() + 60000, assignmentVersion: 0 },
    queue: { items: [] },
    clockOffsetMs: 0,
    liveEvents: [goal(1)],
    gameSnapshot: { version: 2, state: 'LIVE' },
    bannerMessage: null,
    submitEvent: vi.fn<OperationsContract['submitEvent']>(),
    retryFailedEvent: vi.fn<OperationsContract['retryFailedEvent']>(),
    requestTakeover: vi.fn<OperationsContract['requestTakeover']>(),
    reverseEvent: vi.fn<OperationsContract['reverseEvent']>(),
    assignAssist: vi.fn<OperationsContract['assignAssist']>(),
    applyCommandResult: vi.fn<OperationsContract['applyCommandResult']>(() => true),
    ...overrides,
  };
}

function CoreHarness({
  fixtureId = 'f-1',
  takeoverEnabled = true,
  operatorScopeKey = 'operator-1',
}: {
  fixtureId?: string;
  takeoverEnabled?: boolean;
  operatorScopeKey?: string;
}) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmModal } = useConfirm();
  const fixtureLineup = testFixtures.lineups();
  const gameQuery = testFixtures.game();
  const operations = testFixtures.operations();
  const auth = testFixtures.auth();
  const revisions = testFixtures.resultRevisions();
  const data = gameQuery.data as GameDetail | undefined;
  const queryStatus = gameQuery.status ?? (gameQuery.isLoading ? 'pending' : gameQuery.isError ? 'error' : 'success');
  const gameDetail: GameDetailQueryState = {
    data,
    isLoading: gameQuery.isLoading ?? false,
    isError: gameQuery.isError ?? false,
    error: gameQuery.error ?? null,
    status: queryStatus,
    refetch: gameQuery.refetch ?? (async () => undefined),
  };

  return (
    <OperateConsoleCore
      gameId={fixtureLineup.data?.gameId ?? data?.id ?? null}
      runtime={{
        authUserId: auth.data?.user?.id,
        resultRevisions: revisions.data,
        queryClient,
        confirm,
        confirmModal: ConfirmModal,
        postGameCommand: testFixtures.sendCommand,
        gameOperationsErrorMessage: (code) => code === 'STAFF_SCOPE_DENIED' ? '이 경기를 운영할 권한이 없어요.' : code,
        isRetryableGameOperationsErrorCode: (code) => code !== 'STAFF_SCOPE_DENIED',
        operations,
      }}
      gameDetail={gameDetail}
      lineupsQuery={{
        data: fixtureLineup.data?.lineups,
        isLoading: fixtureLineup.isLoading ?? false,
        isError: fixtureLineup.isError ?? false,
        error: fixtureLineup.error ?? null,
        refetch: fixtureLineup.refetch ?? (async () => undefined),
      }}
      leaseRequired
      takeoverEnabled={takeoverEnabled}
      operatorScopeKey={operatorScopeKey}
      operationContextKey={JSON.stringify(['operation', fixtureId])}
      headerTopClass="top-[52px]"
      requiresLineupBeforeStart={data?.sourceType === 'TEAM_MATCH'}
      allowPenaltyShootout={data?.isKnockoutFixture === true}
      resultReviewEnabled
      renderResultReview={(gameId) => (
        <div data-testid="result-confirm-card" data-game-id={gameId} />
      )}
      renderAbnormalEndDialog={(props) => <AbnormalEndDialog {...props} />}
      renderKickoffChecklist={({ gameId }) => (
        <section role="region" aria-label="킥오프 준비" data-game-id={gameId}>
          <p>이번 경기 출전 명단</p>
        </section>
      )}
    />
  );
}

describe('OperateConsoleCore — 기록된 이벤트 / 전송 상태 분리', () => {
  beforeEach(() => {
    testFixtures.auth.mockReturnValue({ data: { user: { id: 'user-1' } } });
    testFixtures.lineups.mockReturnValue({
      data: { gameId: 'game-1', lineups: [{ sideId: SIDE_ID, invalidatedAt: null, participants: [
        { id: 'p-1', gameId: 'game-1', sideId: SIDE_ID, lineupId: 'l-1',
          displayNameSnapshot: '정우진', jerseyNumber: 10, position: null,
          createdAt: '', updatedAt: '' },
      ] }] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    testFixtures.game.mockReturnValue({
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
    testFixtures.operations.mockReturnValue(consoleState());
  });

  it('서버에 확정된 이벤트를 보여준다 — 로컬 큐가 비어 있어도', () => {
    render(<CoreHarness />);

    const list = screen.getByRole('list', { name: '기록된 이벤트 목록' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('정우진');
  });

  it('필드 범위 밖 경기 접근의 REST 오류를 한국어로 안내한다', () => {
    testFixtures.lineups.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: new V1ApiError({ status: 'error', message: 'Tournament staff scope is denied', statusCode: 403, code: 'STAFF_SCOPE_DENIED', timestamp: '2026-10-14T01:00:00Z' }),
      refetch: vi.fn(),
    });
    render(<CoreHarness />);
    expect(screen.getByText('이 경기를 운영할 권한이 없어요.')).toBeInTheDocument();
    expect(screen.queryByText('Tournament staff scope is denied')).not.toBeInTheDocument();
    // 권한 문제는 다시 불러와도 같은 답이다 — 누를 버튼을 두지 않는다(MD-QA #171).
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
  });

  it('권한이 아닌 불러오기 실패에는 다시 시도를 둔다', () => {
    const refetch = vi.fn();
    testFixtures.lineups.mockReturnValue({
      data: undefined, isLoading: false, isError: true,
      error: new V1ApiError({ status: 'error', message: '경기 정보를 불러오지 못했어요.', statusCode: 500, code: 'INTERNAL_ERROR', timestamp: '2026-10-14T01:00:00Z' }),
      refetch,
    });
    render(<CoreHarness />);
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(refetch).toHaveBeenCalled();
  });

  // MD-QA #165: 다른 운영자가 쥔 경기는 보기 모드로 열고, 코드 없이 누가 운영 중인지와 가져오는 방법을 보여 준다.
  it('다른 운영자가 운영 중이면 이름과 가져오기 버튼을 보여 주고, 확인해야만 force 로 가져온다', async () => {
    const state = consoleState({ takeover: { status: 'denied', code: 'TAKEOVER_HELD', holderName: '김운영' } });
    testFixtures.operations.mockReturnValue(state);
    render(<CoreHarness />);

    expect(screen.getByText('김운영님이 이 경기를 운영하고 있어요. 지금은 보기만 할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByText(/TAKEOVER_HELD/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '운영 권한 가져오기' }));
    expect(state.requestTakeover).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: '가져오기' }));
    await waitFor(() => expect(state.requestTakeover).toHaveBeenCalledWith({ force: true }));
  });

  it('권한을 뺏긴 쪽도 코드 대신 누가 가져갔는지 보여 준다', () => {
    testFixtures.operations.mockReturnValue(
      consoleState({ takeover: { status: 'denied', code: 'TAKEOVER_SUPERSEDED', holderName: '박운영' } }),
    );
    render(<CoreHarness />);

    expect(screen.getByText('박운영님이 운영 권한을 가져갔어요. 지금은 보기만 할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByText(/TAKEOVER_SUPERSEDED/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '운영 권한 가져오기' })).toBeInTheDocument();
  });

  // Task 180 G6(F76) — 콘솔에서는 방금 한 일이 맨 위여야 어시스트를 잘못된 골에 다는 사고가 없다.
  it('콘솔의 기록된 이벤트는 최신순이다 (맨 위가 가장 나중에 기록된 골)', () => {
    testFixtures.operations.mockReturnValue(
      consoleState({ liveEvents: [goal(1), { ...goal(2), clockMs: 9 * 60000 }, { ...goal(3), clockMs: 12 * 60000 }] }),
    );
    render(<CoreHarness />);

    const rows = within(screen.getByRole('list', { name: '기록된 이벤트 목록' })).getAllByRole('listitem');
    expect(rows.map((row) => /후반 (\d+)/.exec(row.textContent ?? '')?.[1])).toEqual(['12', '9', '6']);
    expect(screen.getByRole('heading', { name: /기록된 이벤트/ })).toHaveTextContent('최신순');
  });

  it('takeover가 허용되고 보유 중이면 기록 수정 액션을 노출한다', () => {
    testFixtures.operations.mockReturnValue(
      consoleState({
        takeover: { status: 'held', token: 'tok', expiresAtMs: Date.now() + 60000, assignmentVersion: 0 },
        liveEvents: [{ ...goal(1), assistParticipantId: null }],
      }),
    );
    render(<CoreHarness />);

    expect(within(screen.getByRole('list', { name: '기록된 이벤트 목록' })).getByRole('button', { name: /어시스트/ })).toBeInTheDocument();
  });

  it('takeover가 비활성화되면 기록 조회만 허용한다', () => {
    render(<CoreHarness takeoverEnabled={false} operatorScopeKey="readonly-operator" />);

    expect(screen.getByRole('list', { name: '기록된 이벤트 목록' })).toHaveTextContent('정우진');
    expect(screen.queryByRole('button', { name: /어시스트/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '수정·취소' })).toBeNull();
  });

  // 큐가 비어 있으면 "전송 상태" 절은 아예 나오지 않아야 한다 — 평상시 화면에 빈 패널이
  // 남아 있으면 운영자가 그걸 이벤트 목록으로 오해한다(예전 회귀의 원인).
  it('전송할 것이 없으면 전송 상태 절을 세우지 않는다', () => {
    render(<CoreHarness />);

    expect(screen.queryByText('전송 대기·실패')).toBeNull();
  });

  it('대기·실패한 전송이 있을 때만 전송 상태를 따로 세운다', () => {
    testFixtures.operations.mockReturnValue(
      consoleState({
        queue: {
          items: [queuedEvent('client-9', 'failed')],
        },
      }),
    );

    render(<CoreHarness />);

    expect(screen.getByText('전송 대기·실패')).toBeInTheDocument();
    // 서버 로그는 그대로 남아 있어야 한다 — 큐가 그것을 대체하지 않는다.
    expect(screen.getByRole('list', { name: '기록된 이벤트 목록' })).toBeInTheDocument();
  });

  // 전부 ack 된 평상시에는 이 절이 통째로 사라져야 한다. 예전에는 ack 된 항목까지 남아
  // "골·옐로카드·골 · 기록 완료"가 위 확정 로그와 1:1로 중복됐다(시각·선수·팀 없이).
  it('전부 서버에 기록된 뒤에는 전송 절을 남기지 않는다', () => {
    testFixtures.operations.mockReturnValue(
      consoleState({
        queue: {
          items: [queuedEvent('c-1', 'acked'), queuedEvent('c-2', 'acked', 'FOUL')],
        },
      }),
    );

    render(<CoreHarness />);

    expect(screen.queryByText('전송 대기·실패')).toBeNull();
    // 확정 로그는 그대로다 — 큐를 숨긴 것이지 기록을 숨긴 게 아니다.
    expect(screen.getByRole('list', { name: '기록된 이벤트 목록' })).toBeInTheDocument();
  });
});

describe('OperateConsole — 피리어드 생명주기 (T1-0)', () => {
  beforeEach(() => {
    testFixtures.auth.mockReturnValue({ data: { user: { id: 'user-1' } } });
    testFixtures.lineups.mockReturnValue({
      data: {
        gameId: 'game-1',
        lineups: [{
          sideId: 'side-home',
          // 이 describe는 라인업 게이트(UX 감사 item 2)가 아니라 피리어드
          // 생명주기를 검증한다 — 제출된 라인업이 있는 정상 상태를 기본값으로
          // 둔다(없으면 SCHEDULED 테스트에서 "경기를 시작해 주세요." 대신
          // "라인업을 제출해야" 배너가 대신 뜬다).
          state: 'SUBMITTED',
          invalidatedAt: null,
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
    periodDurations?: Array<{ durationMinutes: number; extraTime: boolean } | null>,
  ) {
    testFixtures.game.mockReturnValue({
      data: {
        id: 'game-1', state, version: 2, lastSequence: 1,
        periods: periods.map((period) => ({
          id: `period-${period.number}`,
          gameId: 'game-1',
          pausedTotalMs: 0,
          pausedAt: null,
          ...period,
        })),
        sides: [
          {
            id: 'side-home', gameId: 'game-1', sideKey: 'HOME', teamId: 'team-home',
            displayNameSnapshot: '강남 풋살 클럽', createdAt: '', updatedAt: '',
          },
          {
            id: 'side-away', gameId: 'game-1', sideKey: 'AWAY', teamId: 'team-away',
            displayNameSnapshot: '성수 풋살 클럽', createdAt: '', updatedAt: '',
          },
        ],
        lineups: [],
        periodDurations,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 2, state } }));
  }

  // G6-V3 — 시작 전엔 패드가 전부 비활성이라 자리만 차지해 폰에서 킥오프 준비를 첫 화면 밖으로 밀었다.
  // 하프타임처럼 뛰는 도중 잠시 막히는 패드는 그대로 보인다(아래 '하프타임' 참고).
  it('시작 전에는 이벤트 패드와 팀 파울 줄 없이 시작 안내만 보인다', () => {
    gameWithPeriods('SCHEDULED', [
      { number: 1, state: 'SCHEDULED', startedAt: null, endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);

    render(<CoreHarness />);

    expect(screen.getByText('경기를 시작해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^골/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^파울/ })).toBeNull();
    expect(screen.queryByRole('group', { name: /팀 파울/ })).toBeNull();
  });

  it('모든 피리어드가 끝났으면 마지막 완료 피리어드의 팀 파울을 보여준다', () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'ENDED', startedAt: '2026-08-07T00:20:00.000Z', endedAt: '2026-08-07T00:40:00.000Z' },
    ]);
    testFixtures.operations.mockReturnValue(
      consoleState({
        liveEvents: [{
          id: 'foul-period-2', gameId: 'game-1', sequence: 1, clientEventId: 'foul-client-1',
          payloadHash: 'foul-hash', type: 'FOUL', sideId: 'side-away', participantId: null,
          assistParticipantId: null, period: 2, clockMs: 30_000,
          occurredAt: '2026-08-07T00:30:00.000Z', receivedAt: '2026-08-07T00:30:00.000Z',
          actorUserId: 'actor-1', reversesEventId: null, payload: {},
        } as GameEventRecord],
      }),
    );

    render(<CoreHarness />);

    const foulGroup = screen.getByRole('group', { name: '2피리어드 팀 파울' });
    expect(foulGroup).toHaveTextContent('파울 1');
  });

  it('1피리어드가 진행 중이고 다음 피리어드가 있으면 "전반 종료" 버튼을 보여주고 액션을 허용한다', async () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);

    render(<CoreHarness />);

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
    expect(testFixtures.operations().submitEvent).not.toHaveBeenCalled();

    // 확인해야만(취소가 아니라) submitEvent가 골 이벤트로 정확히 한 번
    // 호출되고 모달이 닫힌다 — "확인하면 정확히 한 번만 기록된다" 요구사항.
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '골 기록' }));
    await waitFor(() =>
      expect(testFixtures.operations().submitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GOAL', participantId: 'p-1', sideId: 'side-home' }),
      ),
    );
    expect(testFixtures.operations().submitEvent).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('레드카드가 기록된(되돌리지 않은) 선수만 선수 목록에 퇴장으로 넘긴다', () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);
    const card = (sequence: number, participantId: string, color: 'RED' | 'YELLOW'): GameEventRecord =>
      ({ ...goal(sequence), type: 'CARD', participantId, payload: { card: color } }) as GameEventRecord;
    const undoneRed = card(2, 'p-2', 'RED');
    testFixtures.operations.mockReturnValue(
      consoleState({
        liveEvents: [
          card(1, 'p-1', 'RED'),
          undoneRed,
          { ...goal(3), type: 'CORRECTION', participantId: 'p-2', reversesEventId: undoneRed.id, payload: {} } as GameEventRecord,
          card(4, 'p-3', 'YELLOW'),
        ],
      }),
    );
    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: /^골/ }));

    expect(within(screen.getByRole('dialog')).getByTestId('sent-off-ids')).toHaveTextContent(/^p-1$/);
  });

  it('서버 확정 전(대기 중)인 레드카드 선수도 선수 목록에 퇴장으로 넘긴다', () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);
    const queuedRed = (clientEventId: string, participantId: string, status: 'queued' | 'failed') => ({
      clientEventId,
      gameId: 'game-1',
      expectedVersion: 1,
      event: { type: 'CARD', participantId, period: 1, clockMs: 0, occurredAt: '', payload: { card: 'RED' } },
      payloadHash: 'h',
      status,
      queuedAt: '',
      attempts: 0,
      lastError: null,
      ackedSequence: null,
      ackedVersion: null,
    });
    testFixtures.operations.mockReturnValue(
      consoleState({ queue: { items: [queuedRed('c-1', 'p-1', 'queued'), queuedRed('c-2', 'p-2', 'failed')] } }),
    );
    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: /^골/ }));

    expect(within(screen.getByRole('dialog')).getByTestId('sent-off-ids')).toHaveTextContent(/^p-1$/);
  });

  it('골 확인 모달에서 취소하면 아무것도 기록되지 않는다', async () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);

    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: /^골/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    const confirmDialog = await screen.findByRole('dialog');

    fireEvent.click(within(confirmDialog).getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(testFixtures.operations().submitEvent).not.toHaveBeenCalled();
  });

  describe('두 번째 옐로 — 레드 기록 확인 시트 (MD-QA #81)', () => {
    function yellow(sequence: number, participantId: string | null, overrides: Partial<GameEventRecord> = {}): GameEventRecord {
      return { ...goal(sequence), type: 'CARD', participantId, payload: { card: 'YELLOW' }, ...overrides } as GameEventRecord;
    }

    async function recordYellow(liveEvents: GameEventRecord[]) {
      gameWithPeriods('LIVE', [
        { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
        { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
      ]);
      // 방금 적재한 옐로(q-1)는 이미 서버에 확정된 상태 — 레드는 옐로가 확정된 뒤에만 적재된다.
      const state = consoleState({ liveEvents, queue: { items: [queuedYellow('acked')] } });
      state.submitEvent.mockResolvedValue('q-1');
      testFixtures.operations.mockReturnValue(state);
      render(<CoreHarness />);
      fireEvent.click(screen.getByRole('button', { name: /^옐로카드/ }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '옐로카드 기록' }));
      return state.submitEvent;
    }

    function queuedYellow(status: QueuedGameEvent['status']): QueuedGameEvent {
      return {
        clientEventId: 'q-1', gameId: 'game-1', expectedVersion: 2, status,
        event: { type: 'CARD', sideId: SIDE_ID, participantId: 'p-1', period: 1, clockMs: 1, occurredAt: '', payload: { card: 'YELLOW' } },
        payloadHash: 'h', queuedAt: '', attempts: 0, lastError: null, ackedSequence: null, ackedVersion: null,
      };
    }

    it('같은 선수의 두 번째 옐로를 기록하면 레드도 기록할지 묻고, 확인하면 레드를 한 번 더 기록한다', async () => {
      const submitEvent = await recordYellow([yellow(1, 'p-1')]);

      const sheet = await screen.findByRole('dialog');
      expect(sheet).toHaveTextContent('정우진이 이 경기에서 옐로 2장이에요');
      expect(sheet).toHaveTextContent('경고 누적 퇴장으로 레드카드도 기록할까요?');
      // 옐로 자체는 시트가 뜨기 전에 이미 기록 요청이 나갔다.
      expect(submitEvent).toHaveBeenCalledTimes(1);
      expect(submitEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'CARD', participantId: 'p-1', payload: { card: 'YELLOW' } }));

      fireEvent.click(within(sheet).getByRole('button', { name: '레드도 기록' }));

      await waitFor(() => expect(submitEvent).toHaveBeenCalledTimes(2));
      expect(submitEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: 'CARD', participantId: 'p-1', sideId: 'side-home', payload: { card: 'RED' } }),
      );
    });

    it('앞선 옐로가 아직 전송 중이면 확정될 때까지 기다렸다가 레드를 기록한다(같은 버전으로 둘을 적재하면 서버가 거절한다)', async () => {
      const pendingYellowItem: QueuedGameEvent = {
        clientEventId: 'q-1', gameId: 'game-1', expectedVersion: 2, status: 'sending',
        event: { type: 'CARD', sideId: SIDE_ID, participantId: 'p-1', period: 1, clockMs: 1, occurredAt: '', payload: { card: 'YELLOW' } },
        payloadHash: 'h', queuedAt: '', attempts: 0, lastError: null, ackedSequence: null, ackedVersion: null,
      };
      gameWithPeriods('LIVE', [
        { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
        { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
      ]);
      const state = consoleState({ liveEvents: [yellow(1, 'p-1')] });
      state.submitEvent.mockResolvedValue('q-1');
      testFixtures.operations.mockReturnValue(state);
      const { rerender } = render(<CoreHarness />);
      fireEvent.click(screen.getByRole('button', { name: /^옐로카드/ }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '옐로카드 기록' }));
      const redButton = await screen.findByRole('button', { name: '레드도 기록' });
      // 시트가 떠 있는 동안 방금 기록한 옐로가 큐에서 전송 중이다.
      const sending = consoleState({ liveEvents: [yellow(1, 'p-1')], queue: { items: [pendingYellowItem] }, submitEvent: state.submitEvent });
      testFixtures.operations.mockReturnValue(sending);
      rerender(<CoreHarness />);
      fireEvent.click(redButton);

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(state.submitEvent).toHaveBeenCalledTimes(1);

      const acked = consoleState({
        liveEvents: [yellow(1, 'p-1'), yellow(2, 'p-1')],
        queue: { items: [{ ...pendingYellowItem, status: 'acked' }] },
        gameSnapshot: { version: 3, state: 'LIVE' },
        submitEvent: state.submitEvent,
      });
      testFixtures.operations.mockReturnValue(acked);
      rerender(<CoreHarness />);

      await waitFor(() => expect(state.submitEvent).toHaveBeenCalledTimes(2));
      expect(state.submitEvent).toHaveBeenLastCalledWith(expect.objectContaining({ payload: { card: 'RED' } }));
    });

    it('옐로 기록이 실패하면 레드를 적재하지 않고 다시 보내라고 안내한다 — 레드만 남거나 순서가 뒤집히지 않게', async () => {
      gameWithPeriods('LIVE', [
        { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
        { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
      ]);
      const state = consoleState({ liveEvents: [yellow(1, 'p-1')] });
      state.submitEvent.mockResolvedValue('q-1');
      testFixtures.operations.mockReturnValue(state);
      const { rerender } = render(<CoreHarness />);
      fireEvent.click(screen.getByRole('button', { name: /^옐로카드/ }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '옐로카드 기록' }));
      const redButton = await screen.findByRole('button', { name: '레드도 기록' });
      testFixtures.operations.mockReturnValue(
        consoleState({ liveEvents: [yellow(1, 'p-1')], queue: { items: [queuedYellow('sending')] }, submitEvent: state.submitEvent }),
      );
      rerender(<CoreHarness />);
      fireEvent.click(redButton);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

      testFixtures.operations.mockReturnValue(
        consoleState({ liveEvents: [yellow(1, 'p-1')], queue: { items: [queuedYellow('failed')] }, submitEvent: state.submitEvent }),
      );
      rerender(<CoreHarness />);

      expect(await screen.findByText('옐로 기록이 실패했어요. 옐로를 다시 보낸 뒤 레드를 기록해 주세요.')).toBeInTheDocument();
      expect(state.submitEvent).toHaveBeenCalledTimes(1);
      expect(state.submitEvent).not.toHaveBeenCalledWith(expect.objectContaining({ payload: { card: 'RED' } }));
    });

    it('"옐로만 둘게요"를 고르면 레드를 기록하지 않는다', async () => {
      const submitEvent = await recordYellow([yellow(1, 'p-1')]);

      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '옐로만 둘게요' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(submitEvent).toHaveBeenCalledTimes(1);
    });

    it('첫 옐로·다른 선수의 옐로·이미 레드가 있는 선수에게는 시트를 띄우지 않는다', async () => {
      for (const liveEvents of [
        [],
        [yellow(1, 'p-2')],
        [yellow(1, 'p-1'), yellow(2, 'p-1', { payload: { card: 'RED' } })],
      ]) {
        const submitEvent = await recordYellow(liveEvents);
        await waitFor(() => expect(submitEvent).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        cleanup();
      }
    });
  });

  // 종료 흐름 개편(사용자 결정 2) — 예전엔 마지막 피리어드가 LIVE인 동안
  // "경기 종료" 버튼 하나뿐이었고, 그 한 번의 클릭이 피리어드 닫기·게임
  // ENDED·스코어 산출·결과 리비전 제출을 한 트랜잭션에서 다 했다. 이제
  // 마지막 피리어드도 "후반 종료"로 먼저 닫고, "경기 종료"는 그다음
  // 단계에서만 보인다.
  it('마지막 피리어드가 진행 중이면 주 조작은 "후반 종료"이고, "경기 종료"는 주 조작 줄에 없다', () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'LIVE', startedAt: '2026-08-07T00:25:00.000Z', endedAt: null },
    ]);

    render(<CoreHarness />);

    expect(screen.getByRole('button', { name: '후반 종료' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
    expect(screen.queryByRole('button', { name: '전반 종료' })).toBeNull();
  });

  describe('단판(정규 피리어드 1개)', () => {
    const live = [{ number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null }];

    it('진행 버튼은 "정규 시간 종료"이고 "전반 종료"는 없다', () => {
      gameWithPeriods('LIVE', live, [{ durationMinutes: 40, extraTime: false }]);
      render(<CoreHarness />);
      expect(screen.getByRole('button', { name: '정규 시간 종료' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '전반 종료' })).toBeNull();
    });

    it('시계 옆에 "전반" 라벨이 없고 진행 단계는 "경기 · 종료"다', () => {
      gameWithPeriods('LIVE', live, [{ durationMinutes: 40, extraTime: false }]);
      render(<CoreHarness />);
      expect(screen.queryByText('전반')).toBeNull();
      expect(screen.getByText('경기')).toBeInTheDocument();
    });

    it('연장 피리어드 행이 있어도 정규 1개면 단판이다', () => {
      gameWithPeriods(
        'LIVE',
        [...live, { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null }],
        [{ durationMinutes: 40, extraTime: false }, { durationMinutes: 5, extraTime: true }],
      );
      render(<CoreHarness />);
      expect(screen.getByRole('button', { name: '정규 시간 종료' })).toBeInTheDocument();
    });
  });

  // 마지막 피리어드 종료는 되돌릴 수 없다(서버 revert-period는 되감을 "다음
  // 피리어드"를 전제한다). 확인 문구가 그 사실을 말해야 하고, 성공 후에도
  // 실패가 예정된 "되돌리기" 토스트를 붙이면 안 된다.
  it('"후반 종료"는 되돌릴 수 없다고 알린 뒤 end-period를 보내고, 되돌리기 토스트를 붙이지 않는다', async () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'LIVE', startedAt: '2026-08-07T00:25:00.000Z', endedAt: null },
    ]);
    testFixtures.sendCommand.mockResolvedValue(gameMutationResult('LIVE'));

    render(<CoreHarness />);
    fireEvent.click(screen.getByRole('button', { name: '후반 종료' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('되돌릴 수 없어요');
    fireEvent.click(within(dialog).getByRole('button', { name: '후반 종료' }));

    await waitFor(() =>
      expect(testFixtures.sendCommand).toHaveBeenCalledWith('game-1', 'end-period', expect.anything(), COMMAND_OPTIONS),
    );
    // 전반 종료에는 붙는 되돌리기 토스트가 여기서는 붙지 않는다.
    await waitFor(() => expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull());
  });

  // 이슈 #375 — "전반 종료" 버튼 라벨은 그대로지만 실제로 서버에 보내는
  // 커맨드는 구 fused `next-period`가 아니라 새로 분리된 `end-period`여야
  // 한다(라벨과 동작을 일치시키는 것이 이슈의 핵심).
  it('"전반 종료"를 누르면 확인 모달을 거쳐 sendCommand가 end-period로 호출된다', async () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);
    testFixtures.sendCommand.mockResolvedValue(gameMutationResult('LIVE'));

    render(<CoreHarness />);
    fireEvent.click(screen.getByRole('button', { name: '전반 종료' }));

    // 사용자 결정("예외 없이 전부")으로 end-period도 이제 확인을 거친다.
    const dialog = await screen.findByRole('dialog');
    expect(testFixtures.sendCommand).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '전반 종료' }));

    await waitFor(() =>
      expect(testFixtures.sendCommand).toHaveBeenCalledWith('game-1', 'end-period', expect.anything(), COMMAND_OPTIONS),
    );
  });

  it('an older fixture response cannot clear a newer fixture command pending state', async () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);
    let resolveOldCommand!: (result: GameCommandResult) => void;
    let resolveNewCommand!: (result: GameCommandResult) => void;
    const oldCommandResponse = new Promise<GameCommandResult>((resolve) => {
      resolveOldCommand = resolve;
    });
    const newCommandResponse = new Promise<GameCommandResult>((resolve) => {
      resolveNewCommand = resolve;
    });
    testFixtures.sendCommand.mockReturnValueOnce(oldCommandResponse).mockReturnValueOnce(newCommandResponse);

    const view = render(<CoreHarness />);
    fireEvent.click(screen.getByRole('button', { name: '전반 종료' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '전반 종료' }));
    await waitFor(() => expect(testFixtures.sendCommand).toHaveBeenCalledTimes(1));

    view.rerender(<CoreHarness fixtureId="f-2" />);
    fireEvent.click(screen.getByRole('button', { name: '전반 종료' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '전반 종료' }));
    await waitFor(() => expect(testFixtures.sendCommand).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: '전반 종료' })).toHaveAttribute('aria-busy', 'true');

    await act(async () => {
      resolveOldCommand(gameMutationResult('LIVE'));
      await oldCommandResponse;
    });

    expect(screen.getByRole('button', { name: '전반 종료' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '전반 종료' })).toBeDisabled();

    await act(async () => {
      resolveNewCommand(gameMutationResult('LIVE'));
      await newCommandResponse;
    });
    expect(screen.getByRole('button', { name: '전반 종료' })).toBeEnabled();
  });

  // 종료 흐름 개편 요구사항 1 — 전반 종료는 확인 게이트 없이 실행되면 안
  // 된다(예전 전제였던 "되돌릴 수 있으니 즉시 실행"은 사실이 아니다:
  // 후반에 기록이 하나라도 생기면 서버가 되돌리기를 거부한다).
  it('"전반 종료" 확인 모달에서 취소하면 아무 명령도 나가지 않는다', async () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ]);
    testFixtures.sendCommand.mockResolvedValue(gameMutationResult('LIVE'));

    render(<CoreHarness />);
    fireEvent.click(screen.getByRole('button', { name: '전반 종료' }));

    const dialog = await screen.findByRole('dialog');
    expect(testFixtures.sendCommand).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(testFixtures.sendCommand).not.toHaveBeenCalled();
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
      render(<CoreHarness />);

      expect(screen.getByRole('button', { name: '후반 시작' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument();
      // 조기 정상 종료는 주 조작 줄이 아니라 ⋯ 더보기 시트 안에 있다.
      expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
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
    testFixtures.sendCommand.mockResolvedValue(gameMutationResult('LIVE'));
      render(<CoreHarness />);

      fireEvent.click(screen.getByRole('button', { name: '후반 시작' }));

      // 사용자 결정("예외 없이 전부")으로 start-period도 이제 확인을 거친다.
      const dialog = await screen.findByRole('dialog');
      expect(testFixtures.sendCommand).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: '후반 시작' }));

      await waitFor(() =>
        expect(testFixtures.sendCommand).toHaveBeenCalledWith('game-1', 'start-period', expect.anything(), COMMAND_OPTIONS),
      );
    });

    it('"되돌리기"를 누르면 확인 없이 곧장 revert-period를 보낸다', async () => {
      gameAtHalftime();
      testFixtures.sendCommand.mockResolvedValue(gameMutationResult('LIVE'));
      render(<CoreHarness />);

      fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));

      // UX 감사 item 3 — end/전반종료와 달리 되돌리기는 그 자체가 이미
      // 교정 행동이라 확인 다이얼로그를 거치지 않는다.
      expect(screen.queryByRole('dialog')).toBeNull();
      await waitFor(() =>
        expect(testFixtures.sendCommand).toHaveBeenCalledWith('game-1', 'revert-period', expect.anything(), COMMAND_OPTIONS),
      );
    });
  });

  // Task 180 G6(F69) — 자주 누르는 "전반 종료" 곁에 되돌릴 수 없는 "경기 종료"가 있던 배치를
  // 없앴다. 정규 시간이 끝나기 전의 종료 계열은 ⋯ 시트 안에만 있다.
  describe('조기 종료는 ⋯ 더보기 시트 안에만 있다', () => {
    const FIRST_HALF = [
      { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ];
    const REGULATION_ENDED = [
      { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'ENDED', startedAt: '2026-08-07T00:25:00.000Z', endedAt: '2026-08-07T00:45:00.000Z' },
    ];

    it('전반 중에는 헤더에 "경기 종료"·"몰수·중단으로 종료"가 없고, ⋯ 시트 안에 둘 다 있다', () => {
      gameWithPeriods('LIVE', FIRST_HALF);
      render(<CoreHarness />);

      expect(screen.getByRole('button', { name: '전반 종료' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
      expect(screen.queryByRole('button', { name: /몰수·중단으로 종료/ })).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: '더보기' }));
      const sheet = screen.getByRole('dialog', { name: '경기 더보기' });
      expect(within(sheet).getByRole('button', { name: /^경기 종료/ })).toBeEnabled();
      expect(within(sheet).getByRole('button', { name: /^몰수·중단으로 종료/ })).toBeEnabled();
    });

    it('시트에서 "경기 종료"를 고르면 시트는 닫히고 확인 창이 하나만 뜨며, 확인해야 end 를 보낸다', async () => {
      gameWithPeriods('LIVE', FIRST_HALF);
      testFixtures.sendCommand.mockResolvedValue(gameRevisionMutationResult('ENDED'));
      render(<CoreHarness />);

      fireEvent.click(screen.getByRole('button', { name: '더보기' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^경기 종료/ }));

      const confirmDialog = await screen.findByRole('dialog');
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(confirmDialog).not.toHaveAccessibleName('경기 더보기');
      expect(testFixtures.sendCommand).not.toHaveBeenCalled();

      fireEvent.click(within(confirmDialog).getByRole('button', { name: '경기 종료' }));
      await waitFor(() =>
        expect(testFixtures.sendCommand).toHaveBeenCalledWith('game-1', 'end', expect.anything(), COMMAND_OPTIONS),
      );
    });

    it('시트에서 "몰수·중단으로 종료"를 고르면 사유 입력 창이 열린다', () => {
      gameWithPeriods('LIVE', FIRST_HALF);
      render(<CoreHarness />);

      fireEvent.click(screen.getByRole('button', { name: '더보기' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^몰수·중단으로 종료/ }));

      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByRole('dialog', { name: '몰수·중단으로 종료' })).toBeInTheDocument();
    });

    it('일시 중지 중에도 "경기 종료"는 헤더가 아니라 시트 안에 있다', () => {
      gameWithPeriods('LIVE', FIRST_HALF);
      testFixtures.game.mockReturnValue({
        ...testFixtures.game(),
        data: { ...testFixtures.game().data, state: 'PAUSED' },
      });
      testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 2, state: 'PAUSED' } }));
      render(<CoreHarness />);

      expect(screen.getByRole('button', { name: '재개' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: '더보기' }));
      expect(within(screen.getByRole('dialog')).getByRole('button', { name: /^경기 종료/ })).toBeInTheDocument();
    });

    it('정규 시간 종료 뒤의 "경기 종료"는 헤더 주 버튼이고, 시트에는 몰수·중단만 남는다', () => {
      gameWithPeriods('LIVE', REGULATION_ENDED);
      render(<CoreHarness />);

      expect(screen.getByRole('button', { name: '경기 종료' })).toBeEnabled();

      fireEvent.click(screen.getByRole('button', { name: '더보기' }));
      const sheet = screen.getByRole('dialog', { name: '경기 더보기' });
      expect(within(sheet).queryByRole('button', { name: /^경기 종료/ })).toBeNull();
      expect(within(sheet).getByRole('button', { name: /^몰수·중단으로 종료/ })).toBeInTheDocument();
    });

    it('조작할 명령이 없는 경기(종료됨)에는 조작 줄과 ⋯ 가 없다', () => {
      gameWithPeriods('LIVE', REGULATION_ENDED);
      testFixtures.game.mockReturnValue({
        ...testFixtures.game(),
        data: { ...testFixtures.game().data, state: 'ENDED' },
      });
      testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 3, state: 'ENDED' } }));
      render(<CoreHarness />);

      expect(screen.queryByRole('button', { name: '더보기' })).toBeNull();
      expect(screen.queryByRole('group', { name: '경기 진행 조작' })).toBeNull();
    });
  });

  describe('킥오프 체크리스트 렌더 계약', () => {
    it('경기 시작 전에는 팀 명단을 기본 조회 상태로 보여주고 전원 도착은 없다', () => {
      gameWithPeriods('SCHEDULED', []);
      testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 1, state: 'SCHEDULED' } }));
      render(<CoreHarness />);
      expect(screen.getByRole('region', { name: '킥오프 준비' })).toHaveTextContent('이번 경기 출전 명단');
      expect(screen.queryByRole('button', { name: /전원 도착/ })).toBeNull();
      expect(screen.queryByRole('checkbox')).toBeNull();
    });

    it('경기가 시작된 뒤에는 출전 명단 편집 영역이 없다', () => {
      gameWithPeriods('LIVE', [{ number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null }]);
      render(<CoreHarness />);
      expect(screen.queryByRole('region', { name: '킥오프 준비' })).toBeNull();
      expect(screen.queryByRole('button', { name: /명단 수정하기/ })).toBeNull();
    });
  });
  // Task 180 G6(C-2) — 헤더의 진행 단계 스트립: 전반 · 하프타임 · 후반 · 종료 (끝난 뒤엔 예정 · 진행 · 결과 확인 · 확정).
  describe('진행 단계 스트립', () => {
    const strip = () => screen.queryByRole('list', { name: '경기 진행 단계' });
    const current = () => {
      const list = strip();
      return list === null ? null : within(list).getByText((_, el) => el?.getAttribute('aria-current') === 'step').textContent;
    };

    it('전반이 뛰는 중이면 전반이 현재 단계다', () => {
      gameWithPeriods('LIVE', [
        { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
        { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
      ]);
      render(<CoreHarness />);

      expect(within(strip() as HTMLElement).getAllByRole('listitem').filter((el) => el.textContent).map((el) => el.textContent)).toEqual([
        '전반', '하프타임', '후반', '종료',
      ]);
      expect(current()).toBe('전반');
    });

    it('하프타임 중이면 하프타임이, 후반 중이면 후반이 현재 단계다', () => {
      gameWithPeriods('LIVE', [
        { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
        { number: 2, state: 'HALFTIME', startedAt: null, endedAt: null },
      ]);
      const { unmount } = render(<CoreHarness />);
      expect(current()).toBe('하프타임');
      unmount();

      gameWithPeriods('LIVE', [
        { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
        { number: 2, state: 'LIVE', startedAt: '2026-08-07T00:25:00.000Z', endedAt: null },
      ]);
      render(<CoreHarness />);
      expect(current()).toBe('후반');
    });

    it('정규 시간이 끝나 경기 종료만 남았으면 종료가 현재 단계다', () => {
      gameWithPeriods('LIVE', [
        { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
        { number: 2, state: 'ENDED', startedAt: '2026-08-07T00:25:00.000Z', endedAt: '2026-08-07T00:45:00.000Z' },
      ]);
      render(<CoreHarness />);

      expect(current()).toBe('종료');
    });

    it('끝난 경기는 결과 단계 스트립으로 바뀌고, 공식 결과가 서기 전에는 결과 확인이 현재다', () => {
      gameWithPeriods('LIVE', [
        { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
        { number: 2, state: 'ENDED', startedAt: '2026-08-07T00:25:00.000Z', endedAt: '2026-08-07T00:45:00.000Z' },
      ]);
      testFixtures.game.mockReturnValue({
        ...testFixtures.game(),
        data: { ...testFixtures.game().data, state: 'ENDED' },
      });
      testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 3, state: 'ENDED' } }));
      render(<CoreHarness />);

      expect(within(strip() as HTMLElement).getAllByRole('listitem').filter((el) => el.textContent).map((el) => el.textContent)).toEqual([
        '예정', '진행', '결과 확인', '확정',
      ]);
      expect(current()).toBe('결과 확인');
    });

    it('시작 전 경기에는 스트립이 없다 — 그 자리는 킥오프 준비가 맡는다', () => {
      gameWithPeriods('SCHEDULED', []);
      testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 1, state: 'SCHEDULED' } }));
      render(<CoreHarness />);

      expect(strip()).toBeNull();
    });
  });

  // Task 180 G6(F78) — 종료 직후 콘솔은 "287ms" 한 줄이 아니라 결과 확정 카드로 이어진다.
  describe('종료 직후 결과 확정 카드', () => {
    const REGULATION_ENDED = [
      { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'ENDED', startedAt: '2026-08-07T00:25:00.000Z', endedAt: '2026-08-07T00:45:00.000Z' },
    ];

    function endedGame(state: 'LIVE' | 'ENDED') {
      gameWithPeriods('LIVE', REGULATION_ENDED);
      testFixtures.game.mockReturnValue({
        ...testFixtures.game(),
        data: { ...testFixtures.game().data, state },
      });
      testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 3, state } }));
    }

    it('경기가 ENDED 이면 이 경기의 확정 카드를 콘솔 모드로 마운트한다', () => {
      endedGame('ENDED');
      render(<CoreHarness />);

      const card = screen.getByTestId('result-confirm-card');
      expect(card).toHaveAttribute('data-game-id', 'game-1');
    });

    // G6-V7 — 종료 뒤엔 기록할 수 없는 패드·팀 파울 줄이 확정 카드 아래 한 화면 가까이를 채웠다.
    it('경기가 ENDED 이면 이벤트 패드와 팀 파울 줄 없이 확정 카드와 기록 목록만 남는다', () => {
      endedGame('ENDED');
      render(<CoreHarness />);

      expect(screen.getByTestId('result-confirm-card')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^골/ })).toBeNull();
      expect(screen.queryByRole('group', { name: /팀 파울/ })).toBeNull();
      expect(screen.getByRole('list', { name: '기록된 이벤트 목록' })).toBeInTheDocument();
    });

    it('아직 끝나지 않은 경기(정규 시간 종료 직후 포함)에는 확정 카드가 없다', () => {
      endedGame('LIVE');
      render(<CoreHarness />);

      expect(screen.queryByTestId('result-confirm-card')).toBeNull();
    });

    it('명령 왕복 시간(ms)을 더 이상 보여주지 않는다', async () => {
      gameWithPeriods('LIVE', REGULATION_ENDED);
      testFixtures.sendCommand.mockResolvedValue(gameRevisionMutationResult('ENDED'));
      render(<CoreHarness />);

      fireEvent.click(screen.getByRole('button', { name: '경기 종료' }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '경기 종료' }));
      await waitFor(() => expect(testFixtures.sendCommand).toHaveBeenCalled());
      // 성공 뒤 재조회·상태 갱신까지 흘려보낸 다음에도 화면에 시간이 없어야 한다.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(screen.queryByText(/\d+\s*ms/)).toBeNull();
    });
  });

  // Task 180 G6 alpha 확인 후속 — V5(후반 ⋯)·V6(끊김과 겹친 재개가 표시 없이 사라짐).
  describe('후반 진행 중 조작과 연결 끊김', () => {
    const SECOND_HALF = [
      { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'LIVE', startedAt: '2026-08-07T00:25:00.000Z', endedAt: null },
    ];
    const HELD: Extract<OperationsContract['takeover'], { status: 'held' }> = {
      status: 'held', token: 'tok', expiresAtMs: Date.now() + 60000, assignmentVersion: 0,
    };

    function secondHalf(
      state: 'LIVE' | 'PAUSED',
      overrides: Record<string, unknown> = {},
      actorRole: string = 'tournament_director',
    ) {
      gameWithPeriods('LIVE', SECOND_HALF);
      testFixtures.game.mockReturnValue({ ...testFixtures.game(), data: { ...testFixtures.game().data, state, actorRole } });
      testFixtures.operations.mockReturnValue(
        consoleState({ gameSnapshot: { version: 2, state }, takeover: HELD, ...overrides }),
      );
    }

    /** 일시 중지 상태에서 재개 확인 창을 연 뒤, 창이 떠 있는 동안 콘솔 상태를 바꾸고 확인을 누른다. */
    async function confirmResumeAfter(change: Record<string, unknown>, actorRole?: string) {
      secondHalf('PAUSED', {}, actorRole);
      const view = render(<CoreHarness />);
      fireEvent.click(screen.getByRole('button', { name: '재개' }));
      const dialog = await screen.findByRole('dialog');
      secondHalf('PAUSED', change, actorRole);
      view.rerender(<CoreHarness />);
      fireEvent.click(within(dialog).getByRole('button', { name: '재개' }));
    }

    it('후반이 뛰는 중에도 ⋯ 시트로 조기 종료와 몰수·중단 종료에 닿는다', () => {
      secondHalf('LIVE');
      render(<CoreHarness />);

      expect(screen.getByRole('button', { name: '후반 종료' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: '더보기' }));
      const sheet = screen.getByRole('dialog', { name: '경기 더보기' });
      expect(within(sheet).getByRole('button', { name: /^경기 종료/ })).toBeEnabled();
      expect(within(sheet).getByRole('button', { name: /^몰수·중단으로 종료/ })).toBeEnabled();
    });

    it('연결이 끊긴 동안에는 재개와 ⋯ 을 잠그고 다시 연결하는 중이라고 알리되, 이벤트 기록은 막지 않는다', () => {
      secondHalf('PAUSED', { connectionStatus: 'disconnected' });
      render(<CoreHarness />);

      expect(screen.getByRole('button', { name: '재개' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '더보기' })).toBeDisabled();
      expect(screen.getByText(/실시간 연결이 끊겨 다시 연결하는 중이에요/)).toBeInTheDocument();
      // 골·카드는 이 기기 큐에 모였다가 연결되면 나간다 — 잠그는 건 진행 명령뿐이다.
      expect(screen.getByRole('button', { name: /^골/ })).toBeEnabled();
    });

    it('확인 창이 떠 있는 사이 연결이 끊기면 재개를 보내지 않고, 보내지 않았다고 알린다', async () => {
      await confirmResumeAfter({ connectionStatus: 'disconnected' });

      expect(
        await screen.findByText('실시간 연결이 끊겨 있어 ‘재개’ 요청을 보내지 않았어요. 연결되면 다시 눌러 주세요.'),
      ).toBeInTheDocument();
      expect(testFixtures.sendCommand).not.toHaveBeenCalled();
    });

    it('확인 창이 떠 있는 사이 운영 권한이 만료되면 재개를 보내지 않고, 그 이유를 알린다', async () => {
      await confirmResumeAfter({ takeover: { status: 'expired' } });

      expect(
        await screen.findByText('운영 권한을 다시 확인하는 중이라 ‘재개’ 요청을 보내지 않았어요. 권한을 받으면 다시 눌러 주세요.'),
      ).toBeInTheDocument();
      expect(testFixtures.sendCommand).not.toHaveBeenCalled();
    });

    it('확인 창이 떠 있는 사이 운영 권한이 다시 발급되면 창을 열 때의 토큰이 아니라 새 토큰으로 보낸다', async () => {
      testFixtures.sendCommand.mockResolvedValue(gameMutationResult('LIVE'));
      await confirmResumeAfter({ takeover: { ...HELD, token: 'tok-2' } });

      await waitFor(() => expect(testFixtures.sendCommand).toHaveBeenCalledTimes(1));
      expect(testFixtures.sendCommand.mock.calls[0][1]).toBe('resume');
      expect(testFixtures.sendCommand.mock.calls[0][2]).toEqual(expect.objectContaining({ takeoverToken: 'tok-2' }));
    });

    // 2026-10-01 사용자 결정 — 어드민은 언제든 고칠 수 있어야 한다. 현장 스태프의 잠금(위)은 그대로다.
    describe('플랫폼 운영자는 연결이 끊긴 동안에도', () => {
      it('재개와 ⋯ 을 쓸 수 있고, 잠그지 않는다고 알린다', () => {
        secondHalf('PAUSED', { connectionStatus: 'disconnected' }, 'platform_ops');
        render(<CoreHarness />);

        expect(screen.getByRole('button', { name: '재개' })).toBeEnabled();
        expect(screen.getByRole('button', { name: '더보기' })).toBeEnabled();
        expect(screen.getByText(/진행 버튼은 그대로 쓸 수 있고, 보낸 명령은 서버 기준으로 반영돼요/)).toBeInTheDocument();
        expect(screen.queryByText(/진행 버튼은 잠겨요/)).toBeNull();
      });

      it('확인 창이 떠 있는 사이 끊겨도 들고 있던 토큰으로 재개를 보낸다', async () => {
        testFixtures.sendCommand.mockResolvedValue(gameMutationResult('LIVE'));
        await confirmResumeAfter({ connectionStatus: 'disconnected' }, 'platform_ops');

        await waitFor(() => expect(testFixtures.sendCommand).toHaveBeenCalledTimes(1));
        expect(testFixtures.sendCommand.mock.calls[0][1]).toBe('resume');
        expect(testFixtures.sendCommand.mock.calls[0][2]).toEqual(expect.objectContaining({ takeoverToken: 'tok' }));
      });

      // 토큰 갱신은 소켓으로만 된다 — 끊긴 채 만료되면 서버가 거절하므로 보내지 않고 이유를 보인다.
      it('끊긴 사이 운영 권한이 만료되면 진행 버튼을 잠그고 그 이유를 알린다', () => {
        secondHalf('PAUSED', { connectionStatus: 'disconnected', takeover: { status: 'expired' } }, 'platform_ops');
        render(<CoreHarness />);

        expect(screen.getByRole('button', { name: '재개' })).toBeDisabled();
        expect(screen.getByText('연결이 끊긴 사이 운영 권한이 만료돼 진행 명령을 보낼 수 없어요. 다시 연결되면 권한을 새로 받아요.')).toBeInTheDocument();
      });

      it('확인 창이 떠 있는 사이 끊기고 권한까지 만료되면 보내지 않고 그 이유를 알린다', async () => {
        await confirmResumeAfter({ connectionStatus: 'disconnected', takeover: { status: 'expired' } }, 'platform_ops');

        expect(
          await screen.findByText('연결이 끊긴 사이 운영 권한이 만료돼 ‘재개’ 요청을 보내지 않았어요. 다시 연결되면 권한을 새로 받아요.'),
        ).toBeInTheDocument();
        expect(testFixtures.sendCommand).not.toHaveBeenCalled();
      });
    });

    // 망이 먹통이면 fetch 가 끝나지 않아 버튼이 "처리 중"에 멈춘다 — 끊겨도 실패로 드러나야 다시 보낼 수 있다.
    it('응답 없이 걸린 재개는 제한 시간이 지나면 재시도로 드러나고, 재시도는 같은 요청 본문을 다시 보낸다', async () => {
      vi.useFakeTimers();
      try {
        secondHalf('PAUSED');
        testFixtures.sendCommand
          .mockImplementationOnce((...[, , , options]: Parameters<OperateConsoleRuntime['postGameCommand']>) =>
            new Promise<GameCommandResult>((_resolve, reject) => {
              if (options.signal === undefined) throw new Error('Expected command AbortSignal');
              options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
            }),
          )
          .mockResolvedValueOnce(gameMutationResult('LIVE'));
        render(<CoreHarness />);

        fireEvent.click(screen.getByRole('button', { name: '재개' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '재개' }));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(2_000);
        });
        expect(testFixtures.sendCommand).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('button', { name: '같은 요청 재시도' })).toBeNull();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(COMMAND_RESPONSE_TIMEOUT_MS);
        });
        expect(screen.getByText(/재개 요청의 서버 응답을 받지 못했어요/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '같은 요청 재시도' }));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });

        expect(testFixtures.sendCommand).toHaveBeenCalledTimes(2);
        // 같은 clientCommandId(=Idempotency-Key) — 첫 요청이 사실 처리됐다면 서버가 그 결과를 재생한다.
        expect(testFixtures.sendCommand.mock.calls[1][2]).toEqual(testFixtures.sendCommand.mock.calls[0][2]);
        expect(testFixtures.operations().applyCommandResult).toHaveBeenCalledWith(
          expect.objectContaining({ state: 'LIVE', version: 3 }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    describe('재시도 사이 운영 권한이 다시 발급되거나 시간이 흐르면', () => {
      const hangUntilAbort: OperateConsoleRuntime['postGameCommand'] = (...[, , , options]) =>
        new Promise<GameCommandResult>((_resolve, reject) => {
          if (options.signal === undefined) throw new Error('Expected command AbortSignal');
          options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      const rejected = (statusCode: number, code: string, message: string) =>
        new V1ApiError({ status: 'error', timestamp: '', statusCode, code, message });
      const bodyOf = (call: number): GameCommandRequest => testFixtures.sendCommand.mock.calls[call][2];

      /** 첫 재개가 응답 없이 제한 시간을 넘긴 뒤, 콘솔 상태를 바꾸고 `waitMs` 만큼 지나 "같은 요청 재시도"를 누른다. */
      async function retryAfterTimeout(change: Record<string, unknown>, waitMs = 0) {
        secondHalf('PAUSED');
        const view = render(<CoreHarness />);
        fireEvent.click(screen.getByRole('button', { name: '재개' }));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '재개' }));
        await act(async () => {
          // 확인 창이 닫히는 시간까지 넉넉히 더한다.
          await vi.advanceTimersByTimeAsync(COMMAND_RESPONSE_TIMEOUT_MS + 2_000 + waitMs);
        });
        secondHalf('PAUSED', change);
        view.rerender(<CoreHarness />);
        fireEvent.click(screen.getByRole('button', { name: '같은 요청 재시도' }));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
      }

      // 한 테스트가 남긴 Once 응답이 다음 테스트로 새지 않게, 기본 구현만 남기고 매번 비운다.
      let defaultImplementation: ReturnType<typeof testFixtures.sendCommand.getMockImplementation>;
      beforeEach(() => {
        vi.useFakeTimers();
        defaultImplementation = testFixtures.sendCommand.getMockImplementation();
        testFixtures.sendCommand.mockReset();
        testFixtures.sendCommand.mockImplementationOnce(hangUntilAbort);
      });
      afterEach(() => {
        vi.useRealTimers();
        testFixtures.sendCommand.mockReset();
        if (defaultImplementation) testFixtures.sendCommand.mockImplementation(defaultImplementation);
      });

      // 서버는 토큰까지 해시해 멱등을 가린다 — 토큰을 바꿔 보내면 저장된 결과가 재생되지 않고 409 가 된다.
      it('첫 요청이 이미 저장됐다면 새 토큰이 있어도 처음 본문 그대로 보내 서버가 결과를 재생하게 한다', async () => {
        testFixtures.sendCommand.mockResolvedValueOnce(gameMutationResult('LIVE', 3, true));
        await retryAfterTimeout({ takeover: { ...HELD, token: 'tok-2' } });

        expect(testFixtures.sendCommand).toHaveBeenCalledTimes(2);
        expect(bodyOf(1)).toEqual(bodyOf(0));
        expect(bodyOf(1).takeoverToken).toBe('tok');
        expect(testFixtures.operations().applyCommandResult).toHaveBeenCalledWith(
          expect.objectContaining({ state: 'LIVE', version: 3 }),
        );
      });

      it('처음 본문이 옛 토큰으로 거절되면 저장되지 않은 것이라, 같은 clientCommandId 에 새 토큰을 실어 한 번 더 보낸다', async () => {
        testFixtures.sendCommand
          .mockRejectedValueOnce(rejected(403, 'TAKEOVER_TOKEN_EXPIRED', 'A valid exclusive takeover token is required'))
          .mockResolvedValueOnce(gameMutationResult('LIVE'));
        await retryAfterTimeout({ takeover: { ...HELD, token: 'tok-2' } });

        expect(testFixtures.sendCommand).toHaveBeenCalledTimes(3);
        expect(bodyOf(1)).toEqual(bodyOf(0));
        // clientCommandId·expectedVersion·payload 는 그대로 — 새 명령이 아니라 같은 명령이다.
        expect(bodyOf(2)).toEqual({ ...bodyOf(0), takeoverToken: 'tok-2', occurredAt: expect.any(String) });
        expect(testFixtures.sendCommand.mock.calls[2][1]).toBe('resume');
        expect(testFixtures.operations().applyCommandResult).toHaveBeenCalledWith(
          expect.objectContaining({ state: 'LIVE', version: 3 }),
        );
        expect(screen.queryByRole('button', { name: '같은 요청 재시도' })).toBeNull();
        expect(screen.queryByText('A valid exclusive takeover token is required')).toBeNull();
      });

      // 새 토큰 본문이 저장됐을 수 있으니, 다음 재시도가 처음 본문을 보내면 서버는 재생 대신 409 를 낸다.
      it('새 토큰으로 다시 보낸 본문도 응답이 없으면, 다음 재시도는 그 새 본문을 그대로 보낸다', async () => {
        testFixtures.sendCommand
          .mockRejectedValueOnce(rejected(403, 'TAKEOVER_TOKEN_EXPIRED', 'A valid exclusive takeover token is required'))
          .mockImplementationOnce(hangUntilAbort)
          .mockResolvedValueOnce(gameMutationResult('LIVE', 3, true));
        await retryAfterTimeout({ takeover: { ...HELD, token: 'tok-2' } });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(COMMAND_RESPONSE_TIMEOUT_MS);
        });
        fireEvent.click(screen.getByRole('button', { name: '같은 요청 재시도' }));
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });

        expect(testFixtures.sendCommand).toHaveBeenCalledTimes(4);
        expect(bodyOf(2).takeoverToken).toBe('tok-2');
        expect(bodyOf(3)).toEqual(bodyOf(2));
        expect(testFixtures.operations().applyCommandResult).toHaveBeenCalledWith(
          expect.objectContaining({ state: 'LIVE', version: 3 }),
        );
      });

      it('서버 시각 허용 폭(30초)을 넘겨 처음 본문이 거절되면, 같은 clientCommandId 에 지금 시각을 실어 다시 보낸다', async () => {
        testFixtures.sendCommand
          .mockRejectedValueOnce(rejected(422, 'CLOCK_DRIFT', 'occurredAt has drifted from server time by more than 30 seconds'))
          .mockResolvedValueOnce(gameMutationResult('LIVE'));
        await retryAfterTimeout({}, 40_000);

        expect(testFixtures.sendCommand).toHaveBeenCalledTimes(3);
        const original = bodyOf(0);
        const resent = bodyOf(2);
        expect(resent).toEqual({ ...original, occurredAt: expect.any(String) });
        expect(Date.parse(String(resent.occurredAt)) - Date.parse(String(original.occurredAt))).toBeGreaterThanOrEqual(40_000);
      });

      it('토큰이 그대로인데 거절되면 권한을 잃은 것이라 다시 보내지 않고, 거절 사유를 보여 준다', async () => {
        testFixtures.sendCommand.mockRejectedValueOnce(
          rejected(403, 'TAKEOVER_TOKEN_EXPIRED', 'A valid exclusive takeover token is required'),
        );
        await retryAfterTimeout({});

        expect(testFixtures.sendCommand).toHaveBeenCalledTimes(2);
        expect(screen.getByText('A valid exclusive takeover token is required')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '같은 요청 재시도' })).toBeNull();
      });
    });
  });
});

describe('OperateConsole — 선수 교체', () => {
  const LIVE_PERIOD = { id: 'period-1', gameId: 'game-1', number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null, pausedTotalMs: 0, pausedAt: null };
  const SUB_SIDES = [{ id: 'side-home', gameId: 'game-1', sideKey: 'HOME', teamId: null, displayNameSnapshot: '강남 풋살 클럽', createdAt: '', updatedAt: '' }];

  beforeEach(() => {
    testFixtures.auth.mockReturnValue({ data: { user: { id: 'user-1' } } });
    testFixtures.lineups.mockReturnValue({
      data: {
        gameId: 'game-1',
        lineups: [{
          sideId: 'side-home',
          state: 'SUBMITTED',
          invalidatedAt: null,
          revision: 1,
          participants: [
            { id: 'p-1', gameId: 'game-1', sideId: 'side-home', lineupId: 'l-1', displayNameSnapshot: '정우진', jerseyNumber: 10, position: null, positionX: null, positionY: null, started: true, createdAt: '', updatedAt: '' },
            { id: 'p-2', gameId: 'game-1', sideId: 'side-home', lineupId: 'l-1', displayNameSnapshot: '이민호', jerseyNumber: 7, position: null, positionX: null, positionY: null, started: false, createdAt: '', updatedAt: '' },
            { id: 'p-3', gameId: 'game-1', sideId: 'side-home', lineupId: 'l-1', displayNameSnapshot: '박서준', jerseyNumber: 3, position: null, positionX: null, positionY: null, started: false, createdAt: '', updatedAt: '' },
          ],
        }],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  function gameWithSubstitutionPolicy(
    substitutionPolicy: { mode: 'limited' | 'rolling'; maxSubstitutions: number | null },
    liveEvents: GameEventRecord[] = [],
  ) {
    testFixtures.game.mockReturnValue({
      data: { id: 'game-1', state: 'LIVE', version: 2, lastSequence: 1, periods: [LIVE_PERIOD], sides: SUB_SIDES, lineups: [], substitutionPolicy },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 2, state: 'LIVE' }, liveEvents }));
  }

  function substitutionEvent(id: string, sequence: number, inParticipantId: string, outParticipantId: string): GameEventRecord {
    return {
      id,
      gameId: 'game-1',
      sequence,
      clientEventId: `client-${id}`,
      payloadHash: `hash-${id}`,
      type: 'SUBSTITUTION',
      sideId: 'side-home',
      participantId: inParticipantId,
      assistParticipantId: null,
      period: 1,
      clockMs: sequence * 1000,
      occurredAt: '2026-08-07T00:00:00.000Z',
      receivedAt: '2026-08-07T00:00:00.000Z',
      actorUserId: 'user-1',
      reversesEventId: null,
      payload: { outParticipantId },
    };
  }

  it('"교체" 액션 버튼이 있고, 2단계(나갈 선수 → 들어올 선수)를 거쳐 SUBSTITUTION 이벤트를 제출한다', async () => {
    gameWithSubstitutionPolicy({ mode: 'limited', maxSubstitutions: 5 });
    render(<CoreHarness />);

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
    expect(testFixtures.operations().submitEvent).not.toHaveBeenCalled();
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '교체 기록' }));

    await waitFor(() =>
      expect(testFixtures.operations().submitEvent).toHaveBeenCalledWith(
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
    render(<CoreHarness />);
    expect(screen.queryByRole('button', { name: /^교체$/ })).toBeNull();
    // 롤링 전용이던 "빠른 교체 모드"도 함께 사라졌다.
    expect(screen.queryByRole('button', { name: /빠른 교체 모드/ })).toBeNull();
  });

  it('제한 교체 종목에서는 "교체" 액션 버튼이 그대로 있다 (회귀)', () => {
    // 음성 케이스가 없으면 "모든 경기에서 숨김" 으로 바뀌어도 위 테스트가 통과한다.
    gameWithSubstitutionPolicy({ mode: 'limited', maxSubstitutions: 5 });
    render(<CoreHarness />);
    expect(screen.getByRole('button', { name: /^교체$/ })).toBeInTheDocument();
  });

  it('제한 교체에서 이미 나간 선수는 incoming 후보에서 빠지고, reversal된 교체는 다시 허용된다', async () => {
    gameWithSubstitutionPolicy(
      { mode: 'limited', maxSubstitutions: 5 },
      [substitutionEvent('sub-1', 1, 'p-2', 'p-1')],
    );
    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: /^교체/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));

    const confirmDialog = await screen.findByRole('dialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '교체 기록' }));
    await waitFor(() =>
      expect(testFixtures.operations().submitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: 'p-3', payload: { outParticipantId: 'p-2' } }),
      ),
    );
  });
});

const HOME_AWAY_SIDES = [
  { id: 'side-home', gameId: 'game-1', sideKey: 'HOME' as const, teamId: null, displayNameSnapshot: '강남 풋살 클럽', createdAt: '', updatedAt: '' },
  { id: 'side-away', gameId: 'game-1', sideKey: 'AWAY' as const, teamId: null, displayNameSnapshot: '성수 풋살 클럽', createdAt: '', updatedAt: '' },
];

// UX 감사 item 2 — 라인업 없이 경기 시작 가능 → 복구 불가능한 막다른 길.
describe('OperateConsole — 라인업 게이트 (UX 감사 item 2)', () => {
  function setup(
    lineups: Array<{ sideId: string; state: GameLineupState; revision: number; invalidatedAt: string | null }>,
    sourceType: 'TEAM_MATCH' | 'TOURNAMENT_FIXTURE' = 'TEAM_MATCH',
    participantCounts: { home: number; away: number } = { home: 1, away: 1 },
  ) {
    const makeLineup = (
      sideId: string,
      revision: number,
      state: GameLineupState,
      count: number,
      invalidatedAt: string | null = null,
    ) => {
      const id = `${sideId}-lineup-${revision}`;
      return {
        id,
        gameId: 'game-1',
        sideId,
        revision,
        state,
        version: 0,
        submittedAt: null,
        supersedesId: null,
        formation: null,
        createdAt: '',
        updatedAt: '',
        invalidatedAt,
        participants: Array.from({ length: count }, (_, index) => ({
          id: `${id}-player-${index + 1}`,
          gameId: 'game-1',
          sideId,
          lineupId: id,
          userId: null,
          displayNameSnapshot: `${sideId} 선수 ${index + 1}`,
          jerseyNumber: index + 1,
          position: null,
          positionX: null,
          positionY: null,
          started: true,
          arrivedAt: null,
          createdAt: '',
          updatedAt: '',
        })),
      };
    };
    const effectiveLineups = [
      makeLineup('side-home', 1, 'DRAFT', participantCounts.home),
      makeLineup('side-away', 1, 'DRAFT', participantCounts.away),
      ...lineups.map((lineup) => makeLineup(
        lineup.sideId,
        lineup.revision,
        lineup.state,
        lineup.invalidatedAt === null
          ? lineup.sideId === 'side-home' ? participantCounts.home : participantCounts.away
          : 0,
        lineup.invalidatedAt,
      )),
    ];
    testFixtures.auth.mockReturnValue({ data: { user: { id: 'user-1' } } });
    const fixtureLineupResponse: {
      data: FixtureLineupResponse;
      isLoading: false;
      isError: false;
      error: null;
      refetch: ReturnType<typeof vi.fn>;
    } = {
      data: { gameId: 'game-1', lineups: effectiveLineups },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    testFixtures.lineups.mockReturnValue(fixtureLineupResponse);
    testFixtures.game.mockReturnValue({
      data: {
        id: 'game-1', state: 'SCHEDULED', version: 1, lastSequence: 0, sourceType,
        periods: [{ id: 'period-1', gameId: 'game-1', number: 1, state: 'SCHEDULED', startedAt: null, endedAt: null, pausedTotalMs: 0, pausedAt: null }],
        sides: HOME_AWAY_SIDES.map((side) => ({
          ...side,
          teamId: side.sideKey === 'HOME' ? 'team-home' : 'team-away',
        })),
        lineups: [],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 1, state: 'SCHEDULED' } }));
    return fixtureLineupResponse;
  }

  /**
   * [P1-c] 이 테스트는 원래 **반대**를 못박고 있었다 -- "한쪽이 미제출이면 시작 버튼이
   * 비활성". 그 차단을 걷어냈으므로 계약이 뒤집혔다: **경고는 뜨되 시작은 된다.**
   *
   * 단언을 뒤집는 것이지 지우는 것이 아니다. 차단이 사라졌다고 경고까지 없애면
   * "왜 명단이 비어 있지"를 운영자가 현장에서 알 수 없다.
   */
  it('한쪽 팀만 라인업을 제출했어도 "경기 시작"은 활성이고, 미제출 경고는 그대로 뜬다', () => {
    setup([{ sideId: 'side-home', state: 'SUBMITTED', revision: 2, invalidatedAt: null }]);
    render(<CoreHarness />);

    expect(screen.getByRole('button', { name: '경기 시작' })).toBeEnabled();
    expect(screen.getByText(/성수 풋살 클럽.*아직 출전 명단을 제출하지 않았어요/)).toBeInTheDocument();
    // [P1-d/웨이브8] 제출 링크 단언은 뺐다 — 링크를 그릴 수 있는 코드가 남아 있지 않아
    // 무조건 통과하는 단언이었다. 경고 문구 단언(위)이 이 계약의 실제 보호막이다.
  });

  /**
   * 대회 축엔 라인업 제출 단계가 없다 — 대진 생성 때 등록 명단이 참가자로 복사되고,
   * 자동 생성된 초안은 영영 SUBMITTED 가 되지 않는다. 그래서 명단 검인에 선수가 다 차
   * 있는데도 이 경고가 떴다(alpha 실측). 운영자가 할 수 있는 일이 없는 경고다.
   */
  it('대회 경기에서는 미제출 경고를 띄우지 않는다', () => {
    setup([{ sideId: 'side-home', state: 'SUBMITTED', revision: 2, invalidatedAt: null }], 'TOURNAMENT_FIXTURE');
    render(<CoreHarness />);

    expect(screen.getByRole('button', { name: '경기 시작' })).toBeEnabled();
    expect(screen.queryByText(/아직 출전 명단을 제출하지 않았어요/)).not.toBeInTheDocument();
  });

  it('양 팀 모두 라인업을 제출하면 "경기 시작"이 활성화되고 배너가 없다', () => {
    setup([
      { sideId: 'side-home', state: 'SUBMITTED', revision: 2, invalidatedAt: null },
      { sideId: 'side-away', state: 'LOCKED', revision: 2, invalidatedAt: null },
    ]);
    render(<CoreHarness />);

    expect(screen.getByRole('button', { name: '경기 시작' })).not.toBeDisabled();
    expect(screen.queryByText(/출전 명단을 제출해야/)).toBeNull();
  });

  it('무효화된 제출 명단은 유효한 현재 초안의 출전자를 덮어쓰지 않는다', () => {
    setup([{
      sideId: 'side-home',
      state: 'SUBMITTED',
      revision: 2,
      invalidatedAt: '2026-10-26T00:00:00.000Z',
    }]);
    render(<CoreHarness />);

    expect(screen.getByRole('button', { name: '경기 시작' })).toBeEnabled();
    expect(screen.queryByText(/출전 선수가 없어요/)).not.toBeInTheDocument();
  });

  it.each([
    ['홈', { home: 0, away: 1 }, '강남 풋살 클럽'],
    ['원정', { home: 1, away: 0 }, '성수 풋살 클럽'],
    ['양쪽', { home: 0, away: 0 }, '강남 풋살 클럽, 성수 풋살 클럽'],
  ] as const)('유효 경기 출전자가 %s 팀에 없으면 시작을 막고 팀 이름을 안내한다', (_side, counts, teamNames) => {
    setup([], 'TEAM_MATCH', counts);
    render(<CoreHarness />);

    expect(screen.getByRole('button', { name: '경기 시작' })).toBeDisabled();
    expect(screen.getByText(`${teamNames} 팀 출전 선수가 없어요. 경기 명단을 확인해 주세요.`)).toBeInTheDocument();
  });

  it('명단 불러오기에서 완료 상태로 바뀌어도 시작 전환이 계속 렌더된다', () => {
    const loadedLineup = setup([], 'TEAM_MATCH', { home: 0, away: 1 });
    type FixtureLineupQueryState =
      | {
          data: undefined;
          isLoading: true;
          isError: false;
          error: null;
          refetch: ReturnType<typeof vi.fn>;
        }
      | typeof loadedLineup;
    let fixtureLineupState: FixtureLineupQueryState = {
      ...loadedLineup,
      data: undefined,
      isLoading: true,
    };
    testFixtures.lineups.mockImplementation(() => fixtureLineupState);
    const { rerender } = render(<CoreHarness />);

    expect(screen.getByText('불러오는 중이에요…')).toBeInTheDocument();
    fixtureLineupState = loadedLineup;
    expect(() => rerender(<CoreHarness />)).not.toThrow();
    expect(screen.getByRole('button', { name: '경기 시작' })).toBeDisabled();
    expect(screen.getByText('강남 풋살 클럽 팀 출전 선수가 없어요. 경기 명단을 확인해 주세요.')).toBeInTheDocument();
  });

  it('같은 fixture에서 lease 만료 중 command 응답이 끝나도 pending을 풀어 재획득 후 시작을 허용한다', async () => {
    setup([], 'TOURNAMENT_FIXTURE');
    const initialGameQuery = testFixtures.game() as {
      data: GameDetail;
      isLoading: false;
      isError: false;
      error: null;
      status: 'success';
      refetch: ReturnType<typeof vi.fn>;
    };
    let gameState: GameDetail['state'] = 'SCHEDULED';
    testFixtures.game.mockImplementation(() => ({
      ...initialGameQuery,
      data: {
        ...initialGameQuery.data,
        state: gameState,
        periods: initialGameQuery.data.periods.map((period) => ({
          ...period,
          state: gameState === 'LIVE' ? 'LIVE' : 'SCHEDULED',
          startedAt: gameState === 'LIVE' ? '2026-10-28T00:00:00.000Z' : null,
        })),
      },
    }));
    let operationsState = consoleState({ gameSnapshot: { version: 1, state: 'SCHEDULED' } });
    testFixtures.operations.mockImplementation(() => operationsState);
    let resolveCommand!: (value: GameCommandResult) => void;
    const pendingCommand = new Promise<GameCommandResult>((resolve) => {
      resolveCommand = resolve;
    });
    testFixtures.sendCommand.mockReturnValueOnce(pendingCommand);

    const view = render(<CoreHarness />);
    fireEvent.click(screen.getByRole('button', { name: '경기 시작' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '경기 시작' }));
    await waitFor(() => expect(testFixtures.sendCommand).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: '경기 시작' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: '경기 시작' })).toBeDisabled();

    operationsState = consoleState({
      canOperate: false,
      takeover: { status: 'expired' },
      gameSnapshot: { version: 1, state: 'SCHEDULED' },
    });
    view.rerender(<CoreHarness />);
    await act(async () => {
      resolveCommand(gameMutationResult('LIVE', 2));
      await pendingCommand;
    });

    gameState = 'LIVE';
    operationsState = consoleState({
      takeover: { status: 'held', token: 'tok-renewed', expiresAtMs: Date.now() + 60000, assignmentVersion: 1 },
      gameSnapshot: { version: 2, state: 'LIVE' },
    });
    view.rerender(<CoreHarness />);

    const pauseButton = screen.getByRole('button', { name: '일시 중지' });
    expect(pauseButton).toBeEnabled();
    expect(pauseButton).not.toHaveAttribute('aria-busy', 'true');
  });
});

// UX 감사 item 3 — "경기 종료"가 확인 없이 즉시 실행됐다(되돌릴 수 없는 동작).
describe('OperateConsole — 경기 종료 확인 (UX 감사 item 3)', () => {
  beforeEach(() => {
    testFixtures.auth.mockReturnValue({ data: { user: { id: 'user-1' } } });
    testFixtures.lineups.mockReturnValue({
      data: { gameId: 'game-1', lineups: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    testFixtures.game.mockReturnValue({
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
    testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 2, state: 'LIVE' } }));
      testFixtures.sendCommand.mockResolvedValue(gameRevisionMutationResult('ENDED'));
  });

  it('"경기 종료"를 눌러도 확인 전에는 실행되지 않고, 취소하면 아무 일도 일어나지 않는다', async () => {
    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '경기 종료' }));
    const dialog = await screen.findByRole('dialog');
    expect(testFixtures.sendCommand).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(testFixtures.sendCommand).not.toHaveBeenCalled();
  });

  it('확인하면 그때 종료 명령이 실행된다', async () => {
    testFixtures.sendCommand.mockResolvedValue(gameRevisionMutationResult('ENDED'));
    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '경기 종료' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '경기 종료' }));

    await waitFor(() =>
      expect(testFixtures.sendCommand).toHaveBeenCalledWith('game-1', 'end', expect.anything(), COMMAND_OPTIONS),
    );

    // UX 감사 — 명령 응답이 그 자리에서 gameSnapshot에 반영돼야 한다.
    // 이게 빠지면 REST는 성공해도 화면은 다음 이벤트 커밋/재구독 전까지
    // 이전 상태(예: "일시 중지")를 계속 보여준다(alpha 실측, 2026-08:
    // 새로고침해야만 반영됨).
    await waitFor(() =>
      expect(testFixtures.operations().applyCommandResult).toHaveBeenCalledWith(gameRevisionMutationResult('ENDED')),
    );
  });

  it('응답이 끊기면 같은 종료 요청을 같은 idempotency body로 재시도하고 다른 기록은 막는다', async () => {
    // v1Api 가 fetch reject 를 바꿔 던지는 모양(api-client fetchOrNetworkError).
    const networkError = new V1ApiError(
      { status: 'error', timestamp: '', statusCode: 0, code: V1_NETWORK_ERROR_CODE, message: 'Failed to fetch' },
      { displayableMessage: false },
    );
    testFixtures.sendCommand
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(gameRevisionMutationResult('ENDED'));

    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '경기 종료' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '경기 종료' }));

    const retry = await screen.findByRole('button', { name: '같은 요청 재시도' });
    const firstRequest = testFixtures.sendCommand.mock.calls[0]?.[2];
    expect(firstRequest).toEqual(expect.objectContaining({
      expectedVersion: 2,
      clientCommandId: expect.any(String),
      takeoverToken: 'tok',
      occurredAt: expect.any(String),
    }));
    expect(screen.getByRole('button', { name: '경기 종료' })).toBeDisabled();

    fireEvent.click(retry);

    await waitFor(() => expect(testFixtures.sendCommand).toHaveBeenCalledTimes(2));
    expect(testFixtures.sendCommand.mock.calls[1]?.[2]).toEqual(firstRequest);
    await waitFor(() => expect(screen.queryByRole('button', { name: '같은 요청 재시도' })).toBeNull());
    expect(testFixtures.operations().applyCommandResult).toHaveBeenCalledWith(gameRevisionMutationResult('ENDED'));
  });

  it('종료 POST가 성공한 뒤 상세 재조회가 실패해도 이미 저장된 명령을 재시도하지 않는다', async () => {
    // React Query 의 refetch 는 throwOnError 없이는 실패해도 resolve 한다 — 그 계약대로 흉내 낸다.
    const refreshError = new Error('refresh unavailable');
    const refetch = vi.fn((options?: { throwOnError?: boolean }) =>
      options?.throwOnError ? Promise.reject(refreshError) : Promise.resolve({ isError: true, error: refreshError }),
    );
    testFixtures.game.mockReturnValue({ ...testFixtures.game(), refetch });
      testFixtures.sendCommand.mockResolvedValue(gameRevisionMutationResult('ENDED'));

    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '경기 종료' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '경기 종료' }));

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    await screen.findByText('명령은 저장됐지만 최신 상태를 불러오지 못했어요. 화면을 새로고침해 주세요.');
    expect(screen.queryByRole('button', { name: '같은 요청 재시도' })).toBeNull();
    expect(screen.getByText('명령은 저장됐지만 최신 상태를 불러오지 못했어요. 화면을 새로고침해 주세요.')).toBeInTheDocument();
  });

  it('진행 중인 종료 요청이 다른 경기로 전환된 뒤 도착해도 새 경기 상태를 오염시키지 않는다', async () => {
    let resolvePost: ((value: GameCommandResult) => void) | undefined;
    testFixtures.sendCommand.mockReturnValueOnce(new Promise((resolve) => { resolvePost = resolve; }));

    const view = render(<CoreHarness />);
    fireEvent.click(screen.getByRole('button', { name: '경기 종료' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '경기 종료' }));
    await waitFor(() => expect(testFixtures.sendCommand).toHaveBeenCalledTimes(1));

    const nextFixtureLineup = testFixtures.lineups();
    const nextGame = testFixtures.game();
    testFixtures.lineups.mockReturnValue({
      ...nextFixtureLineup,
      data: { ...nextFixtureLineup.data, gameId: 'game-2' },
    });
    testFixtures.game.mockReturnValue({
      ...nextGame,
      data: { ...nextGame.data, id: 'game-2' },
    });
    view.rerender(<CoreHarness />);

    await act(async () => {
      resolvePost?.(gameRevisionMutationResult('ENDED'));
    });
    expect(testFixtures.operations().applyCommandResult).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '같은 요청 재시도' })).toBeNull();
  });
});

// alpha "452′" 사고(2026-08) — 운영자가 경기 종료를 누르지 않으면 클럭이
// 계속 흘러 골/카드가 몇 시간 뒤 시각으로 기록될 수 있다. 서버는 이 값을
// 하드 거부하지 않으므로(현장 기록이 우선), 콘솔이 제출 직전에 확인만 요구
// 해야 한다 — 취소해도 "제출 안 됨"일 뿐 서버 422가 아니다.
describe('OperateConsole — 이상 클럭 확인 게이트 (alpha 452′ 사고)', () => {
  function setup(periodDurations: unknown) {
    testFixtures.auth.mockReturnValue({ data: { user: { id: 'user-1' } } });
    testFixtures.lineups.mockReturnValue({
      data: {
        gameId: 'game-1',
        lineups: [{
          sideId: 'side-home',
          state: 'SUBMITTED',
          invalidatedAt: null,
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
    testFixtures.game.mockReturnValue({
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
    testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 2, state: 'LIVE' } }));
  }

  it('설정된 피리어드 길이를 크게 넘는 시각을 기록하려 하면 제출 전 확인을 요구하고, 취소하면 제출되지 않는다', async () => {
    setup([{ durationMinutes: 20, extraTime: false }]);
    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));

    expect(await screen.findByText(/이 피리어드는 보통 20분이에요/)).toBeInTheDocument();
    expect(testFixtures.operations().submitEvent).not.toHaveBeenCalled();
    // 과제 1 요구사항 4 — 시계 경고와 일반 커밋 확인이 별개 모달로 겹쳐
    // 뜨지 않는다(모달은 항상 하나뿐, 경고가 그 안에 병합된다).
    expect(screen.getAllByRole('dialog')).toHaveLength(1);

    // 서버 하드 거부가 아니라 확인 게이트일 뿐이라는 계약: 취소해도 그냥
    // "제출 안 됨"이지 에러가 아니다.
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(testFixtures.operations().submitEvent).not.toHaveBeenCalled();
  });

  it('확인을 누르면 그대로(숫자 조작 없이) 기록된다', async () => {
    setup([{ durationMinutes: 20, extraTime: false }]);
    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    await screen.findByText(/이 피리어드는 보통 20분이에요/);

    fireEvent.click(screen.getByRole('button', { name: '그대로 기록' }));

    await waitFor(() =>
      expect(testFixtures.operations().submitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GOAL', participantId: 'p-1' }),
      ),
    );
  });

  it('피리어드 설정을 못 읽었으면(periodDurations: null) 시계 경고 없이 일반 확인만 거친다', async () => {
    setup(null);
    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));

    // 과제 1(모든 액션에 확인)로 시계 경고 여부와 무관하게 확인 모달은 뜬다 —
    // 다만 시계 경고 문구·"그대로 기록" 라벨은 없어야 한다(판단 근거가
    // 없으면 지어낸 경고를 보여주지 않는다는 계약은 그대로 유지).
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/이 피리어드는 보통/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '골 기록' }));

    await waitFor(() => expect(testFixtures.operations().submitEvent).toHaveBeenCalled());
  });
});

// UX 감사 item 4 — takeover.status가 'none'/'requesting'인 동안 명령 버튼·
// LineupGrid가 전부 비활성인데 이유가 화면에 없었다.
describe('OperateConsole — 운영 권한 요청 중 배너 (UX 감사 item 4)', () => {
  beforeEach(() => {
    testFixtures.auth.mockReturnValue({ data: { user: { id: 'user-1' } } });
    testFixtures.lineups.mockReturnValue({
      data: { gameId: 'game-1', lineups: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    testFixtures.game.mockReturnValue({
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
      testFixtures.operations.mockReturnValue(consoleState({ takeover: { status } }));
      render(<CoreHarness />);

      expect(screen.getByText('경기 운영 권한을 가져오는 중이에요…')).toBeInTheDocument();
    },
  );

  it('권한을 보유하면(held) 배너가 사라진다', () => {
    testFixtures.operations.mockReturnValue(consoleState());
    render(<CoreHarness />);

    expect(screen.queryByText('경기 운영 권한을 가져오는 중이에요…')).toBeNull();
  });
});

// UX 감사 item 6 — 실시간 점수가 표시되지 않았다. 되돌려진(reversed) 이벤트는
// 제외하고 확정 이벤트에서만 파생해야 한다(`on-pitch-state.ts`와 동일한 규칙).
describe('OperateConsole — 헤더 점수 표시 (UX 감사 item 6)', () => {
  beforeEach(() => {
    testFixtures.auth.mockReturnValue({ data: { user: { id: 'user-1' } } });
    testFixtures.lineups.mockReturnValue({
      data: { gameId: 'game-1', lineups: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    testFixtures.game.mockReturnValue({
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

    testFixtures.operations.mockReturnValue(
      consoleState({ liveEvents: [homeGoalA, homeGoalReversed, reversal, homeGoalB, awayGoal] }),
    );
    render(<CoreHarness />);

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
   * 없다. 이 콘솔의 `operations`은 그렇게 도착한 이벤트를
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

    testFixtures.operations.mockReturnValue(
      consoleState({ liveEvents: [malformedSelfCommittedGoal] }),
    );
    render(<CoreHarness />);

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

    testFixtures.operations.mockReturnValue(
      consoleState({ liveEvents: [firstMalformed, secondMalformed] }),
    );
    render(<CoreHarness />);

    expect(screen.getByText('1 : 1')).toBeInTheDocument();
  });
});

// 과제 2 — 승부차기 입력 단계. "언제 나타날지"(요구사항 1: 정규시간(+연장) 종료 시 동점 + knockout 픽스처)
// 게이팅과, 최종 결과 반영
// (요구사항 4·5: end 커맨드의 payload.penalties로 실제 반영, 확인 모달을 거침)
// 을 검증한다.
