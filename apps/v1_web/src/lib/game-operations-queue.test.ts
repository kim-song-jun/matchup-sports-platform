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
});
