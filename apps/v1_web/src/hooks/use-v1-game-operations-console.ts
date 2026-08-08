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
import type { GameEventRecord, GameEventType, GameState, GameTakeoverGrant } from '@/types/game-operations';

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
   * 오프라인 큐에 들어가지 않는다). 사후 어시스트 부착(reverse+re-append)에 쓰인다. */
  reverseEvent(input: { eventId: string; reason: string }): Promise<void>;
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

  // ── Handshake authorization-subject version ────────────────────────────────
  useEffect(() => {
    setGameOperationsAuthorizationSubjectVersion(myAssignment.data?.version ?? 0);
  }, [myAssignment.data?.version]);

  // ── Socket lifecycle: connect, subscribe, listen ───────────────────────────
  useEffect(() => {
    if (!gameId) return undefined;

    const socket = getV1GameOperationsSocket();
    let cancelled = false;

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
      socket.emit(
        'game.subscribe',
        { gameId, afterSequence: lastSequenceRef.current },
        (result: SubscribeAck) => {
          if (cancelled) return;
          if (result.status === 'subscribed' && result.snapshot) {
            applySnapshot(result.snapshot);
          } else if (result.status === 'denied') {
            setBannerMessage('운영 권한이 없어 이 경기를 조회할 수 없어요. 새로고침 후 다시 시도해주세요.');
          }
        },
      );
    };

    const onConnect = () => {
      setConnectionStatus('connected');
      resubscribeFromLastKnownSequence();
    };
    const onDisconnect = () => setConnectionStatus('disconnected');
    const onSnapshot = (snapshot: { version: number; state: GameState; lastSequence: number; events: readonly GameEventRecord[] }) => {
      if (cancelled) return;
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

  useEffect(() => {
    if (takeover.status === 'expired') requestTakeover();
  }, [takeover.status, requestTakeover]);

  // ── Event send / durable-queue flush ────────────────────────────────────────
  const sendQueuedItem = useCallback(
    (item: QueuedGameEvent) => {
      if (!gameId || !isTakeoverHeld(takeover) || !canAppendWhileSyncing(sync)) return;
      if (Date.now() >= takeover.expiresAtMs) return; // CHECK_EXPIRY's poll will flip status to 'expired' shortly; do not send meanwhile.
      const socket = getV1GameOperationsSocket();
      dispatchQueue({ type: 'MARK_SENDING', clientEventId: item.clientEventId });
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
        (result: { status: string; sequence?: number; version?: number; code?: string }) => {
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
        },
      );
    },
    [gameId, takeover, sync, queryClient],
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

  const retryFailedEvent = useCallback((clientEventId: string) => {
    dispatchQueue({ type: 'RETRY', clientEventId });
  }, []);

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
    },
    [gameId, gameSnapshot, takeover, queryClient],
  );

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
    default:
      return '이벤트를 기록하지 못했어요. 다시 시도해주세요.';
  }
}
