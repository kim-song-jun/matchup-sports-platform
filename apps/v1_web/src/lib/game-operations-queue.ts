/**
 * Task 21 — durable local event queue + takeover-token + sync-gap reducers
 * for the resilient live operations console.
 *
 * Every reducer here is a pure function of `(state, action) -> state`, with
 * no socket/timer/storage access — this is deliberate so the acceptance
 * criterion's exact scenarios (reload, duplicate ack, gap, revoke,
 * expiry/reacquire, end validation) can be asserted directly in Vitest
 * without mocking a socket or a DOM. `apps/v1_web/src/hooks/
 * use-v1-game-operations-console.ts` is the only caller that wires these to
 * real I/O.
 *
 * D-10 (frozen decision table): "Only `append_event` commands may enter the
 * offline queue; start/pause/resume/end/officialize require online server
 * acknowledgement." `assertQueueable()`/`canEnterOfflineQueue()` enforce this
 * on the CLIENT as a fail-fast guard — the server enforces it authoritatively
 * (`409 ONLINE_ACK_REQUIRED`), this is a UI-side belt so an operator can never
 * even construct a queued start/pause/resume/end/officialize command.
 */

// ── Offline-queueable command guard (D-10) ──────────────────────────────────

export type GameOperationsCommandKind =
  | 'append_event'
  | 'start'
  | 'pause'
  | 'resume'
  | 'end'
  | 'officialize'
  | 'cancel'
  | 'lineup_submit'
  | 'result_recovery_derive_and_submit';

const OFFLINE_QUEUEABLE_KIND: GameOperationsCommandKind = 'append_event';

export class GameOperationsQueueError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GameOperationsQueueError';
    this.code = code;
  }
}

export function canEnterOfflineQueue(kind: GameOperationsCommandKind): boolean {
  return kind === OFFLINE_QUEUEABLE_KIND;
}

/** Throws `GameOperationsQueueError('ONLINE_ACK_REQUIRED', ...)` for every
 * command kind except `append_event` — start/end/officialize (and every
 * other exclusive command) must never be queued; a caller must send them
 * online and surface the failure immediately if there is no connection. */
export function assertQueueable(kind: GameOperationsCommandKind): void {
  if (!canEnterOfflineQueue(kind)) {
    throw new GameOperationsQueueError(
      'ONLINE_ACK_REQUIRED',
      `"${kind}" requires an online server acknowledgement and can never enter the offline queue`,
    );
  }
}

// ── Durable local event queue ────────────────────────────────────────────────

export type QueuedEventStatus = 'queued' | 'sending' | 'acked' | 'failed';

export interface QueuedGameEventInput {
  readonly type: string;
  readonly sideId?: string;
  readonly participantId?: string;
  readonly assistParticipantId?: string | null;
  readonly period: number;
  readonly clockMs: number;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
}

export interface QueuedGameEvent {
  readonly clientEventId: string;
  readonly gameId: string;
  readonly expectedVersion: number;
  readonly event: QueuedGameEventInput;
  readonly payloadHash: string;
  readonly status: QueuedEventStatus;
  readonly queuedAt: string;
  readonly attempts: number;
  readonly lastError: { readonly code: string; readonly message: string } | null;
  readonly ackedSequence: number | null;
  readonly ackedVersion: number | null;
}

export interface GameOperationsQueueState {
  readonly items: readonly QueuedGameEvent[];
}

export const EMPTY_QUEUE_STATE: GameOperationsQueueState = { items: [] };

export type GameOperationsQueueAction =
  | { readonly type: 'HYDRATE'; readonly items: readonly QueuedGameEvent[] }
  | { readonly type: 'ENQUEUE'; readonly item: QueuedGameEvent }
  | { readonly type: 'MARK_SENDING'; readonly clientEventId: string }
  | {
      readonly type: 'ACK';
      readonly clientEventId: string;
      readonly sequence: number;
      readonly version: number;
    }
  | {
      readonly type: 'FAIL';
      readonly clientEventId: string;
      readonly error: { readonly code: string; readonly message: string };
    }
  | {
      readonly type: 'RETRY';
      readonly clientEventId: string;
      /** alpha 실사고(2026-08) 구제 경로 — 이 픽스 이전에 캡처된 항목은
       * `event.clockMs`가 소수(`.5` 등)일 수 있고, 그대로 재전송하면 서버
       * `parseGameEvent`(`Number.isSafeInteger` 요구)에 매번 똑같이 막힌다
       * (재시도가 무의미한 무한 루프). 호출자(`use-v1-game-operations-console.
       * ts`)가 정수로 보정한 event와 그에 맞춰 다시 계산한 payloadHash를 함께
       * 주면, 재시도가 'queued'로 돌아갈 때 이 값으로 교체한다 — 서버는
       * `payloadHash`를 event 내용으로 재계산해 대조하므로(`retryEvent`의
       * `OFFLINE_EVENT_REBASE_CONFLICT`) 둘을 반드시 짝지어 바꿔야 한다.
       * 이벤트 시각(occurredAt)은 절대 바꾸지 않는다 — clockMs만 1ms 미만
       * 반올림한다. */
      readonly repairedEvent?: {
        readonly event: QueuedGameEventInput;
        readonly payloadHash: string;
      };
    };

function mapItem(
  state: GameOperationsQueueState,
  clientEventId: string,
  update: (item: QueuedGameEvent) => QueuedGameEvent,
): GameOperationsQueueState {
  let changed = false;
  const items = state.items.map((item) => {
    if (item.clientEventId !== clientEventId) return item;
    const next = update(item);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? { items } : state;
}

export function gameOperationsQueueReducer(
  state: GameOperationsQueueState,
  action: GameOperationsQueueAction,
): GameOperationsQueueState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.items };

    case 'ENQUEUE': {
      // Idempotent by clientEventId — the same durable dedupe key the
      // server itself keys `V1IdempotencyRecord`/`V1GameEvent` on. Enqueuing
      // an already-known event (queued, sending, acked, or failed) is a
      // no-op rather than a duplicate row, so a double-tap or a re-mounted
      // component can never fork one logical event into two queue entries.
      if (state.items.some((item) => item.clientEventId === action.item.clientEventId)) {
        return state;
      }
      return { items: [...state.items, action.item] };
    }

    case 'MARK_SENDING':
      return mapItem(state, action.clientEventId, (item) =>
        // An already-acked item can never regress to "sending".
        item.status === 'acked' ? item : { ...item, status: 'sending' },
      );

    case 'ACK':
      return mapItem(state, action.clientEventId, (item) =>
        // Duplicate ack: the first ack already committed this item — a
        // second `game.event.ack`/REST replay for the same clientEventId
        // (e.g. a retried socket emit whose first response was merely slow,
        // not lost) is a no-op, never a second state transition.
        item.status === 'acked'
          ? item
          : {
              ...item,
              status: 'acked',
              ackedSequence: action.sequence,
              ackedVersion: action.version,
              lastError: null,
            },
      );

    case 'FAIL':
      return mapItem(state, action.clientEventId, (item) =>
        // An ack that already landed can never be overwritten by a
        // late/out-of-order failure response for the same id.
        item.status === 'acked' ? item : { ...item, status: 'failed', lastError: action.error },
      );

    case 'RETRY':
      return mapItem(state, action.clientEventId, (item) =>
        item.status === 'failed'
          ? {
              ...item,
              ...(action.repairedEvent
                ? { event: action.repairedEvent.event, payloadHash: action.repairedEvent.payloadHash }
                : {}),
              status: 'queued',
              attempts: item.attempts + 1,
              lastError: null,
            }
          : item,
      );

    default:
      return state;
  }
}

/** FIFO — the oldest still-`queued` item, so a flush loop always sends in
 * original capture order (never reorders a match's event timeline). */
export function nextQueuedItem(state: GameOperationsQueueState): QueuedGameEvent | null {
  return state.items.find((item) => item.status === 'queued') ?? null;
}

export function hasPendingWork(state: GameOperationsQueueState): boolean {
  return state.items.some((item) => item.status === 'queued' || item.status === 'sending');
}

export function failedItems(state: GameOperationsQueueState): readonly QueuedGameEvent[] {
  return state.items.filter((item) => item.status === 'failed');
}

// ── Reload durability (localStorage hydrate) ────────────────────────────────

const QUEUE_STORAGE_VERSION = 1;

interface StoredQueuePayload {
  readonly v: number;
  readonly items: readonly QueuedGameEvent[];
}

function isQueuedGameEvent(value: unknown): value is QueuedGameEvent {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.clientEventId === 'string' &&
    typeof candidate.gameId === 'string' &&
    typeof candidate.expectedVersion === 'number' &&
    typeof candidate.payloadHash === 'string' &&
    (candidate.status === 'queued' ||
      candidate.status === 'sending' ||
      candidate.status === 'acked' ||
      candidate.status === 'failed') &&
    typeof candidate.queuedAt === 'string' &&
    typeof candidate.attempts === 'number' &&
    candidate.event !== null &&
    typeof candidate.event === 'object'
  );
}

export function serializeQueueState(state: GameOperationsQueueState): string {
  const payload: StoredQueuePayload = { v: QUEUE_STORAGE_VERSION, items: state.items };
  return JSON.stringify(payload);
}

/** Parses a previously-serialized queue. Any malformed/foreign/version-
 * mismatched payload degrades to an empty queue rather than throwing — a
 * corrupt localStorage entry must never crash the console on mount. */
export function deserializeQueueState(raw: string | null): GameOperationsQueueState {
  if (raw === null) return EMPTY_QUEUE_STATE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_QUEUE_STATE;
  }
  if (parsed === null || typeof parsed !== 'object') return EMPTY_QUEUE_STATE;
  const candidate = parsed as Partial<StoredQueuePayload>;
  if (candidate.v !== QUEUE_STORAGE_VERSION || !Array.isArray(candidate.items)) {
    return EMPTY_QUEUE_STATE;
  }
  return { items: candidate.items.filter(isQueuedGameEvent) };
}

/**
 * Reload scenario: a page reload can never observe whether a `sending`
 * request actually reached the server before the tab closed. Because every
 * append is idempotent server-side by `clientEventId` (same id + same
 * payload replays the original ack — see `GamesService.appendEvent`/
 * `retryEvent`), it is always SAFE to re-attempt a `sending` item as
 * `queued` again after reload: either it never reached the server (now
 * sent for the first time) or it already committed (the server replays the
 * stored ack instead of creating a duplicate). `queued`/`failed`/`acked`
 * items are left exactly as they were.
 *
 * `acked` 항목은 **이 픽스 이후로는 새로 저장되지 않는다** — `persistQueue`
 * (`use-v1-game-operations-console.ts`)가 저장 직전에 걸러낸다(그 함수의 주석 참고).
 * 그래도 여기와 `isQueuedGameEvent`가 `acked`를 계속 받아들이는 이유는, 이 픽스
 * **이전에** 저장된 로컬스토리지 항목에는 acked가 들어 있기 때문이다 — 그걸
 * 무효 취급하면 같은 키의 미전송 항목까지 통째로 버려진다.
 */
export function hydrateAfterReload(items: readonly QueuedGameEvent[]): GameOperationsQueueState {
  return {
    items: items.map((item) => (item.status === 'sending' ? { ...item, status: 'queued' } : item)),
  };
}

// ── Takeover token lifecycle (grant / expiry / reacquire / revoke) ──────────

export type TakeoverState =
  | { readonly status: 'none' }
  | { readonly status: 'requesting' }
  | {
      readonly status: 'held';
      readonly token: string;
      readonly expiresAtMs: number;
      readonly assignmentVersion: number;
    }
  | { readonly status: 'expired' }
  | { readonly status: 'revoked'; readonly assignmentVersion: number }
  | { readonly status: 'denied'; readonly code: string };

export const INITIAL_TAKEOVER_STATE: TakeoverState = { status: 'none' };

export type TakeoverAction =
  | { readonly type: 'REQUEST' }
  | {
      readonly type: 'GRANTED';
      readonly token: string;
      readonly expiresAtMs: number;
      readonly assignmentVersion: number;
    }
  | { readonly type: 'DENIED'; readonly code: string }
  | { readonly type: 'CHECK_EXPIRY'; readonly nowMs: number }
  | { readonly type: 'REVOKED'; readonly assignmentVersion: number }
  | { readonly type: 'RESET' };

export function takeoverReducer(state: TakeoverState, action: TakeoverAction): TakeoverState {
  switch (action.type) {
    case 'REQUEST':
      return { status: 'requesting' };
    case 'GRANTED':
      return {
        status: 'held',
        token: action.token,
        expiresAtMs: action.expiresAtMs,
        assignmentVersion: action.assignmentVersion,
      };
    case 'DENIED':
      return { status: 'denied', code: action.code };
    case 'CHECK_EXPIRY':
      // A held grant past its own expiresAtMs transitions to `expired`
      // exactly once (idempotent — re-checking an already-expired/other
      // state is a no-op) so the console can surface "재획득이 필요해요" and
      // block further sends until a fresh `game.takeover.request` succeeds.
      if (state.status === 'held' && action.nowMs >= state.expiresAtMs) {
        return { status: 'expired' };
      }
      return state;
    case 'REVOKED':
      // A revoke can supersede ANY state (even mid-request) — another
      // operator/platform_ops action always wins immediately.
      return { status: 'revoked', assignmentVersion: action.assignmentVersion };
    case 'RESET':
      return { status: 'none' };
    default:
      return state;
  }
}

export function isTakeoverHeld(
  state: TakeoverState,
): state is Extract<TakeoverState, { status: 'held' }> {
  return state.status === 'held';
}

export function canSendExclusiveCommand(state: TakeoverState, nowMs: number): boolean {
  return state.status === 'held' && nowMs < state.expiresAtMs;
}

// ── Backfill / gap synchronization state ────────────────────────────────────

export type GameSyncState =
  | { readonly status: 'synced'; readonly lastSequence: number }
  | {
      readonly status: 'gap';
      readonly lastSequence: number;
      readonly expectedSequence: number;
      readonly availableFrom: number;
    };

export const INITIAL_SYNC_STATE: GameSyncState = { status: 'synced', lastSequence: 0 };

export type GameSyncAction =
  | { readonly type: 'SNAPSHOT'; readonly lastSequence: number }
  | { readonly type: 'GAP'; readonly expectedSequence: number; readonly availableFrom: number }
  | { readonly type: 'BACKFILLED'; readonly lastSequence: number }
  /**
   * 이 기기가 보낸 이벤트의 ack — "내 이벤트가 시퀀스 N으로 확정됐다"는 사실만
   * 알려줄 뿐 **빠진 구간의 이벤트 본문은 하나도 실어 오지 않는다**. 그래서
   * `BACKFILLED`와 구분한다: 예전에는 ack 경로도 `BACKFILLED`를 디스패치했는데,
   * 그 리듀서는 상태와 무관하게 `synced`를 돌려주므로 **백필 없이 갭 프리즈가
   * 풀렸다**(전송 in-flight 중에 다른 운영자의 비연속 브로드캐스트가 도착해 GAP이
   * 걸리고, 곧이어 내 ack이 도착하면 그 자리에서 해제된다). 그 상태로 교체를
   * 기록하면 불완전한 피치 상태 위에서 나가 서버가
   * `SUBSTITUTION_OUT_NOT_ON_PITCH`로 거부하는데 그 코드는 NON_RETRYABLE이다.
   */
  | { readonly type: 'SELF_ACK'; readonly lastSequence: number };

export function gameSyncReducer(state: GameSyncState, action: GameSyncAction): GameSyncState {
  switch (action.type) {
    case 'SNAPSHOT':
      // 갭이 난 상태에서는 SNAPSHOT을 무시한다. SNAPSHOT은 REST로 읽어온
      // `lastSequence` 숫자를 반영하는 통로일 뿐(콘솔의 `initialLastSequence`
      // effect) 빠진 이벤트를 실제로 채워 오지 않는데, 예전에는 무조건
      // `{ status: 'synced' }`를 돌려줘 아래 GAP 주석이 못박은 계약("불완전한
      // 타임라인 위에 새 이벤트를 절대 커밋시키지 않는다")을 무단으로 풀었다 —
      // `providers.tsx`의 `refetchOnWindowFocus: true` 때문에 갭이 난 채로 창을
      // 한 번 갔다 오기만 해도 전송 게이트가 열렸다. 갭을 푸는 유일한 경로는
      // 실제 백필(`BACKFILLED`)이다.
      if (state.status === 'gap') return state;
      return { status: 'synced', lastSequence: action.lastSequence };
    case 'GAP':
      // A gap freezes further sends (`canAppendWhileSyncing` below) until an
      // explicit backfill resolves it — the console must never let an
      // operator commit a new event on top of a known-incomplete timeline.
      return {
        status: 'gap',
        lastSequence: state.lastSequence,
        expectedSequence: action.expectedSequence,
        availableFrom: action.availableFrom,
      };
    case 'BACKFILLED':
      // 실제로 이벤트 본문을 손에 넣은 경우에만 디스패치된다(전체 스냅숏 적용,
      // 연속 브로드캐스트 append). 갭을 푸는 유일한 경로다.
      return { status: 'synced', lastSequence: action.lastSequence };
    case 'SELF_ACK':
      // 위 액션 주석 참고 — 갭이 난 상태를 풀 자격이 없다(빠진 구간을 하나도
      // 채우지 않았다). 동기 상태에서만 lastSequence를 전진시킨다.
      if (state.status === 'gap') return state;
      return { status: 'synced', lastSequence: action.lastSequence };
    default:
      return state;
  }
}

export function canAppendWhileSyncing(state: GameSyncState): boolean {
  return state.status === 'synced';
}
