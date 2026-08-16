import { describe, expect, it } from 'vitest';
import {
  assertQueueable,
  canAppendWhileSyncing,
  canEnterOfflineQueue,
  canSendExclusiveCommand,
  deserializeQueueState,
  EMPTY_QUEUE_STATE,
  failedItems,
  gameOperationsQueueReducer,
  GameOperationsQueueError,
  gameSyncReducer,
  hasPendingWork,
  hydrateAfterReload,
  INITIAL_SYNC_STATE,
  INITIAL_TAKEOVER_STATE,
  isTakeoverHeld,
  nextQueuedItem,
  serializeQueueState,
  takeoverReducer,
  type GameOperationsQueueState,
  type QueuedGameEvent,
} from './game-operations-queue';

function queuedEvent(overrides: Partial<QueuedGameEvent> = {}): QueuedGameEvent {
  return {
    clientEventId: 'client-event-1',
    gameId: 'game-1',
    expectedVersion: 5,
    event: {
      type: 'GOAL',
      sideId: 'side-home',
      participantId: 'participant-7',
      period: 1,
      clockMs: 120000,
      occurredAt: '2026-08-03T12:00:00.000Z',
      payload: {},
    },
    payloadHash: 'hash-1',
    status: 'queued',
    queuedAt: '2026-08-03T12:00:00.000Z',
    attempts: 0,
    lastError: null,
    ackedSequence: null,
    ackedVersion: null,
    ...overrides,
  };
}

describe('end validation (D-10: only append_event may enter the offline queue)', () => {
  it('accepts only append_event', () => {
    expect(canEnterOfflineQueue('append_event')).toBe(true);
    expect(canEnterOfflineQueue('start')).toBe(false);
    expect(canEnterOfflineQueue('pause')).toBe(false);
    expect(canEnterOfflineQueue('resume')).toBe(false);
    expect(canEnterOfflineQueue('end')).toBe(false);
    expect(canEnterOfflineQueue('officialize')).toBe(false);
    expect(canEnterOfflineQueue('cancel')).toBe(false);
    expect(canEnterOfflineQueue('lineup_submit')).toBe(false);
  });

  it('assertQueueable is a no-op for append_event', () => {
    expect(() => assertQueueable('append_event')).not.toThrow();
  });

  it.each(['start', 'pause', 'resume', 'end', 'officialize', 'cancel', 'lineup_submit'] as const)(
    'assertQueueable rejects %s with ONLINE_ACK_REQUIRED so it can never be queued',
    (kind) => {
      try {
        assertQueueable(kind);
        expect.unreachable('assertQueueable must throw for a non-append_event command');
      } catch (error) {
        expect(error).toBeInstanceOf(GameOperationsQueueError);
        expect((error as GameOperationsQueueError).code).toBe('ONLINE_ACK_REQUIRED');
      }
    },
  );
});

describe('reload (queue durability across a page reload)', () => {
  it('round-trips a queue through serialize/deserialize', () => {
    const state: GameOperationsQueueState = { items: [queuedEvent()] };
    const restored = deserializeQueueState(serializeQueueState(state));
    expect(restored).toEqual(state);
  });

  it('degrades to an empty queue for malformed/foreign/absent storage instead of throwing', () => {
    expect(deserializeQueueState(null)).toEqual(EMPTY_QUEUE_STATE);
    expect(deserializeQueueState('not json')).toEqual(EMPTY_QUEUE_STATE);
    expect(deserializeQueueState(JSON.stringify({ v: 999, items: [] }))).toEqual(EMPTY_QUEUE_STATE);
    expect(deserializeQueueState(JSON.stringify({ v: 1, items: 'not-an-array' }))).toEqual(
      EMPTY_QUEUE_STATE,
    );
  });

  it('rebases an in-flight ("sending") item back to "queued" on reload, since the append is idempotent server-side', () => {
    const sendingItem = queuedEvent({ status: 'sending' });
    const failedItem = queuedEvent({ clientEventId: 'client-event-2', status: 'failed' });
    const ackedItem = queuedEvent({
      clientEventId: 'client-event-3',
      status: 'acked',
      ackedSequence: 10,
      ackedVersion: 11,
    });

    const rehydrated = hydrateAfterReload([sendingItem, failedItem, ackedItem]);

    expect(rehydrated.items).toEqual([
      { ...sendingItem, status: 'queued' },
      failedItem,
      ackedItem,
    ]);
  });

  it('reload scenario end-to-end: three queued events survive a simulated reload in original order', () => {
    let state: GameOperationsQueueState = EMPTY_QUEUE_STATE;
    const events = [
      queuedEvent({ clientEventId: 'a' }),
      queuedEvent({ clientEventId: 'b' }),
      queuedEvent({ clientEventId: 'c' }),
    ];
    for (const item of events) {
      state = gameOperationsQueueReducer(state, { type: 'ENQUEUE', item });
    }
    // Simulate the device going offline mid-flush: the first item is
    // in-flight ("sending") when the reload happens.
    state = gameOperationsQueueReducer(state, { type: 'MARK_SENDING', clientEventId: 'a' });

    const serialized = serializeQueueState(state);
    const afterReload = hydrateAfterReload(deserializeQueueState(serialized).items);

    expect(afterReload.items.map((item) => [item.clientEventId, item.status])).toEqual([
      ['a', 'queued'],
      ['b', 'queued'],
      ['c', 'queued'],
    ]);
    expect(nextQueuedItem(afterReload)?.clientEventId).toBe('a');
  });
});

describe('duplicate ack', () => {
  it('the first ack commits the item; a duplicate ack for the same clientEventId is a no-op', () => {
    const state: GameOperationsQueueState = {
      items: [queuedEvent({ status: 'sending' })],
    };

    const firstAck = gameOperationsQueueReducer(state, {
      type: 'ACK',
      clientEventId: 'client-event-1',
      sequence: 42,
      version: 6,
    });
    expect(firstAck.items[0]).toMatchObject({ status: 'acked', ackedSequence: 42, ackedVersion: 6 });

    const secondAck = gameOperationsQueueReducer(firstAck, {
      type: 'ACK',
      clientEventId: 'client-event-1',
      sequence: 999, // a stale/replayed ack must never overwrite the first with different numbers
      version: 999,
    });

    expect(secondAck).toBe(firstAck); // reference-stable: reducer recognized the no-op and did not rebuild state
    expect(secondAck.items[0]).toMatchObject({ status: 'acked', ackedSequence: 42, ackedVersion: 6 });
  });

  it('enqueuing the same clientEventId twice never creates a duplicate queue row', () => {
    const item = queuedEvent();
    const once = gameOperationsQueueReducer(EMPTY_QUEUE_STATE, { type: 'ENQUEUE', item });
    const twice = gameOperationsQueueReducer(once, { type: 'ENQUEUE', item: { ...item, expectedVersion: 999 } });

    expect(twice.items).toHaveLength(1);
    expect(twice.items[0].expectedVersion).toBe(5); // the ORIGINAL queued item, not the duplicate attempt
  });

  it('a late failure can never overwrite an item that already acked', () => {
    const acked = gameOperationsQueueReducer(
      { items: [queuedEvent({ status: 'sending' })] },
      { type: 'ACK', clientEventId: 'client-event-1', sequence: 1, version: 1 },
    );

    const afterLateFailure = gameOperationsQueueReducer(acked, {
      type: 'FAIL',
      clientEventId: 'client-event-1',
      error: { code: 'INTERNAL_ERROR', message: 'late/out-of-order failure' },
    });

    expect(afterLateFailure).toBe(acked);
    expect(afterLateFailure.items[0].status).toBe('acked');
  });
});

describe('gap (backfill required before further sends)', () => {
  it('a GAP transitions sync state to blocked and BACKFILLED resolves it', () => {
    const synced = gameSyncReducer(INITIAL_SYNC_STATE, { type: 'SNAPSHOT', lastSequence: 10 });
    expect(canAppendWhileSyncing(synced)).toBe(true);

    const gapped = gameSyncReducer(synced, {
      type: 'GAP',
      expectedSequence: 11,
      availableFrom: 14,
    });
    expect(gapped).toEqual({
      status: 'gap',
      lastSequence: 10,
      expectedSequence: 11,
      availableFrom: 14,
    });
    expect(canAppendWhileSyncing(gapped)).toBe(false);

    const resynced = gameSyncReducer(gapped, { type: 'BACKFILLED', lastSequence: 14 });
    expect(resynced).toEqual({ status: 'synced', lastSequence: 14 });
    expect(canAppendWhileSyncing(resynced)).toBe(true);
  });

  /**
   * `GAP` 케이스의 주석은 "불완전한 타임라인 위에 새 이벤트를 절대 커밋시키지
   * 않는다"고 못박고 있는데, `SNAPSHOT`은 무조건 `{ status: 'synced' }`를 돌려줘
   * 그 프리즈를 **무단으로 해제**한다. 콘솔은 REST `initialLastSequence`가 바뀔
   * 때마다(`providers.tsx`의 `refetchOnWindowFocus: true` → 창 포커스 복귀마다)
   * SNAPSHOT을 디스패치하므로, 갭이 난 채로 창을 한 번 갔다 오기만 하면 백필이
   * 끝나지 않았는데도 전송 게이트가 풀린다. 갭을 푸는 것은 실제 백필
   * (`BACKFILLED`)뿐이어야 한다.
   */
  it('gap 상태에서 SNAPSHOT을 받아도 백필 전까지는 gap이 유지된다', () => {
    const gapped = gameSyncReducer(
      { status: 'synced', lastSequence: 10 },
      { type: 'GAP', expectedSequence: 11, availableFrom: 14 },
    );
    expect(canAppendWhileSyncing(gapped)).toBe(false);

    const afterSnapshot = gameSyncReducer(gapped, { type: 'SNAPSHOT', lastSequence: 10 });

    expect(afterSnapshot.status).toBe('gap');
    expect(canAppendWhileSyncing(afterSnapshot)).toBe(false);

    // 갭을 푸는 유일한 경로는 여전히 실제 백필이다.
    const resynced = gameSyncReducer(afterSnapshot, { type: 'BACKFILLED', lastSequence: 14 });
    expect(canAppendWhileSyncing(resynced)).toBe(true);
  });

  /**
   * SNAPSHOT과 **같은 구멍**이 전송 ack 경로에도 있었다. 콘솔은 자기 이벤트의
   * ack에서 `BACKFILLED`를 디스패치했는데, 그 액션은 상태와 무관하게 `synced`를
   * 돌려준다 — 즉 전송이 in-flight인 사이 다른 운영자의 비연속 브로드캐스트로
   * GAP이 걸려도 내 ack 하나가 도착하면 **빠진 구간을 한 건도 받아오지 않은 채**
   * 게이트가 열렸다. 그 창에서 교체를 기록하면 불완전한 피치 상태 위에서 나가
   * 서버가 `SUBSTITUTION_OUT_NOT_ON_PITCH`로 거부하고, 그 코드는 NON_RETRYABLE이라
   * '다시 시도' 버튼조차 뜨지 않는다.
   */
  it('gap 상태에서 내 이벤트의 ack(SELF_ACK)은 프리즈를 풀지 못한다', () => {
    const gapped = gameSyncReducer(
      { status: 'synced', lastSequence: 10 },
      { type: 'GAP', expectedSequence: 11, availableFrom: 14 },
    );

    const afterSelfAck = gameSyncReducer(gapped, { type: 'SELF_ACK', lastSequence: 15 });

    expect(afterSelfAck).toEqual(gapped);
    expect(canAppendWhileSyncing(afterSelfAck)).toBe(false);

    // 동기 상태에서는 종전대로 lastSequence를 전진시킨다(정상 경로 회귀 방지).
    const synced = gameSyncReducer({ status: 'synced', lastSequence: 10 }, { type: 'SELF_ACK', lastSequence: 11 });
    expect(synced).toEqual({ status: 'synced', lastSequence: 11 });
  });
});

describe('revoke (permission revoked mid-session)', () => {
  it('REVOKED supersedes a held grant and blocks exclusive commands immediately', () => {
    const held = takeoverReducer(INITIAL_TAKEOVER_STATE, {
      type: 'GRANTED',
      token: 'token-1',
      expiresAtMs: 1_000_000,
      assignmentVersion: 3,
    });
    expect(isTakeoverHeld(held)).toBe(true);
    expect(canSendExclusiveCommand(held, 500_000)).toBe(true);

    const revoked = takeoverReducer(held, { type: 'REVOKED', assignmentVersion: 4 });

    expect(revoked).toEqual({ status: 'revoked', assignmentVersion: 4 });
    expect(canSendExclusiveCommand(revoked, 500_000)).toBe(false);
  });

  it('REVOKED can supersede a mid-flight request, not only an already-held grant', () => {
    const requesting = takeoverReducer(INITIAL_TAKEOVER_STATE, { type: 'REQUEST' });
    const revoked = takeoverReducer(requesting, { type: 'REVOKED', assignmentVersion: 1 });
    expect(revoked).toEqual({ status: 'revoked', assignmentVersion: 1 });
  });
});

describe('expiry/reacquire (takeover token lifecycle)', () => {
  it('a held token past its own expiresAtMs transitions to expired exactly once', () => {
    const held = takeoverReducer(INITIAL_TAKEOVER_STATE, {
      type: 'GRANTED',
      token: 'token-1',
      expiresAtMs: 1_000,
      assignmentVersion: 1,
    });

    const stillHeld = takeoverReducer(held, { type: 'CHECK_EXPIRY', nowMs: 500 });
    expect(stillHeld).toBe(held);
    expect(canSendExclusiveCommand(stillHeld, 500)).toBe(true);

    const expired = takeoverReducer(held, { type: 'CHECK_EXPIRY', nowMs: 1_500 });
    expect(expired).toEqual({ status: 'expired' });
    expect(canSendExclusiveCommand(expired, 1_500)).toBe(false);

    // Re-checking an already-expired state is a no-op, not a re-transition.
    const stillExpired = takeoverReducer(expired, { type: 'CHECK_EXPIRY', nowMs: 2_000 });
    expect(stillExpired).toBe(expired);
  });

  it('reacquiring after expiry issues a fresh REQUEST -> GRANTED cycle', () => {
    const expired: ReturnType<typeof takeoverReducer> = { status: 'expired' };
    const requesting = takeoverReducer(expired, { type: 'REQUEST' });
    expect(requesting).toEqual({ status: 'requesting' });

    const reacquired = takeoverReducer(requesting, {
      type: 'GRANTED',
      token: 'token-2',
      expiresAtMs: 5_000,
      assignmentVersion: 2,
    });
    expect(isTakeoverHeld(reacquired)).toBe(true);
    expect(canSendExclusiveCommand(reacquired, 4_000)).toBe(true);
  });

  it('a denied reacquire attempt surfaces the server code instead of silently retrying forever', () => {
    const requesting = takeoverReducer(INITIAL_TAKEOVER_STATE, { type: 'REQUEST' });
    const denied = takeoverReducer(requesting, { type: 'DENIED', code: 'STAFF_SCOPE_DENIED' });
    expect(denied).toEqual({ status: 'denied', code: 'STAFF_SCOPE_DENIED' });
  });
});

describe('queue introspection helpers', () => {
  it('nextQueuedItem returns the oldest queued item (FIFO), skipping sending/acked/failed', () => {
    const state: GameOperationsQueueState = {
      items: [
        queuedEvent({ clientEventId: 'a', status: 'acked' }),
        queuedEvent({ clientEventId: 'b', status: 'queued' }),
        queuedEvent({ clientEventId: 'c', status: 'queued' }),
      ],
    };
    expect(nextQueuedItem(state)?.clientEventId).toBe('b');
  });

  it('hasPendingWork is true while anything is queued or sending, false once settled', () => {
    expect(hasPendingWork({ items: [queuedEvent({ status: 'queued' })] })).toBe(true);
    expect(hasPendingWork({ items: [queuedEvent({ status: 'sending' })] })).toBe(true);
    expect(hasPendingWork({ items: [queuedEvent({ status: 'acked' })] })).toBe(false);
    expect(hasPendingWork({ items: [queuedEvent({ status: 'failed' })] })).toBe(false);
  });

  it('a failed item remains visible (never silently dropped) and RETRY re-queues it', () => {
    const failed = queuedEvent({ status: 'failed', lastError: { code: 'INTERNAL_ERROR', message: 'x' } });
    const state: GameOperationsQueueState = { items: [failed] };

    expect(failedItems(state)).toEqual([failed]);

    const retried = gameOperationsQueueReducer(state, {
      type: 'RETRY',
      clientEventId: failed.clientEventId,
    });
    expect(retried.items[0]).toMatchObject({ status: 'queued', attempts: 1, lastError: null });
  });

  // alpha 실사고(2026-08) 구제 경로: 이 픽스 이전에 캡처된 항목은 소수
  // clockMs를 가질 수 있어 그대로 재시도하면 서버가 매번 같은 이유로 다시
  // 거부한다(무의미한 재시도 루프). RETRY가 `repairedEvent`를 받으면 큐에
  // 저장된 event/payloadHash 자체를 그걸로 교체해야 한다 — 그래야 다음
  // 전송이 보정된 값을 쓴다.
  it('RETRY에 repairedEvent가 실리면 큐 항목의 event/payloadHash를 그것으로 교체한다', () => {
    const failed = queuedEvent({
      status: 'failed',
      lastError: { code: 'VALIDATION_ERROR', message: 'x' },
      event: { type: 'CARD', sideId: 'side-home', participantId: 'p-1', period: 2, clockMs: 60_000.5, occurredAt: '2026-08-09T00:00:00.000Z', payload: { card: 'YELLOW' } },
      payloadHash: 'hash-with-fractional-clock',
    });
    const state: GameOperationsQueueState = { items: [failed] };

    const repairedEvent = { ...failed.event, clockMs: 60_000 };
    const retried = gameOperationsQueueReducer(state, {
      type: 'RETRY',
      clientEventId: failed.clientEventId,
      repairedEvent: { event: repairedEvent, payloadHash: 'hash-with-integer-clock' },
    });

    expect(retried.items[0]).toMatchObject({
      status: 'queued',
      attempts: 1,
      lastError: null,
      event: repairedEvent,
      payloadHash: 'hash-with-integer-clock',
    });
  });
});
