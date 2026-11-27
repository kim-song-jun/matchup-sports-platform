import { act, cleanup, render as renderElement, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { AbnormalEndDialog, OperateConsoleCore, type GameDetailQueryState, type OperateConsoleRuntime } from '@/shared/game-operations';
import { COMMAND_RESPONSE_TIMEOUT_MS, UNDO_WAIT_LIMIT_MS } from './operate-console-core';
import type { FixtureLineupResponse, GameCommandRequest, GameDetail, GameEventRecord, GameLineup, GameLineupState, GameMutationResult, GameRevisionMutationResult, GameState } from '@/types/game-operations';
import type { V1GameResultRevision } from '@/types/api';
import type { QueuedGameEvent } from '@/lib/game-operations-queue';
import { V1_NETWORK_ERROR_CODE, V1ApiError } from '@/lib/api-client';
import { liveV1DataSource, V1DataSourceProvider, type V1DataSource } from '@/components/providers/v1-data-source';
import * as overlayHistory from '@/lib/overlay-history';
import { installViewport } from '@/test/viewport';

// MD-QA #187: 기록 "수정" 시트(BottomSheet)가 라우터 훅을 쓴다.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const queryClients: QueryClient[] = [];
// 되돌리기가 서버 기록 목록(`GET /games/:id/events`)을 읽는 길만 시험이 정한다. 나머지 REST 는 그대로 둔다.
const serverEventsSource = {
  ...liveV1DataSource,
  v1Api: ((path: string, options?: unknown) =>
    path.endsWith('/events')
      ? testFixtures.serverEvents(path)
      : liveV1DataSource.v1Api(path, options as Parameters<V1DataSource['v1Api']>[1])) as V1DataSource['v1Api'],
} satisfies V1DataSource;
function render(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  queryClients.push(client);
  return renderElement(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <V1DataSourceProvider source={serverEventsSource}>{children}</V1DataSourceProvider>
      </QueryClientProvider>
    ),
  });
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
  /** true 면 선수 시트를 스텁이 아니라 실제 `LineupGrid` 로 그린다(명단 줄 수를 볼 때). */
  realLineupGrid: { current: false },
  auth: vi.fn(),
  lineups: vi.fn(),
  game: vi.fn(),
  operations: vi.fn<() => MockedOperations>(),
  sendCommand: vi.fn<OperateConsoleRuntime['postGameCommand']>(),
  /** 서버 기록 목록 읽기. 기본은 「읽지 못함」 — 필요한 시험이 응답을 정한다. */
  serverEvents: vi.fn<(path: string) => Promise<unknown>>(),
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
vi.mock('./lineup-grid', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lineup-grid')>();
  return {
  // 선택자 함수들은 **실제 구현을 그대로 쓴다**(`importOriginal`). 예전에는 목 안에
  // 로직을 손으로 베껴 뒀는데, 그러면 구현이 바뀔 때 목이 조용히 뒤처진다 -- 실제로
  // [P1-c 후속]에서 `latestLineupForDisplay` 가 추가되자 이 목에 없어서 세 테스트가
  // "export 가 없다"로 깨졌고, 거기서 로직을 또 베꼈다면 **두 규칙이 다르다는 계약을
  // 목이 왜곡**할 수 있었다. 컴포넌트만 가벼운 스텁으로 대체한다.
  ...actual,
  LineupGrid: (props: {
    sides?: ReadonlyArray<{ id: string }>;
    renderSideFooter?: (side: never) => ReactNode;
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
    if (testFixtures.realLineupGrid.current) {
      return <actual.LineupGrid {...(props as unknown as Parameters<typeof actual.LineupGrid>[0])} />;
    }
    const { onSelectPlayer, restrictSideId, filterParticipantIds, sentOffParticipantIds, sides, renderSideFooter } = props;
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
        {renderSideFooter ? (sides ?? []).map((side) => <div key={side.id}>{renderSideFooter(side as never)}</div>) : null}
      </div>
    );
  },
  };
});

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
  testFixtures.realLineupGrid.current = false;
  testFixtures.serverEvents.mockReset();
  testFixtures.serverEvents.mockRejectedValue(new Error('offline'));
  // 쉬는 시간은 기기에 저장된다 — 앞 시험의 타이머가 다음 시험으로 이어지지 않게 비운다.
  window.localStorage.clear();
});

// 진행 명령은 응답 제한 시간을 걸 수 있게 abort 신호를 함께 넘긴다.
const COMMAND_OPTIONS = { signal: expect.any(AbortSignal) };

/** 상태 줄의 「자세히」 시트를 연다(이미 열려 있으면 그대로). */
function openStatusSheet() {
  const existing = screen.queryByRole('dialog', { name: '경기 상태' });
  if (existing) return existing;
  fireEvent.click(screen.getByRole('button', { name: '자세히' }));
  return screen.getByRole('dialog', { name: '경기 상태' });
}

/** 콘솔이 운영자에게 알리는 안내(요청 실패 등)는 「자세히」 시트 안에 있다. */
async function findConsoleNotice(text: string | RegExp) {
  await screen.findByRole('button', { name: '자세히' });
  return within(openStatusSheet()).findByText(text);
}

/** 상태 줄(한 줄) 요소. danger 면 alert, 아니면 status 다. */
function statusRow() {
  return screen.getByRole('button', { name: '자세히' }).closest('[role="status"],[role="alert"]') as HTMLElement;
}

/** 점수 카드의 팀 열(「홈 팀명」·「원정 팀명」). */
function teamColumn(teamName: string) {
  return within(screen.getByRole('banner')).getByRole('group', { name: new RegExp(`${teamName}$`) });
}

/** 기록 격자의 「더보기」 칸(교체를 기록하는 종목은 진행 바의 ⋯)으로 더보기 시트를 연다. */
function openMoreSheet() {
  fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  return screen.getByRole('dialog', { name: '더보기' });
}

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
    lastError: status === 'failed' ? { code: 'INTERNAL_ERROR', message: '기록하지 못했어요.' } : null,
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
    submitEvent: vi.fn<OperationsContract['submitEvent']>().mockResolvedValue('client-new'),
    retryFailedEvent: vi.fn<OperationsContract['retryFailedEvent']>(),
    requestTakeover: vi.fn<OperationsContract['requestTakeover']>(),
    reverseEvent: vi.fn<OperationsContract['reverseEvent']>().mockResolvedValue(undefined),
    correctEventTime: vi.fn<NonNullable<OperationsContract['correctEventTime']>>(),
    assignAssist: vi.fn<OperationsContract['assignAssist']>(),
    applyCommandResult: vi.fn<OperationsContract['applyCommandResult']>(() => true),
    ...overrides,
  };
}

function CoreHarness({
  fixtureId = 'f-1',
  takeoverEnabled = true,
  operatorScopeKey = 'operator-1',
  leaseRequired = true,
  resultHref,
  sampleMode = false,
}: {
  fixtureId?: string;
  takeoverEnabled?: boolean;
  operatorScopeKey?: string;
  leaseRequired?: boolean;
  resultHref?: string;
  sampleMode?: boolean;
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
      leaseRequired={leaseRequired}
      takeoverEnabled={takeoverEnabled}
      operatorScopeKey={operatorScopeKey}
      operationContextKey={JSON.stringify(['operation', fixtureId])}
      headerTopClass="top-[52px]"
      resultHref={resultHref}
      sampleMode={sampleMode}
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

  it('실제 콘솔은 소켓 연결 상태를 상태 줄에 그대로 보여 준다', () => {
    render(<CoreHarness />);
    expect(statusRow()).toHaveTextContent('이 기기에서 기록 중 · 연결됨');
    expect(screen.queryByText('체험 중 · 서버 연결 없음')).not.toBeInTheDocument();
  });

  it('체험 콘솔은 서버에 연결됐다고 말하지 않는다', () => {
    render(<CoreHarness sampleMode />);
    expect(statusRow()).toHaveTextContent('체험 중 · 서버 연결 없음');
    expect(statusRow()).not.toHaveTextContent('연결됨');
  });

  it('서버에 확정된 이벤트를 보여준다 — 로컬 큐가 비어 있어도', () => {
    render(<CoreHarness />);

    const list = screen.getByRole('list', { name: '기록 목록' });
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

  // 다른 기기가 쥔 경기는 보기 모드로 열고, 코드 없이 누가 기록 중인지와 가져오는 방법을 보여 준다.
  it('takeover: 「이 기기에서 기록하기」→ 확인 → requestTakeover({force:true}), 「운영 권한」 글자는 화면 어디에도 없다', async () => {
    const state = consoleState({ takeover: { status: 'denied', code: 'TAKEOVER_HELD', holderName: '김운영' } });
    testFixtures.operations.mockReturnValue(state);
    render(<CoreHarness />);

    expect(statusRow()).toHaveTextContent('다른 기기에서 기록하고 있어요');
    expect(screen.queryByText(/TAKEOVER_HELD/)).not.toBeInTheDocument();

    // 버튼은 시트를 열지 않아도 상태 줄 안에 있다.
    fireEvent.click(within(statusRow()).getByRole('button', { name: '이 기기에서 기록하기' }));
    expect(state.requestTakeover).not.toHaveBeenCalled();
    const confirmDialog = await screen.findByRole('dialog', { name: '이 기기에서 기록할까요?' });
    expect(confirmDialog).toHaveTextContent('김운영님의 기기는 보기만 할 수 있게 돼요. 같은 경기를 두 곳에서 기록하지 않도록 먼저 확인해 주세요.');
    expect(document.body).not.toHaveTextContent('운영 권한');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '이 기기에서 기록하기' }));
    await waitFor(() => expect(state.requestTakeover).toHaveBeenCalledWith({ force: true }));
    expect(state.requestTakeover).toHaveBeenCalledTimes(1);

    expect(await findConsoleNotice('김운영님이 이 경기를 기록하고 있어요. 이 기기는 보기만 할 수 있어요.')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('운영 권한');
  });

  it('권한을 뺏긴 쪽도 코드 대신 누가 가져갔는지 보여 준다', async () => {
    testFixtures.operations.mockReturnValue(
      consoleState({ takeover: { status: 'denied', code: 'TAKEOVER_SUPERSEDED', holderName: '박운영' } }),
    );
    render(<CoreHarness />);

    expect(within(statusRow()).getByRole('button', { name: '이 기기에서 기록하기' })).toBeInTheDocument();
    expect(await findConsoleNotice('박운영님이 기록 권한을 가져갔어요. 이 기기는 보기만 할 수 있어요.')).toBeInTheDocument();
    expect(screen.queryByText(/TAKEOVER_SUPERSEDED/)).not.toBeInTheDocument();
  });

  // Task 180 G6(F76) — 콘솔에서는 방금 한 일이 맨 위여야 어시스트를 잘못된 골에 다는 사고가 없다.
  it('콘솔의 기록된 이벤트는 최신순이다 (맨 위가 가장 나중에 기록된 골)', () => {
    testFixtures.operations.mockReturnValue(
      consoleState({ liveEvents: [goal(1), { ...goal(2), clockMs: 9 * 60000 }, { ...goal(3), clockMs: 12 * 60000 }] }),
    );
    render(<CoreHarness />);

    // 폰 첫 화면은 한 줄짜리 두 줄까지만 둔다.
    const rows = within(screen.getByRole('list', { name: '기록 목록' })).getAllByRole('listitem');
    expect(rows.map((row) => /후반 (\d+)/.exec(row.textContent ?? '')?.[1])).toEqual(['12', '9']);
    expect(screen.getByRole('heading', { name: /^최근 기록/ })).toHaveTextContent('최신순');
  });

  it('takeover가 허용되고 보유 중이면 기록을 고치는 액션을 노출한다', () => {
    testFixtures.operations.mockReturnValue(
      consoleState({
        takeover: { status: 'held', token: 'tok', expiresAtMs: Date.now() + 60000, assignmentVersion: 0 },
        liveEvents: [{ ...goal(1), assistParticipantId: null }],
      }),
    );
    render(<CoreHarness />);

    expect(within(screen.getByRole('list', { name: '기록 목록' })).getByRole('button', { name: /어시스트/ })).toBeInTheDocument();
  });

  // MD-QA #187 -- 기록 "수정" 시트: 시각 정정은 콘솔 커맨드 경로(ops.correctEventTime)로 간다.
  it('"고치기"에서 시각을 고치면 ops.correctEventTime 이 이벤트 id·새 시각·사유로 불린다', async () => {
    const correctEventTime = vi.fn<NonNullable<OperationsContract['correctEventTime']>>().mockResolvedValue(undefined);
    const ops = consoleState({ liveEvents: [goal(1)], correctEventTime });
    testFixtures.operations.mockReturnValue(ops);
    render(<CoreHarness />);

    fireEvent.click(within(screen.getByRole('list', { name: '기록 목록' })).getByRole('button', { name: '기록 고치기 (골)' }));
    const dialog = await screen.findByRole('dialog', { name: '골 기록 고치기' });
    expect(within(dialog).getByText(/정우진/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: '1분 빼기' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '6:00 → 5:00으로 고치기' }));

    await waitFor(() => expect(correctEventTime).toHaveBeenCalledTimes(1));
    expect(correctEventTime).toHaveBeenCalledWith({
      eventId: 'event-1',
      clockMs: 5 * 60000,
      reason: '경기 중 기록 시각 고치기 (6:00 → 5:00)',
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '골 기록 고치기' })).toBeNull());
  });

  it('시각을 고친 줄은 새 시각과 "고친 기록"을 보이고, 시트의 기준 시각도 새 시각이다', async () => {
    const correction: GameEventRecord = {
      ...goal(2),
      id: 'tc-1',
      type: 'TIME_CORRECTION',
      sideId: null,
      participantId: null,
      clockMs: 5 * 60000,
      correctsEventId: 'event-1',
      payload: { previousClockMs: 6 * 60000, clockMs: 5 * 60000, reason: '자동', lane: 'OPERATOR' },
    };
    testFixtures.operations.mockReturnValue(consoleState({ liveEvents: [goal(1), correction] }));
    // 이력 펼침은 전체 목록에 있다 — 넓은 화면의 오른쪽 열이 그 자리다.
    const restoreViewport = installViewport(1280);
    render(<CoreHarness />);

    const list = screen.getByRole('list', { name: '기록 목록' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('후반 5:00');
    expect(within(list).getByRole('button', { name: /고친 기록/ })).toBeInTheDocument();

    fireEvent.click(within(list).getByRole('button', { name: '기록 고치기 (골)' }));
    const dialog = await screen.findByRole('dialog', { name: '골 기록 고치기' });
    expect(within(dialog).getByRole('button', { name: /고칠 시각 5:00/ })).toBeInTheDocument();
    restoreViewport();
  });

  it('정정 실패는 시트 안에 해요체로 남고 시트는 열려 있다', async () => {
    const correctEventTime = vi.fn<NonNullable<OperationsContract['correctEventTime']>>().mockRejectedValue(
      new V1ApiError({ status: 'error', message: 'x', statusCode: 409, code: 'EVENT_ALREADY_REVERSED', timestamp: '2026-11-10T01:00:00Z' }),
    );
    const ops = consoleState({ liveEvents: [goal(1)], correctEventTime });
    testFixtures.operations.mockReturnValue(ops);
    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '기록 고치기 (골)' }));
    const dialog = await screen.findByRole('dialog', { name: '골 기록 고치기' });
    fireEvent.click(within(dialog).getByRole('button', { name: '1분 빼기' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '6:00 → 5:00으로 고치기' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('이미 취소된 기록은 시각을 고칠 수 없어요.');
    expect(screen.getByRole('dialog', { name: '골 기록 고치기' })).toBeInTheDocument();
  });

  it('"기록 취소" 탭은 기존 취소 확인 흐름(ops.reverseEvent)으로 이어진다', async () => {
    const ops = consoleState({ liveEvents: [goal(1)] });
    ops.reverseEvent.mockResolvedValue(undefined);
    testFixtures.operations.mockReturnValue(ops);
    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '기록 고치기 (골)' }));
    const dialog = await screen.findByRole('dialog', { name: '골 기록 고치기' });
    fireEvent.click(within(dialog).getByRole('tab', { name: '기록 취소' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '이 기록 취소하기' }));

    const confirmDialog = await screen.findByRole('dialog', { name: /골 기록을 취소할까요/ });
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '기록 취소' }));
    await waitFor(() => expect(ops.reverseEvent).toHaveBeenCalledWith({ eventId: 'event-1', reason: '골 기록 취소' }));
  });

  it('ops.correctEventTime 이 없는 런타임에서는 "고치기"가 기록 취소로 이어진다', () => {
    const ops = consoleState({ liveEvents: [goal(1)] });
    delete (ops as { correctEventTime?: unknown }).correctEventTime;
    testFixtures.operations.mockReturnValue(ops);
    render(<CoreHarness />);

    expect(screen.queryByRole('button', { name: '기록 고치기 (골)' })).toBeNull();
    expect(screen.getByRole('button', { name: '고치기' })).toBeInTheDocument();
  });

  it('takeover가 비활성화되면 기록 조회만 허용한다', () => {
    render(<CoreHarness takeoverEnabled={false} operatorScopeKey="readonly-operator" />);

    expect(screen.getByRole('list', { name: '기록 목록' })).toHaveTextContent('정우진');
    expect(screen.queryByRole('button', { name: /어시스트/ })).toBeNull();
    expect(screen.queryByRole('button', { name: '고치기' })).toBeNull();
  });

  // 큐가 비어 있으면 "전송 상태" 절은 아예 나오지 않아야 한다 — 평상시 화면에 빈 패널이
  // 남아 있으면 운영자가 그걸 이벤트 목록으로 오해한다(예전 회귀의 원인).
  it('전송할 것이 없으면 상태 줄이 평소 그대로다', () => {
    render(<CoreHarness />);

    expect(statusRow()).toHaveAttribute('role', 'status');
    expect(statusRow()).toHaveTextContent('이 기기에서 기록 중 · 연결됨');
    expect(within(openStatusSheet()).queryByText('보낼 기록')).toBeNull();
  });

  it('실패한 전송이 있으면 상태 줄이 알리고, 자세히에서 다시 보낼 수 있다', () => {
    testFixtures.operations.mockReturnValue(
      consoleState({
        queue: {
          items: [queuedEvent('client-9', 'failed')],
        },
      }),
    );

    const state = testFixtures.operations();
    render(<CoreHarness />);

    expect(statusRow()).toHaveAttribute('role', 'alert');
    expect(statusRow()).toHaveTextContent('기록 1개를 보내지 못했어요');
    // 서버 로그는 그대로 남아 있어야 한다 — 큐가 그것을 대체하지 않는다.
    expect(screen.getByRole('list', { name: '기록 목록' })).toBeInTheDocument();

    const sheet = openStatusSheet();
    expect(within(sheet).getByText('기록하지 못했어요.')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: '다시 시도' }));
    expect(state.retryFailedEvent).toHaveBeenCalledWith('client-9');
  });

  // 전부 ack 된 평상시에는 이 절이 통째로 사라져야 한다. 예전에는 ack 된 항목까지 남아
  // "골·옐로카드·골 · 기록 완료"가 위 확정 로그와 1:1로 중복됐다(시각·선수·팀 없이).
  it('전부 서버에 기록된 뒤에는 전송 안내를 남기지 않는다', () => {
    testFixtures.operations.mockReturnValue(
      consoleState({
        queue: {
          items: [queuedEvent('c-1', 'acked'), queuedEvent('c-2', 'acked', 'FOUL')],
        },
      }),
    );

    render(<CoreHarness />);

    expect(statusRow()).toHaveTextContent('이 기기에서 기록 중 · 연결됨');
    expect(within(openStatusSheet()).queryByText('보낼 기록')).toBeNull();
    // 확정 로그는 그대로다 — 큐를 숨긴 것이지 기록을 숨긴 게 아니다.
    expect(screen.getByRole('list', { name: '기록 목록' })).toBeInTheDocument();
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

    expect(within(screen.getByRole('banner')).getByText('경기를 시작해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: '기록하기' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^골/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^파울/ })).toBeNull();
    expect(screen.queryByText(/팀 파울/)).toBeNull();
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

    expect(teamColumn('성수 풋살 클럽')).toHaveTextContent('후반 팀 파울 1');
    expect(teamColumn('강남 풋살 클럽')).toHaveTextContent('후반 팀 파울 0');
    // 마지막 경기 시간 뒤에는 다시 셀 구간이 없다.
    expect(screen.getByRole('banner')).not.toHaveTextContent('0부터 다시 세요');
  });

  // 2026-11-18 사용자 결정: 옐로·레드카드도 팀 파울 1개로 세고, 경고 누적 퇴장(옐로 2장 뒤 레드)은 세지 않는다.
  it('팀 파울은 카드도 파울로 세고 경고 누적 퇴장 레드는 세지 않는다', () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'HALFTIME', startedAt: null, endedAt: null },
    ]);
    const cardEvent = (id: string, sequence: number, color: 'YELLOW' | 'RED', sideId: string, participantId: string) => ({
      id, gameId: 'game-1', sequence, clientEventId: `${id}-client`,
      payloadHash: `${id}-hash`, type: 'CARD', sideId, participantId,
      assistParticipantId: null, period: 1, clockMs: sequence * 60_000,
      occurredAt: '2026-08-07T00:10:00.000Z', receivedAt: '2026-08-07T00:10:00.000Z',
      actorUserId: 'actor-1', reversesEventId: null, payload: { card: color },
    }) as GameEventRecord;
    testFixtures.operations.mockReturnValue(
      consoleState({
        liveEvents: [
          cardEvent('yellow-1', 1, 'YELLOW', 'side-home', 'participant-1'),
          cardEvent('yellow-2', 2, 'YELLOW', 'side-home', 'participant-1'),
          cardEvent('red-accumulated', 3, 'RED', 'side-home', 'participant-1'),
          cardEvent('red-direct', 4, 'RED', 'side-away', 'participant-2'),
        ],
      }),
    );

    render(<CoreHarness />);

    // 홈: 옐로 2장 = 파울 2개(레드는 경고 누적 퇴장이라 제외). 원정: 직접 레드 = 파울 1개.
    expect(teamColumn('강남 풋살 클럽')).toHaveTextContent('전반 팀 파울 2');
    expect(teamColumn('성수 풋살 클럽')).toHaveTextContent('전반 팀 파울 1');
  });

  // 대회·리그마다 팀 파울 기준이 다르다 — 서버가 경기 상세에 실어 준 `teamFoulThreshold` 로 경고를 켠다.
  describe('팀 파울 경고 기준(teamFoulThreshold)', () => {
    const LIVE_FIRST_HALF = [{ number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null }];
    const foulEvent = (index: number, sideId: string) => ({
      id: `foul-${sideId}-${index}`, gameId: 'game-1', sequence: index, clientEventId: `foul-client-${index}`,
      payloadHash: `foul-hash-${index}`, type: 'FOUL', sideId, participantId: null,
      assistParticipantId: null, period: 1, clockMs: index * 60_000,
      occurredAt: '2026-08-07T00:10:00.000Z', receivedAt: '2026-08-07T00:10:00.000Z',
      actorUserId: 'actor-1', reversesEventId: null, payload: {},
    }) as GameEventRecord;
    const homeFouls = (count: number) => Array.from({ length: count }, (_, index) => foulEvent(index + 1, 'side-home'));
    function mountWith(fouls: GameEventRecord[], teamFoulThreshold?: number) {
      gameWithPeriods('LIVE', LIVE_FIRST_HALF);
      const current = testFixtures.game() as { data: object };
      testFixtures.game.mockReturnValue({ ...current, data: { ...current.data, teamFoulThreshold } });
      testFixtures.operations.mockReturnValue(consoleState({ liveEvents: fouls }));
      render(<CoreHarness />);
    }

    it('대회·리그가 정한 기준(3개)에 이르면 기본값(5개)보다 일찍 경고한다', () => {
      mountWith(homeFouls(3), 3);

      expect(screen.getAllByText('다음부터 10m 프리킥')).toHaveLength(1);
      expect(teamColumn('강남 풋살 클럽')).toHaveTextContent('다음부터 10m 프리킥');
      expect(teamColumn('성수 풋살 클럽')).not.toHaveTextContent('다음부터 10m 프리킥');
    });

    it('같은 파울 수라도 기준이 7개면 아직 경고하지 않는다', () => {
      mountWith(homeFouls(5), 7);

      expect(screen.queryByText('다음부터 10m 프리킥')).toBeNull();
    });

    it('서버 응답에 기준이 없으면(구버전·캐시) 기본값(5개)으로 경고한다', () => {
      mountWith(homeFouls(4));
      expect(screen.queryByText('다음부터 10m 프리킥')).toBeNull();
    });

    it('기준이 없는 응답이어도 5개째에는 경고한다(기존 동작 유지)', () => {
      mountWith(homeFouls(5));
      expect(screen.getAllByText('다음부터 10m 프리킥')).toHaveLength(1);
    });
  });

  // MD-QA #189: 하프타임에는 방금 끝난 전반의 팀 파울을 보여 주고, 후반에 다시 센다고 알려 준다.
  it('하프타임에는 전반 팀 파울과 후반에 0부터 다시 센다는 안내를 보여준다', () => {
    gameWithPeriods('LIVE', [
      { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'HALFTIME', startedAt: null, endedAt: null },
    ]);
    testFixtures.operations.mockReturnValue(
      consoleState({
        liveEvents: [{
          id: 'foul-period-1', gameId: 'game-1', sequence: 1, clientEventId: 'foul-client-1',
          payloadHash: 'foul-hash', type: 'FOUL', sideId: 'side-home', participantId: null,
          assistParticipantId: null, period: 1, clockMs: 30_000,
          occurredAt: '2026-08-07T00:10:00.000Z', receivedAt: '2026-08-07T00:10:00.000Z',
          actorUserId: 'actor-1', reversesEventId: null, payload: {},
        } as GameEventRecord],
      }),
    );

    render(<CoreHarness />);

    expect(teamColumn('강남 풋살 클럽')).toHaveTextContent('전반 팀 파울 1');
    expect(screen.getByRole('banner')).toHaveTextContent('후반에는 0부터 다시 세요');
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

    fireEvent.click(goalButton);
    expect(screen.getByRole('dialog', { name: '골 · 누가 넣었나요?' })).toBeInTheDocument();
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

  describe('퇴장한 선수 재확인', () => {
    const periods = [
      { number: 1, state: 'LIVE' as const, startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
      { number: 2, state: 'SCHEDULED' as const, startedAt: null, endedAt: null },
    ];
    // 선수 목록 스텁은 언제나 p-1(정우진)을 고른다 — 그 선수가 전반 8:00 에 레드카드를 받은 상태.
    const redCardOfP1 = { ...goal(1), type: 'CARD', participantId: 'p-1', period: 1, clockMs: 8 * 60000, payload: { card: 'RED' } } as GameEventRecord;

    it('퇴장한 선수를 고르면 "퇴장한 선수예요"를 먼저 묻고, 계속하면 다른 확인 없이 기록한다', async () => {
      gameWithPeriods('LIVE', periods);
      testFixtures.operations.mockReturnValue(consoleState({ liveEvents: [redCardOfP1] }));
      render(<CoreHarness />);

      fireEvent.click(screen.getByRole('button', { name: /^골/ }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));

      const panel = within(screen.getByRole('dialog')).getByRole('group', { name: '정우진은 퇴장한 선수예요' });
      expect(panel).toHaveTextContent('전반 8:00에 레드카드를 받고 퇴장했어요. 그래도 골을 기록할까요?');
      expect(testFixtures.operations().submitEvent).not.toHaveBeenCalled();

      fireEvent.click(within(panel).getByRole('button', { name: '그래도 계속' }));

      await waitFor(() =>
        expect(testFixtures.operations().submitEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'GOAL', participantId: 'p-1', sideId: 'side-home' }),
        ),
      );
      expect(testFixtures.operations().submitEvent).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('"다른 선수 고르기"를 누르면 아무것도 기록하지 않고 선택 화면에 머문다', () => {
      gameWithPeriods('LIVE', periods);
      testFixtures.operations.mockReturnValue(consoleState({ liveEvents: [redCardOfP1] }));
      render(<CoreHarness />);

      fireEvent.click(screen.getByRole('button', { name: /^골/ }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
      fireEvent.click(screen.getByRole('button', { name: '다른 선수 고르기' }));

      expect(within(screen.getByRole('dialog')).getByTestId('lineup-grid')).toBeInTheDocument();
      expect(testFixtures.operations().submitEvent).not.toHaveBeenCalled();
    });

    it('레드카드를 되돌린 선수는 재확인 없이 바로 기록한다', async () => {
      gameWithPeriods('LIVE', periods);
      const undo = { ...goal(2), type: 'CORRECTION', participantId: 'p-1', reversesEventId: redCardOfP1.id, payload: {} } as GameEventRecord;
      testFixtures.operations.mockReturnValue(consoleState({ liveEvents: [redCardOfP1, undo] }));
      render(<CoreHarness />);

      fireEvent.click(screen.getByRole('button', { name: /^골/ }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));

      expect(screen.queryByRole('group', { name: /퇴장한 선수예요/ })).not.toBeInTheDocument();
      await waitFor(() => expect(testFixtures.operations().submitEvent).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('dialog')).toBeNull();
    });
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
      // 이미 레드카드를 받은 선수면 "퇴장한 선수예요"가 먼저 뜬다 — 계속을 누르면 곧바로 기록한다.
      const sentOffPanel = screen.queryByRole('group', { name: /퇴장한 선수예요/ });
      if (sentOffPanel) fireEvent.click(within(sentOffPanel).getByRole('button', { name: '그래도 계속' }));
      await waitFor(() => expect(state.submitEvent).toHaveBeenCalledTimes(1));
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

    it('시계 옆에 "전반" 라벨이 없고 팀 파울은 "경기 팀 파울"이다', () => {
      gameWithPeriods('LIVE', live, [{ durationMinutes: 40, extraTime: false }]);
      render(<CoreHarness />);
      expect(screen.getByRole('banner')).not.toHaveTextContent('전반');
      expect(teamColumn('강남 풋살 클럽')).toHaveTextContent('경기 팀 파울 0');
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

    // 진행 명령인 end-period 는 확인을 거친다.
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

    it('진행 바에는 "후반 시작"만 있고, 일시 중지·전반 종료는 숨긴다', () => {
      gameAtHalftime();
      render(<CoreHarness />);

      const bar = screen.getByRole('group', { name: '경기 진행 조작' });
      expect(within(bar).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual([
        '후반 시작',
        '더보기',
      ]);
      // 조기 정상 종료는 주 조작 줄이 아니라 ⋯ 더보기 시트 안에 있다.
      expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
      expect(screen.queryByRole('button', { name: '일시 중지' })).toBeNull();
      expect(screen.queryByRole('button', { name: '전반 종료' })).toBeNull();
      expect(within(screen.getByRole('banner')).getByText(/하프타임이에요\. 준비되면 ‘후반 시작’을 눌러 주세요/)).toBeInTheDocument();
      // 시작 안내가 하프타임 안내와 겹치지 않아야 한다.
      expect(screen.queryByText('경기를 시작해 주세요.')).toBeNull();

      // 하프타임에도 빠진 골·카드·파울은 앞 피리어드 끝 시각으로 기록할 수 있다
      // (2026-11-18 사용자 확정). LIVE인 피리어드가 없어도 이 네 종류는 열린다.
      expect(screen.getByRole('button', { name: /^골/ })).toBeEnabled();
    });

    it('골·자책골·옐로/레드카드·파울은 열려 있고, 하프타임 안내가 그 사실을 알려준다', () => {
      gameAtHalftime();
      render(<CoreHarness />);

      for (const name of ['골', '자책골', '옐로카드', '레드카드', '파울']) {
        expect(screen.getByRole('button', { name })).toBeEnabled();
      }
      expect(screen.getByText(/빠진 골·카드·파울은 지금도 전반 끝 시각으로 기록할 수 있어요/)).toBeInTheDocument();
    });

    it('하프타임에 누른 골은 전반이 실제로 뛴 시간(20:00)에 고정해 기록한다', async () => {
      gameAtHalftime();
      render(<CoreHarness />);

      fireEvent.click(screen.getByRole('button', { name: '골' }));

      expect(await screen.findByText(/20:00로 기록돼요/)).toBeInTheDocument();
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
      await waitFor(() =>
        expect(testFixtures.operations().submitEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'GOAL', period: 1, clockMs: 20 * 60000 }),
        ),
      );
    });

    it('"후반 시작"을 누르면 확인 모달을 거쳐 start-period를 보낸다', async () => {
      gameAtHalftime();
    testFixtures.sendCommand.mockResolvedValue(gameMutationResult('LIVE'));
      render(<CoreHarness />);

      fireEvent.click(screen.getByRole('button', { name: '후반 시작' }));

      // 진행 명령인 start-period 는 확인을 거친다.
      const dialog = await screen.findByRole('dialog');
      expect(testFixtures.sendCommand).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: '후반 시작' }));

      await waitFor(() =>
        expect(testFixtures.sendCommand).toHaveBeenCalledWith('game-1', 'start-period', expect.anything(), COMMAND_OPTIONS),
      );
    });

    it('더보기의 "전반 종료 되돌리기"는 확인 없이 곧장 revert-period를 보낸다', async () => {
      gameAtHalftime();
      testFixtures.sendCommand.mockResolvedValue(gameMutationResult('LIVE'));
      render(<CoreHarness />);

      fireEvent.click(within(openMoreSheet()).getByRole('button', { name: /^전반 종료 되돌리기/ }));

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

    it('전반 중에는 첫 화면에 종료 계열 버튼이 없고, 더보기 시트의 위험 묶음 안에 둘 다 있다', () => {
      gameWithPeriods('LIVE', FIRST_HALF);
      render(<CoreHarness />);

      expect(screen.getByRole('button', { name: '전반 종료' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
      expect(screen.queryByRole('button', { name: /경기 일찍 끝내기/ })).toBeNull();
      expect(screen.queryByRole('button', { name: /몰수·중단으로 끝내기/ })).toBeNull();

      const sheet = openMoreSheet();
      expect(within(sheet).getByText('되돌리기 어려운 동작')).toBeInTheDocument();
      expect(within(sheet).getByRole('button', { name: /^경기 일찍 끝내기/ })).toBeEnabled();
      expect(within(sheet).getByRole('button', { name: /^몰수·중단으로 끝내기/ })).toBeEnabled();
      // 시트 설명은 점수 규칙을 말하지 않는다 — 몰수(3:0, 3골 차 이상이면 기록 그대로)와 중단(기록된 점수)이
      // 한 줄에 섞이면 한쪽이 틀리므로 점수 안내는 종료 창이 고른 종류에 맞춰 한다.
      expect(within(sheet).getByText('사유를 남기고 마쳐요')).toBeInTheDocument();
      expect(within(sheet).queryByText(/기록된 점수/)).toBeNull();
    });

    it('시트에서 "경기 일찍 끝내기"를 고르면 시트는 닫히고 확인 창이 하나만 뜨며, 확인해야 end 를 보낸다', async () => {
      gameWithPeriods('LIVE', FIRST_HALF);
      testFixtures.sendCommand.mockResolvedValue(gameRevisionMutationResult('ENDED'));
      render(<CoreHarness />);

      fireEvent.click(within(openMoreSheet()).getByRole('button', { name: /^경기 일찍 끝내기/ }));

      const confirmDialog = await screen.findByRole('dialog');
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(confirmDialog).toHaveAccessibleName('경기를 종료할까요?');
      expect(testFixtures.sendCommand).not.toHaveBeenCalled();

      fireEvent.click(within(confirmDialog).getByRole('button', { name: '경기 종료' }));
      await waitFor(() =>
        expect(testFixtures.sendCommand).toHaveBeenCalledWith('game-1', 'end', expect.anything(), COMMAND_OPTIONS),
      );
    });

    it('시트에서 "몰수·중단으로 끝내기"를 고르면 사유 입력 창이 열린다', () => {
      gameWithPeriods('LIVE', FIRST_HALF);
      render(<CoreHarness />);

      fireEvent.click(within(openMoreSheet()).getByRole('button', { name: /^몰수·중단으로 끝내기/ }));

      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByRole('dialog', { name: '몰수·중단으로 끝내기' })).toBeInTheDocument();
    });

    it('일시 중지 중에도 종료는 진행 바가 아니라 시트 안에 있다', () => {
      gameWithPeriods('LIVE', FIRST_HALF);
      testFixtures.game.mockReturnValue({
        ...testFixtures.game(),
        data: { ...testFixtures.game().data, state: 'PAUSED' },
      });
      testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 2, state: 'PAUSED' } }));
      render(<CoreHarness />);

      expect(screen.getByRole('button', { name: '재개' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
      expect(within(openMoreSheet()).getByRole('button', { name: /^경기 일찍 끝내기/ })).toBeInTheDocument();
    });

    it('정규 시간 종료 뒤의 "경기 종료"는 진행 바의 주 버튼이고, 시트의 위험 묶음에는 일찍 끝내기가 없다', () => {
      gameWithPeriods('LIVE', REGULATION_ENDED);
      render(<CoreHarness />);

      expect(within(screen.getByRole('group', { name: '경기 진행 조작' })).getByRole('button', { name: '경기 종료' })).toBeEnabled();

      const sheet = openMoreSheet();
      expect(within(sheet).queryByRole('button', { name: /^경기 일찍 끝내기/ })).toBeNull();
      expect(within(sheet).getByRole('button', { name: /^몰수·중단으로 끝내기/ })).toBeInTheDocument();
    });

    it('조작할 명령이 없는 경기(종료됨)에는 진행 바와 더보기가 없다', () => {
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

    it('뛰는 동안에는 스트립이 없다 — 상태 칩과 시계가 단계를 말한다', () => {
      gameWithPeriods('LIVE', [
        { number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null },
        { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
      ]);
      const { unmount } = render(<CoreHarness />);
      expect(strip()).toBeNull();
      expect(within(screen.getByRole('banner')).getByText('진행 중')).toBeInTheDocument();
      unmount();

      gameWithPeriods('LIVE', [
        { number: 1, state: 'ENDED', startedAt: '2026-08-07T00:00:00.000Z', endedAt: '2026-08-07T00:20:00.000Z' },
        { number: 2, state: 'HALFTIME', startedAt: null, endedAt: null },
      ]);
      render(<CoreHarness />);
      expect(strip()).toBeNull();
      expect(within(screen.getByRole('banner')).getByText('하프타임')).toBeInTheDocument();
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
      expect(screen.queryByRole('group', { name: '기록하기' })).toBeNull();
      expect(screen.queryByRole('button', { name: /^골/ })).toBeNull();
      expect(screen.queryByText(/팀 파울/)).toBeNull();
      expect(screen.getByRole('list', { name: '기록 목록' })).toBeInTheDocument();
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

    it('후반이 뛰는 중에도 더보기 시트로 일찍 끝내기와 몰수·중단으로 끝내기에 닿는다', () => {
      secondHalf('LIVE');
      render(<CoreHarness />);

      expect(screen.getByRole('button', { name: '후반 종료' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
      const sheet = openMoreSheet();
      expect(within(sheet).getByRole('button', { name: /^경기 일찍 끝내기/ })).toBeEnabled();
      expect(within(sheet).getByRole('button', { name: /^몰수·중단으로 끝내기/ })).toBeEnabled();
    });

    it('연결이 끊긴 동안에는 재개와 더보기의 종료 계열을 잠그고 다시 연결하는 중이라고 알리되, 기록은 막지 않는다', async () => {
      secondHalf('PAUSED', { connectionStatus: 'disconnected' });
      render(<CoreHarness />);

      expect(screen.getByRole('button', { name: '재개' })).toBeDisabled();
      const sheet = openMoreSheet();
      expect(within(sheet).getByRole('button', { name: /^경기 일찍 끝내기/ })).toBeDisabled();
      expect(within(sheet).getByRole('button', { name: /^몰수·중단으로 끝내기/ })).toBeDisabled();
      expect(within(sheet).getByRole('button', { name: /^경기 시작 취소/ })).toBeDisabled();
      fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
      expect(statusRow()).toHaveTextContent('연결이 끊겼어요');
      expect(
        await findConsoleNotice('다시 연결하는 중이에요. 연결될 때까지 재개·종료 같은 진행 버튼은 잠겨요. 그동안 적는 기록은 이 기기에 모아 두었다가 보내요.'),
      ).toBeInTheDocument();
      // 골·카드는 이 기기 큐에 모였다가 연결되면 나간다 — 잠그는 건 진행 명령뿐이다.
      expect(screen.getByRole('button', { name: /^골/ })).toBeEnabled();
    });

    it('확인 창이 떠 있는 사이 연결이 끊기면 재개를 보내지 않고, 보내지 않았다고 알린다', async () => {
      await confirmResumeAfter({ connectionStatus: 'disconnected' });

      expect(
        await findConsoleNotice('실시간 연결이 끊겨 있어 ‘재개’ 요청을 보내지 않았어요. 연결되면 다시 눌러 주세요.'),
      ).toBeInTheDocument();
      expect(testFixtures.sendCommand).not.toHaveBeenCalled();
    });

    it('확인 창이 떠 있는 사이 기록 권한이 만료되면 재개를 보내지 않고, 그 이유를 알린다', async () => {
      await confirmResumeAfter({ takeover: { status: 'expired' } });

      expect(
        await findConsoleNotice('기록 권한을 다시 확인하는 중이라 ‘재개’ 요청을 보내지 않았어요. 권한을 받으면 다시 눌러 주세요.'),
      ).toBeInTheDocument();
      expect(testFixtures.sendCommand).not.toHaveBeenCalled();
    });

    it('확인 창이 떠 있는 사이 기록 권한이 다시 발급되면 창을 열 때의 토큰이 아니라 새 토큰으로 보낸다', async () => {
      testFixtures.sendCommand.mockResolvedValue(gameMutationResult('LIVE'));
      await confirmResumeAfter({ takeover: { ...HELD, token: 'tok-2' } });

      await waitFor(() => expect(testFixtures.sendCommand).toHaveBeenCalledTimes(1));
      expect(testFixtures.sendCommand.mock.calls[0][1]).toBe('resume');
      expect(testFixtures.sendCommand.mock.calls[0][2]).toEqual(expect.objectContaining({ takeoverToken: 'tok-2' }));
    });

    // 2026-10-01 사용자 결정 — 어드민은 언제든 고칠 수 있어야 한다. 현장 스태프의 잠금(위)은 그대로다.
    describe('플랫폼 운영자는 연결이 끊긴 동안에도', () => {
      it('재개와 더보기의 종료 계열을 쓸 수 있고, 잠그지 않는다고 알린다', async () => {
        secondHalf('PAUSED', { connectionStatus: 'disconnected' }, 'platform_ops');
        render(<CoreHarness />);

        expect(screen.getByRole('button', { name: '재개' })).toBeEnabled();
        const sheet = openMoreSheet();
        expect(within(sheet).getByRole('button', { name: /^경기 일찍 끝내기/ })).toBeEnabled();
        expect(within(sheet).getByRole('button', { name: /^몰수·중단으로 끝내기/ })).toBeEnabled();
        fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
        expect(await findConsoleNotice(/진행 버튼은 그대로 쓸 수 있고, 보낸 명령은 서버 기준으로 반영돼요/)).toBeInTheDocument();
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
      it('끊긴 사이 기록 권한이 만료되면 진행 버튼을 잠그고 그 이유를 알린다', async () => {
        secondHalf('PAUSED', { connectionStatus: 'disconnected', takeover: { status: 'expired' } }, 'platform_ops');
        render(<CoreHarness />);

        expect(screen.getByRole('button', { name: '재개' })).toBeDisabled();
        expect(
          await findConsoleNotice('연결이 끊긴 사이 기록 권한이 만료돼 진행 명령을 보낼 수 없어요. 다시 연결되면 권한을 새로 받아요.'),
        ).toBeInTheDocument();
      });

      it('확인 창이 떠 있는 사이 끊기고 권한까지 만료되면 보내지 않고 그 이유를 알린다', async () => {
        await confirmResumeAfter({ connectionStatus: 'disconnected', takeover: { status: 'expired' } }, 'platform_ops');

        expect(
          await findConsoleNotice('연결이 끊긴 사이 기록 권한이 만료돼 ‘재개’ 요청을 보내지 않았어요. 다시 연결되면 권한을 새로 받아요.'),
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
        expect(statusRow()).toHaveTextContent('재개 요청의 응답을 받지 못했어요');
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

    describe('재시도 사이 기록 권한이 다시 발급되거나 시간이 흐르면', () => {
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
          .mockRejectedValueOnce(rejected(422, 'CLOCK_DRIFT', '기록 시각이 서버 시각과 30초 넘게 차이 나요. 다시 시도해 주세요. 계속 같은 안내가 나오면 기기의 날짜와 시간을 확인해 주세요.'))
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
        expect(within(openStatusSheet()).getByText('A valid exclusive takeover token is required')).toBeInTheDocument();
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

    // 교체도 확인 없이 저장한다.
    await waitFor(() =>
      expect(testFixtures.operations().submitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'SUBSTITUTION', participantId: 'p-2', sideId: 'side-home', payload: { outParticipantId: 'p-1' } }),
      ),
    );
    expect(testFixtures.operations().submitEvent).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('교체 · 강남 풋살 클럽 · 정우진 → 이민호 기록했어요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument();
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

  describe('퇴장 패널티 카운트다운(롤링 교체 종목)', () => {
    // LIVE_PERIOD 는 2026-08-07 00:00:00Z 에 시작했다 — 시스템 시각만 고정해 경기 시계를 8:00 으로 둔다.
    const MATCH_TIME = (minutes: number, seconds = 0) => new Date(Date.UTC(2026, 7, 7, 0, minutes, seconds));
    const card = (id: string, sequence: number, color: 'RED' | 'YELLOW', clockMs: number): GameEventRecord => ({
      ...substitutionEvent(id, sequence, 'p-1', 'p-2'),
      type: 'CARD',
      participantId: 'p-1',
      clockMs,
      payload: { card: color },
    });
    const opponentGoal = (clockMs: number): GameEventRecord => ({
      ...substitutionEvent('goal-away', 9, 'p-9', 'p-8'),
      type: 'GOAL',
      sideId: 'side-away',
      participantId: 'p-9',
      clockMs,
      payload: {},
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('레드카드를 받은 팀에 "패널티 1:30"이 남은 시간과 함께 뜬다', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(MATCH_TIME(8, 0));
      gameWithSubstitutionPolicy({ mode: 'rolling', maxSubstitutions: null }, [card('red-1', 1, 'RED', 7.5 * 60_000)]);
      render(<CoreHarness />);

      const list = screen.getByRole('list', { name: '퇴장 패널티' });
      expect(within(list).getByRole('timer')).toHaveTextContent('패널티 1:30');
      expect(list).toHaveTextContent('강남 풋살 클럽 · 정우진 퇴장');
    });

    it('2분이 지났거나 상대가 득점했거나 레드카드가 아니면 아무것도 뜨지 않는다', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(MATCH_TIME(9, 40));
      gameWithSubstitutionPolicy({ mode: 'rolling', maxSubstitutions: null }, [card('red-1', 1, 'RED', 7.5 * 60_000)]);
      const { unmount } = render(<CoreHarness />);
      expect(screen.queryByRole('list', { name: '퇴장 패널티' })).toBeNull();
      unmount();

      vi.setSystemTime(MATCH_TIME(8, 0));
      gameWithSubstitutionPolicy({ mode: 'rolling', maxSubstitutions: null }, [card('red-1', 1, 'RED', 7.5 * 60_000), opponentGoal(7.75 * 60_000)]);
      const second = render(<CoreHarness />);
      expect(screen.queryByRole('list', { name: '퇴장 패널티' })).toBeNull();
      second.unmount();

      gameWithSubstitutionPolicy({ mode: 'rolling', maxSubstitutions: null }, [card('yellow-1', 1, 'YELLOW', 7.5 * 60_000)]);
      render(<CoreHarness />);
      expect(screen.queryByRole('list', { name: '퇴장 패널티' })).toBeNull();
    });

    it('제한 교체 종목(축구)에서는 레드카드가 있어도 패널티를 띄우지 않는다', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(MATCH_TIME(8, 0));
      gameWithSubstitutionPolicy({ mode: 'limited', maxSubstitutions: 5 }, [card('red-1', 1, 'RED', 7.5 * 60_000)]);
      render(<CoreHarness />);

      expect(screen.queryByRole('list', { name: '퇴장 패널티' })).toBeNull();
    });

    // alpha 확인(#2506): 일시 중지하면 경기 상태가 PAUSED 가 되는데 줄이 통째로 사라졌다.
    it('일시 중지(PAUSED) 중에도 줄이 남고, 시계와 함께 멈춘 값에 "일시 중지 중"을 적는다', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      // 8:00 에 멈췄고 지금은 그 뒤 30초 — 숫자는 8:00 기준 그대로여야 한다.
      vi.setSystemTime(MATCH_TIME(8, 30));
      testFixtures.game.mockReturnValue({
        data: {
          id: 'game-1', state: 'PAUSED', version: 2, lastSequence: 1,
          periods: [{ ...LIVE_PERIOD, pausedAt: MATCH_TIME(8, 0).toISOString() }],
          sides: SUB_SIDES, lineups: [], substitutionPolicy: { mode: 'rolling', maxSubstitutions: null },
        },
        isLoading: false, isError: false, refetch: vi.fn(),
      });
      testFixtures.operations.mockReturnValue(
        consoleState({ gameSnapshot: { version: 2, state: 'PAUSED' }, liveEvents: [card('red-1', 1, 'RED', 7.5 * 60_000)] }),
      );
      render(<CoreHarness />);

      const list = screen.getByRole('list', { name: '퇴장 패널티' });
      expect(within(list).getByRole('timer')).toHaveTextContent('패널티 1:30');
      expect(list).toHaveTextContent('일시 중지 중');
    });

    // alpha 확인(#2506): 전반을 설정 길이(20분)보다 일찍 끝내면 하프타임에 줄이 사라졌다.
    it('전반을 설정 길이보다 일찍 끝내도 하프타임에 실제로 흐른 시간으로 줄을 유지한다', () => {
      gameWithSubstitutionPolicy({ mode: 'rolling', maxSubstitutions: null }, [card('red-1', 1, 'RED', 4.5 * 60_000)]);
      testFixtures.game.mockReturnValue({
        data: {
          id: 'game-1', state: 'LIVE', version: 2, lastSequence: 1,
          // 전반은 설정이 20분인데 5:00 에 끝났다. 퇴장은 4:30 — 하프타임 값은 실제 종료(5:00) 기준 30초가 흐른 1:30 이다.
          periods: [
            { id: 'period-1', gameId: 'game-1', number: 1, state: 'ENDED', startedAt: MATCH_TIME(0).toISOString(), endedAt: MATCH_TIME(5).toISOString(), pausedTotalMs: 0, pausedAt: null },
            { id: 'period-2', gameId: 'game-1', number: 2, state: 'HALFTIME', startedAt: null, endedAt: null, pausedTotalMs: 0, pausedAt: null },
          ],
          sides: SUB_SIDES, lineups: [], substitutionPolicy: { mode: 'rolling', maxSubstitutions: null },
          periodDurations: [{ durationMinutes: 20, extraTime: false }, { durationMinutes: 20, extraTime: false }],
        },
        isLoading: false, isError: false, refetch: vi.fn(),
      });
      render(<CoreHarness />);

      const list = screen.getByRole('list', { name: '퇴장 패널티' });
      expect(within(list).getByRole('timer')).toHaveTextContent('패널티 1:30');
      expect(list).toHaveTextContent('하프타임');
    });
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

  it('경기별 제출 단계가 없어 한쪽 제출본만 있어도 시작하고 제출을 요구하지 않는다', () => {
    setup([{ sideId: 'side-home', state: 'SUBMITTED', revision: 2, invalidatedAt: null }]);
    render(<CoreHarness />);

    expect(screen.getByRole('button', { name: '경기 시작' })).toBeEnabled();
    expect(screen.queryByText(/아직 출전 명단을 제출하지 않았어요/)).not.toBeInTheDocument();
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
  ] as const)('유효 경기 출전자가 %s 팀에 없어도 시작할 수 있고, 시작 전에는 명단 안내를 따로 띄우지 않는다', (_side, counts, teamNames) => {
    setup([], 'TEAM_MATCH', counts);
    render(<CoreHarness />);

    expect(screen.getByRole('button', { name: '경기 시작' })).toBeEnabled();
    // 시작 전의 명단은 킥오프 준비 패널이 보여 준다 — 상태 줄·시트가 다른 숫자를 말하지 않는다.
    expect(statusRow()).not.toHaveTextContent(teamNames.split(', ')[0]);
    expect(within(openStatusSheet()).queryByText('출전 명단')).toBeNull();
    expect(document.body).not.toHaveTextContent('익명으로만');
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
    expect(screen.getByRole('button', { name: '경기 시작' })).toBeEnabled();
    expect(document.body).not.toHaveTextContent('익명으로만');
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

  it('경기 시작 취소는 ‘취소한다’ 를 정확히 입력해야 확인 버튼이 켜지고 revert-start 에 confirmation 이 실린다', async () => {
    testFixtures.operations.mockReturnValue(
      consoleState({ gameSnapshot: { version: 2, state: 'LIVE' }, liveEvents: [goal(1), { ...goal(2), type: 'FOUL' } as GameEventRecord] }),
    );
    render(<CoreHarness />);
    expect(screen.queryByRole('button', { name: '경기 시작 취소' })).toBeNull();
    fireEvent.click(within(openMoreSheet()).getByRole('button', { name: /^경기 시작 취소/ }));

    const dialog = await screen.findByRole('dialog', { name: '경기 시작을 취소할까요?' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(dialog).toHaveTextContent('무효 처리할 경기 기록: 골 1건, 파울 1건. 경기 시계를 초기화하고 시작 전으로 돌아가요.');
    const submit = within(dialog).getByRole('button', { name: '경기 시작 취소' });
    expect(submit).toBeDisabled();
    const input = within(dialog).getByRole('textbox');
    fireEvent.change(input, { target: { value: '취소한다 ' } });
    expect(submit).toBeDisabled();
    expect(testFixtures.sendCommand).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '취소한다' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    await waitFor(() => expect(testFixtures.sendCommand).toHaveBeenCalledWith('game-1', 'revert-start',
      expect.objectContaining({ payload: { confirmation: '취소한다' } }), COMMAND_OPTIONS));
    expect(testFixtures.sendCommand).toHaveBeenCalledTimes(1);
  });

  it('기록이 없으면 무효 처리할 기록이 없다고 말한다', async () => {
    testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 2, state: 'LIVE' }, liveEvents: [] }));
    render(<CoreHarness />);
    fireEvent.click(within(openMoreSheet()).getByRole('button', { name: /^경기 시작 취소/ }));

    expect(await screen.findByRole('dialog', { name: '경기 시작을 취소할까요?' })).toHaveTextContent('무효 처리할 경기 기록: 없음.');
  });

  it('경기 시작 취소 확인 사이 버전이 바뀌면 보내지 않는다', async () => {
    const view = render(<CoreHarness />);
    fireEvent.click(within(openMoreSheet()).getByRole('button', { name: /^경기 시작 취소/ }));
    const dialog = await screen.findByRole('dialog', { name: '경기 시작을 취소할까요?' });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '취소한다' } });

    // 확인 창이 떠 있는 사이 다른 기록이 커밋돼 버전이 오른다.
    testFixtures.operations.mockReturnValue(consoleState({ gameSnapshot: { version: 3, state: 'LIVE' }, liveEvents: [goal(1), goal(2)] }));
    view.rerender(<CoreHarness />);
    fireEvent.click(within(dialog).getByRole('button', { name: '경기 시작 취소' }));

    expect(await findConsoleNotice('경기 기록이 바뀌었어요. 취소할 기록을 다시 확인해 주세요.')).toBeInTheDocument();
    expect(testFixtures.sendCommand).not.toHaveBeenCalled();
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
    expect(
      await findConsoleNotice('명령은 저장됐지만 최신 상태를 불러오지 못했어요. 화면을 새로고침해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '같은 요청 재시도' })).toBeNull();
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

    expect(await screen.findByText(/이 경기 시간은 보통 20분이에요/)).toBeInTheDocument();
    expect(testFixtures.operations().submitEvent).not.toHaveBeenCalled();
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
    await screen.findByText(/이 경기 시간은 보통 20분이에요/);

    fireEvent.click(screen.getByRole('button', { name: '그대로 기록' }));

    await waitFor(() =>
      expect(testFixtures.operations().submitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'GOAL', participantId: 'p-1' }),
      ),
    );
  });

  it('경기 시간 설정을 못 읽었으면(periodDurations: null) 시계 경고 없이 바로 기록한다', async () => {
    setup(null);
    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));

    // 판단 근거가 없으면 지어낸 경고를 보여 주지 않는다.
    await waitFor(() => expect(testFixtures.operations().submitEvent).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText(/이 경기 시간은 보통/)).toBeNull();
  });
});

// UX 감사 item 4 — takeover.status가 'none'/'requesting'인 동안 명령 버튼·
// LineupGrid가 전부 비활성인데 이유가 화면에 없었다.
describe('OperateConsole — 기록 권한 요청 중 안내 (UX 감사 item 4)', () => {
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
    'takeover.status가 %s이면 상태 줄이 기록할 준비를 하는 중이라고 알린다',
    (status) => {
      testFixtures.operations.mockReturnValue(consoleState({ takeover: { status } }));
      render(<CoreHarness />);

      expect(statusRow()).toHaveTextContent('이 기기에서 기록할 준비를 하는 중이에요…');
    },
  );

  it('권한을 보유하면(held) 안내가 사라진다', () => {
    testFixtures.operations.mockReturnValue(consoleState());
    render(<CoreHarness />);

    expect(statusRow()).not.toHaveTextContent('준비를 하는 중');
    expect(statusRow()).toHaveTextContent('이 기기에서 기록 중 · 연결됨');
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

// 경고 누적 퇴장 합친 줄 — 두 번째 옐로와 레드는 같은 순간의 기록이라 시각을 같이 옮기고, 취소는 레드만/모두로 갈린다.
describe('OperateConsole — 경고 누적 퇴장 합친 줄의 고치기·취소', () => {
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

  const card = (sequence: number, color: 'YELLOW' | 'RED', period: number, clockMs: number): GameEventRecord =>
    ({ ...goal(sequence), type: 'CARD', period, clockMs, payload: { card: color } }) as GameEventRecord;
  const first = card(1, 'YELLOW', 1, 11 * 60000);
  const second = card(2, 'YELLOW', 2, 31 * 60000);
  const red = card(3, 'RED', 2, 31 * 60000);
  const SHEET = '경고 누적 퇴장 기록 고치기';
  const openMergedSheet = async () => {
    fireEvent.click(within(screen.getByRole('list', { name: '기록 목록' })).getByRole('button', { name: '기록 고치기 (경고 누적 퇴장)' }));
    return screen.findByRole('dialog', { name: SHEET });
  };

  it('시각을 고치면 옐로, 이어서 레드를 같은 시각·같은 이유로 고친다', async () => {
    const correctEventTime = vi.fn<NonNullable<OperationsContract['correctEventTime']>>().mockResolvedValue(undefined);
    testFixtures.operations.mockReturnValue(consoleState({ liveEvents: [first, second, red], correctEventTime }));
    render(<CoreHarness />);

    const dialog = await openMergedSheet();
    expect(within(dialog).getByText('옐로카드와 레드카드가 함께 옮겨져요.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '1분 빼기' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '31:00 → 30:00으로 고치기' }));

    await waitFor(() => expect(correctEventTime).toHaveBeenCalledTimes(2));
    const reason = '경기 중 기록 시각 고치기 (31:00 → 30:00)';
    expect(correctEventTime).toHaveBeenNthCalledWith(1, { eventId: 'event-2', clockMs: 30 * 60000, reason });
    expect(correctEventTime).toHaveBeenNthCalledWith(2, { eventId: 'event-3', clockMs: 30 * 60000, reason });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: SHEET })).toBeNull());
  });

  it('옐로만 옮겨지고 레드가 실패하면 안내를 남기고, 다시 고치면 이미 옮긴 옐로는 건너뛰고 레드만 옮긴다', async () => {
    const correctEventTime = vi
      .fn<NonNullable<OperationsContract['correctEventTime']>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('서버가 바빠요.'))
      .mockResolvedValue(undefined);
    testFixtures.operations.mockReturnValue(consoleState({ liveEvents: [first, second, red], correctEventTime }));
    const view = render(<CoreHarness />);

    const dialog = await openMergedSheet();
    fireEvent.click(within(dialog).getByRole('button', { name: '1분 빼기' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '31:00 → 30:00으로 고치기' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('옐로카드 시각은 옮겼지만 레드카드 시각은 못 옮겼어요');
    expect(screen.getByRole('dialog', { name: SHEET })).toBeInTheDocument();
    expect(correctEventTime).toHaveBeenCalledTimes(2);

    // 옐로의 정정이 반영된 목록(옐로 30:00, 레드 31:00)으로 다시 그려진 상태에서 다시 정정한다.
    const yellowCorrection: GameEventRecord = {
      ...goal(4),
      id: 'tc-1',
      type: 'TIME_CORRECTION',
      sideId: null,
      participantId: null,
      period: 2,
      clockMs: 30 * 60000,
      correctsEventId: 'event-2',
      payload: { previousClockMs: 31 * 60000, clockMs: 30 * 60000, reason: '자동', lane: 'OPERATOR' },
    } as GameEventRecord;
    testFixtures.operations.mockReturnValue(consoleState({ liveEvents: [first, second, red, yellowCorrection], correctEventTime }));
    view.rerender(<CoreHarness />);
    fireEvent.click(within(screen.getByRole('dialog', { name: SHEET })).getByRole('button', { name: '31:00 → 30:00으로 고치기' }));

    await waitFor(() => expect(correctEventTime).toHaveBeenCalledTimes(3));
    expect(correctEventTime).toHaveBeenLastCalledWith({
      eventId: 'event-3',
      clockMs: 30 * 60000,
      reason: '경기 중 기록 시각 고치기 (31:00 → 30:00)',
    });
  });

  it('"레드카드만 취소"는 확인을 거쳐 레드만 되돌리고 옐로 2장은 남긴다', async () => {
    const ops = consoleState({ liveEvents: [first, second, red] });
    ops.reverseEvent.mockResolvedValue(undefined);
    testFixtures.operations.mockReturnValue(ops);
    render(<CoreHarness />);

    const dialog = await openMergedSheet();
    fireEvent.click(within(dialog).getByRole('tab', { name: '기록 취소' }));
    expect(within(dialog).queryByRole('button', { name: '이 기록 취소하기' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '레드카드만 취소 (퇴장 취소)' }));

    const confirmDialog = await screen.findByRole('dialog', { name: '레드카드 기록을 취소할까요?' });
    expect(confirmDialog).toHaveTextContent('옐로 2장은 그대로 남고 퇴장만 취소돼요');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '레드 취소' }));

    await waitFor(() => expect(ops.reverseEvent).toHaveBeenCalledTimes(1));
    expect(ops.reverseEvent).toHaveBeenCalledWith({ eventId: 'event-3', reason: '레드카드 기록 취소' });
  });

  it('"옐로·레드 모두 취소"는 레드를 먼저, 이어서 두 번째 옐로를 되돌린다', async () => {
    const ops = consoleState({ liveEvents: [first, second, red] });
    ops.reverseEvent.mockResolvedValue(undefined);
    testFixtures.operations.mockReturnValue(ops);
    render(<CoreHarness />);

    const dialog = await openMergedSheet();
    fireEvent.click(within(dialog).getByRole('tab', { name: '기록 취소' }));
    fireEvent.click(within(dialog).getByRole('button', { name: '옐로·레드 모두 취소' }));

    const confirmDialog = await screen.findByRole('dialog', { name: '두 번째 옐로와 레드를 모두 취소할까요?' });
    expect(confirmDialog).toHaveTextContent('첫 번째 옐로는 그대로 남아요');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: '모두 취소' }));

    await waitFor(() => expect(ops.reverseEvent).toHaveBeenCalledTimes(2));
    expect(ops.reverseEvent).toHaveBeenNthCalledWith(1, { eventId: 'event-3', reason: '레드카드 기록 취소' });
    expect(ops.reverseEvent).toHaveBeenNthCalledWith(2, { eventId: 'event-2', reason: '옐로카드 기록 취소' });
  });

  it('합치지 않은 카드 한 장의 고치기 시트에는 함께 옮김 안내와 취소 선택지가 없다', async () => {
    const ops = consoleState({ liveEvents: [first] });
    ops.reverseEvent.mockResolvedValue(undefined);
    testFixtures.operations.mockReturnValue(ops);
    render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '기록 고치기 (옐로카드)' }));
    const dialog = await screen.findByRole('dialog', { name: '옐로카드 기록 고치기' });
    expect(within(dialog).queryByText(/함께 옮겨져요/)).toBeNull();
    fireEvent.click(within(dialog).getByRole('tab', { name: '기록 취소' }));
    expect(within(dialog).getByRole('button', { name: '이 기록 취소하기' })).toBeInTheDocument();
  });
});

describe('OperateConsole — 기록은 확인 없이 저장하고 5초 되돌리기를 준다', () => {
  const RECORDED = '골 · 강남 풋살 클럽 · 정우진 기록했어요';

  function setup(overrides: Partial<MockedOperations> = {}) {
    testFixtures.auth.mockReturnValue({ data: { user: { id: 'user-1' } } });
    testFixtures.lineups.mockReturnValue({
      data: {
        gameId: 'game-1',
        lineups: [{
          sideId: 'side-home', state: 'SUBMITTED', invalidatedAt: null, revision: 1,
          participants: [{
            id: 'p-1', gameId: 'game-1', sideId: 'side-home', lineupId: 'l-1',
            displayNameSnapshot: '정우진', jerseyNumber: 10, position: null, createdAt: '', updatedAt: '',
          }],
        }],
      },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    testFixtures.game.mockReturnValue({
      data: {
        id: 'game-1', state: 'LIVE', version: 2, lastSequence: 1,
        periods: [
          { id: 'period-1', gameId: 'game-1', number: 1, state: 'LIVE', startedAt: '2026-08-07T00:00:00.000Z', endedAt: null, pausedTotalMs: 0, pausedAt: null },
          { id: 'period-2', gameId: 'game-1', number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null, pausedTotalMs: 0, pausedAt: null },
        ],
        sides: [
          { id: 'side-home', gameId: 'game-1', sideKey: 'HOME', teamId: 'team-home', displayNameSnapshot: '강남 풋살 클럽', createdAt: '', updatedAt: '' },
          { id: 'side-away', gameId: 'game-1', sideKey: 'AWAY', teamId: 'team-away', displayNameSnapshot: '성수 풋살 클럽', createdAt: '', updatedAt: '' },
        ],
        lineups: [],
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    const state = consoleState({ liveEvents: [], gameSnapshot: { version: 2, state: 'LIVE' }, ...overrides });
    state.submitEvent.mockResolvedValue('c1');
    testFixtures.operations.mockReturnValue(state);
    return state;
  }

  /** 같은 submitEvent·reverseEvent 를 쥔 채 서버 상태(큐·기록 목록)만 바꾼다. */
  function advance(state: MockedOperations, overrides: Partial<MockedOperations>) {
    const next = consoleState({
      liveEvents: [],
      gameSnapshot: { version: 3, state: 'LIVE' },
      submitEvent: state.submitEvent,
      reverseEvent: state.reverseEvent,
      ...overrides,
    });
    testFixtures.operations.mockReturnValue(next);
    return next;
  }

  const recorded = (id: string, clientEventId: string, overrides: Partial<GameEventRecord> = {}): GameEventRecord =>
    ({ ...goal(9), id, clientEventId, period: 1, payload: {}, ...overrides }) as GameEventRecord;

  function recordGoal() {
    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('골: 선수를 고르면 확인 창 없이 submitEvent 가 한 번 불리고 되돌리기 토스트가 뜬다', async () => {
    const state = setup();
    render(<CoreHarness />);
    recordGoal();

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(state.submitEvent).toHaveBeenCalledTimes(1));
    expect(state.submitEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'GOAL', participantId: 'p-1', sideId: 'side-home' }));
    expect(await screen.findByText(RECORDED)).toBeInTheDocument();
    expect(screen.getByText('잘못 눌렀으면 5초 안에 되돌려요')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '되돌리기' })).toHaveClass('min-h-[44px]');
    expect(screen.queryByRole('button', { name: '어시스트 추가' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('되돌리기는 서버 이벤트 id 로 reverseEvent 를 확인 없이 부른다', async () => {
    const state = setup();
    const { rerender } = render(<CoreHarness />);
    recordGoal();
    const undo = await screen.findByRole('button', { name: '되돌리기' });
    advance(state, { liveEvents: [recorded('e9', 'c1')] });
    rerender(<CoreHarness />);

    fireEvent.click(undo);

    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledWith({ eventId: 'e9', reason: '골 기록 되돌리기' }));
    expect(state.reverseEvent).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
  });

  it('되돌리기를 연달아 두 번 눌러도 reverseEvent 는 한 번만 나간다', async () => {
    const state = setup();
    const { rerender } = render(<CoreHarness />);
    recordGoal();
    const undo = await screen.findByRole('button', { name: '되돌리기' });
    advance(state, { liveEvents: [recorded('e9', 'c1')] });
    rerender(<CoreHarness />);

    fireEvent.click(undo);
    fireEvent.click(undo);

    await screen.findByText('되돌렸어요');
    expect(state.reverseEvent).toHaveBeenCalledTimes(1);
  });

  it('아직 큐에 있는 기록은 확정을 기다렸다가 되돌린다', async () => {
    const state = setup();
    const { rerender } = render(<CoreHarness />);
    recordGoal();
    const undo = await screen.findByRole('button', { name: '되돌리기' });
    advance(state, { queue: { items: [queuedEvent('c1', 'sending')] }, gameSnapshot: { version: 2, state: 'LIVE' } });
    rerender(<CoreHarness />);

    fireEvent.click(undo);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(state.reverseEvent).not.toHaveBeenCalled();
    expect(screen.queryByText('되돌렸어요')).toBeNull();
    // 눌렀는데 아무 일도 없는 것처럼 보이지 않게, 기다리는 중이라고 알린다.
    expect(screen.getByText('기록을 보내는 중이에요. 서버에 닿으면 되돌릴게요.')).toBeInTheDocument();

    advance(state, { queue: { items: [queuedEvent('c1', 'acked')] }, liveEvents: [recorded('e9', 'c1')] });
    rerender(<CoreHarness />);

    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledWith({ eventId: 'e9', reason: '골 기록 되돌리기' }));
    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
  });

  it('토스트가 뜨는 바로 그 순간 눌러도 방금 넣은 기록을 큐에서 찾는다 — 서버에 없다고 넘겨짚지 않는다', async () => {
    const state = setup();
    let rerenderHarness = () => {};
    function LiveQueueHarness() {
      const [, setTick] = useState(0);
      rerenderHarness = () => setTick((tick) => tick + 1);
      return <CoreHarness />;
    }
    // 실제 훅처럼 큐에 넣는 상태 변경과 id 반환이 함께 일어나, 큐와 토스트가 같은 커밋에 나타난다.
    state.submitEvent.mockImplementation(async () => {
      advance(state, { queue: { items: [queuedEvent('c1', 'sending')] }, gameSnapshot: { version: 2, state: 'LIVE' } });
      rerenderHarness();
      return 'c1';
    });
    render(<LiveQueueHarness />);
    // 토스트가 DOM 에 붙은 직후, 다음 작업이 돌기 전에 누른다.
    const pressed = new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        const undo = screen.queryByRole('button', { name: '되돌리기' });
        if (undo === null) return;
        observer.disconnect();
        undo.click();
        resolve();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });

    recordGoal();
    await pressed;

    expect(await screen.findByText('기록을 보내는 중이에요. 서버에 닿으면 되돌릴게요.')).toBeInTheDocument();
    expect(testFixtures.serverEvents).not.toHaveBeenCalled();
    expect(state.reverseEvent).not.toHaveBeenCalled();
  });

  it('전송 실패로 표시된 기록도 서버 목록에 있으면 버전을 맞춘 뒤 되돌린다', async () => {
    const state = setup();
    testFixtures.serverEvents.mockResolvedValue({ events: [recorded('e9', 'c1')], version: 4, state: 'LIVE' });
    const { rerender } = render(<CoreHarness />);
    recordGoal();
    const undo = await screen.findByRole('button', { name: '되돌리기' });
    const failed = advance(state, { queue: { items: [queuedEvent('c1', 'failed')] }, gameSnapshot: { version: 2, state: 'LIVE' } });
    rerender(<CoreHarness />);

    fireEvent.click(undo);

    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledWith({ eventId: 'e9', reason: '골 기록 되돌리기' }));
    expect(testFixtures.serverEvents).toHaveBeenCalledWith('/games/game-1/events');
    // 이 기기가 놓친 커밋만큼 버전을 먼저 맞춘다 — 그래야 되돌리기가 옛 버전으로 나가지 않는다.
    expect(failed.applyCommandResult).toHaveBeenCalledWith({ state: 'LIVE', version: 4 });
    expect(failed.applyCommandResult.mock.invocationCallOrder[0]).toBeLessThan(state.reverseEvent.mock.invocationCallOrder[0]);
    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
  });

  it('서버가 없다고 확인한 기록은 reverseEvent 를 부르지 않고 그렇게 알린다', async () => {
    const state = setup();
    testFixtures.serverEvents.mockResolvedValue({ events: [], version: 2, state: 'LIVE' });
    const { rerender } = render(<CoreHarness />);
    recordGoal();
    const undo = await screen.findByRole('button', { name: '되돌리기' });
    advance(state, { queue: { items: [queuedEvent('c1', 'failed')] }, gameSnapshot: { version: 2, state: 'LIVE' } });
    rerender(<CoreHarness />);

    fireEvent.click(undo);

    expect(
      await findConsoleNotice('서버에 저장되지 않은 기록이라 되돌릴 것이 없어요. 뒤늦게 기록 목록에 나타나면 「고치기」에서 취소해 주세요.'),
    ).toBeInTheDocument();
    expect(state.reverseEvent).not.toHaveBeenCalled();
    expect(screen.queryByText('되돌렸어요')).toBeNull();
  });

  it('서버 목록을 읽지 못하면 없다고 단정하지 않고 결과를 모른다고 알린다', async () => {
    const state = setup();
    const { rerender } = render(<CoreHarness />);
    recordGoal();
    const undo = await screen.findByRole('button', { name: '되돌리기' });
    advance(state, { queue: { items: [queuedEvent('c1', 'failed')] }, gameSnapshot: { version: 2, state: 'LIVE' } });
    rerender(<CoreHarness />);

    fireEvent.click(undo);

    expect(
      await findConsoleNotice('전송 결과를 아직 확인하지 못했어요. 기록 목록에 나타나면 「고치기」에서 취소해 주세요.'),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('되돌릴 것이 없어요');
    expect(state.reverseEvent).not.toHaveBeenCalled();
  });

  it('서버 기록 목록에 이미 있는 기록은 큐가 실패로 표시해도 「보내지 못했어요」라고 하지 않는다', () => {
    setup({ liveEvents: [recorded('e9', 'c1')], queue: { items: [queuedEvent('c1', 'failed'), queuedEvent('c2', 'failed')] } });
    render(<CoreHarness />);

    // c1 은 서버에 있다(응답만 잃음). 손이 필요한 것은 c2 하나다.
    expect(statusRow()).toHaveTextContent('기록 1개를 보내지 못했어요');
    const sheet = openStatusSheet();
    expect(within(within(sheet).getByRole('list', { name: '전송 대기·실패한 기록 목록' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('이미 기록 목록에서 취소한 기록은 다시 되돌리지 않는다', async () => {
    const state = setup();
    const { rerender } = render(<CoreHarness />);
    recordGoal();
    const undo = await screen.findByRole('button', { name: '되돌리기' });
    advance(state, {
      liveEvents: [
        recorded('e9', 'c1'),
        recorded('e10', 'c-cancel', { type: 'CORRECTION', sequence: 10, reversesEventId: 'e9' }),
      ],
    });
    rerender(<CoreHarness />);

    fireEvent.click(undo);

    expect(await screen.findByText('이미 취소한 기록이에요')).toBeInTheDocument();
    expect(state.reverseEvent).not.toHaveBeenCalled();
    expect(screen.queryByText('되돌렸어요')).toBeNull();
  });

  const rejection = (code: string, message: string, statusCode = 409) =>
    new V1ApiError({ status: 'error', message, statusCode, code, timestamp: '2026-10-14T01:00:00Z' });

  /** 골 하나를 기록해 서버 목록에 올린 뒤 되돌리기 버튼을 돌려준다. */
  async function recordedGoalWithUndo(state: MockedOperations, overrides: Partial<MockedOperations> = {}) {
    const view = render(<CoreHarness />);
    recordGoal();
    const undo = await screen.findByRole('button', { name: '되돌리기' });
    const next = advance(state, { liveEvents: [recorded('e9', 'c1')], ...overrides });
    view.rerender(<CoreHarness />);
    return { ...view, undo, next };
  }

  // 서버 메시지는 영어 원문이거나 옛 용어일 수 있다 — 화면에는 코드별 해요체 안내만 나간다.
  it.each([
    ['VERSION_CONFLICT', 'Expected version is stale', '그사이 경기 기록이 바뀌어 되돌리지 못했어요. 기록 목록의 「고치기」에서 취소해 주세요.'],
    ['COMMAND_CONCURRENCY_CONFLICT', '동시에 처리된 요청이 있어요. 최신 상태를 다시 불러와 주세요.', '그사이 경기 기록이 바뀌어 되돌리지 못했어요. 기록 목록의 「고치기」에서 취소해 주세요.'],
    ['RESULT_ALREADY_OFFICIAL', '이미 확정된 결과예요. 이벤트를 취소하려면 결과 정정을 이용해주세요.', '결과가 이미 확정돼 되돌릴 수 없어요. 결과 고치기에서 고쳐 주세요.'],
    ['GAME_EVENT_NOT_FOUND', 'Game event was not found', '기록을 되돌리지 못했어요. 기록 목록의 「고치기」에서 취소해 주세요.'],
    ['STAFF_SCOPE_DENIED', 'Tournament staff scope is denied', '이 경기를 운영할 권한이 없어요.'],
    ['SOMETHING_NEW', '잠시 후 다시 시도해 주세요.', '잠시 후 다시 시도해 주세요.'],
  ])('reverseEvent 가 %s 로 거절되면 해요체로 알리고 「되돌렸어요」는 없다', async (code, serverMessage, shown) => {
    const state = setup();
    state.reverseEvent.mockRejectedValue(rejection(code, serverMessage));
    const { undo } = await recordedGoalWithUndo(state);

    fireEvent.click(undo);

    expect(await findConsoleNotice(shown)).toBeInTheDocument();
    expect(state.reverseEvent).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('되돌렸어요')).toBeNull();
    if (/[A-Za-z]{4,}/.test(serverMessage)) expect(document.body).not.toHaveTextContent(serverMessage);
  });

  it('서버가 이미 취소된 기록이라고 답하면 실패가 아니라 「이미 취소한 기록이에요」', async () => {
    const state = setup();
    state.reverseEvent.mockRejectedValue(rejection('EVENT_ALREADY_REVERSED', 'This event was already reversed once'));
    const { undo } = await recordedGoalWithUndo(state);

    fireEvent.click(undo);

    expect(await screen.findByText('이미 취소한 기록이에요')).toBeInTheDocument();
    expect(within(openStatusSheet()).queryByText(/되돌리지 못했어요/)).toBeNull();
    expect(screen.queryByText('되돌렸어요')).toBeNull();
  });

  it('거절된 되돌리기는 다시 누르면 다시 보낸다', async () => {
    const state = setup();
    state.reverseEvent.mockRejectedValueOnce(rejection('VERSION_CONFLICT', 'Expected version is stale')).mockResolvedValue(undefined);
    const { undo } = await recordedGoalWithUndo(state);

    fireEvent.click(undo);
    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledTimes(1));
    await findConsoleNotice('그사이 경기 기록이 바뀌어 되돌리지 못했어요. 기록 목록의 「고치기」에서 취소해 주세요.');
    fireEvent.click(undo);

    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
    // 지난 실패 안내는 남지 않는다.
    expect(within(openStatusSheet()).queryByText(/되돌리지 못했어요/)).toBeNull();
  });

  it('다른 기록이 전송 중이면 큐가 빌 때까지 기다렸다가 되돌린다', async () => {
    const state = setup();
    const { undo, rerender } = await recordedGoalWithUndo(state, { queue: { items: [queuedEvent('c2', 'sending')] } });

    fireEvent.click(undo);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(state.reverseEvent).not.toHaveBeenCalled();
    expect(screen.getByText('다른 기록을 보내는 중이에요. 다 보내면 되돌릴게요.')).toBeInTheDocument();

    advance(state, { liveEvents: [recorded('e9', 'c1'), recorded('e10', 'c2', { sequence: 10 })], queue: { items: [queuedEvent('c2', 'acked')] } });
    rerender(<CoreHarness />);

    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledWith({ eventId: 'e9', reason: '골 기록 되돌리기' }));
    expect(state.reverseEvent).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
  });

  it('큐를 기다리는 사이 다른 길로 취소된 기록은 다시 되돌리지 않는다', async () => {
    const state = setup();
    const { undo, rerender } = await recordedGoalWithUndo(state, { queue: { items: [queuedEvent('c2', 'sending')] } });

    fireEvent.click(undo);
    await screen.findByText('다른 기록을 보내는 중이에요. 다 보내면 되돌릴게요.');
    advance(state, {
      liveEvents: [recorded('e9', 'c1'), recorded('e10', 'c-cancel', { type: 'CORRECTION', sequence: 10, reversesEventId: 'e9' })],
      queue: { items: [queuedEvent('c2', 'acked')] },
    });
    rerender(<CoreHarness />);

    expect(await screen.findByText('이미 취소한 기록이에요')).toBeInTheDocument();
    expect(state.reverseEvent).not.toHaveBeenCalled();
  });

  it('큐를 기다리는 사이 진행 요청이 시작되면 되돌리기를 보내지 않고 알린다', async () => {
    const state = setup();
    // 진행 요청이 서버에서 돌아오지 않은 채 걸려 있다.
    testFixtures.sendCommand.mockReturnValue(new Promise(() => {}));
    const { undo, rerender } = await recordedGoalWithUndo(state, { queue: { items: [queuedEvent('c2', 'sending')] } });
    fireEvent.click(undo);
    await screen.findByText('다른 기록을 보내는 중이에요. 다 보내면 되돌릴게요.');
    fireEvent.click(screen.getByRole('button', { name: '전반 종료' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '전반 종료' }));
    await waitFor(() => expect(testFixtures.sendCommand).toHaveBeenCalledTimes(1));

    advance(state, { liveEvents: [recorded('e9', 'c1'), recorded('e10', 'c2', { sequence: 10 })], queue: { items: [queuedEvent('c2', 'acked')] } });
    rerender(<CoreHarness />);

    expect(
      await findConsoleNotice('진행 요청을 처리하는 중이라 되돌리지 못했어요. 기록 목록의 「고치기」에서 취소해 주세요.'),
    ).toBeInTheDocument();
    expect(state.reverseEvent).not.toHaveBeenCalled();
    expect(screen.queryByText('되돌렸어요')).toBeNull();
  });

  const recordCells = () =>
    within(screen.getByRole('group', { name: '기록하기' })).getAllByRole('button').filter((cell) => cell.textContent !== '더보기');

  it('되돌리기가 서버에 가 있는 동안 기록 버튼을 막고 상태 줄이 알린다 — 두 번 눌러도 기록되지 않고, 끝나면 한 번 누른 것만 기록된다', async () => {
    const state = setup();
    const reversal = Promise.withResolvers<void>();
    state.reverseEvent.mockReturnValue(reversal.promise);
    const { undo } = await recordedGoalWithUndo(state);
    fireEvent.click(undo);
    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(statusRow()).toHaveTextContent('되돌리는 중이에요…'));
    expect(recordCells().length).toBeGreaterThanOrEqual(5);
    recordCells().forEach((cell) => expect(cell).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(screen.getByRole('button', { name: '골' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state.submitEvent).toHaveBeenCalledTimes(1);

    await act(async () => {
      reversal.resolve();
    });

    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: '골' })).toBeEnabled());
    expect(statusRow()).not.toHaveTextContent('되돌리는 중이에요');
    recordGoal();
    await waitFor(() => expect(state.submitEvent).toHaveBeenCalledTimes(2));
  });

  it('선수 시트를 열어 둔 채 되돌리기가 시작됐으면, 고른 기록은 기다린다고 알리고 되돌리기가 끝난 뒤에 큐에 넣는다', async () => {
    const state = setup();
    const reversal = Promise.withResolvers<void>();
    state.reverseEvent.mockReturnValue(reversal.promise);
    const { undo } = await recordedGoalWithUndo(state);
    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(undo);
    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledTimes(1));

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));

    expect(await screen.findByText('되돌리기를 마치면 바로 기록할게요.')).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    // 첫 골 하나뿐이다 — 새 골은 되돌리기와 같은 버전으로 나가지 않게 기다린다.
    expect(state.submitEvent).toHaveBeenCalledTimes(1);

    await act(async () => {
      reversal.resolve();
    });

    await waitFor(() => expect(state.submitEvent).toHaveBeenCalledTimes(2));
    expect(state.reverseEvent.mock.invocationCallOrder[0]).toBeLessThan(state.submitEvent.mock.invocationCallOrder[1]);
  });

  it('되돌리기 응답이 끝내 오지 않으면 기록 버튼을 다시 열고 결과를 모른다고 알린다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const state = setup();
    state.reverseEvent.mockReturnValue(new Promise(() => {}));
    const { undo } = await recordedGoalWithUndo(state);
    fireEvent.click(undo);
    await waitFor(() => expect(screen.getByRole('button', { name: '골' })).toBeDisabled());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMMAND_RESPONSE_TIMEOUT_MS);
    });

    expect(screen.getByRole('button', { name: '골' })).toBeEnabled();
    expect(statusRow()).not.toHaveTextContent('되돌리는 중이에요');
    expect(
      within(openStatusSheet()).getByText('되돌리기 응답을 받지 못했어요. 기록 목록에서 취소됐는지 확인해 주세요.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('되돌렸어요')).toBeNull();
  });

  it.each([
    ['connected', '기록 전송이 끝나지 않아 되돌리지 못했어요. 기록 목록의 「고치기」에서 취소해 주세요.'],
    ['disconnected', '연결이 돌아오지 않아 되돌리지 못했어요. 기록 목록의 「고치기」에서 취소해 주세요.'],
  ] as const)('큐가 한도 안에 비지 않으면(%s) 되돌리기를 그만두고 알린다 — 그 뒤에 큐가 비어도 보내지 않는다', async (connectionStatus, notice) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const state = setup();
    const { undo, rerender } = await recordedGoalWithUndo(state, { connectionStatus, queue: { items: [queuedEvent('c2', 'queued')] } });
    fireEvent.click(undo);
    expect(await screen.findByText('다른 기록을 보내는 중이에요. 다 보내면 되돌릴게요.')).toBeInTheDocument();
    // 기다리는 동안 상태 줄 항목이 있고, 기록 버튼은 잠기지 않는다.
    await waitFor(() => expect(within(openStatusSheet()).getByText('되돌리는 중이에요…')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '골' })).toBeEnabled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_WAIT_LIMIT_MS - 1_000);
    });
    expect(within(openStatusSheet()).getByText('되돌리는 중이에요…')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(within(openStatusSheet()).getByText(notice)).toBeInTheDocument();
    expect(within(openStatusSheet()).queryByText('되돌리는 중이에요…')).toBeNull();
    expect(state.reverseEvent).not.toHaveBeenCalled();

    advance(state, { liveEvents: [recorded('e9', 'c1'), recorded('e10', 'c2', { sequence: 10 })], queue: { items: [queuedEvent('c2', 'acked')] } });
    rerender(<CoreHarness />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(state.reverseEvent).not.toHaveBeenCalled();
    expect(screen.queryByText('되돌렸어요')).toBeNull();
  });

  it('되돌릴 기록 자신이 한도 안에 서버에 닿지 않아도 그만두고 알린다 — 뒤늦게 닿아도 보내지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const state = setup();
    const { rerender } = render(<CoreHarness />);
    recordGoal();
    const undo = await screen.findByRole('button', { name: '되돌리기' });
    advance(state, { connectionStatus: 'disconnected', queue: { items: [queuedEvent('c1', 'queued')] }, gameSnapshot: { version: 2, state: 'LIVE' } });
    rerender(<CoreHarness />);
    fireEvent.click(undo);
    expect(await screen.findByText('기록을 보내는 중이에요. 서버에 닿으면 되돌릴게요.')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(UNDO_WAIT_LIMIT_MS);
    });

    expect(
      within(openStatusSheet()).getByText('연결이 돌아오지 않아 되돌리지 못했어요. 기록 목록의 「고치기」에서 취소해 주세요.'),
    ).toBeInTheDocument();
    expect(testFixtures.serverEvents).not.toHaveBeenCalled();

    advance(state, { queue: { items: [queuedEvent('c1', 'acked')] }, liveEvents: [recorded('e9', 'c1')] });
    rerender(<CoreHarness />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(state.reverseEvent).not.toHaveBeenCalled();
  });

  it('서버 목록을 읽느라 한도를 넘기면 기록을 찾았어도 되돌리기를 보내지 않는다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const state = setup();
    testFixtures.serverEvents.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ events: [recorded('e9', 'c1')], version: 4, state: 'LIVE' }), 7_000);
        }),
    );
    const { rerender } = render(<CoreHarness />);
    recordGoal();
    const undo = await screen.findByRole('button', { name: '되돌리기' });
    advance(state, { queue: { items: [queuedEvent('c1', 'sending')] }, gameSnapshot: { version: 2, state: 'LIVE' } });
    rerender(<CoreHarness />);
    fireEvent.click(undo);
    await screen.findByText('기록을 보내는 중이에요. 서버에 닿으면 되돌릴게요.');

    // 9초 뒤 전송이 실패로 끝나고, 서버 목록 읽기가 7초 걸려 한도(15초)를 넘긴다.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_000);
    });
    advance(state, { queue: { items: [queuedEvent('c1', 'failed')] }, gameSnapshot: { version: 2, state: 'LIVE' } });
    rerender(<CoreHarness />);
    await waitFor(() => expect(testFixtures.serverEvents).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });

    expect(
      within(openStatusSheet()).getByText('기록 전송이 끝나지 않아 되돌리지 못했어요. 기록 목록의 「고치기」에서 취소해 주세요.'),
    ).toBeInTheDocument();
    expect(state.reverseEvent).not.toHaveBeenCalled();
    expect(screen.queryByText('되돌렸어요')).toBeNull();
  });

  it('5초 뒤 토스트가 사라진다', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup();
    render(<CoreHarness />);
    recordGoal();
    expect(await screen.findByRole('button', { name: '되돌리기' })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5200);
    });

    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
    expect(screen.queryByText(RECORDED)).toBeNull();
  });

  it('끊긴 연결이면 되돌리기 없이 「이 기기에 기록해 뒀어요」', async () => {
    const state = setup({ connectionStatus: 'disconnected' });
    render(<CoreHarness />);
    recordGoal();

    expect(await screen.findByText('골 · 강남 풋살 클럽 · 정우진 이 기기에 기록해 뒀어요')).toBeInTheDocument();
    expect(screen.getByText('연결되면 보내요')).toBeInTheDocument();
    expect(state.submitEvent).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
    expect(screen.queryByText(RECORDED)).toBeNull();
  });

  it('submitEvent 가 null 이면 오류를 알린다', async () => {
    const state = setup();
    state.submitEvent.mockResolvedValue(null);
    render(<CoreHarness />);
    recordGoal();

    expect(await findConsoleNotice('기록을 저장하지 못했어요. 연결과 기록 권한을 확인한 뒤 다시 눌러 주세요.')).toBeInTheDocument();
    expect(screen.queryByText(RECORDED)).toBeNull();
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();
  });

  it('기록 실패 안내는 다음 기록을 하면 사라진다 — 지난 실패가 상태 줄에 계속 남지 않는다', async () => {
    const state = setup();
    state.submitEvent.mockResolvedValueOnce(null);
    render(<CoreHarness />);
    recordGoal();
    await waitFor(() => expect(statusRow()).toHaveAttribute('role', 'alert'));
    expect(statusRow()).toHaveTextContent('요청을 처리하지 못했어요');

    recordGoal();

    expect(await screen.findByText(RECORDED)).toBeInTheDocument();
    expect(statusRow()).toHaveAttribute('role', 'status');
    expect(statusRow()).toHaveTextContent('이 기기에서 기록 중 · 연결됨');
  });

  it('선수 모름 골은 anonymous 로 저장되고 토스트에 선수 모름', async () => {
    const state = setup();
    render(<CoreHarness />);
    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '성수 풋살 클럽 · 선수 모름' }));

    await waitFor(() => expect(state.submitEvent).toHaveBeenCalledTimes(1));
    const input = state.submitEvent.mock.calls[0]![0];
    expect(input).toMatchObject({ type: 'GOAL', sideId: 'side-away', payload: { anonymous: true } });
    expect(input.participantId).toBeUndefined();
    expect(await screen.findByText('골 · 성수 풋살 클럽 (선수 모름) 기록했어요')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('두 번째 옐로: 옐로는 바로 저장, 레드 확인만 뜨고, 레드까지 기록하면 되돌리기는 레드 → 옐로 순서', async () => {
    const card = (id: string, clientEventId: string, color: 'YELLOW' | 'RED') =>
      recorded(id, clientEventId, { type: 'CARD', participantId: 'p-1', payload: { card: color } });
    const firstYellow = card('e-y1', 'c-y1', 'YELLOW');
    const state = setup({ liveEvents: [firstYellow], queue: { items: [queuedEvent('q-1', 'acked', 'CARD')] } });
    state.submitEvent.mockReset();
    state.submitEvent.mockResolvedValueOnce('q-1').mockResolvedValueOnce('q-2');
    const { rerender } = render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '옐로카드' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));

    const sheet = await screen.findByRole('dialog', { name: '정우진이 이 경기에서 옐로 2장이에요' });
    expect(state.submitEvent).toHaveBeenCalledTimes(1);
    expect(state.submitEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'CARD', payload: { card: 'YELLOW' } }));
    // 레드를 물어보는 동안에는 아직 되돌리기 토스트를 띄우지 않는다.
    expect(screen.queryByRole('button', { name: '되돌리기' })).toBeNull();

    fireEvent.click(within(sheet).getByRole('button', { name: '레드도 기록' }));
    await waitFor(() => expect(state.submitEvent).toHaveBeenCalledTimes(2));
    expect(state.submitEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'CARD', payload: { card: 'RED' } }));
    expect(await screen.findByText('경고 누적 퇴장 · 강남 풋살 클럽 · 정우진 기록했어요')).toBeInTheDocument();

    const undo = screen.getByRole('button', { name: '되돌리기' });
    advance(state, { liveEvents: [firstYellow, card('e-y2', 'q-1', 'YELLOW'), card('e-r', 'q-2', 'RED')] });
    rerender(<CoreHarness />);
    fireEvent.click(undo);

    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledTimes(2));
    expect(state.reverseEvent.mock.calls.map(([input]) => input)).toEqual([
      { eventId: 'e-r', reason: '경고 누적 퇴장 기록 되돌리기' },
      { eventId: 'e-y2', reason: '경고 누적 퇴장 기록 되돌리기' },
    ]);
    expect(await screen.findByText('되돌렸어요')).toBeInTheDocument();
  });

  it('두 번째 옐로의 레드도 서버에 가 있는 되돌리기가 끝난 뒤에 나간다 — 확인 창은 막히지 않는다', async () => {
    const card = (id: string, clientEventId: string, color: 'YELLOW' | 'RED') =>
      recorded(id, clientEventId, { type: 'CARD', participantId: 'p-1', payload: { card: color } });
    const firstYellow = card('e-y1', 'c-y1', 'YELLOW');
    const state = setup({ liveEvents: [firstYellow] });
    const reversal = Promise.withResolvers<void>();
    state.reverseEvent.mockReturnValue(reversal.promise);
    const { rerender } = render(<CoreHarness />);
    // 골을 하나 기록해 되돌리기 토스트를 띄워 둔다.
    recordGoal();
    const undo = await screen.findByRole('button', { name: '되돌리기' });
    state.submitEvent.mockResolvedValueOnce('q-1').mockResolvedValueOnce('q-2');
    advance(state, { liveEvents: [firstYellow, recorded('e9', 'c1')], queue: { items: [queuedEvent('q-1', 'acked', 'CARD')] } });
    rerender(<CoreHarness />);

    // 옐로를 기록해 레드 확인 창이 뜬 사이, 골 되돌리기가 서버로 간다.
    fireEvent.click(screen.getByRole('button', { name: '옐로카드' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    const sheet = await screen.findByRole('dialog', { name: '정우진이 이 경기에서 옐로 2장이에요' });
    fireEvent.click(undo);
    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledTimes(1));
    const submittedBefore = state.submitEvent.mock.calls.length;

    fireEvent.click(within(sheet).getByRole('button', { name: '레드도 기록' }));
    expect(await screen.findByText('되돌리기를 마치면 바로 기록할게요.')).toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(state.submitEvent).toHaveBeenCalledTimes(submittedBefore);

    await act(async () => {
      reversal.resolve();
    });

    await waitFor(() => expect(state.submitEvent).toHaveBeenCalledTimes(submittedBefore + 1));
    expect(state.submitEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'CARD', payload: { card: 'RED' } }));
  });

  it('레드 → 옐로를 잇달아 되돌리는 사이에는 기다리던 새 기록이 끼어들지 않는다', async () => {
    const card = (id: string, clientEventId: string, color: 'YELLOW' | 'RED') =>
      recorded(id, clientEventId, { type: 'CARD', participantId: 'p-1', payload: { card: color } });
    const firstYellow = card('e-y1', 'c-y1', 'YELLOW');
    const state = setup({ liveEvents: [firstYellow], queue: { items: [queuedEvent('q-1', 'acked', 'CARD')] } });
    state.submitEvent.mockReset();
    state.submitEvent.mockResolvedValueOnce('q-1').mockResolvedValueOnce('q-2').mockResolvedValue('q-3');
    const redReversal = Promise.withResolvers<void>();
    const yellowReversal = Promise.withResolvers<void>();
    state.reverseEvent.mockReturnValueOnce(redReversal.promise).mockReturnValueOnce(yellowReversal.promise);
    const { rerender } = render(<CoreHarness />);
    fireEvent.click(screen.getByRole('button', { name: '옐로카드' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: '정우진이 이 경기에서 옐로 2장이에요' })).getByRole('button', { name: '레드도 기록' }),
    );
    const undo = await screen.findByRole('button', { name: '되돌리기' });
    advance(state, { liveEvents: [firstYellow, card('e-y2', 'q-1', 'YELLOW'), card('e-r', 'q-2', 'RED')] });
    rerender(<CoreHarness />);

    // 골 시트를 열어 둔 채 되돌리기를 누르고, 레드를 되돌리는 동안 선수를 고른다.
    fireEvent.click(screen.getByRole('button', { name: '골' }));
    fireEvent.click(undo);
    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledTimes(1));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    // 레드가 아직 되돌려지지 않아 퇴장 선수 확인이 한 번 더 뜬다.
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '그래도 계속' }));
    await screen.findByText('되돌리기를 마치면 바로 기록할게요.');

    // 레드가 끝나고 옐로 되돌리기가 서버로 간 사이에도 골은 아직 나가지 않는다.
    await act(async () => {
      redReversal.resolve();
    });
    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledTimes(2));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(state.submitEvent).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: '옐로카드' })).toBeDisabled();

    await act(async () => {
      yellowReversal.resolve();
    });

    await waitFor(() => expect(state.submitEvent).toHaveBeenCalledTimes(3));
    expect(state.submitEvent).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'GOAL' }));
    expect(state.reverseEvent.mock.invocationCallOrder[1]).toBeLessThan(state.submitEvent.mock.invocationCallOrder[2]);
  });

  it('두 번째 옐로에서 「옐로만 둘게요」를 고르면 옐로 하나만 되돌릴 수 있다', async () => {
    const card = (id: string, clientEventId: string, color: 'YELLOW' | 'RED') =>
      recorded(id, clientEventId, { type: 'CARD', participantId: 'p-1', payload: { card: color } });
    const firstYellow = card('e-y1', 'c-y1', 'YELLOW');
    const state = setup({ liveEvents: [firstYellow] });
    state.submitEvent.mockResolvedValue('q-1');
    const { rerender } = render(<CoreHarness />);

    fireEvent.click(screen.getByRole('button', { name: '옐로카드' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'select-player' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '옐로만 둘게요' }));

    expect(await screen.findByText('옐로카드 · 강남 풋살 클럽 · 정우진 기록했어요')).toBeInTheDocument();
    advance(state, { liveEvents: [firstYellow, card('e-y2', 'q-1', 'YELLOW')] });
    rerender(<CoreHarness />);
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));

    await waitFor(() => expect(state.reverseEvent).toHaveBeenCalledWith({ eventId: 'e-y2', reason: '옐로카드 기록 되돌리기' }));
    expect(state.reverseEvent).toHaveBeenCalledTimes(1);
    expect(state.submitEvent).toHaveBeenCalledTimes(1);
  });
});

describe('OperateConsole — 첫 화면 조립(점수 카드 · 상태 줄 · 기록 격자 · 진행 바 · 더보기)', () => {
  const T0 = '2026-08-07T00:00:00.000Z';
  const PERIODS = {
    scheduled: [
      { number: 1, state: 'SCHEDULED', startedAt: null, endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ],
    firstHalf: [
      { number: 1, state: 'LIVE', startedAt: T0, endedAt: null },
      { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
    ],
    halftime: [
      { number: 1, state: 'ENDED', startedAt: T0, endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'HALFTIME', startedAt: null, endedAt: null },
    ],
    regulationEnded: [
      { number: 1, state: 'ENDED', startedAt: T0, endedAt: '2026-08-07T00:20:00.000Z' },
      { number: 2, state: 'ENDED', startedAt: '2026-08-07T00:25:00.000Z', endedAt: '2026-08-07T00:45:00.000Z' },
    ],
    single: [{ number: 1, state: 'LIVE', startedAt: T0, endedAt: null }],
  } as const;

  function rosterLineup(sideId: string, count: number) {
    return {
      id: `lineup-${sideId}`, gameId: 'game-1', sideId, revision: 1, state: 'SUBMITTED', version: 0, submittedAt: T0,
      supersedesId: null, formation: null, createdAt: '', updatedAt: '', invalidatedAt: null,
      participants: Array.from({ length: count }, (_, index) => ({
        id: `${sideId}-p${index + 1}`, gameId: 'game-1', sideId, lineupId: `lineup-${sideId}`, userId: null,
        displayNameSnapshot: `${sideId === 'side-home' ? '홈' : '원정'}선수${index + 1}`, jerseyNumber: index + 1,
        position: null, positionX: null, positionY: null, started: true, arrivedAt: null, createdAt: '', updatedAt: '',
      })),
    };
  }

  function setup({
    state = 'LIVE',
    periods = PERIODS.firstHalf,
    substitution = 'rolling',
    roster = { home: 1, away: 1 },
    periodDurations,
    ops = {},
  }: {
    state?: GameState;
    periods?: ReadonlyArray<{ number: number; state: string; startedAt: string | null; endedAt: string | null; pausedAt?: string | null }>;
    substitution?: 'rolling' | 'limited';
    roster?: { home: number; away: number };
    periodDurations?: Array<{ durationMinutes: number; extraTime: boolean }>;
    ops?: Partial<MockedOperations>;
  } = {}) {
    testFixtures.auth.mockReturnValue({ data: { user: { id: 'user-1' } } });
    testFixtures.lineups.mockReturnValue({
      data: { gameId: 'game-1', lineups: [rosterLineup('side-home', roster.home), rosterLineup('side-away', roster.away)] },
      isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    testFixtures.game.mockReturnValue({
      data: {
        id: 'game-1', state, version: 2, lastSequence: 1,
        periods: periods.map((period) => ({ id: `period-${period.number}`, gameId: 'game-1', pausedTotalMs: 0, pausedAt: null, ...period })),
        sides: HOME_AWAY_SIDES.map((side) => ({ ...side, teamId: side.sideKey === 'HOME' ? 'team-home' : 'team-away' })),
        lineups: [],
        periodDurations,
        substitutionPolicy: { mode: substitution, maxSubstitutions: substitution === 'limited' ? 5 : null },
      },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    const consoleOps = consoleState({ liveEvents: [], gameSnapshot: { version: 2, state }, ...ops });
    testFixtures.operations.mockReturnValue(consoleOps);
    return consoleOps;
  }

  const recordGrid = () => screen.getByRole('group', { name: '기록하기' });
  const commandBar = () => screen.getByRole('group', { name: '경기 진행 조작' });
  const barLabels = () =>
    within(commandBar()).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent);

  describe('진행 명령은 확인을 거친다', () => {
    const CASES = [
      ['start', '경기 시작', { state: 'SCHEDULED', periods: PERIODS.scheduled }],
      ['pause', '일시 중지', { state: 'LIVE', periods: PERIODS.firstHalf }],
      ['resume', '재개', { state: 'PAUSED', periods: [{ ...PERIODS.firstHalf[0], pausedAt: '2026-08-07T00:05:00.000Z' }, PERIODS.firstHalf[1]] }],
      ['end-period', '전반 종료', { state: 'LIVE', periods: PERIODS.firstHalf }],
      ['start-period', '후반 시작', { state: 'LIVE', periods: PERIODS.halftime }],
      ['end', '경기 종료', { state: 'LIVE', periods: PERIODS.regulationEnded }],
    ] as const;

    it.each(CASES)('%s 은 확인 창을 거치고, 확인 전에는 sendCommand 가 0회', async (command, label, game) => {
      testFixtures.sendCommand.mockResolvedValue(gameMutationResult(game.state));
      setup(game);
      render(<CoreHarness />);

      fireEvent.click(within(commandBar()).getByRole('button', { name: label }));
      const dialog = await screen.findByRole('dialog');
      expect(testFixtures.sendCommand).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole('button', { name: label }));
      await waitFor(() => expect(testFixtures.sendCommand).toHaveBeenCalledTimes(1));
      expect(testFixtures.sendCommand).toHaveBeenCalledWith('game-1', command, expect.anything(), COMMAND_OPTIONS);
    });

    it.each(CASES)('%s 확인 창에서 취소하면 아무 명령도 나가지 않는다', async (_command, label, game) => {
      setup(game);
      render(<CoreHarness />);

      fireEvent.click(within(commandBar()).getByRole('button', { name: label }));
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(testFixtures.sendCommand).not.toHaveBeenCalled();
    });
  });

  describe('기록 격자와 진행 바', () => {
    it('기록 격자는 골·자책골·옐로카드·레드카드·파울·더보기 여섯 개(풋살)', () => {
      setup({ substitution: 'rolling' });
      render(<CoreHarness />);

      expect(within(recordGrid()).getAllByRole('button').map((button) => button.textContent)).toEqual([
        '골', '자책골', '옐로카드', '레드카드', '파울', '더보기',
      ]);
      // 교체를 기록하지 않는 종목은 더보기가 격자에만 있다.
      expect(barLabels()).toEqual(['일시 중지', '전반 종료']);
    });

    it('교체 추적 종목은 격자에 교체가 있고 더보기는 진행 바 ⋯ 로 간다', () => {
      setup({ substitution: 'limited' });
      render(<CoreHarness />);

      expect(within(recordGrid()).getAllByRole('button').map((button) => button.textContent)).toEqual([
        '골', '자책골', '옐로카드', '레드카드', '파울', '교체',
      ]);
      expect(barLabels()).toEqual(['일시 중지', '전반 종료', '더보기']);
      const more = within(commandBar()).getByRole('button', { name: '더보기' });
      expect(more).toHaveClass('h-11', 'w-11');
      fireEvent.click(more);
      expect(screen.getByRole('dialog', { name: '더보기' })).toBeInTheDocument();
    });

    it('진행 바: LIVE 는 일시 중지·전반 종료 둘뿐, PAUSED 재개, 하프타임 후반 시작, 단판은 정규 시간 종료', () => {
      setup();
      const live = render(<CoreHarness />);
      expect(barLabels()).toEqual(['일시 중지', '전반 종료']);
      live.unmount();

      setup({ state: 'PAUSED', periods: [{ ...PERIODS.firstHalf[0], pausedAt: '2026-08-07T00:05:00.000Z' }, PERIODS.firstHalf[1]] });
      const paused = render(<CoreHarness />);
      expect(barLabels()).toEqual(['재개']);
      paused.unmount();

      setup({ periods: PERIODS.halftime });
      const halftime = render(<CoreHarness />);
      expect(barLabels()).toEqual(['후반 시작']);
      halftime.unmount();

      setup({ periods: PERIODS.regulationEnded });
      const ended = render(<CoreHarness />);
      expect(barLabels()).toEqual(['경기 종료']);
      ended.unmount();

      setup({ periods: PERIODS.single, periodDurations: [{ durationMinutes: 40, extraTime: false }] });
      render(<CoreHarness />);
      expect(barLabels()).toEqual(['일시 중지', '정규 시간 종료']);
    });

    it('기록 권한이 없으면 기록 칸은 잠기지만 더보기 칸은 눌린다', () => {
      setup({ ops: { takeover: { status: 'requesting' } } });
      render(<CoreHarness />);

      for (const name of ['골', '자책골', '옐로카드', '레드카드', '파울']) {
        expect(within(recordGrid()).getByRole('button', { name })).toBeDisabled();
      }
      const more = within(recordGrid()).getByRole('button', { name: '더보기' });
      expect(more).toBeEnabled();
      fireEvent.click(more);
      expect(screen.getByRole('dialog', { name: '더보기' })).toBeInTheDocument();
    });

    it('진행 중 첫 화면에 쉬는 시간 칩·프리셋이 없다', () => {
      setup();
      render(<CoreHarness />);

      expect(screen.queryByText(/쉬는 시간/)).toBeNull();
      for (const minutes of [1, 2, 5, 10, 15, 20]) {
        expect(screen.queryByRole('button', { name: `${minutes}분` })).toBeNull();
      }
    });

    it('DOM 순서: 점수 카드 → 상태 줄 → 최근 기록 → 기록 격자', () => {
      setup({ ops: { liveEvents: [goal(1)] } });
      render(<CoreHarness />);

      const follows = (earlier: Element, later: Element) =>
        Boolean(earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING);
      const card = screen.getByRole('banner');
      const records = screen.getByRole('list', { name: '기록 목록' });
      expect(card).toHaveAttribute('data-console-guide', 'overview');
      expect(commandBar()).toHaveAttribute('data-console-guide', 'commands');
      expect(recordGrid()).toHaveAttribute('data-console-guide', 'events');
      expect(records.closest('section')).toHaveAttribute('data-console-guide', 'history');
      expect(follows(card, statusRow())).toBe(true);
      expect(follows(statusRow(), records)).toBe(true);
      expect(follows(records, recordGrid())).toBe(true);
    });
  });

  describe('더보기 시트', () => {
    const labelsOf = (sheet: HTMLElement) =>
      within(sheet).getAllByRole('button').map((button) => button.textContent ?? '').filter((text) => !/닫기|^$/.test(text));

    it('더보기 시트 항목과 위험 묶음', () => {
      setup();
      render(<CoreHarness />);

      const sheet = openMoreSheet();
      const labels = labelsOf(sheet);
      expect(labels[0]).toBe('쉬는 시간 재기부상·작전 시간처럼 잠깐 멈출 때');
      expect(labels[1]).toBe('기록 전체 보기·고치기시각 고치기, 기록 취소');
      expect(labels.slice(2).map((label) => label.replace(/(정규|사유|적은).*$/, ''))).toEqual([
        '경기 일찍 끝내기', '몰수·중단으로 끝내기', '경기 시작 취소',
      ]);
      expect(within(sheet).getByText('되돌리기 어려운 동작')).toBeInTheDocument();
      expect(within(sheet).getByRole('button', { name: /^경기 일찍 끝내기/ })).toHaveTextContent('정규 시간 전에 마쳐요 · 되돌릴 수 없어요');
      expect(within(sheet).getByRole('button', { name: /^경기 시작 취소/ })).toHaveTextContent('적은 기록을 지우고 시작 전으로');
    });

    it('하프타임에는 전반 종료 되돌리기가 더해진다', () => {
      setup({ periods: PERIODS.halftime });
      render(<CoreHarness />);

      expect(within(openMoreSheet()).getByRole('button', { name: /^전반 종료 되돌리기/ })).toBeEnabled();
    });

    it('시작 취소는 sampleMode·읽기 전용에서 없고, 기록 전체 보기는 남는다', () => {
      setup();
      const sample = render(<CoreHarness sampleMode />);
      let sheet = openMoreSheet();
      expect(within(sheet).queryByRole('button', { name: /^경기 시작 취소/ })).toBeNull();
      expect(within(sheet).getByRole('button', { name: /^경기 일찍 끝내기/ })).toBeInTheDocument();
      sample.unmount();

      setup();
      render(<CoreHarness takeoverEnabled={false} />);
      sheet = openMoreSheet();
      expect(within(sheet).queryByRole('button', { name: /^경기 시작 취소/ })).toBeNull();
      expect(within(sheet).getByRole('button', { name: /^기록 전체 보기·고치기/ })).toBeEnabled();
      expect(within(sheet).getByRole('button', { name: /^경기 일찍 끝내기/ })).toBeDisabled();
      expect(within(sheet).getByRole('button', { name: /^몰수·중단으로 끝내기/ })).toBeDisabled();
    });

    it('기록 전체 보기·고치기는 모든 기록이 든 시트를 연다', () => {
      setup({ ops: { liveEvents: [1, 2, 3, 4, 5, 6].map((sequence) => ({ ...goal(sequence), clockMs: sequence * 60000 })) } });
      render(<CoreHarness />);

      fireEvent.click(within(openMoreSheet()).getByRole('button', { name: /^기록 전체 보기·고치기/ }));
      const sheet = screen.getByRole('dialog', { name: '기록 전체' });
      expect(within(within(sheet).getByRole('list', { name: '기록 목록' })).getAllByRole('listitem')).toHaveLength(6);
      expect(screen.queryByRole('dialog', { name: '더보기' })).toBeNull();
    });
  });

  describe('최근 기록', () => {
    const six = [1, 2, 3, 4, 5, 6].map((sequence) => ({ ...goal(sequence), clockMs: sequence * 60000 }));
    const visibleRows = () =>
      within(screen.getAllByRole('list', { name: '기록 목록' })[0]).getAllByRole('listitem');
    let restoreViewport: (() => void) | undefined;
    afterEach(() => {
      restoreViewport?.();
      restoreViewport = undefined;
    });

    it('폰에서는 한 줄짜리 최근 기록 두 줄만 두고 나머지는 전체 보기로 보낸다, 1280 폭에서는 전부', () => {
      restoreViewport = installViewport(390);
      setup({ ops: { liveEvents: six } });
      const phone = render(<CoreHarness />);

      expect(screen.getByRole('heading', { name: /^최근 기록/ })).toBeInTheDocument();
      expect(visibleRows().map((row) => /후반 (\d+)/.exec(row.textContent ?? '')?.[1])).toEqual(['6', '5']);
      // 한 줄 표시: 줄 높이를 48px 로 묶고, 팀 이름을 따로 쌓는 줄이 없고, 버튼은 하나다.
      for (const row of visibleRows()) {
        expect(row).toHaveClass('min-h-[48px]');
        expect(row.querySelector('.basis-full')).toBeNull();
        expect(within(row).getAllByRole('button')).toHaveLength(1);
      }
      fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
      expect(within(screen.getByRole('dialog', { name: '기록 전체' })).getAllByRole('listitem')).toHaveLength(6);
      phone.unmount();
      restoreViewport();

      restoreViewport = installViewport(1280);
      setup({ ops: { liveEvents: six } });
      render(<CoreHarness />);
      expect(visibleRows()).toHaveLength(6);
      expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull();
      expect(screen.getByRole('heading', { name: /^기록 ·/ })).toBeInTheDocument();
    });

    it('기록이 없으면 전체 보기 버튼도 없고, 한 건이라도 있으면 둔다', () => {
      restoreViewport = installViewport(390);
      setup({ ops: { liveEvents: [] } });
      const empty = render(<CoreHarness />);
      expect(screen.queryByRole('button', { name: '전체 보기' })).toBeNull();
      empty.unmount();

      setup({ ops: { liveEvents: six.slice(0, 1) } });
      render(<CoreHarness />);
      expect(visibleRows()).toHaveLength(1);
      expect(screen.getByRole('button', { name: '전체 보기' })).toBeInTheDocument();
    });

    it('되돌린 기록과 기록 취소 줄은 최근 기록에 두지 않고, 전체 보기에는 그대로 둔다', () => {
      restoreViewport = installViewport(390);
      const cancelled = {
        ...goal(7), id: 'event-7', sequence: 7, clientEventId: 'client-7', type: 'CORRECTION',
        reversesEventId: 'event-6', participantId: null, payload: { reason: '골 기록 되돌리기' },
      } as unknown as GameEventRecord;
      setup({ ops: { liveEvents: [...six.slice(0, 3), six[5], cancelled] } });
      render(<CoreHarness />);

      // 6번 골이 취소돼도 최근 두 줄은 아직 살아 있는 기록(3번, 1~2번 중 최신)으로 채운다.
      expect(visibleRows().map((row) => /후반 (\d+)/.exec(row.textContent ?? '')?.[1])).toEqual(['3', '2']);
      expect(screen.queryByText(/취소된 기록|기록 취소/)).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
      const sheet = screen.getByRole('dialog', { name: '기록 전체' });
      expect(within(sheet).getByText(/취소된 기록/)).toBeInTheDocument();
      expect(within(sheet).getByText('기록 취소')).toBeInTheDocument();
    });

    it('골에 어시스트가 없으면 그 줄의 버튼은 어시스트이고, 어시스트가 있으면 고치기다', () => {
      restoreViewport = installViewport(390);
      const noAssist = six.map((event) => ({ ...event, assistParticipantId: null }) as GameEventRecord);
      const withAssist = { ...noAssist[4], assistParticipantId: 'p-2' } as GameEventRecord;
      setup({ ops: { liveEvents: [noAssist[0], noAssist[1], noAssist[2], noAssist[3], withAssist, noAssist[5]] } });
      render(<CoreHarness />);

      const [newest, older] = visibleRows();
      expect(within(newest).getByRole('button', { name: '이 골에 어시스트 추가' })).toBeInTheDocument();
      expect(within(newest).queryByRole('button', { name: /^기록 고치기/ })).toBeNull();
      expect(within(older).queryByRole('button', { name: '이 골에 어시스트 추가' })).toBeNull();
      expect(within(older).getByRole('button', { name: /^기록 고치기/ })).toBeInTheDocument();
    });

    it('끝난 경기는 폰에서도 기록을 전부 보여 준다', () => {
      restoreViewport = installViewport(390);
      setup({ state: 'ENDED', periods: PERIODS.regulationEnded, ops: { liveEvents: six } });
      render(<CoreHarness />);

      expect(visibleRows()).toHaveLength(6);
    });

    it('전체 보기 시트에서 고치기를 누르면 시트가 닫히고 고치기 창 하나만 뜬다', async () => {
      restoreViewport = installViewport(390);
      setup({ ops: { liveEvents: six } });
      render(<CoreHarness />);

      fireEvent.click(screen.getByRole('button', { name: '전체 보기' }));
      const sheet = screen.getByRole('dialog', { name: '기록 전체' });
      fireEvent.click(within(sheet).getAllByRole('button', { name: '기록 고치기 (골)' })[5]);

      await waitFor(() => expect(screen.queryByRole('dialog', { name: '기록 전체' })).toBeNull());
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
    });
  });

  describe('상태 줄', () => {
    it('조건 셋이 겹쳐도 상태 요소는 하나이고 자세히에 셋이 모두 있다', () => {
      // 끊김 + 전송 실패 + 서버 안내 메시지
      setup({
        ops: {
          connectionStatus: 'disconnected',
          bannerMessage: '기록 권한을 다시 확인하지 못했어요.',
          queue: { items: [queuedEvent('c-1', 'failed')] },
        },
      });
      render(<CoreHarness />);

      expect(document.querySelectorAll('[role="status"],[role="alert"]')).toHaveLength(1);
      expect(statusRow()).toHaveAttribute('role', 'alert');
      expect(statusRow()).toHaveTextContent('기록을 확인해 주세요 외 2개');

      const sheet = openStatusSheet();
      expect(within(sheet).getByText('지금 확인할 것 3개')).toBeInTheDocument();
      expect(within(sheet).getByText('기록 권한을 다시 확인하지 못했어요.')).toBeInTheDocument();
      expect(within(sheet).getByText('연결이 끊겼어요')).toBeInTheDocument();
      expect(within(sheet).getByText('기록 1개를 보내지 못했어요')).toBeInTheDocument();
    });

    it('보기 전용 지원 담당자에게는 보기만 할 수 있다고 알린다', () => {
      setup({ ops: { takeover: { status: 'none' } } });
      render(<CoreHarness takeoverEnabled={false} />);

      expect(statusRow()).toHaveTextContent('보기만 할 수 있어요');
      expect(within(openStatusSheet()).getByText('지원 담당자는 이 경기의 기록을 볼 수만 있어요.')).toBeInTheDocument();
    });

    it('서버가 설정된 시간을 넘겼다고 알리면 눌러야 할 버튼 이름까지 말한다', async () => {
      setup({
        periods: [{ number: 1, state: 'LIVE', startedAt: '2020-01-01T00:00:00.000Z', endedAt: null }, PERIODS.firstHalf[1]],
        periodDurations: [{ durationMinutes: 20, extraTime: false }, { durationMinutes: 20, extraTime: false }],
      });
      render(<CoreHarness />);

      expect(
        await findConsoleNotice('서버의 시간 종료 처리를 확인하고 있어요. 처리가 늦어지면 ‘전반 종료’를 눌러 주세요.'),
      ).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent('피리어드');
    });
  });

  describe('명단은 선수 시트가 쓰는 목록 하나에서 나온다', () => {
    it('홈 3명·원정 0명이면 시트에 그 숫자가, 골 시트에는 홈 3줄과 두 팀의 선수 모름만, 「익명으로만」은 어디에도 없다', () => {
      testFixtures.realLineupGrid.current = true;
      setup({ roster: { home: 3, away: 0 } });
      render(<CoreHarness />);

      const sheet = openStatusSheet();
      const roster = within(sheet).getByText('출전 명단').nextElementSibling as HTMLElement;
      expect(roster).toHaveTextContent('홈 · 강남 풋살 클럽 3명');
      expect(roster).toHaveTextContent('원정 · 성수 풋살 클럽 0명 · 선수 모름으로만 기록할 수 있어요');
      fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));

      fireEvent.click(within(recordGrid()).getByRole('button', { name: '골' }));
      const picker = screen.getByRole('dialog', { name: '골 · 누가 넣었나요?' });
      const home = within(picker).getByRole('region', { name: '홈 · 강남 풋살 클럽' });
      const away = within(picker).getByRole('region', { name: '원정 · 성수 풋살 클럽' });
      expect(within(home).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
        '홈선수1 선수로 기록', '홈선수2 선수로 기록', '홈선수3 선수로 기록', '강남 풋살 클럽 · 선수 모름',
      ]);
      expect(within(away).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
        '성수 풋살 클럽 · 선수 모름',
      ]);
      expect(document.body).not.toHaveTextContent('익명으로만');
    });

    it('SCHEDULED 에는 시트에 출전 명단 줄이 없다', () => {
      setup({ state: 'SCHEDULED', periods: PERIODS.scheduled, roster: { home: 3, away: 0 } });
      render(<CoreHarness />);

      const sheet = openStatusSheet();
      expect(within(sheet).queryByText('출전 명단')).toBeNull();
      expect(within(sheet).getByText('연결')).toBeInTheDocument();
      // 그 자리의 명단은 킥오프 준비 패널이다.
      expect(screen.getByRole('region', { name: '킥오프 준비' })).toBeInTheDocument();
    });
  });

  describe('단계 문구는 점수 카드 안에 한 번만', () => {
    const caption = (text: string | RegExp) => within(screen.getByRole('banner')).getByText(text);

    it('시작 전', () => {
      setup({ state: 'SCHEDULED', periods: PERIODS.scheduled });
      render(<CoreHarness />);
      expect(caption('경기를 시작해 주세요.')).toBeInTheDocument();
      expect(screen.getAllByText('경기를 시작해 주세요.')).toHaveLength(1);
    });

    it('하프타임', () => {
      setup({ periods: PERIODS.halftime });
      render(<CoreHarness />);
      expect(
        caption('하프타임이에요. 준비되면 ‘후반 시작’을 눌러 주세요. 빠진 골·카드·파울은 지금도 전반 끝 시각으로 기록할 수 있어요.'),
      ).toBeInTheDocument();
    });

    it('정규 시간 종료 — 기록 권한이 있는 대회 경기', () => {
      setup({ periods: PERIODS.regulationEnded });
      render(<CoreHarness />);
      expect(caption('정규 시간이 끝났어요. 기록을 확인한 뒤 ‘경기 종료’를 눌러 주세요.')).toBeInTheDocument();
    });

    it('정규 시간 종료 — 콘솔에서 끝낼 수 없는 호스트는 결과 제출 화면 링크를 준다', () => {
      setup({ periods: PERIODS.regulationEnded });
      render(<CoreHarness leaseRequired={false} resultHref="/team-matches/tm-1/result" />);

      expect(caption(/정규 시간이 끝났어요\. 기록을 확인한 뒤 결과 제출 화면에서 경기 기록을 보내 주세요\./)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '결과 제출 화면 열기' })).toHaveAttribute('href', '/team-matches/tm-1/result');
      expect(within(screen.getByRole('banner')).getByRole('link', { name: '결과 보내기' })).toHaveAttribute('href', '/team-matches/tm-1/result');
      // 이 호스트는 콘솔에서 경기를 끝낼 수 없다.
      expect(screen.queryByRole('button', { name: '경기 종료' })).toBeNull();
    });

    it('뛰는 동안에는 단계 문구가 없다', () => {
      setup();
      render(<CoreHarness />);
      expect(screen.queryByText('경기를 시작해 주세요.')).toBeNull();
      expect(screen.queryByText(/하프타임이에요/)).toBeNull();
      expect(screen.queryByText(/정규 시간이 끝났어요/)).toBeNull();
    });
  });
});

describe('OperateConsole — 쉬는 시간', () => {
  const T0 = '2026-08-07T00:00:00.000Z';
  const HALFTIME = [
    { number: 1, state: 'ENDED', startedAt: T0, endedAt: '2026-08-07T00:20:00.000Z' },
    { number: 2, state: 'HALFTIME', startedAt: null, endedAt: null },
  ];
  const FIRST_HALF = [
    { number: 1, state: 'LIVE', startedAt: T0, endedAt: null },
    { number: 2, state: 'SCHEDULED', startedAt: null, endedAt: null },
  ];
  const SECOND_HALF = [
    { number: 1, state: 'ENDED', startedAt: T0, endedAt: '2026-08-07T00:20:00.000Z' },
    { number: 2, state: 'LIVE', startedAt: '2026-08-07T00:30:00.000Z', endedAt: null },
  ];

  function setup(
    periods: ReadonlyArray<{ number: number; state: string; startedAt: string | null; endedAt: string | null }>,
    { detailVersion = 2, snapshotVersion = 2, loading = false }: { detailVersion?: number; snapshotVersion?: number; loading?: boolean } = {},
  ) {
    testFixtures.auth.mockReturnValue({ data: { user: { id: 'user-1' } } });
    testFixtures.lineups.mockReturnValue({
      data: { gameId: 'game-1', lineups: [] }, isLoading: false, isError: false, error: null, refetch: vi.fn(),
    });
    testFixtures.game.mockReturnValue({
      data: loading
        ? undefined
        : {
            id: 'game-1', state: 'LIVE', version: detailVersion, lastSequence: 1,
            periods: periods.map((period) => ({ id: `period-${period.number}`, gameId: 'game-1', pausedTotalMs: 0, pausedAt: null, ...period })),
            sides: HOME_AWAY_SIDES.map((side) => ({ ...side, teamId: side.sideKey === 'HOME' ? 'team-home' : 'team-away' })),
            lineups: [],
            substitutionPolicy: { mode: 'rolling', maxSubstitutions: null },
          },
      isLoading: loading, isError: false, refetch: vi.fn(),
    });
    testFixtures.operations.mockReturnValue(
      consoleState({ liveEvents: [], gameSnapshot: loading ? null : { version: snapshotVersion, state: 'LIVE' } }),
    );
  }

  const advance = (ms: number) => act(() => {
    vi.advanceTimersByTime(ms);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-07T00:20:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('하프타임이 되면 입력 없이 쉬는 시간 10분이 시작되고 1분 추가·쉬는 시간 끝내기가 있다', () => {
    setup(HALFTIME);
    render(<CoreHarness />);

    expect(screen.getByRole('button', { name: '쉬는 시간 10분' })).toBeInTheDocument();
    expect(screen.getByText('10:00 남았어요')).toBeInTheDocument();
    advance(3_000);
    expect(screen.getByText('09:57 남았어요')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '1분 추가' }));
    expect(screen.getByText('10:57 남았어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '쉬는 시간 끝내기' }));
    expect(screen.queryByText(/남았어요/)).toBeNull();
    expect(screen.queryByText(/새로고침/)).toBeNull();
  });

  it('새로고침(재마운트)해도 남은 시간이 이어지고 끝내기한 뒤엔 다시 시작하지 않는다', () => {
    setup(HALFTIME);
    const first = render(<CoreHarness />);
    advance(4 * 60_000);
    first.unmount();

    setup(HALFTIME);
    const second = render(<CoreHarness />);
    expect(screen.getByText('06:00 남았어요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '쉬는 시간 끝내기' }));
    second.unmount();

    setup(HALFTIME);
    render(<CoreHarness />);
    expect(screen.queryByText(/남았어요/)).toBeNull();
    // 끝낸 뒤에도 더보기에서 다시 잴 수 있다.
    expect(within(openMoreSheet()).getByRole('button', { name: /^쉬는 시간 재기/ })).toBeInTheDocument();
  });

  it('경기 정보를 읽는 동안에는 저장된 쉬는 시간을 지우지 않는다', () => {
    setup(HALFTIME);
    const first = render(<CoreHarness />);
    advance(4 * 60_000);
    first.unmount();

    setup(HALFTIME, { loading: true });
    const view = render(<CoreHarness />);
    expect(screen.getByText('불러오는 중이에요…')).toBeInTheDocument();
    setup(HALFTIME);
    view.rerender(<CoreHarness />);

    expect(screen.getByText('06:00 남았어요')).toBeInTheDocument();
  });

  it('하프타임에 늦은 기록으로 상세가 잠깐 뒤처져도 쉬는 시간은 이어진다', () => {
    setup(HALFTIME);
    const view = render(<CoreHarness />);
    advance(4 * 60_000);

    // 늦은 골이 확정돼 소켓 버전이 먼저 오르고, 상세는 아직 옛 버전이다.
    setup(HALFTIME, { snapshotVersion: 3 });
    view.rerender(<CoreHarness />);
    expect(screen.getByText('06:00 남았어요')).toBeInTheDocument();

    setup(HALFTIME, { detailVersion: 3, snapshotVersion: 3 });
    view.rerender(<CoreHarness />);
    expect(screen.getByText('06:00 남았어요')).toBeInTheDocument();
  });

  it('후반 시작하면 카드가 사라진다', () => {
    setup(HALFTIME);
    const view = render(<CoreHarness />);
    expect(screen.getByText('10:00 남았어요')).toBeInTheDocument();

    setup(SECOND_HALF);
    view.rerender(<CoreHarness />);
    expect(screen.queryByText(/남았어요/)).toBeNull();
    expect(screen.queryByText(/쉬는 시간/)).toBeNull();
  });

  it('쉬는 시간이 끝나면 하프타임 카드는 확인을 누를 때까지 알림으로 남는다', () => {
    setup(HALFTIME);
    render(<CoreHarness />);
    advance(10 * 60_000);

    expect(screen.getByRole('alert')).toHaveTextContent('쉬는 시간이 끝났어요');
    advance(60_000);
    expect(screen.getByRole('alert')).toHaveTextContent('쉬는 시간이 끝났어요');
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: '확인' }));
    expect(screen.queryByText('쉬는 시간이 끝났어요')).toBeNull();
  });

  it('진행 중에는 쉬는 시간 UI 가 없고 더보기 → 쉬는 시간 재기 → 5분으로 닿는다', () => {
    setup(FIRST_HALF);
    render(<CoreHarness />);
    expect(screen.queryByText(/쉬는 시간/)).toBeNull();

    fireEvent.click(within(openMoreSheet()).getByRole('button', { name: /^쉬는 시간 재기/ }));
    const sheet = screen.getByRole('dialog', { name: '쉬는 시간' });
    expect(screen.queryByRole('dialog', { name: '더보기' })).toBeNull();
    fireEvent.click(within(sheet).getByRole('button', { name: '5분' }));

    expect(within(sheet).getByText('05:00 남았어요')).toBeInTheDocument();
    advance(60_000);
    expect(within(sheet).getByText('04:00 남았어요')).toBeInTheDocument();

    // 시트를 닫아도 첫 화면에는 쉬는 시간이 나오지 않고, 더보기 항목이 남은 시간을 말한다.
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
    expect(screen.queryByText(/남았어요/)).toBeNull();
    expect(within(openMoreSheet()).getByRole('button', { name: /^쉬는 시간 재기/ })).toHaveTextContent('04:00 남았어요');
  });

  it('진행 중 끝나면 토스트', () => {
    setup(FIRST_HALF);
    render(<CoreHarness />);
    fireEvent.click(within(openMoreSheet()).getByRole('button', { name: /^쉬는 시간 재기/ }));
    const sheet = screen.getByRole('dialog', { name: '쉬는 시간' });
    fireEvent.click(within(sheet).getByRole('button', { name: '1분' }));
    fireEvent.click(within(sheet).getByRole('button', { name: '닫기' }));
    expect(screen.queryByText('쉬는 시간이 끝났어요')).toBeNull();

    advance(60_000);

    expect(screen.getByText('쉬는 시간이 끝났어요')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    // 알린 뒤에는 다시 잴 수 있는 처음 상태로 돌아간다.
    expect(within(openMoreSheet()).getByRole('button', { name: /^쉬는 시간 재기/ })).toHaveTextContent('부상·작전 시간처럼 잠깐 멈출 때');
  });

  it('진행 중 시트를 열어 둔 채 끝나면 토스트 대신 시트 안에서 알린다', () => {
    setup(FIRST_HALF);
    render(<CoreHarness />);
    fireEvent.click(within(openMoreSheet()).getByRole('button', { name: /^쉬는 시간 재기/ }));
    const sheet = screen.getByRole('dialog', { name: '쉬는 시간' });
    fireEvent.click(within(sheet).getByRole('button', { name: '1분' }));

    advance(60_000);

    expect(within(sheet).getByRole('alert')).toHaveTextContent('쉬는 시간이 끝났어요');
    expect(screen.getAllByText('쉬는 시간이 끝났어요')).toHaveLength(1);
  });
});
