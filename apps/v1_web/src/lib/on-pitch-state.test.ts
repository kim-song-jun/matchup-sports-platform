import { describe, expect, it } from 'vitest';
import {
  countActiveSubstitutions,
  deriveOnPitchParticipantIds,
  deriveSentOffParticipantIds,
  deriveSentOffRedCards,
  wasSentOffAt,
} from './on-pitch-state';
import type { QueuedGameEvent } from '@/lib/game-operations-queue';
import type { GameEventRecord, GameLineupParticipant } from '@/types/game-operations';

function participant(id: string, sideId: string, started: boolean): GameLineupParticipant {
  return {
    id,
    gameId: 'g-1',
    sideId,
    lineupId: `lineup-${sideId}`,
    userId: null,
    displayNameSnapshot: id,
    jerseyNumber: null,
    position: null,
    positionX: null,
    positionY: null,
    started,
    arrivedAt: null,
    createdAt: '',
    updatedAt: '',
  };
}

function subEvent(
  id: string,
  sequence: number,
  sideId: string,
  inParticipantId: string,
  outParticipantId: string,
  reversesEventId: string | null = null,
): GameEventRecord {
  return {
    id,
    gameId: 'g-1',
    sequence,
    clientEventId: `client-${id}`,
    payloadHash: 'hash',
    type: 'SUBSTITUTION',
    sideId,
    participantId: inParticipantId,
    assistParticipantId: null,
    period: 1,
    clockMs: 0,
    occurredAt: '2026-08-09T00:00:00.000Z',
    receivedAt: '2026-08-09T00:00:00.000Z',
    actorUserId: 'actor-1',
    reversesEventId,
    payload: { outParticipantId },
  };
}

describe('deriveOnPitchParticipantIds', () => {
  it('starts from `started` lineup participants when there are no events yet', () => {
    const participants = [participant('p1', 'side-home', true), participant('p2', 'side-home', false)];
    expect(deriveOnPitchParticipantIds(participants, [])).toEqual(new Set(['p1']));
  });

  it('folds a substitution: outgoing leaves, incoming joins', () => {
    const participants = [participant('p1', 'side-home', true), participant('p2', 'side-home', false)];
    const onPitch = deriveOnPitchParticipantIds(participants, [subEvent('e1', 1, 'side-home', 'p2', 'p1')]);
    expect(onPitch.has('p1')).toBe(false);
    expect(onPitch.has('p2')).toBe(true);
  });

  it('applies events in sequence order, not array order — rolling subs can send a player back on', () => {
    const participants = [participant('p1', 'side-home', true), participant('p2', 'side-home', false)];
    const events = [subEvent('e2', 2, 'side-home', 'p1', 'p2'), subEvent('e1', 1, 'side-home', 'p2', 'p1')];
    const onPitch = deriveOnPitchParticipantIds(participants, events);
    expect(onPitch.has('p1')).toBe(true);
    expect(onPitch.has('p2')).toBe(false);
  });

  it('ignores a reversed SUBSTITUTION event — reversal restores prior on-pitch state', () => {
    const participants = [participant('p1', 'side-home', true), participant('p2', 'side-home', false)];
    const events: GameEventRecord[] = [
      subEvent('e1', 1, 'side-home', 'p2', 'p1'),
      {
        ...subEvent('e2', 2, 'side-home', 'p1', 'p2'),
        type: 'CORRECTION',
        reversesEventId: 'e1',
        payload: { reason: 'misclick' },
      },
    ];
    const onPitch = deriveOnPitchParticipantIds(participants, events);
    expect(onPitch.has('p1')).toBe(true);
    expect(onPitch.has('p2')).toBe(false);
  });
});

describe('countActiveSubstitutions', () => {
  it('counts only non-reversed SUBSTITUTION events for the given side', () => {
    const events: GameEventRecord[] = [
      subEvent('e1', 1, 'side-home', 'p2', 'p1'),
      subEvent('e2', 2, 'side-away', 'p4', 'p3'),
      subEvent('e3', 3, 'side-home', 'p5', 'p2'),
      { ...subEvent('e4', 4, 'side-home', 'p2', 'p5'), type: 'CORRECTION', reversesEventId: 'e3', payload: {} },
    ];
    expect(countActiveSubstitutions('side-home', events)).toBe(1);
    expect(countActiveSubstitutions('side-away', events)).toBe(1);
  });
});

describe('deriveSentOffParticipantIds', () => {
  const cardEvent = (
    id: string,
    participantId: string | null,
    card: 'RED' | 'YELLOW',
    overrides: Partial<GameEventRecord> = {},
  ): GameEventRecord => ({
    ...subEvent(id, 1, 'side-home', 'x', 'y'),
    type: 'CARD',
    participantId,
    payload: { card },
    ...overrides,
  });

  it('collects players with a red card on either side and ignores yellows, other event types and anonymous cards', () => {
    const events = [
      cardEvent('e1', 'p1', 'RED'),
      cardEvent('e2', 'p2', 'YELLOW'),
      cardEvent('e3', 'p3', 'RED', { sideId: 'side-away' }),
      cardEvent('e4', null, 'RED'),
      subEvent('e5', 5, 'side-home', 'p4', 'p2'),
    ];
    expect(deriveSentOffParticipantIds(events)).toEqual(new Set(['p1', 'p3']));
  });

  it('drops a red card that was reversed by a correction while keeping the others', () => {
    const events = [
      cardEvent('e1', 'p1', 'RED'),
      cardEvent('e2', 'p2', 'RED'),
      cardEvent('e3', 'p1', 'YELLOW', { type: 'CORRECTION', reversesEventId: 'e1', payload: {} }),
    ];
    expect(deriveSentOffParticipantIds(events)).toEqual(new Set(['p2']));
  });

  const queuedCard = (
    clientEventId: string,
    participantId: string,
    card: 'RED' | 'YELLOW',
    status: QueuedGameEvent['status'],
  ): QueuedGameEvent => ({
    clientEventId,
    gameId: 'game-1',
    expectedVersion: 1,
    event: { type: 'CARD', participantId, period: 1, clockMs: 0, occurredAt: '', payload: { card } },
    payloadHash: 'h',
    status,
    queuedAt: '',
    attempts: 0,
    lastError: null,
    ackedSequence: null,
    ackedVersion: null,
  });

  it('adds red cards still waiting for the server (queued/sending) but not failed, acked or yellow ones', () => {
    const queued = [
      queuedCard('c1', 'p1', 'RED', 'queued'),
      queuedCard('c2', 'p2', 'RED', 'sending'),
      queuedCard('c3', 'p3', 'RED', 'failed'),
      queuedCard('c4', 'p4', 'RED', 'acked'),
      queuedCard('c5', 'p5', 'YELLOW', 'queued'),
    ];
    expect(deriveSentOffParticipantIds([cardEvent('e1', 'p6', 'RED')], queued)).toEqual(new Set(['p1', 'p2', 'p6']));
  });
});

describe('deriveSentOffRedCards', () => {
  const redCard = (
    id: string,
    participantId: string | null,
    period: number,
    clockMs: number,
    overrides: Partial<GameEventRecord> = {},
  ): GameEventRecord => ({
    ...subEvent(id, 1, 'side-home', 'x', 'y'),
    type: 'CARD',
    participantId,
    period,
    clockMs,
    payload: { card: 'RED' },
    ...overrides,
  });

  it('선수마다 레드카드를 받은 피리어드와 시각을 돌려준다(옐로·익명 카드는 뺀다)', () => {
    const events = [
      redCard('e1', 'p1', 2, 492_000),
      redCard('e2', 'p2', 1, 60_000, { payload: { card: 'YELLOW' } }),
      redCard('e3', null, 1, 10_000),
    ];
    expect(deriveSentOffRedCards(events)).toEqual(new Map([['p1', { period: 2, clockMs: 492_000 }]]));
  });

  it('같은 선수의 레드카드가 여럿이면 가장 이른 것을 쓴다', () => {
    const events = [redCard('e1', 'p1', 2, 30_000), redCard('e2', 'p1', 1, 900_000), redCard('e3', 'p1', 1, 600_000)];
    expect(deriveSentOffRedCards(events).get('p1')).toEqual({ period: 1, clockMs: 600_000 });
  });

  it('되돌린 레드카드는 빼고, 서버 확정 전인 레드카드는 그 시각으로 넣는다', () => {
    const events = [
      redCard('e1', 'p1', 1, 120_000),
      redCard('e2', 'p2', 1, 240_000, { type: 'CORRECTION', participantId: 'p2', reversesEventId: 'e1', payload: {} }),
    ];
    const queued: QueuedGameEvent = {
      clientEventId: 'c1',
      gameId: 'game-1',
      expectedVersion: 1,
      event: { type: 'CARD', participantId: 'p3', period: 2, clockMs: 45_000, occurredAt: '', payload: { card: 'RED' } },
      payloadHash: 'h',
      status: 'sending',
      queuedAt: '',
      attempts: 0,
      lastError: null,
      ackedSequence: null,
      ackedVersion: null,
    };
    expect(deriveSentOffRedCards(events, [queued])).toEqual(new Map([['p3', { period: 2, clockMs: 45_000 }]]));
  });
});

describe('wasSentOffAt', () => {
  const red = { period: 2, clockMs: 300_000 };

  it('레드카드가 없으면 퇴장한 적이 없다', () => {
    expect(wasSentOffAt(undefined, { period: 2, clockMs: 400_000 })).toBe(false);
  });

  it('그 시각이 퇴장 시각과 같거나 늦으면 이미 퇴장한 상태다 — 이른 피리어드는 늦은 시각이어도 퇴장 전이다', () => {
    expect(wasSentOffAt(red, { period: 2, clockMs: 300_000 })).toBe(true);
    expect(wasSentOffAt(red, { period: 2, clockMs: 301_000 })).toBe(true);
    expect(wasSentOffAt(red, { period: 3, clockMs: 0 })).toBe(true);
    expect(wasSentOffAt(red, { period: 2, clockMs: 299_999 })).toBe(false);
    expect(wasSentOffAt(red, { period: 1, clockMs: 3_000_000 })).toBe(false);
  });
});
