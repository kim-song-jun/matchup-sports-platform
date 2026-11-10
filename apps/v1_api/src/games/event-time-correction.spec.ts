import { HttpException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { appendEventTimeCorrection, syncRevisionEventTimes } from './event-time-correction';
import { gameAuthorizationAction } from './games.service';

type Row = Record<string, unknown>;

const GAME = 'game-1';
const baseEvent = {
  id: 'card-1', gameId: GAME, sequence: 3, clientEventId: 'c', payloadHash: 'h', type: 'CARD',
  sideId: 'side-home', participantId: 'p-1', assistParticipantId: null, period: 1, clockMs: 11 * 60_000,
  occurredAt: new Date(), receivedAt: new Date(), actorUserId: 'u', reversesEventId: null, correctsEventId: null,
  payload: { card: 'YELLOW' },
};

function harness(options: {
  target?: Row | null;
  related?: Row[];
  periods?: unknown;
  period?: Row | null;
  revisionParticipants?: Row[];
  corrections?: Row[];
} = {}) {
  const created: Row[] = [];
  const gameUpdates: Row[] = [];
  const revisionsCreated: Row[] = [];
  const revisionUpdates: Row[] = [];
  const participantRows: Row[] = [];
  const outbox: Row[] = [];
  const executed: unknown[] = [];
  const tx = {
    v1GameEvent: {
      findFirst: async () => (options.target === undefined ? baseEvent : options.target),
      findMany: async (args: { where: Row }) => ('type' in args.where ? options.corrections ?? [] : options.related ?? []),
      create: async (args: { data: Row }) => {
        created.push(args.data);
        return { ...args.data, id: 'correction-1', receivedAt: new Date() };
      },
    },
    v1CompetitionConfigVersion: {
      findUnique: async () => ({ periods: options.periods ?? [{ durationMinutes: 25 }, { durationMinutes: 25 }] }),
    },
    v1GamePeriod: { findFirst: async () => (options.period === undefined ? null : options.period) },
    v1Game: {
      update: async (args: Row) => {
        gameUpdates.push(args);
        return { version: 8, state: 'LIVE' };
      },
    },
    v1GameResultParticipant: {
      findMany: async () => options.revisionParticipants ?? [],
      createMany: async (args: { data: Row[] }) => {
        participantRows.push(...args.data);
        return { count: args.data.length };
      },
    },
    v1GameResultRevision: {
      findFirst: async () => ({ revision: 2 }),
      create: async (args: { data: Row }) => {
        revisionsCreated.push(args.data);
        return { id: 'rev-new', state: 'DRAFT', revision: 3, ...args.data };
      },
      update: async (args: { where: Row; data: Row }) => {
        revisionUpdates.push(args);
        return { id: 'rev-new', revision: 3, ...args.data };
      },
    },
    v1OutboxEvent: { create: async (args: { data: Row }) => outbox.push(args.data) },
    $executeRaw: async (...args: unknown[]) => {
      executed.push(args);
      return 0;
    },
  };
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    created, gameUpdates, revisionsCreated, revisionUpdates, participantRows, outbox, executed,
  };
}

const input = {
  gameId: GAME, eventId: 'card-1', clockMs: 9 * 60_000, reason: '심판 기록 대조', lane: 'OPERATOR' as const,
  clientEventId: 'cmd-1', payloadHash: 'hash-1', actorUserId: 'user-1', lastSequence: 7,
  competitionConfigVersionId: 'config-1',
};

async function failure(operation: Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const exception = error as HttpException;
    return { status: exception.getStatus(), code: (exception.getResponse() as { code: string }).code };
  }
  throw new Error('expected failure');
}

describe('appendEventTimeCorrection (MD-QA #187)', () => {
  it('appends an append-only TIME_CORRECTION row pointing at the original and bumps sequence/version', async () => {
    const h = harness();
    const result = await appendEventTimeCorrection(h.tx, input);
    expect(h.created).toHaveLength(1);
    expect(h.created[0]).toMatchObject({
      gameId: GAME, sequence: 8, type: 'TIME_CORRECTION', correctsEventId: 'card-1', period: 1,
      clockMs: 9 * 60_000, sideId: null, participantId: null, actorUserId: 'user-1', clientEventId: 'cmd-1',
      payload: { previousClockMs: 11 * 60_000, clockMs: 9 * 60_000, reason: '심판 기록 대조', lane: 'OPERATOR' },
    });
    expect(h.gameUpdates[0]).toMatchObject({ data: { lastSequence: 8, version: { increment: 1 } } });
    expect(result).toMatchObject({ previousClockMs: 11 * 60_000, sequence: 8, version: 8 });
  });

  it('uses the latest earlier correction as the previous clock', async () => {
    const h = harness({ related: [
      { id: 'x-1', type: 'TIME_CORRECTION', clockMs: 10 * 60_000, sequence: 4, correctsEventId: 'card-1', reversesEventId: null },
      { id: 'x-2', type: 'TIME_CORRECTION', clockMs: 12 * 60_000, sequence: 6, correctsEventId: 'card-1', reversesEventId: null },
    ] });
    await appendEventTimeCorrection(h.tx, input);
    expect(h.created[0]).toMatchObject({ payload: { previousClockMs: 12 * 60_000 } });
  });

  it.each([
    ['missing event', { target: null }, 404, 'GAME_EVENT_NOT_FOUND'],
    ['period marker', { target: { ...baseEvent, type: 'PERIOD_START' } }, 422, 'EVENT_TIME_NOT_CORRECTABLE'],
    ['a correction row', { target: { ...baseEvent, type: 'TIME_CORRECTION' } }, 422, 'EVENT_TIME_NOT_CORRECTABLE'],
    ['a backfilled goal without a known period', { target: { ...baseEvent, type: 'GOAL', payload: { source: 'GOAL_BACKFILL_V1' } } }, 422, 'EVENT_TIME_NOT_CORRECTABLE'],
    ['a reversed event', { related: [{ id: 'r', type: 'CORRECTION', clockMs: 0, sequence: 4, correctsEventId: null, reversesEventId: 'card-1' }] }, 409, 'EVENT_ALREADY_REVERSED'],
  ])('rejects %s', async (_label, options, status, code) => {
    const h = harness(options as Parameters<typeof harness>[0]);
    expect(await failure(appendEventTimeCorrection(h.tx, input))).toEqual({ status, code });
    expect(h.created).toHaveLength(0);
  });

  it('rejects an unchanged clock', async () => {
    const h = harness();
    expect(await failure(appendEventTimeCorrection(h.tx, { ...input, clockMs: 11 * 60_000 }))).toEqual({ status: 422, code: 'EVENT_TIME_UNCHANGED' });
  });

  it('rejects a blank reason', async () => {
    const h = harness();
    expect(await failure(appendEventTimeCorrection(h.tx, { ...input, reason: '   ' }))).toEqual({ status: 422, code: 'EVENT_TIME_REASON_REQUIRED' });
  });

  it('rejects a clock beyond the period length plus actually played stoppage time', async () => {
    const now = new Date('2026-11-10T10:00:00.000Z');
    const h = harness({ period: { startedAt: new Date('2026-11-10T09:00:00.000Z'), endedAt: new Date('2026-11-10T09:27:00.000Z'), pausedTotalMs: 0, pausedAt: null } });
    expect(await failure(appendEventTimeCorrection(h.tx, { ...input, clockMs: 27 * 60_000 + 1, now }))).toEqual({ status: 422, code: 'EVENT_CLOCK_OUT_OF_RANGE' });
    const ok = harness({ period: { startedAt: new Date('2026-11-10T09:00:00.000Z'), endedAt: new Date('2026-11-10T09:27:00.000Z'), pausedTotalMs: 0, pausedAt: null } });
    await appendEventTimeCorrection(ok.tx, { ...input, clockMs: 26 * 60_000, now });
    expect(ok.created).toHaveLength(1);
  });
});

describe('syncRevisionEventTimes (MD-QA #187)', () => {
  const revision = (state: 'SUBMITTED' | 'OFFICIAL') => ({
    id: 'rev-old', gameId: GAME, revision: 2, state, score: { home: 1, away: 0 },
    goalEvents: [{ id: 'goal-1', sideId: 'side-home', participantId: 'p-1', minute: 11, period: 1, ownGoal: false }],
    eventsHash: 'events-hash', missingScorer: false, mvpParticipantId: 'p-1', outcomeReason: 'NORMAL', outcomeNote: null,
    reason: null, createdByActorType: 'USER', createdByUserId: 'u', createdBySystemActor: null, supersedesId: null,
    submittedAt: new Date('2026-11-10T09:00:00.000Z'), officialAt: state === 'OFFICIAL' ? new Date() : null,
    createdAt: new Date(), updatedAt: new Date(),
  });
  const participant = {
    id: 'row-1', resultRevisionId: 'rev-old', participantId: 'p-1', sideId: 'side-home', started: true, minutesPlayed: null,
    goals: 1, assists: 0, fouls: 0, cards: { yellow: 1, red: 0 }, goalkeeper: false, createdAt: new Date(), updatedAt: new Date(),
  };
  const corrections = [{ id: 'c-1', type: 'TIME_CORRECTION', clockMs: 9 * 60_000, sequence: 9, correctsEventId: 'goal-1' }];

  it('does nothing when no snapshot minute changes', async () => {
    const h = harness({ revisionParticipants: [participant], corrections: [] });
    const result = await syncRevisionEventTimes(h.tx, {
      gameId: GAME, base: revision('OFFICIAL') as never, reason: 'r', createdBy: { actorType: 'USER', userId: 'admin' },
    });
    expect(result).toBeNull();
    expect(h.revisionsCreated).toHaveLength(0);
  });

  it('supersedes an OFFICIAL revision with the same score/stats and the corrected minute, moving the pointer', async () => {
    const h = harness({ revisionParticipants: [participant], corrections });
    const result = await syncRevisionEventTimes(h.tx, {
      gameId: GAME, base: revision('OFFICIAL') as never, reason: '어드민 사건 시각 정정: 대조', createdBy: { actorType: 'USER', userId: 'admin' },
    });
    expect(result).toEqual({ revisionId: 'rev-new', revision: 3, revisionState: 'OFFICIAL', supersedesRevisionId: 'rev-old' });
    expect(h.revisionsCreated[0]).toMatchObject({
      revision: 3, supersedesId: 'rev-old', score: { home: 1, away: 0 }, eventsHash: 'events-hash', mvpParticipantId: 'p-1',
      goalEvents: [{ id: 'goal-1', minute: 9 }],
    });
    expect(h.participantRows).toEqual([expect.objectContaining({ participantId: 'p-1', goals: 1, cards: { yellow: 1, red: 0 }, resultRevisionId: 'rev-new' })]);
    expect(h.revisionUpdates[0]).toMatchObject({ data: { state: 'OFFICIAL' } });
    expect(h.gameUpdates).toContainEqual(expect.objectContaining({ data: { currentOfficialRevisionId: 'rev-new' } }));
    expect(h.outbox[0]).toMatchObject({ type: 'GAME_RESULT_OFFICIAL', revisionId: 'rev-new' });
  });

  it('re-submits a SUBMITTED revision (EVENT_TIME_SYNC), keeps the original submission time and closes the old SLA', async () => {
    const h = harness({ revisionParticipants: [participant], corrections });
    const base = revision('SUBMITTED');
    const result = await syncRevisionEventTimes(h.tx, {
      gameId: GAME, base: base as never, reason: 'sync', createdBy: { actorType: 'USER', userId: 'operator' },
    });
    expect(result).toMatchObject({ revisionState: 'SUBMITTED', supersedesRevisionId: 'rev-old' });
    expect(h.revisionUpdates[0]).toMatchObject({ data: { state: 'SUBMITTED', submittedAt: base.submittedAt } });
    expect(h.gameUpdates).toHaveLength(0);
    expect(h.executed.length).toBeGreaterThan(0);
    expect(h.outbox[0]).toMatchObject({ type: 'GAME_RESULT_SUBMITTED' });
  });
});

describe('event time correction authority (MD-QA #187)', () => {
  it('uses the same authorization bucket as reversing an event', () => {
    expect(gameAuthorizationAction('event_time_correct')).toBe(gameAuthorizationAction('event_reverse'));
  });
});
