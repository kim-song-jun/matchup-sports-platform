import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { countActiveSubstitutions, deriveOnPitchParticipantIds } from '@/lib/on-pitch-state';
import type { GameEventRecord, GameLineupParticipant, GameState } from '@/types/game-operations';

/**
 * 재연결 와이프 회귀 테스트 — 사용자 보고 "오래 들어가 있으면 가끔 기록이 안 돼서
 * 새로고침해야 한다".
 *
 * `use-v1-game-operations-console-initial-history.test.tsx`가 박제한 alpha 실사고
 * (2026-08)는 **최초 구독**만 `afterSequence: 0`으로 고치고 **재연결 경로**는
 * 그대로 뒀다. 남은 절반이 이 파일이 잡는 결함이다:
 *
 *  - 서버 `GamesService.listEvents`는 `sequence > afterSequence` 인 **델타만** 준다.
 *  - 클라 `applySnapshot`은 `setLiveEvents(snapshot.events)` 로 **통째 교체**한다.
 *  - 재연결 구독은 `afterSequence = lastSequenceRef.current`(=이미 아는 마지막
 *    시퀀스)를 보내므로 서버는 **빈 배열**을 준다 → `setLiveEvents([])`.
 *
 * 소켓은 모듈 싱글턴이고 socket.io v4 기본값이 무한 재연결이라, 콘솔을 오래 켜 두면
 * 재연결 1회마다 이벤트 목록이 통째로 비워진다. `liveEvents` 단독에서 파생되는
 * 헤더 스코어·누적 파울·교체 잔여·"지금 피치 위"가 전부 같이 무너지고, 그 상태에서
 * 교체를 기록하면 서버가 `SUBSTITUTION_OUT_NOT_ON_PITCH` /
 * `SUBSTITUTION_IN_ALREADY_ON_PITCH`로 거부한다 — 둘 다 클라 NON_RETRYABLE 목록에
 * 있어 '다시 시도' 버튼조차 뜨지 않는다(= 새로고침 말고는 복구 수단 없음).
 */

const GAME_ID = 'game-1';

/** 선발 2명(p-1, p-2) + 벤치 1명(p-3). `started`만이 "경기 시작 시점의 피치"이고
 * 그 이후는 SUBSTITUTION 이벤트를 접어서 구한다(`on-pitch-state.ts`). */
const PARTICIPANTS: readonly GameLineupParticipant[] = [
  lineupParticipant('p-1', true),
  lineupParticipant('p-2', true),
  lineupParticipant('p-3', false),
];

function lineupParticipant(id: string, started: boolean): GameLineupParticipant {
  return {
    id,
    gameId: GAME_ID,
    sideId: 'side-home',
    lineupId: 'lineup-home',
    userId: null,
    displayNameSnapshot: id,
    jerseyNumber: null,
    position: null,
    positionX: null,
    positionY: null,
    started,
    createdAt: '2026-08-16T00:00:00.000Z',
    updatedAt: '2026-08-16T00:00:00.000Z',
  };
}

function baseEvent(sequence: number): GameEventRecord {
  return {
    id: `event-${sequence}`,
    gameId: GAME_ID,
    sequence,
    clientEventId: `client-${sequence}`,
    payloadHash: `hash-${sequence}`,
    type: 'GOAL',
    sideId: 'side-home',
    participantId: 'p-1',
    assistParticipantId: null,
    period: 1,
    clockMs: 60_000 * sequence,
    occurredAt: '2026-08-16T00:01:00.000Z',
    receivedAt: '2026-08-16T00:01:00.000Z',
    actorUserId: 'actor-1',
    reversesEventId: null,
    payload: {},
  };
}

/** seq 1: 홈 골(헤더 스코어 1점) / seq 2: 홈 교체 — p-2 out, p-3 in.
 * 따라서 정상 상태의 "지금 피치 위"는 {p-1, p-3}, 홈 교체 사용 1회다. */
const SERVER_EVENTS: readonly GameEventRecord[] = [
  baseEvent(1),
  {
    ...baseEvent(2),
    type: 'SUBSTITUTION',
    participantId: 'p-3',
    payload: { outParticipantId: 'p-2' },
  },
];
const SERVER_LAST_SEQUENCE = 2;

type SubscribeInput = { gameId: string; afterSequence: number };

/**
 * 핸들러를 **저장하는** mock 소켓 — 기존 initial-history 테스트의 mock은 `on`이
 * `vi.fn()`이라 핸들러를 버려서 `connect`를 두 번째로 발화시킬 수 없다.
 *
 * `game.subscribe` ack는 서버(`GamesService.listEvents`,
 * `sequence: { gt: afterSequence, lte: snapshotLastSequence }`)를 그대로 흉내낸다:
 * **delta만** 돌려주고 `lastSequence`는 언제나 서버 기준 최신값이다.
 */
function createMockSocket() {
  const handlers = new Map<string, Set<(...args: never[]) => void>>();
  const subscribeCalls: SubscribeInput[] = [];

  const socket = {
    connected: true,
    on(event: string, handler: (...args: never[]) => void) {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
    },
    off(event: string, handler: (...args: never[]) => void) {
      handlers.get(event)?.delete(handler);
    },
    emit(event: string, payload: unknown, cb?: (result: unknown) => void) {
      if (event === 'game.subscribe' && cb) {
        const input = payload as SubscribeInput;
        subscribeCalls.push(input);
        cb({
          status: 'subscribed',
          snapshot: {
            version: 7,
            state: 'LIVE' as GameState,
            lastSequence: SERVER_LAST_SEQUENCE,
            events: SERVER_EVENTS.filter((e) => e.sequence > input.afterSequence),
          },
        });
      }
    },
  };

  /** 소켓이 끊겼다 다시 붙는 것을 재현한다(socket.io v4 기본 무한 재연결). */
  function fire(event: string, ...args: unknown[]) {
    for (const handler of [...(handlers.get(event) ?? [])]) {
      (handler as (...a: unknown[]) => void)(...args);
    }
  }

  return { socket, subscribeCalls, fire };
}

vi.mock('@/lib/api-client', () => ({
  v1Get: vi.fn(async () => ({ items: [] })),
  v1Post: vi.fn(async () => ({})),
}));

function createWrapper(queryClient: QueryClient) {
  return function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  window.localStorage.clear();
});

async function mountConsole() {
  const mock = createMockSocket();
  vi.doMock('@/lib/v1-game-operations-socket', () => ({
    getV1GameOperationsSocket: () => mock.socket,
    setGameOperationsAuthorizationSubjectVersion: vi.fn(),
  }));

  const { useV1GameOperationsConsole } = await import('./use-v1-game-operations-console');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = renderHook(
    () =>
      useV1GameOperationsConsole({
        tournamentId: null,
        gameId: GAME_ID,
        myUserId: 'user-1',
        initialLastSequence: SERVER_LAST_SEQUENCE,
      }),
    { wrapper: createWrapper(queryClient) },
  );

  // 최초 구독이 전체 이력을 받아온 뒤부터가 이 테스트의 출발선이다.
  await waitFor(() => expect(rendered.result.current.liveEvents).toHaveLength(2));
  await waitFor(() => expect(rendered.result.current.sync.lastSequence).toBe(SERVER_LAST_SEQUENCE));
  expect(mock.subscribeCalls).toEqual([{ gameId: GAME_ID, afterSequence: 0 }]);

  return { ...mock, ...rendered };
}

describe('useV1GameOperationsConsole — 재연결이 이벤트 이력을 지우지 않는다', () => {
  it('(a) 재연결 후에도 이미 받은 이벤트가 liveEvents에 그대로 남아 있다', async () => {
    const { fire, result, unmount } = await mountConsole();

    act(() => fire('connect'));

    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));
    expect(result.current.liveEvents.map((event) => event.id)).toEqual(['event-1', 'event-2']);

    unmount();
  });

  it('(b) 재연결 구독도 afterSequence:0으로 전체 리싱크한다', async () => {
    const { fire, subscribeCalls, result, unmount } = await mountConsole();

    act(() => fire('connect'));

    await waitFor(() => expect(subscribeCalls).toHaveLength(2));
    expect(subscribeCalls[1]).toEqual({ gameId: GAME_ID, afterSequence: 0 });

    // 델타 재구독이 사라져도 서버 기준 시퀀스는 그대로여야 한다.
    expect(result.current.sync.lastSequence).toBe(SERVER_LAST_SEQUENCE);

    unmount();
  });

  it('(c) 재연결 후에도 liveEvents 파생값(헤더 스코어 입력·교체 잔여)이 보존된다', async () => {
    const { fire, result, unmount } = await mountConsole();

    // `game.subscribe` ack는 emit 안에서 동기적으로 돌아오므로 act 종료 시점에
    // 재구독 결과가 이미 반영돼 있다 — waitFor로 감싸면 실패가 타임아웃으로
    // 뭉개져 원인이 보이지 않는다.
    act(() => fire('connect'));

    // 헤더 스코어는 liveEvents의 GOAL을 접어서 만든다(operate-console.tsx
    // `scoreBySideId`) — 골 이벤트가 사라지면 1:0이 0:0으로 되돌아간다.
    const goals = result.current.liveEvents.filter((event) => event.type === 'GOAL');
    expect(goals).toHaveLength(1);

    // "교체 잔여"는 실제 프로덕션 파생 함수를 그대로 쓴다.
    expect(countActiveSubstitutions('side-home', result.current.liveEvents)).toBe(1);

    unmount();
  });

  it('(d) 재연결 직후에도 교체 대상이 여전히 피치 위로 인식된다 (SUBSTITUTION_OUT_NOT_ON_PITCH를 유발하지 않는다)', async () => {
    const { fire, result, unmount } = await mountConsole();

    act(() => fire('connect'));

    // 훅 경계에서 검증 가능한 형태: 콘솔이 실제로 쓰는 파생 함수
    // (`deriveOnPitchParticipantIds`)에 훅이 내놓은 liveEvents를 그대로 먹인다.
    const onPitch = deriveOnPitchParticipantIds(PARTICIPANTS, result.current.liveEvents);

    // seq 2 교체로 들어온 p-3은 피치 위 — 여기서 p-3을 빼는 교체를 기록해도
    // 서버 `assertSubstitution`이 통과시킨다.
    expect(onPitch.has('p-3')).toBe(true);
    // 나간 p-2는 벤치 — 다시 넣는 교체가 `SUBSTITUTION_IN_ALREADY_ON_PITCH`로
    // 거부되지 않는다.
    expect(onPitch.has('p-2')).toBe(false);

    unmount();
  });
});
