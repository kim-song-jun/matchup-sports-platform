'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { v1Get, v1Post } from '@/lib/api-client';
import {
  assertQueueable,
  canAppendWhileSyncing,
  deserializeQueueState,
  EMPTY_QUEUE_STATE,
  gameOperationsQueueReducer,
  gameSyncReducer,
  hydrateAfterReload,
  INITIAL_SYNC_STATE,
  INITIAL_TAKEOVER_STATE,
  isTakeoverHeld,
  nextQueuedItem,
  serializeQueueState,
  takeoverReducer,
  type GameOperationsQueueState,
  type GameSyncState,
  type QueuedGameEvent,
  type TakeoverState,
} from '@/lib/game-operations-queue';
import { canonicalGameEventPayloadHash } from '@/lib/game-operations-hash';
import { medianOffsetMs, pushClockSample, type ClockPingPong } from '@/lib/game-operations-clock';
import { getV1GameOperationsSocket, setGameOperationsAuthorizationSubjectVersion } from '@/lib/v1-game-operations-socket';
import { randomUuid } from '@/lib/uuid';
import { v1Keys } from '@/lib/query-keys';
import type {
  AssignGoalAssistResult,
  GameEventRecord,
  GameEventType,
  GameState,
  GameTakeoverGrant,
} from '@/types/game-operations';

/**
 * `game.takeover.request` / `game.takeover.renew` 의 ack 응답.
 *
 * 서버(RealtimeGateway)는 `{ status: 'granted', ...GameTakeoverGrant }` 를 보낸다 —
 * 토큰 필드 이름은 `takeoverToken` 이다. 예전에는 이 콜백 인자를
 * `{ status: string; token?: string; ... }` 라는 인라인 리터럴로 적어 두었는데,
 * ack 콜백은 socket.io 쪽에서 타입이 강제되지 않으므로 tsc 가 이 불일치를 잡지 못했다.
 * 그 결과 서버가 granted 를 줘도 `result.token` 이 undefined 라 항상 denied 로 떨어졌고,
 * 화면에는 "이 경기를 운영할 권한이 없어요" 가 떴다(대회 디렉터가 경기를 운영하지 못함).
 * 공유 타입에서 파생시켜 필드가 다시 갈라지면 컴파일이 깨지게 한다.
 */
type GameTakeoverAck =
  | ({ status: 'granted' } & GameTakeoverGrant)
  | { status: 'denied'; code?: string };

const CLOCK_PING_INTERVAL_MS = 15_000;
const TAKEOVER_RENEW_INTERVAL_MS = 20_000; // < the 30s server-enforced minimum renewal spacing
const TAKEOVER_EXPIRY_CHECK_INTERVAL_MS = 2_000;
/**
 * UX audit item 1 (CRITICAL, 2026-08): `socket.emit(event, payload, ackHandler)`
 * has no built-in timeout — if the socket disconnects (or the server hangs)
 * after the emit but before the ack, `ackHandler` may simply never fire.
 * Before this constant existed, that meant the queue item sat in `sending`
 * forever: `nextQueuedItem()` only ever re-sends `queued` items, so a
 * mid-flight event an operator captured (a goal, a card) could look
 * permanently "전송 중" with no retry button and no way to tell whether it
 * actually landed — recoverable only by a full page reload (which
 * `hydrateAfterReload` resets `sending` → `queued` for). This timeout is the
 * in-session escape hatch: if no ack arrives within this window, the item is
 * force-FAILed with a retryable error code, which surfaces the existing
 * `QueueStatusPanel` retry affordance instead of a silent, permanent stall.
 */
export const SEND_ACK_TIMEOUT_MS = 10_000;

function queueStorageKey(gameId: string): string {
  return `teameet.v1.gameOps.queue.${gameId}`;
}

function loadPersistedQueue(gameId: string): GameOperationsQueueState {
  if (typeof window === 'undefined') return EMPTY_QUEUE_STATE;
  const raw = window.localStorage.getItem(queueStorageKey(gameId));
  return hydrateAfterReload(deserializeQueueState(raw).items);
}

function persistQueue(gameId: string, state: GameOperationsQueueState): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(queueStorageKey(gameId), serializeQueueState(state));
}

interface MyStaffAssignment {
  readonly userId: string;
  readonly version: number;
  readonly revokedAt: string | null;
  readonly expiresAt: string | null;
}

/** Resolves the CURRENT actor's own tournament-staff assignment version, so
 * the socket handshake can present a value the gateway's `game.subscribe`
 * staleness gate will actually recognize as fresh (see that handler's own
 * doc comment in `RealtimeGateway`). `null` (no row found) is correct and
 * expected for a `platform_ops` admin-bypass actor -- the gateway only
 * enforces this check `when principal.assignmentVersion !== null`. */
function useMyTournamentStaffAssignmentVersion(tournamentId: string | null, myUserId: string | undefined) {
  return useQuery({
    queryKey: [...v1Keys.all, 'tournament-ops', tournamentId ?? '', 'staff'] as const,
    queryFn: () =>
      v1Get<{ items: MyStaffAssignment[] }>(`/tournament-ops/tournaments/${tournamentId}/staff`),
    // 팀매치(tournamentId===null)는 스태프 배정 개념이 없다 — 쿼리 자체를 스킵하고
    // 아래 효과가 항상 0을 기록/전송하게 둔다(그래도 self-consistency 체크는 통과한다).
    enabled: Boolean(tournamentId) && Boolean(myUserId),
    staleTime: 15_000,
    select: (data) => data.items.find((item) => item.userId === myUserId) ?? null,
  });
}

export type GameOperationsConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface SubmitEventInput {
  readonly type: GameEventType;
  readonly sideId?: string;
  readonly participantId?: string;
  readonly assistParticipantId?: string | null;
  readonly period: number;
  readonly clockMs: number;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

export interface UseV1GameOperationsConsoleOptions {
  // T3 추가: 팀매치는 tournamentId/스태프 배정 개념이 없다 — null이면 아래
  // useMyTournamentStaffAssignmentVersion 쿼리가 스킵되고 버전은 항상 0으로
  // 고정된다(팀매치는 배정 handshake가 필요 없어 언제나 self-consistent하다).
  readonly tournamentId: string | null;
  readonly gameId: string | null;
  readonly myUserId: string | undefined;
  /**
   * 페이지가 REST로 미리 읽어온(`useV1Game`) `gameDetail.data.lastSequence`.
   * **이 값은 소켓 최초 구독의 `afterSequence`로 쓰이면 안 된다** — 이전엔
   * 그렇게 썼고, 그게 alpha 실사고(2026-08)의 원인이었다: 서버에 이미
   * 기록된 이벤트가 있어도(예: 5건) 클라이언트는 그 이벤트를 한 번도 받은
   * 적이 없는데 "거기까지는 이미 안다"고 서버에 알리는 셈이라 서버가 빈
   * 배열을 돌려줬다("아직 기록된 이벤트가 없어요"로 보임, 스코어도 0:0
   * 고정). 최초 구독은 항상 `afterSequence: 0`으로 전체 이력을 받는다(아래
   * 소켓 라이프사이클 effect 참고) — 재연결/갭 복구에서만 `lastSequenceRef`를
   * 쓴다. 이 값이 실제로 쓰이는 곳은 두 군데뿐이다: (1) 마운트 시
   * `sync.lastSequence`의 초기값(첫 스냅숏이 도착하기 전 화면에 잠깐 보일 수
   * 있는 값), (2) `requestTakeover`가 서버에 보내는 `lastSequence` 필드
   * (참고용 — 서버가 게이팅에 쓰지 않는다, `GamesService.requestTakeover`).
   */
  readonly initialLastSequence: number;
}

export interface UseV1GameOperationsConsoleResult {
  readonly connectionStatus: GameOperationsConnectionStatus;
  readonly sync: GameSyncState;
  readonly takeover: TakeoverState;
  readonly queue: GameOperationsQueueState;
  readonly clockOffsetMs: number;
  readonly liveEvents: readonly GameEventRecord[];
  readonly gameSnapshot: { readonly version: number; readonly state: GameState } | null;
  readonly bannerMessage: string | null;
  submitEvent(input: SubmitEventInput): Promise<void>;
  retryFailedEvent(clientEventId: string): void;
  requestTakeover(): void;
  /** T3 추가 — 큐를 거치지 않는 온라인 전용 되돌리기(D-10과 같은 이유로 절대
   * 오프라인 큐에 들어가지 않는다). 골/카드/교체 등 일반 이벤트를 되돌릴 때 쓰인다
   * — 어시스트 부착·해제는 더 이상 이 경로를 타지 않는다(아래 assignAssist 참고,
   * 이슈 #376). */
  reverseEvent(input: { eventId: string; reason: string }): Promise<void>;
  /**
   * 이슈 #376 — 이미 기록된 GOAL 이벤트의 assistParticipantId를 원자적으로
   * 채우거나(참가자 id) 지우는(null) 커맨드. `reverseEvent`와 같은 이유로 큐를
   * 거치지 않는 온라인 전용 REST 호출이다(D-10). 예전 `attachAssist`가 하던
   * "reverseEvent로 되돌리고 새 GOAL을 submitEvent로 재제출"하는 2단계 흐름을
   * 완전히 대체한다 — 그 흐름은 두 번째 호출이 첫 번째 호출의 버전 갱신을 아직
   * 반영하지 못한 stale expectedVersion을 큐에 넣어 구조적으로 실패할 수 있었다
   * (GamesService.assignGoalAssist의 문서 주석 참고).
   */
  assignAssist(input: { eventId: string; assistParticipantId: string | null }): Promise<void>;
  /**
   * UX 감사 — `start`/`pause`/`resume`/`end`/`end-period`/`start-period`/
   * `revert-period` 커맨드는 항상 REST로만
   * 처리되고(D-10) 성공해도 게이트웨이가 아무 것도 브로드캐스트하지 않는다
   * (`RealtimeGateway`에 커맨드 성공 emit이 없다 — 이벤트 append만
   * `game.event.committed`를 쏜다). 그래서 명령이 성공해도 `gameSnapshot`은
   * 다음 이벤트 커밋이나 재구독 전까지 그대로였다: alpha 실측(2026-08)에서
   * "재개 완료 · 167ms" 피드백은 떴는데 화면은 계속 "일시 중지"로 남았고
   * 새로고침해야 풀렸다 — `gameState = ops.gameSnapshot?.state ??
   * gameDetail.data?.state`가 gameSnapshot을 우선하므로 REST
   * `gameDetail.refetch()`가 최신 state를 받아와도 화면엔 반영되지 않았다.
   * 호출부는 커맨드 REST 응답(`{ state, version }`)을 받은 즉시 이걸 불러
   * gameSnapshot을 그 자리에서 갱신해야 한다.
   */
  applyCommandResult(result: { state: GameState; version: number }): void;
}

/**
 * Task 21 — the integration hook wiring the pure queue/clock/token reducers
 * (`lib/game-operations-queue.ts`, `lib/game-operations-clock.ts`) to the
 * `/game-operations` socket and durable localStorage persistence. This hook
 * itself is intentionally NOT the target of the QA scenario's Vitest
 * coverage (reload/duplicate-ack/gap/revoke/expiry-reacquire/end-validation)
 * -- those are asserted directly against the pure reducers it calls, which
 * is what makes them assertable without a real socket/browser.
 */
export function useV1GameOperationsConsole(
  options: UseV1GameOperationsConsoleOptions,
): UseV1GameOperationsConsoleResult {
  const { tournamentId, gameId, myUserId, initialLastSequence } = options;
  const queryClient = useQueryClient();

  const [connectionStatus, setConnectionStatus] = useState<GameOperationsConnectionStatus>('connecting');
  const [sync, dispatchSync] = useReducer(gameSyncReducer, INITIAL_SYNC_STATE);
  const [takeover, dispatchTakeover] = useReducer(takeoverReducer, INITIAL_TAKEOVER_STATE);
  const [queue, dispatchQueue] = useReducer(gameOperationsQueueReducer, EMPTY_QUEUE_STATE);
  const [gameSnapshot, setGameSnapshot] = useState<{ version: number; state: GameState } | null>(null);
  const [liveEvents, setLiveEvents] = useState<readonly GameEventRecord[]>([]);
  const [clockSamples, setClockSamples] = useState<readonly ClockPingPong[]>([]);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  const clockOffsetMs = useMemo(() => medianOffsetMs(clockSamples), [clockSamples]);

  const myAssignment = useMyTournamentStaffAssignmentVersion(tournamentId, myUserId);
  const clientInstanceIdRef = useRef<string | null>(null);
  // 언마운트 후 SEND_ACK_TIMEOUT_MS 타이머가 뒤늦게 발화해 dispatch하는 것을
  // 막는다 — 화면을 떠난 뒤의 상태 갱신은 의미가 없다.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // ── Queue: hydrate once per gameId, persist on every change ───────────────
  useEffect(() => {
    if (!gameId) return;
    dispatchQueue({ type: 'HYDRATE', items: loadPersistedQueue(gameId).items });
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;
    persistQueue(gameId, queue);
  }, [gameId, queue]);

  useEffect(() => {
    dispatchSync({ type: 'SNAPSHOT', lastSequence: initialLastSequence });
  }, [initialLastSequence]);

  // Always mirrors the latest `sync.lastSequence` for handlers registered by
  // the gameId-only socket effect below (see that effect's own comment).
  const lastSequenceRef = useRef(sync.lastSequence);
  useEffect(() => {
    lastSequenceRef.current = sync.lastSequence;
  }, [sync.lastSequence]);

  // `reverseEvent` (T3, REST-only, no offline queue — see that function's own
  // comment) has no realtime broadcast counterpart: `GamesService.
  // reverseEvent` writes the CORRECTION row over REST and nothing emits
  // `game.event.committed` for it (unlike WS-submitted GOAL/CARD/FOUL/
  // SUBSTITUTION appends). Left alone, the operator's own `liveEvents` —
  // and therefore the scoreboard, which derives purely from it — would only
  // pick up a reversal on the next full reload. This ref lets `reverseEvent`
  // (defined outside the gameId-effect below) trigger a full resync of
  // `liveEvents` from the SAME authoritative source a fresh page load uses,
  // set inside that effect and cleared on its cleanup so a call after
  // unmount/gameId-change is a safe no-op.
  const resyncEventsRef = useRef<(() => void) | null>(null);

  // ── Handshake authorization-subject version ────────────────────────────────
  useEffect(() => {
    setGameOperationsAuthorizationSubjectVersion(myAssignment.data?.version ?? 0);
  }, [myAssignment.data?.version]);

  // ── Socket lifecycle: connect, subscribe, listen ───────────────────────────
  useEffect(() => {
    if (!gameId) return undefined;

    const socket = getV1GameOperationsSocket();
    let cancelled = false;
    // 이 소켓 구독 세션(=이 gameId의 effect 인스턴스) 안에서 서버로부터 진짜
    // 스냅숏을 한 번이라도 받았는지 — 받기 전까지는 이 클라이언트가 실제로
    // "아는" 이벤트가 하나도 없다는 뜻이다(REST로 미리 읽은
    // `initialLastSequence`가 있어도 마찬가지 — 그건 숫자만 알 뿐 이벤트
    // 본문을 받은 적이 없다). ack 콜백 안에서 성공한 경우에만 true로
    // 올린다 — emit 시점에 미리 올려두면 최초 구독이 denied 등으로 실패한
    // 뒤 재연결이 왔을 때도 "이미 안다"고 착각해 여전히 빈 배열을 받는
    // 문제가 재현된다.
    let hasReceivedSnapshot = false;

    type SubscribeAck = {
      status: string;
      snapshot?: { version: number; state: GameState; lastSequence: number; events: readonly GameEventRecord[] };
    };

    // This effect intentionally depends only on `[gameId]` (resubscribing on
    // every sync/queue change would thrash the connection), so every handler
    // below reads the LATEST `lastSequence` through `lastSequenceRef` instead
    // of closing over the `sync` state value from whichever render created
    // this effect — a stale closure here would resubscribe/backfill from a
    // sequence far behind reality after the first snapshot.
    const applySnapshot = (snapshot: { version: number; state: GameState; lastSequence: number; events: readonly GameEventRecord[] }) => {
      setGameSnapshot({ version: snapshot.version, state: snapshot.state });
      setLiveEvents(snapshot.events);
      dispatchSync({ type: 'BACKFILLED', lastSequence: snapshot.lastSequence });
    };

    const resubscribeFromLastKnownSequence = () => {
      // 최초 구독은 항상 0부터(전체 이력) — 재연결/갭 복구에서만
      // `lastSequenceRef`를 써 이미 받은 이벤트를 다시 받지 않는다. 서버
      // `GamesService.listEvents`는 페이징이 없어(games.service.ts) 전체
      // 이력을 한 번에 돌려주는데, 대회 경기 하나의 이벤트 수는 골/카드/
      // 파울/교체 합쳐 수십 건 규모라 이 규모에서는 안전하다 — 수천 건
      // 단위가 되면 페이징이 필요하지만 지금 범위는 아니다.
      const afterSequence = hasReceivedSnapshot ? lastSequenceRef.current : 0;
      socket.emit(
        'game.subscribe',
        { gameId, afterSequence },
        (result: SubscribeAck) => {
          if (cancelled) return;
          if (result.status === 'subscribed' && result.snapshot) {
            hasReceivedSnapshot = true;
            applySnapshot(result.snapshot);
          } else if (result.status === 'denied') {
            setBannerMessage('운영 권한이 없어 이 경기를 조회할 수 없어요. 새로고침 후 다시 시도해주세요.');
          }
        },
      );
    };

    // Always fetches the COMPLETE event history (afterSequence: 0) — unlike
    // `resubscribeFromLastKnownSequence` (used for connect/gap-recovery,
    // which asks only for what's missing since `lastSequenceRef.current`),
    // this must never assume the client's current `liveEvents` are still a
    // valid base to build on: it exists specifically so `reverseEvent`
    // (below, outside this effect) can force `liveEvents` back in sync with
    // the server after a REST-only reversal that has no realtime broadcast
    // counterpart. A full resubscribe, exactly like the very first mount
    // performs, is the only response guaranteed self-consistent regardless
    // of what this client did or didn't already know.
    const resyncFromServer = () => {
      socket.emit(
        'game.subscribe',
        { gameId, afterSequence: 0 },
        (result: SubscribeAck) => {
          if (cancelled) return;
          if (result.status === 'subscribed' && result.snapshot) {
            hasReceivedSnapshot = true;
            applySnapshot(result.snapshot);
          } else if (result.status === 'denied') {
            setBannerMessage('운영 권한이 없어 이 경기를 조회할 수 없어요. 새로고침 후 다시 시도해주세요.');
          }
        },
      );
    };
    resyncEventsRef.current = resyncFromServer;

    const onConnect = () => {
      setConnectionStatus('connected');
      resubscribeFromLastKnownSequence();
    };
    const onDisconnect = () => setConnectionStatus('disconnected');
    const onSnapshot = (snapshot: { version: number; state: GameState; lastSequence: number; events: readonly GameEventRecord[] }) => {
      if (cancelled) return;
      // 서버는 구독 처리 중 이 이벤트도 함께 쏘고(`subscribeToGame`,
      // realtime.gateway.ts) 그 응답을 ack 콜백으로도 돌려준다 — 어느 쪽이
      // 먼저 도착해도 `hasReceivedSnapshot`이 올라가도록 여기서도 표시한다.
      hasReceivedSnapshot = true;
      applySnapshot(snapshot);
    };
    const onGap = (gap: { expectedSequence: number; availableFrom: number }) => {
      if (cancelled) return;
      dispatchSync({ type: 'GAP', expectedSequence: gap.expectedSequence, availableFrom: gap.availableFrom });
      // Recover by re-subscribing from the last KNOWN-good sequence — the
      // server replays every event from there, closing the gap in order.
      resubscribeFromLastKnownSequence();
    };
    const onCommitted = (committed: { gameId: string; sequence: number; version: number; event: GameEventRecord }) => {
      if (cancelled || committed.gameId !== gameId) return;
      setGameSnapshot((current) => (current ? { ...current, version: committed.version } : current));
      if (committed.sequence === lastSequenceRef.current + 1) {
        // Contiguous. The gateway emits `game.event.committed` to the
        // sender's OWN socket too (not only the room broadcast, which
        // explicitly excludes the sender) — so this fires for every
        // committed event on this game, self-sent or from another
        // operator, exactly once each. This is the single place liveEvents
        // is appended; the ack handler in `sendQueuedItem` only updates
        // queue/sync/version state for this device's own sends.
        dispatchSync({ type: 'BACKFILLED', lastSequence: committed.sequence });
        setLiveEvents((current) => [...current, committed.event]);
      } else if (committed.sequence > lastSequenceRef.current + 1) {
        // Non-contiguous broadcast: something between our last known
        // sequence and this one was missed — recover exactly like an
        // explicit `game.gap`, via a full re-subscribe/backfill rather
        // than silently appending a event list with a hole in it.
        dispatchSync({ type: 'GAP', expectedSequence: lastSequenceRef.current + 1, availableFrom: committed.sequence });
        resubscribeFromLastKnownSequence();
      }
      // committed.sequence <= lastSequenceRef.current: already-known/ordering-
      // duplicate broadcast, ignored.
    };
    const onPermissionRevoked = () => {
      if (cancelled) return;
      dispatchTakeover({ type: 'REVOKED', assignmentVersion: -1 });
      setBannerMessage('운영 권한이 해제됐어요. 다른 운영자가 이 경기를 담당하고 있어요.');
    };
    const onGameError = (error: { code: string; clientEventId?: string }) => {
      if (cancelled) return;
      if (error.clientEventId) {
        dispatchQueue({
          type: 'FAIL',
          clientEventId: error.clientEventId,
          error: { code: error.code, message: gameOperationsErrorMessage(error.code) },
        });
      } else {
        setBannerMessage(gameOperationsErrorMessage(error.code));
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game.snapshot', onSnapshot);
    socket.on('game.gap', onGap);
    socket.on('game.event.committed', onCommitted);
    socket.on('game.permission.revoked', onPermissionRevoked);
    socket.on('game.error', onGameError);

    if (socket.connected) onConnect();

    return () => {
      cancelled = true;
      if (resyncEventsRef.current === resyncFromServer) resyncEventsRef.current = null;
      socket.emit('game.unsubscribe', { gameId });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('game.snapshot', onSnapshot);
      socket.off('game.gap', onGap);
      socket.off('game.event.committed', onCommitted);
      socket.off('game.permission.revoked', onPermissionRevoked);
      socket.off('game.error', onGameError);
    };
  }, [gameId]);

  // ── Clock sync ping/pong ────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameId) return undefined;
    const socket = getV1GameOperationsSocket();
    const ping = () => {
      const clientSentAt = Date.now();
      socket.emit(
        'game.time.ping',
        { clientSentAt },
        (pong: { clientSentAt: number; serverReceivedAt: number; serverSentAt: number }) => {
          const clientReceivedAt = Date.now();
          setClockSamples((current) =>
            pushClockSample(current, {
              clientSentAt: pong.clientSentAt,
              serverReceivedAt: pong.serverReceivedAt,
              serverSentAt: pong.serverSentAt,
              clientReceivedAt,
            }),
          );
        },
      );
    };
    ping();
    const interval = setInterval(ping, CLOCK_PING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [gameId]);

  // ── Takeover: request once, renew on a timer, expire on a timer ────────────
  const requestTakeover = useCallback(() => {
    if (!gameId || (!myAssignment.data && myAssignment.isLoading)) return;
    const socket = getV1GameOperationsSocket();
    clientInstanceIdRef.current = clientInstanceIdRef.current ?? randomUuid();
    dispatchTakeover({ type: 'REQUEST' });
    socket.emit(
      'game.takeover.request',
      {
        gameId,
        authorizationSubjectVersion: myAssignment.data?.version ?? 0,
        clientInstanceId: clientInstanceIdRef.current,
        lastSequence: sync.lastSequence,
      },
      (result: GameTakeoverAck) => {
        // 서버가 코드를 주지 않은 경우까지 STAFF_SCOPE_DENIED 로 뭉뚱그리면 안 된다.
        // 운영자가 실제 원인이 아니라 권한 요청이라는 엉뚱한 경로로 가기 때문이다.
        // 서버가 명시한 거부만 그 코드로 남기고, 나머지는 원인 미상으로 구분한다.
        if (result.status !== 'granted') {
          dispatchTakeover({ type: 'DENIED', code: result.code ?? 'TAKEOVER_UNAVAILABLE' });
          return;
        }
        if (!result.takeoverToken || !result.expiresAt) {
          dispatchTakeover({ type: 'DENIED', code: 'TAKEOVER_UNAVAILABLE' });
          return;
        }
        dispatchTakeover({
          type: 'GRANTED',
          token: result.takeoverToken,
          expiresAtMs: new Date(result.expiresAt).getTime(),
          assignmentVersion: myAssignment.data?.version ?? 0,
        });
      },
    );
  }, [gameId, myAssignment.data, myAssignment.isLoading, sync.lastSequence]);

  useEffect(() => {
    if (takeover.status === 'none') requestTakeover();
  }, [takeover.status, requestTakeover]);

  useEffect(() => {
    if (takeover.status !== 'held') return undefined;
    const interval = setInterval(() => {
      const socket = getV1GameOperationsSocket();
      if (!clientInstanceIdRef.current) return;
      socket.emit(
        'game.takeover.renew',
        { gameId, takeoverToken: takeover.token, clientInstanceId: clientInstanceIdRef.current },
        (result: GameTakeoverAck) => {
          if (result.status !== 'granted') {
            dispatchTakeover({ type: 'DENIED', code: result.code ?? 'TAKEOVER_TOKEN_EXPIRED' });
            return;
          }
          if (!result.takeoverToken || !result.expiresAt) {
            dispatchTakeover({ type: 'DENIED', code: 'TAKEOVER_TOKEN_EXPIRED' });
            return;
          }
          dispatchTakeover({
            type: 'GRANTED',
            token: result.takeoverToken,
            expiresAtMs: new Date(result.expiresAt).getTime(),
            assignmentVersion: takeover.assignmentVersion,
          });
        },
      );
    }, TAKEOVER_RENEW_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeover.status, gameId]);

  useEffect(() => {
    const interval = setInterval(() => {
      dispatchTakeover({ type: 'CHECK_EXPIRY', nowMs: Date.now() });
    }, TAKEOVER_EXPIRY_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // UX 감사 — 주기적 renew(위 effect)가 실패하면 'denied'로 떨어지는데,
  // renew가 실패하는 흔한 이유는 (진짜 권한 상실이 아니라) 토큰 자체가
  // 서버에서 만료돼 renew 창을 놓친 경우다(게이트웨이가 `renewTakeover`
  // 실패를 거의 항상 `TAKEOVER_TOKEN_EXPIRED`로 매핑한다 —
  // `RealtimeGateway.renewGameTakeover`, `PERMISSION_DENIED`가 아닌 모든
  // ForbiddenException이 이 코드로 온다). 배너 문구
  // (`gameOperationsErrorMessage('TAKEOVER_TOKEN_EXPIRED')`)는 이미
  // "다시 가져오는 중이에요"라고 말하지만, 이전엔 자동 재요청 effect가
  // `status === 'expired'`(자연 만료, `CHECK_EXPIRY`)만 지켜봐서 실제로는
  // 아무것도 다시 가져오지 않았다 — alpha 실측(2026-08): 배너가 뜬 채 8초를
  // 기다려도 회복되지 않고 새로고침해야 풀렸다. `game.takeover.request`(재요청,
  // renew가 아니다)는 이 코드를 절대 돌려주지 않으므로(요청 경로는
  // STAFF_SCOPE_DENIED/VALIDATION_ERROR/granted만 가능) 이 재시도가 같은
  // 이유로 계속 실패하며 도는 tight loop이 될 수 없다. STAFF_SCOPE_DENIED 등
  // 진짜 권한 거부는 그대로 'denied'에 남아 재시도하지 않는다(D-10 취지 —
  // 같은 이유로 확실히 또 실패할 요청을 자동으로 반복하지 않는다).
  const deniedCode = takeover.status === 'denied' ? takeover.code : null;
  useEffect(() => {
    if (takeover.status === 'expired' || (takeover.status === 'denied' && deniedCode === 'TAKEOVER_TOKEN_EXPIRED')) {
      requestTakeover();
    }
  }, [takeover.status, deniedCode, requestTakeover]);

  // ── Event send / durable-queue flush ────────────────────────────────────────
  const sendQueuedItem = useCallback(
    (item: QueuedGameEvent) => {
      if (!gameId || !isTakeoverHeld(takeover) || !canAppendWhileSyncing(sync)) return;
      if (Date.now() >= takeover.expiresAtMs) return; // CHECK_EXPIRY's poll will flip status to 'expired' shortly; do not send meanwhile.
      const socket = getV1GameOperationsSocket();
      dispatchQueue({ type: 'MARK_SENDING', clientEventId: item.clientEventId });
      // `attempts > 0` means this item already failed once and is being
      // resent via `retryFailedEvent`/the RETRY action — the backend already
      // has a dedicated rebase path for exactly this (`game.event.retry` →
      // `GamesService.retryEvent`), which re-validates against the CURRENT
      // game version instead of the stale `item.expectedVersion` captured at
      // enqueue time and skips the live clock-drift check (the event's
      // `occurredAt` is immutable/hash-pinned and legitimately historical by
      // now). Before this branch, EVERY retry re-emitted `game.event.append`
      // with the original stale `expectedVersion` — which is structurally
      // guaranteed to fail again with the exact same VERSION_CONFLICT /
      // OFFLINE_EVENT_REBASE_CONFLICT it failed with the first time, since
      // nothing ever advanced the version the retry presented.
      const isRetry = item.attempts > 0;
      // 이 emit의 ack가 SEND_ACK_TIMEOUT_MS 안에 오지 않으면(소켓이 응답 없이
      // 끊기면 콜백 자체가 영영 안 온다) 'sending'에 갇히지 않도록 FAIL로
      // 전환한다. ackHandler가 먼저 불리면 이 타이머는 취소된다 — 반대로
      // 타이머가 먼저 발화한 뒤 ack가 뒤늦게 와도 ACK 리듀서는 'failed'
      // 상태를 정상적으로 덮어쓰므로 늦은 성공 응답도 버려지지 않는다.
      const ackTimeoutId = setTimeout(() => {
        if (!isMountedRef.current) return;
        dispatchQueue({
          type: 'FAIL',
          clientEventId: item.clientEventId,
          error: { code: 'SEND_TIMEOUT', message: gameOperationsErrorMessage('SEND_TIMEOUT') },
        });
      }, SEND_ACK_TIMEOUT_MS);
      const ackHandler = (result: { status: string; sequence?: number; version?: number; code?: string }) => {
        clearTimeout(ackTimeoutId);
        if (result.status === 'ack' && result.sequence !== undefined && result.version !== undefined) {
          dispatchQueue({
            type: 'ACK',
            clientEventId: item.clientEventId,
            sequence: result.sequence,
            version: result.version,
          });
          // Advances local sync state for THIS device's own committed
          // event — `onCommitted` only fires for OTHER clients' broadcasts
          // (see that handler's own comment), so this device's own sends
          // must independently keep `lastSequenceRef`/`sync` current.
          dispatchSync({ type: 'BACKFILLED', lastSequence: result.sequence });
          setGameSnapshot((current) => (current ? { ...current, version: result.version! } : current));
          void queryClient.invalidateQueries({ queryKey: v1Keys.game(gameId) });
        } else {
          dispatchQueue({
            type: 'FAIL',
            clientEventId: item.clientEventId,
            error: { code: result.code ?? 'INTERNAL_ERROR', message: gameOperationsErrorMessage(result.code ?? 'INTERNAL_ERROR') },
          });
        }
      };
      if (isRetry) {
        socket.emit(
          'game.event.retry',
          {
            gameId,
            // Rebase onto the freshest version this device knows about
            // rather than the (by definition, already-rejected) version the
            // item was originally enqueued with.
            rebasedExpectedVersion: gameSnapshot?.version ?? item.expectedVersion,
            clientEventId: item.clientEventId,
            takeoverToken: takeover.token,
            payloadHash: item.payloadHash,
            event: item.event,
          },
          ackHandler,
        );
      } else {
        socket.emit(
          'game.event.append',
          {
            gameId,
            expectedVersion: item.expectedVersion,
            clientEventId: item.clientEventId,
            takeoverToken: takeover.token,
            payloadHash: item.payloadHash,
            event: item.event,
          },
          ackHandler,
        );
      }
    },
    [gameId, takeover, sync, queryClient, gameSnapshot],
  );

  useEffect(() => {
    if (
      connectionStatus !== 'connected' ||
      !isTakeoverHeld(takeover) ||
      Date.now() >= takeover.expiresAtMs ||
      !canAppendWhileSyncing(sync)
    ) {
      return;
    }
    const next = nextQueuedItem(queue);
    if (next) sendQueuedItem(next);
  }, [connectionStatus, takeover, sync, queue, sendQueuedItem]);

  const submitEvent = useCallback(
    async (input: SubmitEventInput) => {
      if (!gameSnapshot) return;
      // D-10 (frozen decision table): this is the ONLY thing that may ever
      // enter the durable offline queue. Asserting it here — even though
      // every current caller already only constructs an append_event —
      // means a future change that tries to route start/pause/resume/end/
      // officialize through this same path fails loudly instead of quietly
      // queuing a command that must always be online-acknowledged.
      assertQueueable('append_event');
      const clientEventId = randomUuid();
      const payloadHash = await canonicalGameEventPayloadHash({
        type: input.type,
        sideId: input.sideId,
        participantId: input.participantId,
        assistParticipantId: input.assistParticipantId,
        period: input.period,
        clockMs: input.clockMs,
        occurredAt: input.occurredAt,
        payload: input.payload,
      });
      const item: QueuedGameEvent = {
        clientEventId,
        gameId: gameId ?? '',
        expectedVersion: gameSnapshot.version,
        event: {
          type: input.type,
          sideId: input.sideId,
          participantId: input.participantId,
          assistParticipantId: input.assistParticipantId,
          period: input.period,
          clockMs: input.clockMs,
          occurredAt: input.occurredAt,
          payload: input.payload,
        },
        payloadHash,
        status: 'queued',
        queuedAt: new Date().toISOString(),
        attempts: 0,
        lastError: null,
        ackedSequence: null,
        ackedVersion: null,
      };
      dispatchQueue({ type: 'ENQUEUE', item });
    },
    [gameId, gameSnapshot],
  );

  const retryFailedEvent = useCallback(
    async (clientEventId: string) => {
      // alpha 실사고(2026-08) 구제: `medianOffsetMs()`를 고치기 전에 이미
      // 캡처된 항목은 `event.clockMs`가 소수(.5 등)일 수 있다 — 그대로
      // 재전송하면 서버 `parseGameEvent`(`Number.isSafeInteger` 요구)에
      // 똑같이 막혀 "다시 시도"가 영원히 무의미한 루프가 된다. 여기서만
      // 1ms 미만으로 반올림해 보정한다(이벤트가 실제로 벌어진 시각 자체는
      // 절대 바꾸지 않는다 — occurredAt은 그대로 둔다). 서버는 payloadHash를
      // event 내용으로 재계산해 대조하므로(`GamesService.retryEvent`) clockMs만
      // 고치고 hash를 그대로 두면 `OFFLINE_EVENT_REBASE_CONFLICT`로 또 실패한다
      // — 그래서 항상 짝지어 다시 계산한다.
      const item = queue.items.find((candidate) => candidate.clientEventId === clientEventId);
      if (item && !Number.isSafeInteger(item.event.clockMs)) {
        const repairedEvent = { ...item.event, clockMs: Math.round(item.event.clockMs) };
        try {
          const repairedHash = await canonicalGameEventPayloadHash({
            type: repairedEvent.type as GameEventType,
            sideId: repairedEvent.sideId,
            participantId: repairedEvent.participantId,
            assistParticipantId: repairedEvent.assistParticipantId,
            period: repairedEvent.period,
            clockMs: repairedEvent.clockMs,
            occurredAt: repairedEvent.occurredAt,
            payload: repairedEvent.payload,
          });
          dispatchQueue({
            type: 'RETRY',
            clientEventId,
            repairedEvent: { event: repairedEvent, payloadHash: repairedHash },
          });
          return;
        } catch {
          // Web Crypto를 쓸 수 없는 극단적 환경 등 — 보정 없이 원래 값으로
          // 재시도한다(이 픽스 이전과 동일하게 동작, 새 결함을 만들지 않는다).
        }
      }
      dispatchQueue({ type: 'RETRY', clientEventId });
    },
    [queue.items],
  );

  // T3 추가 — 큐를 거치지 않는 온라인 전용 REST 호출. assertQueueable을 굳이
  // 부르지 않는다(큐에 절대 안 넣으니 필요 없다) — 대신 이 함수 자체가 "온라인일
  // 때만 호출 가능"을 문서화한다.
  const reverseEvent = useCallback(
    async (input: { eventId: string; reason: string }) => {
      if (!gameId || !gameSnapshot || !isTakeoverHeld(takeover)) {
        throw new Error('경기 운영 권한이 없어 되돌릴 수 없어요.');
      }
      const clientEventId = randomUuid();
      const result = await v1Post<{ gameId: string; state: GameState; version: number }>(
        `/games/${gameId}/events/${input.eventId}/reverse`,
        {
          expectedVersion: gameSnapshot.version,
          clientEventId,
          takeoverToken: takeover.token,
          reason: input.reason,
        },
        { headers: { 'Idempotency-Key': clientEventId } },
      );
      setGameSnapshot((current) => (current ? { ...current, version: result.version } : current));
      void queryClient.invalidateQueries({ queryKey: v1Keys.game(gameId) });
      // Root-cause fix (2026-08, requirement 3): a reversal has no realtime
      // broadcast counterpart (`GamesService.reverseEvent` is REST-only and
      // never emits `game.event.committed` — see `resyncEventsRef`'s doc
      // comment). Without this, `liveEvents` — and the scoreboard, which is
      // purely derived from it — would keep showing the just-reversed goal
      // until a full page reload. Force the same full resync a fresh mount
      // performs so the correction (and its `reversesEventId`) lands
      // immediately.
      resyncEventsRef.current?.();
    },
    [gameId, gameSnapshot, takeover, queryClient],
  );

  // 이슈 #376 — 큐를 거치지 않는 온라인 전용 REST 호출(reverseEvent와 동일한 이유,
  // 위 주석 참고). 하나의 커맨드로 assistParticipantId를 in-place로 갱신하므로
  // reverseEvent+submitEvent 2단계가 겪던 stale expectedVersion 레이스가 구조적으로
  // 사라진다 — 이 함수 하나가 gameSnapshot.version을 읽어 그대로 보내고, 응답의
  // 새 version으로 갱신할 때까지 다른 커맨드가 끼어들 여지가 없다.
  const assignAssist = useCallback(
    async (input: { eventId: string; assistParticipantId: string | null }) => {
      if (!gameId || !gameSnapshot || !isTakeoverHeld(takeover)) {
        throw new Error('경기 운영 권한이 없어 어시스트를 기록할 수 없어요.');
      }
      const clientEventId = randomUuid();
      const result = await v1Post<AssignGoalAssistResult>(
        `/games/${gameId}/events/${input.eventId}/assist`,
        {
          expectedVersion: gameSnapshot.version,
          clientEventId,
          takeoverToken: takeover.token,
          assistParticipantId: input.assistParticipantId,
        },
        { headers: { 'Idempotency-Key': clientEventId } },
      );
      setGameSnapshot((current) => (current ? { ...current, version: result.version } : current));
      void queryClient.invalidateQueries({ queryKey: v1Keys.game(gameId) });
      // reverseEvent와 동일한 이유(위 그 함수의 주석 참고) — 이 REST-only 커맨드도
      // 실시간 브로드캐스트 짝이 없다. liveEvents를 서버 스냅숏으로 강제 재동기화해
      // in-place로 갱신된 assistParticipantId가 새로고침 없이 즉시 반영되게 한다.
      resyncEventsRef.current?.();
    },
    [gameId, gameSnapshot, takeover, queryClient],
  );

  // UX 감사 — REST 커맨드(start/pause/resume/end/end-period/start-period/
  // revert-period) 성공 응답을
  // 그 자리에서 gameSnapshot에 반영한다. 자세한 이유는
  // `UseV1GameOperationsConsoleResult.applyCommandResult` 문서 참고.
  const applyCommandResult = useCallback((result: { state: GameState; version: number }) => {
    setGameSnapshot((current) =>
      current ? { ...current, state: result.state, version: result.version } : current,
    );
  }, []);

  return {
    connectionStatus,
    sync,
    takeover,
    queue,
    clockOffsetMs,
    liveEvents,
    gameSnapshot,
    bannerMessage,
    submitEvent,
    retryFailedEvent,
    requestTakeover,
    reverseEvent,
    assignAssist,
    applyCommandResult,
  };
}

export function gameOperationsErrorMessage(code: string): string {
  switch (code) {
    case 'TAKEOVER_TOKEN_EXPIRED':
      return '운영 권한 토큰이 만료됐어요. 다시 가져오는 중이에요.';
    case 'STAFF_SCOPE_DENIED':
      return '이 경기를 운영할 권한이 없어요.';
    case 'TAKEOVER_UNAVAILABLE':
      // 서버가 거부 사유 코드를 주지 않은 경우만 여기로 온다. 연결 자체는 살아 있을 수
      // 있으므로(실제로 "실시간 연결됨" 상태에서 이 코드가 뜬 사례가 있었다) 원인을
      // 단정하지 않는다.
      return '경기 운영 권한을 가져오지 못했어요. 새로고침 후 다시 시도해 주세요.';
    case 'VERSION_CONFLICT':
      return '경기 상태가 변경되어 다시 시도해주세요.';
    case 'CLOCK_DRIFT':
      return '기기 시각이 서버와 많이 달라요. 시간을 확인해주세요.';
    // alpha 실사고(2026-08) 근본 원인: 옐로카드/파울 기록이 이 코드로 거부됐는데
    // 매핑이 없어 default("이벤트를 기록하지 못했어요")로 뭉개졌다. 실제 원인은
    // `medianOffsetMs()`가 소수(.5) offset을 반환해 `clockMs`가 정수가 아니게
    // 되고, 서버 `parseGameEvent`(`Number.isSafeInteger` 요구)가 거부한 것—
    // `game-operations-clock.ts`에서 고쳤다(새 캡처는 항상 정수). 다만 이 픽스
    // 이전에 이미 큐에 저장된 항목은 여전히 소수 clockMs를 갖고 있을 수 있어
    // NON_RETRYABLE로 두지 않는다 — `retryFailedEvent`가 재시도 시점에 정수로
    // 보정하고 payloadHash를 다시 계산해 함께 보내므로(아래 구현) 재시도가
    // 실제로 복구 경로가 된다.
    case 'VALIDATION_ERROR':
      return '이벤트 형식에 문제가 있어 기록하지 못했어요. 다시 시도해주세요.';
    // UX 감사 CRITICAL — 서버가 ack를 끝내 보내지 않아 'sending'에 고착되던
    // 상태를 클라이언트 타임아웃으로 감지한 경우에만 붙는 코드(서버가 던지는
    // 코드가 아니다). 네트워크가 끊겼거나 응답이 느린 경우가 대부분이라
    // 재시도로 풀릴 수 있다 — NON_RETRYABLE 목록에 없으므로 기본값대로
    // 재시도 가능으로 분류된다.
    case 'SEND_TIMEOUT':
      return '서버 응답을 받지 못했어요. 네트워크를 확인하고 다시 시도해주세요.';
    case 'OFFLINE_EVENT_REBASE_CONFLICT':
      return '오프라인 동안 기록한 이벤트를 다시 확인해주세요.';
    // T1-0 fix round 2: this event path goes through the Socket.IO gateway
    // (game.error), NOT extractErrorMessage -- the design doc assumed the
    // server message would show as-is, but it never reaches this console
    // without an explicit case here. Before this, all four fell to the
    // default "다시 시도해주세요", which is actively wrong for every one of
    // them: none of these are transient and retrying the exact same request
    // fails the exact same way every time until the operator does something
    // different (start the game, refresh, or end it).
    case 'PERIOD_NOT_STARTED':
      return '경기가 진행 중이 아니에요. 경기를 먼저 시작해 주세요.';
    case 'PERIOD_ALREADY_ENDED':
      return '이미 종료된 피리어드예요. 새로고침 후 다시 확인해주세요.';
    case 'NO_NEXT_PERIOD':
      return '마지막 피리어드예요. 경기를 종료해 주세요.';
    case 'EVENT_LATE':
      return '기록하려는 시점이 이미 지난 피리어드예요. 새로고침 후 다시 확인해주세요.';
    // 실측 사고(6건 시도 중 2건 실패) 사후조사에서 드러난 미매핑 코드 9개 — 서버는 이미
    // 이 코드들을 던질 수 있었는데(games.service.ts) 콘솔이 전부 default 로 뭉개
    // "다시 시도해주세요" 를 보여주고 있었다. 아래는 재시도로 풀리는지 여부에 따라
    // 문구를 나눴다 — `isRetryableGameOperationsErrorCode()` 의 판정과 반드시 짝을
    // 맞춰야 한다(둘이 갈라지면 "다시 시도해주세요" 인데 버튼이 없거나, 재시도해도
    // 안 되는데 버튼만 있는 모순이 생긴다).
    case 'TERMINAL_GAME_IMMUTABLE':
      return '이미 종료 처리된 경기라 더 이상 이벤트를 기록할 수 없어요.';
    case 'EVENT_INVALID':
      return '이벤트 정보가 올바르지 않아요. 새로고침 후 다시 기록해주세요.';
    case 'PARTICIPANT_SIDE_MISMATCH':
      return '선택한 선수가 해당 팀 소속이 아니에요. 새로고침 후 다시 기록해주세요.';
    case 'SCORER_REQUIRED':
      return '이 대회는 득점자를 반드시 선택해야 해요. 새로고침 후 다시 기록해주세요.';
    // 라이브 선수 교체(교체 액션 + 풋살 빠른 교체 모드) — 서버가 던질 수 있는
    // SUBSTITUTION 전용 코드. 화면단 필터가 애초에 무효한 대상을 보여주지
    // 않으므로 실제로는 동시성(다른 운영자가 먼저 기록)으로만 도달할 가능성이
    // 크지만, 그 경우에도 "다시 시도해주세요"는 오해를 준다 — 새로고침 후
    // 현재 피치 상태를 다시 확인하라고 안내한다.
    case 'SUBSTITUTION_INVALID':
      return '교체 정보가 올바르지 않아요. 새로고침 후 다시 기록해주세요.';
    case 'SUBSTITUTION_OUT_NOT_ON_PITCH':
      return '나가는 선수가 이미 피치를 떠났어요. 새로고침 후 다시 확인해주세요.';
    case 'SUBSTITUTION_IN_ALREADY_ON_PITCH':
      return '들어오는 선수가 이미 피치 위에 있어요. 새로고침 후 다시 확인해주세요.';
    case 'SUBSTITUTION_LIMIT_REACHED':
      return '이 대회의 교체 횟수를 모두 사용했어요.';
    case 'COMMAND_IDEMPOTENCY_KEY_MISMATCH':
    case 'IDEMPOTENCY_PAYLOAD_CONFLICT':
      return '같은 요청 번호로 다른 내용이 이미 처리됐어요. 새로고침 후 다시 기록해주세요.';
    case 'INVALID_ACTOR_SCOPE':
      return '이 작업을 수행할 권한이 없어요.';
    case 'COMMAND_CONCURRENCY_CONFLICT':
      return '다른 운영자가 동시에 처리하고 있어요. 잠시 후 다시 시도해주세요.';
    case 'INTERNAL_ERROR':
      // 사용자가 고칠 수 있는 게 없다 — 입력을 바꾸라고 하지 않는다. 재시도는 여전히
      // 유효한 선택지다(원인이 payload 가 아니라 일시적 서버 오류일 수 있으므로) — 그래서
      // isRetryableGameOperationsErrorCode 는 이 코드를 재시도 가능으로 둔다.
      return '일시적인 오류로 이벤트를 기록하지 못했어요. 다시 시도해도 계속되면 관리자에게 알려주세요.';
    default:
      // 위 어디에도 없는, 서버가 새로 추가했을 수 있는 코드 — "다시 시도해주세요" 를
      // 단정하지 않는다(그 코드가 재시도로 풀리는지 여기서는 알 수 없다).
      return '이벤트를 기록하지 못했어요.';
  }
}

/**
 * 코드별로 재시도(다시 보내기)가 의미 있는지 — `QueueStatusPanel` 이 이 값으로
 * "다시 시도" 버튼 자체를 숨긴다(비활성화가 아니라 숨김: 눌러도 매번 똑같이
 * 실패할 게 확실한 코드에서 버튼을 살려 두면 운영자가 실패 루프에 갇힌다).
 *
 * 재시도 가능 = "정확히 같은 이벤트를 다시 보내면, 조건이 바뀐 뒤엔 성공할 수 있다"
 * (버전 충돌 재베이스, 권한 토큰 재발급, 서버 일시 오류, 동시성 충돌, 아직 시작 안 한
 * 피리어드가 나중에 시작되는 경우 등). 재시도 불가능 = "같은 payload 는 조건이 무엇이든
 * 항상 같은 이유로 거부된다" — 이런 코드는 재전송이 아니라 다른 행동(새로고침, 다시
 * 캡처, 관리자 문의)이 필요하므로, 그 안내는 `gameOperationsErrorMessage` 문구 자체가
 * 이미 담고 있다.
 */
const NON_RETRYABLE_GAME_OPERATIONS_ERROR_CODES = new Set<string>([
  'STAFF_SCOPE_DENIED',
  'INVALID_ACTOR_SCOPE',
  'TERMINAL_GAME_IMMUTABLE',
  'PERIOD_ALREADY_ENDED',
  'NO_NEXT_PERIOD',
  'EVENT_LATE',
  'EVENT_INVALID',
  'PARTICIPANT_SIDE_MISMATCH',
  'SCORER_REQUIRED',
  'SUBSTITUTION_INVALID',
  'SUBSTITUTION_OUT_NOT_ON_PITCH',
  'SUBSTITUTION_IN_ALREADY_ON_PITCH',
  'SUBSTITUTION_LIMIT_REACHED',
  'COMMAND_IDEMPOTENCY_KEY_MISMATCH',
  'IDEMPOTENCY_PAYLOAD_CONFLICT',
]);

export function isRetryableGameOperationsErrorCode(code: string): boolean {
  return !NON_RETRYABLE_GAME_OPERATIONS_ERROR_CODES.has(code);
}
